import { type RunReport, type StepResult } from 'src/runner';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const STATUS_COLOR: Record<StepResult['status'], string> = {
  passed: '#16a34a',
  failed: '#dc2626',
  skipped: '#a16207',
};

const renderStep = (step: StepResult): string => `
  <tr>
    <td class="status" style="color:${STATUS_COLOR[step.status]}">${step.status}</td>
    <td>${escapeHtml(step.suite)}</td>
    <td>${escapeHtml(step.name)}</td>
    <td class="ms">${step.durationMs} ms</td>
    <td class="detail">${escapeHtml(
      step.error ??
        (step.detail === undefined ? '' : JSON.stringify(step.detail)),
    )}</td>
  </tr>`;

export const renderReportHtml = (
  report: RunReport,
  artifacts: { name: string; key: string }[],
): string => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Campuzz E2E — ${report.runId}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #6b7280; margin-bottom: 16px; }
  .totals span { display: inline-block; margin-right: 16px; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; color: #6b7280; }
  .status { font-weight: 700; white-space: nowrap; }
  .ms { white-space: nowrap; color: #6b7280; }
  .detail { font-family: ui-monospace, monospace; font-size: 12px; max-width: 520px; word-break: break-word; }
  .shots { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
  .shots figure { margin: 0; width: 320px; }
  .shots img { width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; }
  .shots figcaption { font-size: 12px; color: #6b7280; }
</style>
</head>
<body>
  <h1>Campuzz E2E</h1>
  <div class="meta">${escapeHtml(report.target)} · ${escapeHtml(report.runId)} · ${report.durationMs} ms</div>
  <div class="totals">
    <span style="color:${STATUS_COLOR.passed}">${report.totals.passed} passed</span>
    <span style="color:${STATUS_COLOR.failed}">${report.totals.failed} failed</span>
    <span style="color:${STATUS_COLOR.skipped}">${report.totals.skipped} skipped</span>
  </div>
  <table>
    <thead><tr><th>Status</th><th>Suite</th><th>Step</th><th>Time</th><th>Detail</th></tr></thead>
    <tbody>${report.steps.map(renderStep).join('')}</tbody>
  </table>
  <div class="shots">
    ${artifacts
      .map(
        (artifact) => `<figure>
      <img src="/artifact/${escapeHtml(artifact.key)}" alt="${escapeHtml(artifact.name)}" loading="lazy" />
      <figcaption>${escapeHtml(artifact.name)}</figcaption>
    </figure>`,
      )
      .join('')}
  </div>
</body>
</html>`;
