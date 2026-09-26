import { makeExecutableSchema } from '@graphql-tools/schema';
import { Hono } from 'hono';
import { createYoga } from 'graphql-yoga';
import { type GraphQLSchema } from 'graphql';

import { findSessionContext } from 'src/db/core/auth-repository';
import { resolveWorkspaceFromHost } from 'src/db/core/workspace-resolver';
import { loadWorkspaceMetadata } from 'src/db/core/metadata-repository';
import { withDatabaseClient } from 'src/db/client';
import { buildWorkspaceSchemaSdl } from 'src/graphql/build-sdl';
import { buildRecordResolvers } from 'src/graphql/record-resolvers';
import { SCALAR_RESOLVERS } from 'src/graphql/scalars';
import { hashSessionToken, readSessionToken } from 'src/auth/session';
import {
  readCachedMetadata,
  writeCachedMetadata,
} from 'src/cache/metadata-cache';
import { type AppEnv } from 'src/env';
import { type WorkspaceMetadata } from 'src/metadata/types';
import { loadWorkspacePermissions } from 'src/services/permissions';
import {
  createMaskedError,
  isUserFacingError,
} from 'src/graphql/user-facing-error';

// Keyed by workspace and metadata version, so a schema change invalidates the
// entry instead of serving a stale schema for the life of the isolate.
const schemaCache = new Map<string, GraphQLSchema>();

const getWorkspaceSchema = (metadata: WorkspaceMetadata): GraphQLSchema => {
  const cacheKey = `${metadata.workspaceId}:${metadata.metadataVersion}`;
  const cached = schemaCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const schema = makeExecutableSchema({
    typeDefs: buildWorkspaceSchemaSdl(metadata),
    resolvers: {
      ...SCALAR_RESOLVERS,
      ...buildRecordResolvers(metadata),
    },
  });

  schemaCache.clear();
  schemaCache.set(cacheKey, schema);

  return schema;
};

export const graphqlRoute = new Hono<AppEnv>().all('/', async (context) =>
  withDatabaseClient(context.env, context.executionCtx, async (client) => {
    const sessionToken = readSessionToken(context);

    if (sessionToken === null) {
      return context.json({ errors: [{ message: 'UNAUTHENTICATED' }] }, 401);
    }

    const sessionContext = await findSessionContext({
      client,
      tokenHash: await hashSessionToken(sessionToken),
    });

    if (sessionContext === null || sessionContext.membership === null) {
      return context.json({ errors: [{ message: 'UNAUTHENTICATED' }] }, 401);
    }

    // The Host decides the tenant when it maps to one; the session's workspace
    // is only the fallback for the bare workers.dev URL.
    const workspaceFromHost = await resolveWorkspaceFromHost({
      client,
      host: context.req.header('X-Forwarded-Host') ?? context.req.header('Host'),
      appDomain: context.env.APP_DOMAIN,
    });

    const workspace = workspaceFromHost ?? sessionContext.membership.workspace;

    if (workspace === null || workspace.databaseSchema === null) {
      return context.json({ errors: [{ message: 'WORKSPACE_NOT_READY' }] }, 409);
    }

    // Off by default, and deliberately so: measured from this Worker, Upstash
    // answers in ~300ms while Hyperdrive answers in ~5ms, which makes the cache
    // a pessimization. Turn it on only once the Redis lives in the same region
    // as the users — the two queries it saves are cheap today.
    const isMetadataCacheEnabled =
      context.env.METADATA_CACHE_ENABLED === 'true';

    const cachedMetadata = isMetadataCacheEnabled
      ? await readCachedMetadata({
          bindings: context.env,
          workspaceId: workspace.id,
          metadataVersion: workspace.metadataVersion,
        })
      : null;

    const metadata =
      cachedMetadata ??
      (await loadWorkspaceMetadata({
        client,
        workspaceId: workspace.id,
        metadataVersion: workspace.metadataVersion,
      }));

    if (isMetadataCacheEnabled && cachedMetadata === null) {
      context.executionCtx.waitUntil(
        writeCachedMetadata({ bindings: context.env, metadata }),
      );
    }

    const permissions = await loadWorkspacePermissions({
      client,
      workspaceId: workspace.id,
      userWorkspaceId: sessionContext.membership.userWorkspaceId,
      objectMetadataIds: metadata.objects.map((object) => object.id),
    });

    const yoga = createYoga({
      schema: getWorkspaceSchema(metadata),
      graphqlEndpoint: '/graphql',
      landingPage: false,
      // Masking stays on in production so a SQL error never reaches the browser.
      // Deliberate errors are marked, and pass through with their message.
      maskedErrors:
        context.env.DEBUG_ERRORS === 'true'
          ? false
          : {
              maskError: (error, message) =>
                isUserFacingError(error)
                  ? (error as Error)
                  : createMaskedError(message),
            },
      context: () => ({
        client,
        metadata,
        userId: sessionContext.user.id,
        permissions,
      }),
    });

    return yoga.fetch(context.req.raw, context.env);
  }),
);
