import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { isApiPath } from 'src/api-paths';
import { type AppEnv } from 'src/env';
import { clientConfigRoute } from 'src/routes/client-config';
import { healthRoute } from 'src/routes/health';

const app = new Hono<AppEnv>();

app.use('*', async (context, next) => {
  context.set('requestContext', {
    userId: null,
    workspaceId: null,
    userWorkspaceId: null,
  });

  await next();
});

// Same-origin is the default: the SPA and the API share a host, so the
// __Host- session cookie works without a Domain attribute. CORS only matters
// for a split-origin deployment, and then it must be credentialed.
app.use('*', (context, next) => {
  const allowedOrigin = context.env.SERVER_URL;

  return cors({
    origin: (origin) => (origin === allowedOrigin ? origin : allowedOrigin),
    credentials: true,
  })(context, next);
});

app.route('/client-config', clientConfigRoute);
app.route('/healthz', healthRoute);

// Internal endpoints are never reachable from the edge.
app.all('/internal/*', (context) => context.notFound());

// Anything that is not an ApiPath prefix is the SPA. Matching on the exact
// first segment is what keeps /static/* on the assets while /s/* reaches the
// route-trigger API.
app.all('*', async (context) => {
  const { pathname } = new URL(context.req.url);

  if (isApiPath(pathname)) {
    return context.json({ error: 'Not implemented yet', path: pathname }, 501);
  }

  return context.env.ASSETS.fetch(context.req.raw);
});

export default app;
