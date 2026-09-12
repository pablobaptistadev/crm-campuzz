import { Hono } from 'hono';

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

    return context.json({ status: 'ok', databaseLatencyMs });
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
