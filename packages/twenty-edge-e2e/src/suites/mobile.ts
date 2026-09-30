import puppeteer, { type Browser, type Page } from '@cloudflare/puppeteer';

import { type Bindings } from 'src/env';
import { assert, Recorder, type StepResult } from 'src/runner';

// A real iPhone, because that is where the error was reported and it is the one
// environment the desktop run never exercises: different viewport, different
// engine, and an in-app webview that may hold an old cookie.
const IPHONE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_VIEWPORT = { width: 390, height: 844, isMobile: true, hasTouch: true };
const STEP_TIMEOUT_MS = 45_000;

type MobileDiagnostics = {
  consoleErrors: string[];
  rejected: string[];
  responses: string[];
};

const evaluateInPage = async <TValue>(
  page: Page,
  source: string,
): Promise<TValue> => (await page.evaluate(source)) as TValue;

const attach = (page: Page): MobileDiagnostics => {
  const diagnostics: MobileDiagnostics = {
    consoleErrors: [],
    rejected: [],
    responses: [],
  };

  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }

    void Promise.all(
      message.args().map((argument) =>
        argument
          .evaluate((value: unknown) =>
            value instanceof Error
              ? `${value.message}\n${value.stack ?? ''}`
              : typeof value === 'string'
                ? value
                : JSON.stringify(value),
          )
          .catch(() => null),
      ),
    )
      .then((parts) => {
        const resolved = parts.filter((part): part is string => part !== null);

        diagnostics.consoleErrors.push(
          (resolved.length > 0 ? resolved.join(' ') : message.text()).slice(0, 1200),
        );
      })
      .catch(() => undefined);
  });

  page.on('response', (response) => {
    const url = response.url();

    if (!/\/(metadata|graphql|rest|client-config)/.test(url)) {
      return;
    }

    diagnostics.responses.push(`${response.status()} ${url}`);

    if (response.status() >= 400) {
      void response
        .text()
        .then((body) => {
          diagnostics.rejected.push(
            `${response.status()} ${url} :: request=${(response.request().postData() ?? '').slice(0, 300)} :: response=${body.slice(0, 500)}`,
          );
        })
        .catch(() => undefined);
    }
  });

  return diagnostics;
};

const readBanner = async (page: Page): Promise<string> =>
  evaluateInPage<string>(page, `document.body.innerText || ''`);

export const runMobileSuite = async (
  bindings: Bindings,
  runId: string,
): Promise<{ steps: StepResult[]; artifacts: { name: string; key: string }[] }> => {
  const recorder = new Recorder('mobile');
  const artifacts: { name: string; key: string }[] = [];

  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch(bindings.BROWSER);
  } catch (error) {
    recorder.skip(
      'mobile',
      `Browser Rendering unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );

    return { steps: recorder.steps, artifacts };
  }

  const capture = async (page: Page, name: string): Promise<string> => {
    const buffer = (await page.screenshot({ type: 'png' })) as Uint8Array;
    const key = `e2e/${runId}/mobile-${name}.png`;

    await bindings.ARTIFACTS.put(key, buffer, {
      httpMetadata: { contentType: 'image/png' },
    });

    artifacts.push({ name: `mobile-${name}`, key });

    return key;
  };

  const openMobilePage = async (): Promise<{
    page: Page;
    diagnostics: MobileDiagnostics;
  }> => {
    const page = await browser!.newPage();

    await page.setUserAgent(IPHONE_USER_AGENT);
    await page.setViewport(IPHONE_VIEWPORT);

    return { page, diagnostics: attach(page) };
  };

  const settle = async (page: Page): Promise<void> => {
    const deadline = Date.now() + 12_000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const text = await readBanner(page).catch(() => '');

      if (text.includes('Ocorreu um erro')) {
        return;
      }
    }
  };

  try {
    await recorder.step('iPhone: a cold load shows no error', async () => {
      const { page, diagnostics } = await openMobilePage();

      try {
        await page.goto(bindings.TARGET_URL, {
          waitUntil: 'domcontentloaded',
          timeout: STEP_TIMEOUT_MS,
        });

        await settle(page);

        const text = await readBanner(page);
        const key = await capture(page, 'cold-load');

        assert(
          !text.includes('Ocorreu um erro'),
          `error banner on a cold mobile load :: rejected=${diagnostics.rejected.slice(0, 2).join(' ;; ')} :: console=${diagnostics.consoleErrors.slice(0, 2).join(' ;; ')} :: responses=${diagnostics.responses.slice(-8).join(' ;; ')}`,
        );

        return { artifact: key, responses: diagnostics.responses.length };
      } finally {
        await page.close().catch(() => undefined);
      }
    });

    await recorder.step('iPhone: a stale session cookie does not error', async () => {
      const { page, diagnostics } = await openMobilePage();

      try {
        // The phone that reported this had signed in before; a cookie whose
        // session row is gone must read as "logged out", never as an error.
        await page.setCookie({
          name: '__Host-twenty-session',
          value: 'a'.repeat(64),
          domain: new URL(bindings.TARGET_URL).hostname,
          path: '/',
          secure: true,
          httpOnly: true,
        });

        await page.goto(bindings.TARGET_URL, {
          waitUntil: 'domcontentloaded',
          timeout: STEP_TIMEOUT_MS,
        });

        await settle(page);

        const text = await readBanner(page);
        const key = await capture(page, 'stale-cookie');

        assert(
          !text.includes('Ocorreu um erro'),
          `error banner with a stale session cookie :: rejected=${diagnostics.rejected.slice(0, 2).join(' ;; ')} :: console=${diagnostics.consoleErrors.slice(0, 2).join(' ;; ')} :: responses=${diagnostics.responses.slice(-8).join(' ;; ')}`,
        );

        return { artifact: key };
      } finally {
        await page.close().catch(() => undefined);
      }
    });

    const password = bindings.TEST_PASSWORD ?? '';

    if (password.length === 0) {
      recorder.skip('iPhone: sign in', 'TEST_PASSWORD is not set');
    } else {
      await recorder.step('iPhone: sign in reaches the app', async () => {
        const { page, diagnostics } = await openMobilePage();

        try {
          await page.goto(bindings.TARGET_URL, {
            waitUntil: 'domcontentloaded',
            timeout: STEP_TIMEOUT_MS,
          });

          await page.waitForSelector('input[autocomplete="email"]', {
            timeout: STEP_TIMEOUT_MS,
          });

          await page.click('input[autocomplete="email"]');
          await page.keyboard.type(bindings.TEST_EMAIL, { delay: 10 });
          await page.keyboard.press('Enter');

          await page.waitForSelector('input[type="password"]', {
            timeout: STEP_TIMEOUT_MS,
          });

          await page.click('input[type="password"]');
          await page.keyboard.type(password, { delay: 10 });
          await capture(page, 'login-filled');
          await page.keyboard.press('Enter');

          const deadline = Date.now() + STEP_TIMEOUT_MS;
          let signedIn = false;

          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const stillOnForm = await evaluateInPage<boolean>(
              page,
              `document.querySelector('input[type="password"]') !== null`,
            ).catch(() => true);

            if (!stillOnForm) {
              signedIn = true;
              break;
            }
          }

          // Landing on /home is not the same as /home rendering: the skeleton
          // stays up forever when a query the page depends on answers nothing.
          const contentDeadline = Date.now() + 30_000;
          let bodyText = '';

          while (Date.now() < contentDeadline) {
            bodyText = await readBanner(page).catch(() => '');

            if (bodyText.trim().length > 40) {
              break;
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          const text = bodyText;
          const key = await capture(page, 'after-login');

          assert(
            text.trim().length > 40,
            `mobile rendered an empty page at ${page.url()} :: body=${JSON.stringify(text.slice(0, 200))} :: rejected=${diagnostics.rejected.slice(0, 2).join(' ;; ')} :: console=${diagnostics.consoleErrors.slice(0, 3).join(' ;; ')} :: responses=${diagnostics.responses.slice(-12).join(' ;; ')}`,
          );

          assert(
            signedIn,
            `mobile login stayed on the form :: banner=${text.slice(0, 200)} :: rejected=${diagnostics.rejected.slice(0, 2).join(' ;; ')} :: console=${diagnostics.consoleErrors.slice(0, 2).join(' ;; ')}`,
          );

          assert(
            !text.includes('Ocorreu um erro'),
            `error banner after mobile login :: rejected=${diagnostics.rejected.slice(0, 2).join(' ;; ')} :: console=${diagnostics.consoleErrors.slice(0, 2).join(' ;; ')}`,
          );

          return { url: page.url(), artifact: key };
        } finally {
          await page.close().catch(() => undefined);
        }
      });
    }
  } finally {
    await browser.close();
  }

  return { steps: recorder.steps, artifacts };
};
