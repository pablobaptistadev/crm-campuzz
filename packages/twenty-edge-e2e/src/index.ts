import { Hono } from 'hono';

import { type AppEnv, type Bindings } from 'src/env';
import { inspectPage } from 'src/inspect';
import { renderReportHtml } from 'src/report';
import { summarize, type RunReport, type StepResult } from 'src/runner';
import { runApiSuite } from 'src/suites/api';
import { runBrowserSuite } from 'src/suites/browser';
import { runMobileSuite } from 'src/suites/mobile';
import { runRedisSuite } from 'src/suites/redis';

type SuiteName = 'api' | 'redis' | 'browser' | 'mobile';

const ALL_SUITES: SuiteName[] = ['api', 'redis', 'browser', 'mobile'];

const parseSuites = (value: string | undefined): SuiteName[] => {
  if (value === undefined || value === 'all') {
    return ALL_SUITES;
  }

  const requested = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is SuiteName =>
      (ALL_SUITES as string[]).includes(entry),
    );

  return requested.length === 0 ? ALL_SUITES : requested;
};

const run = async (
  bindings: Bindings,
  suites: SuiteName[],
): Promise<{
  report: RunReport;
  artifacts: { name: string; key: string }[];
}> => {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const startedAt = Date.now();
  const steps: StepResult[] = [];
  let artifacts: { name: string; key: string }[] = [];

  // Redis first, then the API, then the browser: each layer is only worth
  // reading if the one under it answered.
  if (suites.includes('redis')) {
    steps.push(...(await runRedisSuite(bindings)).steps);
  }

  if (suites.includes('api')) {
    steps.push(...(await runApiSuite(bindings)).steps);
  }

  if (suites.includes('mobile')) {
    const mobileRun = await runMobileSuite(bindings, runId);

    steps.push(...mobileRun.steps);
    artifacts = [...artifacts, ...mobileRun.artifacts];
  }

  if (suites.includes('browser')) {
    const browserRun = await runBrowserSuite(bindings, runId);

    steps.push(...browserRun.steps);
    artifacts = [...artifacts, ...browserRun.artifacts];
  }

  const finishedAt = Date.now();

  const report: RunReport = {
    runId,
    target: bindings.TARGET_URL,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    totals: summarize(steps),
    steps,
  };

  await bindings.ARTIFACTS.put(
    `e2e/${runId}/report.json`,
    JSON.stringify(report, null, 2),
    { httpMetadata: { contentType: 'application/json' } },
  );

  await bindings.ARTIFACTS.put('e2e/latest.json', JSON.stringify(report), {
    httpMetadata: { contentType: 'application/json' },
  });

  await bindings.ARTIFACTS.put(
    'e2e/latest.html',
    renderReportHtml(report, artifacts),
    { httpMetadata: { contentType: 'text/html; charset=utf-8' } },
  );

  return { report, artifacts };
};

const app = new Hono<AppEnv>();

app.get('/', (context) =>
  context.html(`<!doctype html>
<meta charset="utf-8" />
<title>Campuzz E2E</title>
<body style="font: 14px ui-sans-serif, system-ui; padding: 24px">
  <h1>Campuzz E2E</h1>
  <p>Alvo: <code>${context.env.TARGET_URL}</code></p>
  <ul>
    <li><a href="/run">/run</a> — roda tudo e devolve JSON</li>
    <li><a href="/run?format=html">/run?format=html</a> — roda tudo e devolve o relatório visual</li>
    <li><a href="/run?suites=redis">/run?suites=redis</a> — só o Redis</li>
    <li><a href="/run?suites=api">/run?suites=api</a> — só a API</li>
    <li><a href="/run?suites=browser&format=html">/run?suites=browser</a> — só o navegador</li>
    <li><a href="/report">/report</a> — último relatório</li>
  </ul>
</body>`),
);

// Reproduce a defect on a page, with whatever account reported it.
app.get('/inspect', async (context) => {
  const email = context.req.query('email');
  const password = context.req.query('password');
  const path = context.req.query('path') ?? '/';

  if (email === undefined || password === undefined) {
    return context.json({ error: 'email and password are required' }, 400);
  }

  return context.json(
    await inspectPage({
      bindings: context.env,
      email,
      password,
      path,
      click: context.req.query('click'),
      upload: context.req.query('upload'),
      trace: context.req.query('trace'),
      targetOverride: context.req.query('target'),
      steps: context.req.query('steps'),
    }),
  );
});

app.get('/run', async (context) => {
  const suites = parseSuites(context.req.query('suites'));
  const { report, artifacts } = await run(context.env, suites);

  if (context.req.query('format') === 'html') {
    return context.html(renderReportHtml(report, artifacts));
  }

  return context.json(
    { ...report, artifacts },
    report.totals.failed > 0 ? 500 : 200,
  );
});

app.get('/report', async (context) => {
  const object = await context.env.ARTIFACTS.get('e2e/latest.html');

  if (object === null) {
    return context.text('No run recorded yet — call /run first.', 404);
  }

  return context.html(await object.text());
});

app.get('/report.json', async (context) => {
  const object = await context.env.ARTIFACTS.get('e2e/latest.json');

  if (object === null) {
    return context.text('No run recorded yet — call /run first.', 404);
  }

  return context.json(JSON.parse(await object.text()));
});

app.get('/artifact/*', async (context) => {
  const key = decodeURIComponent(
    new URL(context.req.url).pathname.replace('/artifact/', ''),
  );
  const object = await context.env.ARTIFACTS.get(key);

  if (object === null) {
    return context.text(`Not found: ${key}`, 404);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type':
        object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=300',
    },
  });
});

export default {
  fetch: app.fetch,

  // The same suite on a schedule, so a regression surfaces without anyone
  // opening the URL.
  scheduled: async (
    _event: ScheduledController,
    bindings: Bindings,
    executionCtx: ExecutionContext,
  ) => {
    executionCtx.waitUntil(run(bindings, ALL_SUITES).then(() => undefined));
  },
};
