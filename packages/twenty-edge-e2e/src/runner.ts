export type StepStatus = 'passed' | 'failed' | 'skipped';

export type StepResult = {
  suite: string;
  name: string;
  status: StepStatus;
  durationMs: number;
  detail?: unknown;
  error?: string;
};

export type RunReport = {
  runId: string;
  target: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totals: { passed: number; failed: number; skipped: number };
  steps: StepResult[];
};

export class AssertionError extends Error {}

export const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new AssertionError(message);
  }
};

export const assertEqual = <TValue>(
  actual: TValue,
  expected: TValue,
  message: string,
): void => {
  if (actual !== expected) {
    throw new AssertionError(
      `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

// Collects results instead of throwing, so one broken step never hides the
// state of everything after it — a failed run still reports the whole suite.
export class Recorder {
  readonly steps: StepResult[] = [];

  constructor(private readonly suite: string) {}

  async step<TValue>(
    name: string,
    body: () => Promise<TValue>,
  ): Promise<TValue | null> {
    const startedAt = Date.now();

    try {
      const detail = await body();

      this.steps.push({
        suite: this.suite,
        name,
        status: 'passed',
        durationMs: Date.now() - startedAt,
        detail: detail ?? undefined,
      });

      return detail;
    } catch (error) {
      this.steps.push({
        suite: this.suite,
        name,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });

      return null;
    }
  }

  // The login is throttled to 10 attempts per 10 minutes per address, and a
  // full run spends three or four of them. Two runs back to back therefore
  // throttle themselves, and every later step fails for want of a session —
  // which reads as a broken app rather than as "wait ten minutes".
  get wasThrottled(): boolean {
    return this.steps.some(
      (step) =>
        step.status === 'failed' &&
        (step.error ?? '').includes('TOO_MANY_ATTEMPTS'),
    );
  }

  skip(name: string, reason: string): void {
    this.steps.push({
      suite: this.suite,
      name,
      status: 'skipped',
      durationMs: 0,
      detail: reason,
    });
  }
}

export const summarize = (steps: StepResult[]): RunReport['totals'] => ({
  passed: steps.filter((step) => step.status === 'passed').length,
  failed: steps.filter((step) => step.status === 'failed').length,
  skipped: steps.filter((step) => step.status === 'skipped').length,
});
