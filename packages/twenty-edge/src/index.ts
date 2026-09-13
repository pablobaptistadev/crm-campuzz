import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { isApiPath } from 'src/api-paths';
import { type AppEnv } from 'src/env';
import { clientConfigRoute } from 'src/routes/client-config';
import { filesRoute } from 'src/routes/files';
import { graphqlRoute } from 'src/routes/graphql';
import { healthRoute } from 'src/routes/health';
import { metadataRoute } from 'src/routes/metadata';

const app = new Hono<AppEnv>();

app.use('*', async (context, next) => {
  context.set('requestContext', {
    userId: null,
    workspaceId: null,
    userWorkspaceId: null,
  });

  await next();
});

// Same-origin is the default: the SPA and the API share a host, so the __Host-
// session cookie works without a Domain attribute. CORS only matters for a
// split-origin deployment, and then it must be credentialed.
app.use('*', (context, next) =>
  cors({
    origin: (origin) => (origin === context.env.SERVER_URL ? origin : context.env.SERVER_URL),
    credentials: true,
  })(context, next),
);

// Rejects any state-changing request whose Origin is not ours. Fails closed on a
// missing Origin, which is what makes cookie auth safe cross-site.
app.use('*', async (context, next) => {
  const method = context.req.method;

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  if (context.req.header('Authorization') !== undefined) {
    return next();
  }

  const origin = context.req.header('Origin');

  if (origin !== context.env.SERVER_URL) {
    return context.json({ error: 'CSRF_ORIGIN_MISMATCH' }, 403);
  }

  return next();
});

app.route('/client-config', clientConfigRoute);
app.route('/healthz', healthRoute);
app.route('/metadata', metadataRoute);
app.route('/graphql', graphqlRoute);
app.route('/files', filesRoute);
app.route('/file', filesRoute);

// Internal endpoints are never reachable from the edge.
app.all('/internal/*', (context) => context.notFound());

// Anything that is not an ApiPath prefix is the SPA. Matching on the exact first
// segment is what keeps /static/* on the assets while /s/* reaches the API.
app.all('*', (context) => {
  const { pathname } = new URL(context.req.url);

  if (isApiPath(pathname)) {
    return context.json({ error: 'Not implemented yet', path: pathname }, 501);
  }

  return context.env.ASSETS.fetch(context.req.raw);
});

export default app;
