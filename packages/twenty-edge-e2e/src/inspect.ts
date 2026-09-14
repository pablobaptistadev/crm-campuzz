import puppeteer from '@cloudflare/puppeteer';

import { type Bindings } from 'src/env';

export type InspectResult = {
  url: string;
  finalUrl: string;
  consoleErrors: string[];
  rejectedRequests: string[];
  failedRequests: string[];
  bodyText: string;
  documentTitle: string;
  screenshotKey: string;
  uploadOutcome?: string;
  uploadRequests?: string[];
  tracedRequests?: string[];
};

// A page in the real browser, with its own account, reporting what the API
// refused. The suites log in as the test workspace; a defect someone reports on
// another workspace needs its own session to reproduce at all.
export const inspectPage = async ({
  bindings,
  email,
  password,
  path,
  click,
  upload,
  trace,
  targetOverride,
}: {
  bindings: Bindings;
  email: string;
  password: string;
  path: string;
  click?: string;
  upload?: string;
  trace?: string;
  targetOverride?: string;
}): Promise<InspectResult> => {
  const browser = await puppeteer.launch(bindings.BROWSER);

  try {
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    const rejectedRequests: string[] = [];
    const failedRequests: string[] = [];
    const uploadRequests: string[] = [];
    const tracedRequests: string[] = [];
    let uploadOutcome: string | undefined;

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
          const resolved = parts
            .filter((part): part is string => part !== null)
            .join(' ');

          consoleErrors.push(
            (resolved.length > 0 ? resolved : message.text()).slice(0, 1200),
          );
        })
        .catch(() => undefined);
    });

    // A GraphQL error comes back 200 with an errors array, so the status is the
    // wrong thing to filter on — a refused mutation looks like a success until
    // you read the body.
    page.on('response', (response) => {
      if (!/\/(metadata|graphql|rest|files)/.test(response.url())) {
        return;
      }

      void response
        .text()
        .then((body) => {
          const request = response.request().postData() ?? '';

          // A query can come back 200 with the wrong answer rather than an
          // error; tracing one by name is how that gets looked at at all.
          if (
            trace !== undefined &&
            trace.length > 0 &&
            request.includes(trace)
          ) {
            tracedRequests.push(
              `request=${request.slice(0, 900)} :: response=${body.slice(0, 900)}`,
            );
          }

          const failed =
            response.status() >= 400 || /"errors"\s*:/.test(body);

          if (!failed) {
            return;
          }

          rejectedRequests.push(
            `${response.status()} ${response.url()} :: request=${(response.request().postData() ?? '').slice(0, 600)} :: response=${body.slice(0, 700)}`,
          );
        })
        .catch(() => undefined);
    });

    page.on('request', (request) => {
      if (!/\/files\//.test(request.url())) {
        return;
      }

      uploadRequests.push(`${request.method()} ${request.url().slice(0, 160)}`);
    });

    page.on('requestfailed', (request) => {
      failedRequests.push(
        `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`,
      );
    });

    await page.setViewport({ width: 1440, height: 900 });

    const base = targetOverride ?? bindings.TARGET_URL;
    const target = `${base}${path}`;

    await page.goto(base, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    // The login screen is reached through "Continue with Email" before the
    // fields exist at all.
    const campoEmail = 'input[autocomplete="email"], input[type="email"]';

    const achouEmail = await page
      .waitForSelector(campoEmail, { timeout: 20_000 })
      .then(() => true)
      .catch(async () => {
        await page.evaluate(`(() => {
          const button = Array.from(document.querySelectorAll('button, [role="button"]'))
            .find((element) => /continue with email/i.test(element.textContent || ''));

          button?.click();
        })()`);

        return page
          .waitForSelector(campoEmail, { timeout: 20_000 })
          .then(() => true)
          .catch(() => false);
      });

    // A login screen that never appears is itself the finding: reporting the
    // page beats throwing, which leaves no screenshot and no console to read.
    if (achouEmail) {
      await page.type(campoEmail, email, { delay: 10 });
      await page.keyboard.press('Enter');

      const temSenhaJunto = await page
        .$('input[type="password"]')
        .then((elemento) => elemento !== null)
        .catch(() => false);

      if (!temSenhaJunto) {
        await page
          .waitForSelector('input[type="password"]', { timeout: 25_000 })
          .catch(() => undefined);
      }

      await page.type('input[type="password"]', password, { delay: 10 }).catch(() => undefined);
      await page.keyboard.press('Enter');
    } else {
      consoleErrors.push('inspect: nenhum campo de e-mail apareceu na tela inicial');
    }

    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
      const signedIn = await page
        .evaluate(`document.querySelector('input[type="password"]') === null`)
        .catch(() => false);

      if (signedIn === true) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    await page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });

    // Long enough for the page's own queries to land and fail.
    await new Promise((resolve) => setTimeout(resolve, 8_000));

    // Most defects people report are on an action, not on the load: the page
    // renders and the button is what fails.
    if (click !== undefined && click.length > 0) {
      await page.evaluate(`(() => {
        const needle = ${JSON.stringify(click)}.toLowerCase();
        const target = Array.from(
          document.querySelectorAll('button, [role="button"], a'),
        ).find((element) => (element.textContent || '').toLowerCase().includes(needle));

        target?.click();
      })()`);

      await new Promise((resolve) => setTimeout(resolve, 6_000));
    }

    // The file button opens the OS picker, which a headless run can never
    // answer; handing the hidden input a File directly is the same code path
    // the picker would have taken.
    if (upload !== undefined && upload.length > 0) {
      uploadOutcome = String(
        await page.evaluate(`(() => {
          const inputs = Array.from(
            document.querySelectorAll('input[type="file"]'),
          );

          if (inputs.length === 0) {
            return 'no file input on the page';
          }

          // The page carries several — the avatar picker, the rich-text image
          // picker, the CSV importer, the attachment one — and Chromium
          // silently refuses a File the input's accept attribute excludes. So
          // try each until one keeps the file, and dispatch on that one.
          const attempts = [];

          for (const input of inputs) {
            const transfer = new DataTransfer();

            transfer.items.add(
              new File(['conteudo de teste'], ${JSON.stringify(upload)}, {
                type: 'text/plain',
              }),
            );

            try {
              input.files = transfer.files;
            } catch (error) {
              attempts.push('accept=' + (input.accept || '*') + ' threw');
              continue;
            }

            if (input.files.length === 0) {
              attempts.push('accept=' + (input.accept || '*') + ' rejected');
              continue;
            }

            input.dispatchEvent(new Event('change', { bubbles: true }));

            return 'dispatched on accept=' + (input.accept || '*') +
              ' after [' + attempts.join(', ') + ']';
          }

          return 'no input kept the file: ' + attempts.join(', ');
        })()`).catch((error: unknown) => `evaluate failed: ${String(error)}`),
      );

      await new Promise((resolve) => setTimeout(resolve, 12_000));
    }

    const documentTitle = String(
      await page.evaluate(`document.title || ''`).catch(() => ''),
    );

    const bodyText = String(
      await page.evaluate(`document.body.innerText || ''`).catch(() => ''),
    );

    const buffer = (await page.screenshot({ type: 'png' })) as Uint8Array;
    const screenshotKey = `inspect/${Date.now()}.png`;

    await bindings.ARTIFACTS.put(screenshotKey, buffer, {
      httpMetadata: { contentType: 'image/png' },
    });

    return {
      url: target,
      finalUrl: page.url(),
      consoleErrors: [...new Set(consoleErrors)],
      rejectedRequests: [...new Set(rejectedRequests)],
      failedRequests: [...new Set(failedRequests)],
      bodyText: bodyText.slice(0, 3000),
      documentTitle,
      screenshotKey,
      uploadOutcome,
      uploadRequests,
      tracedRequests,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
};
