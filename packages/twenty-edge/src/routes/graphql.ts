import { makeExecutableSchema } from '@graphql-tools/schema';
import { Hono } from 'hono';
import { createYoga } from 'graphql-yoga';
import { type GraphQLSchema } from 'graphql';

import { findActiveSession, findWorkspaceById } from 'src/db/core/auth-repository';
import { loadWorkspaceMetadata } from 'src/db/core/metadata-repository';
import { withDatabaseClient } from 'src/db/client';
import { buildWorkspaceSchemaSdl } from 'src/graphql/build-sdl';
import { buildRecordResolvers } from 'src/graphql/record-resolvers';
import { SCALAR_RESOLVERS } from 'src/graphql/scalars';
import { hashSessionToken, readSessionToken } from 'src/auth/session';
import { type AppEnv } from 'src/env';
import { type WorkspaceMetadata } from 'src/metadata/types';

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

    const session = await findActiveSession({
      client,
      tokenHash: await hashSessionToken(sessionToken),
    });

    if (session === null || session.workspaceId === null) {
      return context.json({ errors: [{ message: 'UNAUTHENTICATED' }] }, 401);
    }

    const workspace = await findWorkspaceById({
      client,
      workspaceId: session.workspaceId,
    });

    if (workspace === null || workspace.databaseSchema === null) {
      return context.json({ errors: [{ message: 'WORKSPACE_NOT_READY' }] }, 409);
    }

    const metadata = await loadWorkspaceMetadata({
      client,
      workspaceId: workspace.id,
      metadataVersion: workspace.metadataVersion,
    });

    const yoga = createYoga({
      schema: getWorkspaceSchema(metadata),
      graphqlEndpoint: '/graphql',
      landingPage: false,
      context: () => ({ client, metadata }),
    });

    return yoga.fetch(context.req.raw, context.env);
  }),
);
