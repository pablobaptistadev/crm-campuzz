import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';

import { isApiPath } from 'src/api-paths';
import { type AppEnv, type Bindings } from 'src/env';
import { clientConfigRoute } from 'src/routes/client-config';
import { filesRoute } from 'src/routes/files';
import { graphqlRoute } from 'src/routes/graphql';
import { healthRoute } from 'src/routes/health';
import { metadataRoute } from 'src/routes/metadata';
import { restRoute } from 'src/routes/rest';

const app = new Hono<AppEnv>();

app.use('*', async (context, next) => {
  context.set('requestContext', {
    userId: null,
    workspaceId: null,
    userWorkspaceId: null,
  });

  await next();
});

// Whitelabel means there is no single allowed origin: every workspace gets its
// own hostname. The invariant that still holds is same-origin — the Origin must
// match the host this very request arrived on.
const isSameOriginRequest = (context: Context<AppEnv>): boolean => {
  const origin = context.req.header('Origin');

  if (origin === undefined) {
    return false;
  }

  const host =
    context.req.header('X-Forwarded-Host') ?? context.req.header('Host');

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

app.use('*', (context, next) =>
  cors({
    origin: (origin) => (isSameOriginRequest(context) ? origin : ''),
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

  if (!isSameOriginRequest(context)) {
    return context.json({ error: 'CSRF_ORIGIN_MISMATCH' }, 403);
  }

  return next();
});

app.route('/client-config', clientConfigRoute);
app.route('/healthz', healthRoute);
app.route('/metadata', metadataRoute);
app.route('/graphql', graphqlRoute);
app.route('/rest', restRoute);
app.route('/files', filesRoute);
app.route('/file', filesRoute);

// Internal endpoints are never reachable from the edge.
app.all('/internal/*', (context) => context.notFound());

const CLUBE_HOSTNAME = 'clube.campuzz.com.br';
const CLUBE_BASE = '/clube';

// clube.campuzz.com.br is the Education Society app, which lives under /clube in
// the same bundle. Serving it by Host keeps it on one origin with the API, so
// the session cookie works without any cross-site exception.
const isClubeRequest = (url: URL): boolean =>
  url.hostname === CLUBE_HOSTNAME ||
  url.pathname === CLUBE_BASE ||
  url.pathname.startsWith(`${CLUBE_BASE}/`);

// The shell is /clube/app, not /clube/ or /clube/app.html: Cloudflare's asset
// handler redirects a directory to its trailing slash and strips .html, and
// either one bounces back through the rewrite below as an endless loop. This is
// the path it already considers canonical, so it answers it directly.
const CLUBE_SHELL = `${CLUBE_BASE}/app`;

const fetchClubeAsset = (context: { req: { raw: Request } }, env: Bindings, url: URL) => {
  const isFile = /\.[a-z0-9]+$/i.test(url.pathname);
  const caminho = url.pathname.startsWith(`${CLUBE_BASE}/`)
    ? url.pathname
    : `${CLUBE_BASE}${url.pathname}`;

  // Deep links have no file of their own; the SPA shell answers for them.
  const alvo = new URL(isFile ? caminho : CLUBE_SHELL, url.origin);

  return env.ASSETS.fetch(new Request(alvo, context.req.raw));
};

// Anything that is not an ApiPath prefix is the SPA. Matching on the exact first
// segment is what keeps /static/* on the assets while /s/* reaches the API.
app.all('*', (context) => {
  const url = new URL(context.req.url);

  if (isApiPath(url.pathname)) {
    return context.json({ error: 'Not implemented yet', path: url.pathname }, 501);
  }

  if (isClubeRequest(url)) {
    return fetchClubeAsset(context, context.env, url);
  }

  return context.env.ASSETS.fetch(context.req.raw);
});

export default app;
