import { makeExecutableSchema } from '@graphql-tools/schema';
import { Hono } from 'hono';
import { createYoga } from 'graphql-yoga';

import {
  findSessionContext,
  insertSession,
  revokeSession,
} from 'src/db/core/auth-repository';
import { CACHE_NAMESPACES, createCacheStorage } from 'src/cache/cache-storage';
import { withDatabaseClient } from 'src/db/client';
import {
  METADATA_RESOLVERS,
  METADATA_SDL,
  type MetadataContext,
} from 'src/graphql/metadata-schema';
import { SCALAR_RESOLVERS } from 'src/graphql/scalars';
import {
  attachSessionCookie,
  clearSessionCookie,
  hashSessionToken,
  issueSessionToken,
  readSessionToken,
} from 'src/auth/session';
import { type AppEnv } from 'src/env';

// Built once per isolate: parsing the SDL on every request would burn CPU that
// the invocation budget needs for the actual query.
let cachedSchema: ReturnType<typeof makeExecutableSchema> | null = null;

const getMetadataSchema = () => {
  cachedSchema ??= makeExecutableSchema({
    typeDefs: METADATA_SDL,
    resolvers: { ...SCALAR_RESOLVERS, ...METADATA_RESOLVERS },
  });

  return cachedSchema;
};

export const metadataRoute = new Hono<AppEnv>().all('/', async (context) => {
  const appSecret = context.env.APP_SECRET;

  if (appSecret === undefined || appSecret.length === 0) {
    return context.json({ error: 'APP_SECRET is not configured' }, 500);
  }

  return withDatabaseClient(context.env, context.executionCtx, async (client) => {
    const sessionToken = readSessionToken(context);
    const sessionContext =
      sessionToken === null
        ? null
        : await findSessionContext({
            client,
            tokenHash: await hashSessionToken(sessionToken),
          });

    const throttleCache = createCacheStorage({
      bindings: context.env,
      namespace: CACHE_NAMESPACES.engineUsageLimit,
    });

    const graphqlContext: MetadataContext = {
      client,
      appSecret,
      // Derived from the request, not from a fixed env var: a whitelabel
      // deployment answers on many hosts and each must echo its own.
      serverUrl: new URL(context.req.url).origin,
      throttle: async (key, limit, windowMs) => {
        // Without Redis there is no shared counter, so the limiter opens rather
        // than blocking every request.
        if (!throttleCache.isAvailable) {
          return true;
        }

        const attempts = await throttleCache.incrementBy(key, 1);

        if (attempts === 1) {
          await throttleCache.expire(key, windowMs);
        }

        return attempts <= limit;
      },
      sessionContext,
      sessionUserId: sessionContext?.user.id ?? null,
      sessionWorkspaceId: sessionContext?.membership?.workspace.id ?? null,
      issueSession: async ({ userId, workspaceId, userWorkspaceId }) => {
        const issued = await issueSessionToken();

        await insertSession({
          client,
          tokenHash: issued.tokenHash,
          userId,
          workspaceId,
          userWorkspaceId,
          expiresAt: issued.expiresAt,
          ipAddress: context.req.header('CF-Connecting-IP') ?? null,
          userAgent: context.req.header('User-Agent') ?? null,
        });

        attachSessionCookie(context, issued);
      },
      clearSession: async () => {
        if (sessionToken !== null) {
          await revokeSession({
            client,
            tokenHash: await hashSessionToken(sessionToken),
            reason: 'SIGN_OUT',
          });
        }

        clearSessionCookie(context);
      },
    };

    const yoga = createYoga({
      schema: getMetadataSchema(),
      graphqlEndpoint: '/metadata',
      landingPage: false,
      maskedErrors: context.env.DEBUG_ERRORS !== 'true',
      context: () => graphqlContext,
    });

    const response = await yoga.fetch(context.req.raw, context.env);

    // Yoga builds its own Response, so cookies Hono queued during resolution
    // have to be copied across by hand.
    const headers = new Headers(response.headers);

    for (const cookie of context.res.headers.getSetCookie()) {
      headers.append('Set-Cookie', cookie);
    }

    return new Response(response.body, { status: response.status, headers });
  });
});
