import { Hono } from 'hono';

import { CACHE_NAMESPACES, createCacheStorage } from 'src/cache/cache-storage';
import { withDatabaseClient } from 'src/db/client';
import { type AppEnv } from 'src/env';

export const healthRoute = new Hono<AppEnv>().get('/', async (context) => {
  const startedAt = Date.now();

  try {
    const databaseLatencyMs = await withDatabaseClient(
      context.env,
      context.executionCtx,
      async (client) => {
        await client.query('SELECT 1');

        return Date.now() - startedAt;
      },
    );

    const cache = createCacheStorage({
      bindings: context.env,
      namespace: CACHE_NAMESPACES.engineHealth,
    });

    let cacheLatencyMs: number | null = null;

    if (cache.isAvailable) {
      const cacheStartedAt = Date.now();

      await cache.set('probe', Date.now(), 30_000);
      const probe = await cache.get<number>('probe');

      cacheLatencyMs = probe === null ? null : Date.now() - cacheStartedAt;
    }

    return context.json({
      status: 'ok',
      databaseLatencyMs,
      cache: cache.isAvailable
        ? { status: cacheLatencyMs === null ? 'error' : 'ok', latencyMs: cacheLatencyMs }
        : { status: 'not_configured' },
    });
  } catch (error) {
    return context.json(
      {
        status: 'error',
        database: error instanceof Error ? error.message : 'unknown error',
      },
      503,
    );
  }
});
