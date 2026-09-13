import puppeteer, { type Browser, type Page } from '@cloudflare/puppeteer';

import { ApiClient, unwrap } from 'src/api-client';
import { type Bindings } from 'src/env';
import { assert, assertEqual, Recorder, type StepResult } from 'src/runner';

const VIEWPORT = { width: 1440, height: 900 };
const STEP_TIMEOUT_MS = 30_000;
// Signing in fans out into every metadata collection the front loads at boot,
// so it is the one step that legitimately takes longer than a page render.
const LOGIN_TIMEOUT_MS = 60_000;

type Artifact = { name: string; key: string; bytes: number };

type PageDiagnostics = {
  consoleErrors: string[];
  consoleMessages: string[];
  pageErrors: string[];
  failedRequests: string[];
  responses: string[];
  rejectedRequests: string[];
};

const createDiagnostics = (): PageDiagnostics => ({
  consoleErrors: [],
  consoleMessages: [],
  pageErrors: [],
  failedRequests: [],
  responses: [],
  rejectedRequests: [],
});

const attachDiagnostics = (
  page: Page,
  diagnostics: PageDiagnostics,
): PageDiagnostics => {
  page.on('console', (message) => {
    diagnostics.consoleMessages.push(
      `${message.type()}: ${message.text().slice(0, 200)}`,
    );

    if (message.type() !== 'error') {
      return;
    }

    // console.error(someError) prints as "JSHandle@error", which says nothing.
    // Reaching into the handle for the stack is the only way to see what the
    // app actually caught.
    void Promise.all(
      message.args().map((argument) =>
        argument
          .evaluate((value: unknown) => {
            if (value instanceof Error) {
              return `${value.message}\n${value.stack ?? ''}`;
            }

            return typeof value === 'string' ? value : JSON.stringify(value);
          })
          .catch(() => null),
      ),
    )
      .then((parts) => {
        const resolved = parts
          .filter((part): part is string => part !== null)
          .join(' ');

        diagnostics.consoleErrors.push(
          (resolved.length > 0 ? resolved : message.text()).slice(0, 1500),
        );
      })
      .catch(() => {
        diagnostics.consoleErrors.push(message.text().slice(0, 1500));
      });
  });

  // The request trail is what tells a slow boot apart from a redirect loop.
  page.on('response', (response) => {
    const url = response.url();

    if (url.startsWith('data:') || /\.(js|css|woff2?|png|svg)$/.test(url)) {
      return;
    }

    diagnostics.responses.push(
      `${response.status()} ${response.request().method()} ${url}`,
    );

    // A 400 from the API is a rejected document, and the body names the field
    // that does not exist — without it the failure is just a status code.
    if (response.status() >= 400 && /\/(metadata|graphql|rest)/.test(url)) {
      void response
        .text()
        .then((body) => {
          const postData = response.request().postData() ?? '';

          diagnostics.rejectedRequests.push(
            `${response.status()} ${url} :: request=${postData.slice(0, 400)} :: response=${body.slice(0, 600)}`,
          );
        })
        .catch(() => undefined);
    }
  });

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(String(error).slice(0, 1500));
  });

  page.on('requestfailed', (request) => {
    diagnostics.failedRequests.push(
      `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`,
    );
  });

  return diagnostics;
};

// Screenshots are the only evidence left once the isolate is gone, so every
// step writes one whether it passed or not.
const capture = async ({
  page,
  bindings,
  runId,
  name,
  artifacts,
}: {
  page: Page;
  bindings: Bindings;
  runId: string;
  name: string;
  artifacts: Artifact[];
}): Promise<Artifact> => {
  const buffer = (await page.screenshot({ type: 'png' })) as Uint8Array;
  const key = `e2e/${runId}/${String(artifacts.length + 1).padStart(2, '0')}-${name}.png`;

  await bindings.ARTIFACTS.put(key, buffer, {
    httpMetadata: { contentType: 'image/png' },
  });

  const artifact = { name, key, bytes: buffer.byteLength };

  artifacts.push(artifact);

  return artifact;
};

// Page-side code is passed as source text rather than a closure: the Worker
// has no DOM lib, so a real arrow function here would not typecheck.
const evaluateInPage = async <TValue>(
  page: Page,
  source: string,
): Promise<TValue> => (await page.evaluate(source)) as TValue;

const clickButtonContaining = async (
  page: Page,
  pattern: string,
): Promise<boolean> =>
  evaluateInPage<boolean>(
    page,
    `(() => {
      const needle = ${JSON.stringify(pattern)}.toLowerCase();
      const target = Array.from(
        document.querySelectorAll('button, [role="button"]'),
      ).find((button) => (button.textContent || '').toLowerCase().includes(needle));

      if (!target) return false;

      target.click();

      return true;
    })()`,
  );

export const runBrowserSuite = async (
  bindings: Bindings,
  runId: string,
): Promise<{ steps: StepResult[]; artifacts: Artifact[] }> => {
  const recorder = new Recorder('browser');
  const artifacts: Artifact[] = [];
  const password = bindings.TEST_PASSWORD ?? '';

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch(bindings.BROWSER);
  } catch (error) {
    recorder.skip(
      'browser',
      `Browser Rendering binding unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );

    return { steps: recorder.steps, artifacts };
  }

  // A record created through the API and then found in the rendered table is
  // the only assertion that proves both halves are talking to the same rows.
  const apiClient = new ApiClient(bindings.TARGET_URL);
  const companyName = `Browser E2E ${Date.now().toString(36)}`;
  let seededCompanyId: string | null = null;

  try {
    const page = await browser.newPage();
    const diagnostics = createDiagnostics();

    attachDiagnostics(page, diagnostics);

    await page.setViewport(VIEWPORT);

    await recorder.step('the SPA shell loads', async () => {
      const response = await page.goto(bindings.TARGET_URL, {
        waitUntil: 'domcontentloaded',
        timeout: STEP_TIMEOUT_MS,
      });

      assert(response !== null, 'navigation produced a response');
      assertEqual(response?.status(), 200, 'document status');

      const title = await page.title();
      const artifact = await capture({
        page,
        bindings,
        runId,
        name: 'landing',
        artifacts,
      });

      const html = await page.content();

      assert(html.includes('<div id="root"'), 'the React root is served');

      return { title, artifact: artifact.key };
    });

    if (password.length === 0) {
      recorder.skip(
        'log in through the UI',
        'TEST_PASSWORD secret is not set — run: wrangler secret put TEST_PASSWORD',
      );
    } else {
      await recorder.step('seed a company through the API', async () => {
        const login = unwrap(
          (
            await apiClient.graphql<{
              getLoginTokenFromCredentials: { loginToken: { token: string } };
            }>({
              endpoint: '/metadata',
              query: `mutation Login($email: String!, $password: String!) {
                getLoginTokenFromCredentials(email: $email, password: $password) {
                  loginToken { token }
                }
              }`,
              variables: { email: bindings.TEST_EMAIL, password },
            })
          ).body,
          'login for seeding',
        );

        unwrap(
          (
            await apiClient.graphql({
              endpoint: '/metadata',
              query: `mutation Tokens($loginToken: String!) {
                getAuthTokensFromLoginToken(loginToken: $loginToken) {
                  tokens { accessOrWorkspaceAgnosticToken { token } }
                }
              }`,
              variables: {
                loginToken: login.getLoginTokenFromCredentials.loginToken.token,
              },
            })
          ).body,
          'session for seeding',
        );

        const created = unwrap(
          (
            await apiClient.graphql<{ createCompany: { id: string } }>({
              endpoint: '/graphql',
              query: `mutation CreateCompany($data: CompanyCreateInput!) {
                createCompany(data: $data) { id name }
              }`,
              variables: { data: { name: companyName, employees: 7 } },
            })
          ).body,
          'seed company',
        );

        seededCompanyId = created.createCompany.id;

        return { id: seededCompanyId, name: companyName };
      });

      await recorder.step('log in through the UI', async () => {
        // A failed login is the one step worth a post-mortem: the screenshot and
        // the request trail say whether the app was slow, looping or rejected.
        const explainFailure = async (error: unknown): Promise<never> => {
          await capture({
            page,
            bindings,
            runId,
            name: 'login-failure',
            artifacts,
          }).catch(() => undefined);

          const bodyText = await evaluateInPage<string>(
            page,
            `document.body.innerText || ''`,
          ).catch(() => '');

          throw new Error(
            [
              error instanceof Error ? error.message : String(error),
              `url=${page.url()}`,
              `body=${bodyText.slice(0, 300)}`,
              `rejected=${diagnostics.rejectedRequests.slice(0, 3).join(' ;; ')}`,
              `requests=${diagnostics.responses.slice(-10).join(' ;; ')}`,
              `consoleErrors=${Array.from(new Set(diagnostics.consoleErrors)).slice(0, 3).join(' ;; ')}`,
            ].join(' | '),
          );
        };

        try {
          // The form walks Init → Email → Password, so the email field only
          // exists after the first button press.
          const hasEmailField = await page.$('input[autocomplete="email"]');

          if (hasEmailField === null) {
            const clicked = await clickButtonContaining(page, 'mail');

            assert(clicked, 'found the "Continue with Email" button');
          }

          await page.waitForSelector('input[autocomplete="email"]', {
            timeout: STEP_TIMEOUT_MS,
          });

          await page.type('input[autocomplete="email"]', bindings.TEST_EMAIL, {
            delay: 10,
          });

          await capture({
            page,
            bindings,
            runId,
            name: 'email-filled',
            artifacts,
          });

          await page.keyboard.press('Enter');

          await page.waitForSelector('input[type="password"]', {
            timeout: STEP_TIMEOUT_MS,
          });

          await page.type('input[type="password"]', password, { delay: 10 });

          await capture({
            page,
            bindings,
            runId,
            name: 'password-filled',
            artifacts,
          });

          await page.keyboard.press('Enter');

          // The SPA swaps its route rather than navigating, so waiting on the
          // password field disappearing is what actually marks "signed in".
          await page.waitForFunction(
            `document.querySelector('input[type="password"]') === null`,
            { timeout: LOGIN_TIMEOUT_MS },
          );

          await page.waitForFunction(
            `(document.body.innerText || '').length > 200`,
            { timeout: LOGIN_TIMEOUT_MS },
          );

          const artifact = await capture({
            page,
            bindings,
            runId,
            name: 'after-login',
            artifacts,
          });

          const bodyText = await evaluateInPage<string>(
            page,
            `document.body.innerText || ''`,
          );

          assert(
            !/erro|error/i.test(bodyText.slice(0, 400)),
            `no error banner after login: ${bodyText.slice(0, 800)}`,
          );

          return { url: page.url(), artifact: artifact.key };
        } catch (error) {
          return explainFailure(error);
        }
      });

      await recorder.step(
        'the Companies table renders the seeded row',
        async () => {
          await page.goto(`${bindings.TARGET_URL}/objects/companies`, {
            waitUntil: 'domcontentloaded',
            timeout: STEP_TIMEOUT_MS,
          });

          await page.waitForFunction(
            `(document.body.innerText || '').includes(${JSON.stringify(companyName)})`,
            { timeout: LOGIN_TIMEOUT_MS },
          );

          const artifact = await capture({
            page,
            bindings,
            runId,
            name: 'companies',
            artifacts,
          });

          return { url: page.url(), artifact: artifact.key };
        },
      );

      for (const [label, path] of [
        ['people', '/objects/people'],
        ['opportunities', '/objects/opportunities'],
        ['notes', '/objects/notes'],
        ['tasks', '/objects/tasks'],
        ['settings-objects', '/settings/objects'],
      ] as const) {
        await recorder.step(`${label} page renders`, async () => {
          // A fresh tab per section: the app holds a lot of state per page and
          // reusing one tab across six full reloads is what starves the
          // rendering session. The session cookie is shared by the browser.
          const sectionPage = await browser.newPage();

          attachDiagnostics(sectionPage, diagnostics);

          try {
            await sectionPage.setViewport(VIEWPORT);

            const response = await sectionPage.goto(
              `${bindings.TARGET_URL}${path}`,
              { waitUntil: 'domcontentloaded', timeout: STEP_TIMEOUT_MS },
            );

            assertEqual(response?.status(), 200, `${label} document status`);

            await sectionPage.waitForFunction(
              `(document.body.innerText || '').length > 100`,
              { timeout: STEP_TIMEOUT_MS },
            );

            const bodyText = await evaluateInPage<string>(
              sectionPage,
              `document.body.innerText || ''`,
            );

            assert(
              !bodyText.includes('Unexpected Application Error'),
              `${label} rendered a React error boundary: ${bodyText.slice(0, 300)}`,
            );

            const artifact = await capture({
              page: sectionPage,
              bindings,
              runId,
              name: label,
              artifacts,
            });

            return { url: sectionPage.url(), artifact: artifact.key };
          } finally {
            await sectionPage.close().catch(() => undefined);
          }
        });
      }
    }

    await recorder.step('the browser session logged no errors', async () => {
      // The same GraphQL document is retried by Apollo, so raw counts are
      // mostly duplicates: report each distinct message once.
      const uniquePageErrors = Array.from(new Set(diagnostics.pageErrors));

      // Anything the SPA threw during this run would otherwise pass unnoticed:
      // a failed GraphQL call still renders an empty table.
      assertEqual(
        uniquePageErrors.length,
        0,
        `uncaught page errors: ${uniquePageErrors.join(' | ')}`,
      );

      // Hopping between pages aborts whatever the previous route had in
      // flight, so ERR_ABORTED is the test's own doing, not a defect.
      const relevantFailures = diagnostics.failedRequests.filter(
        (entry) =>
          !entry.includes('favicon') && !entry.includes('net::ERR_ABORTED'),
      );

      assertEqual(
        relevantFailures.length,
        0,
        `failed requests: ${relevantFailures.join(' | ')}`,
      );

      assertEqual(
        diagnostics.rejectedRequests.length,
        0,
        `API rejected requests: ${Array.from(new Set(diagnostics.rejectedRequests)).slice(0, 3).join(' ;; ')}`,
      );

      return {
        consoleErrors: Array.from(new Set(diagnostics.consoleErrors)).slice(
          0,
          5,
        ),
        consoleErrorCount: diagnostics.consoleErrors.length,
      };
    });
  } finally {
    if (seededCompanyId !== null) {
      await apiClient
        .graphql({
          endpoint: '/graphql',
          query: `mutation DestroyCompany($id: UUID!) { destroyCompany(id: $id) { id } }`,
          variables: { id: seededCompanyId },
        })
        .catch(() => undefined);
    }

    await browser.close();
  }

  return { steps: recorder.steps, artifacts };
};
