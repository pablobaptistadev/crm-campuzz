import { Hono } from 'hono';

import { buildClientConfig } from 'src/config/build-client-config';
import { type AppEnv } from 'src/env';

export const clientConfigRoute = new Hono<AppEnv>().get('/', (context) =>
  context.json(buildClientConfig(context.env)),
);
