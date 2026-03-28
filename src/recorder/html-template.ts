import type { RunReport, ReportStep, ReportRequest, ReportError } from './types.js';

const MAX_INLINE_SCREENSHOT_BYTES = 500 * 1024;

export function generateHtmlReport(
  report: RunReport,
  screenshots?: Record<string, Buffer>,
): string {
  const { meta, context, steps, errors } = report;
  const isPassing = meta.outcome === 'pass';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Run Report — ${meta.vertical} (${meta.platform})</title>
<style>
${css()}
</style>
</head>
<body>
${banner(meta, isPassing)}
${contextSection(context)}
${stepsSection(steps, screenshots)}
${screenshotsSection(screenshots)}
${errorsSection(errors)}
</body>
</html>`;
}

function css(): string {
  return `
*, *::before, *::after { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: #f5f7fa; color: #1a1a1a; margin: 0; padding: 24px;
  line-height: 1.5;
}
code, pre, .mono { font-family: "SF Mono", "Fira Code", Consolas, monospace; }
pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
h1, h2, h3 { margin: 0 0 8px; }
.banner {
  display: flex; align-items: center; gap: 16px; padding: 16px 20px;
  border-radius: 8px; margin-bottom: 24px; color: #fff;
}
.banner.pass { background: #16a34a; }
.banner.fail { background: #dc2626; }
.badge {
  font-size: 14px; font-weight: 700; letter-spacing: 1px;
  padding: 4px 12px; border-radius: 4px; background: rgba(255,255,255,.2);
}
.banner-info { font-size: 14px; opacity: .9; }
.section { background: #fff; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
.section h2 { font-size: 16px; margin-bottom: 12px; }
.ctx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px 24px; }
.ctx-item label { font-size: 12px; color: #666; display: block; }
.ctx-item .mono { font-size: 14px; }
details { margin-bottom: 8px; }
details summary {
  cursor: pointer; padding: 8px 12px; border-radius: 6px;
  background: #f0f2f5; font-size: 14px; list-style: none;
}
details summary::-webkit-details-marker { display: none; }
details[open] > summary { border-radius: 6px 6px 0 0; }
.step-body { padding: 12px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 6px 6px; }
.req-summary { font-size: 13px; }
.req-body { padding: 8px 12px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 4px 4px; }
.req-body pre { font-size: 12px; background: #f9fafb; padding: 8px; border-radius: 4px; margin: 4px 0; }
.icon-pass { color: #16a34a; } .icon-fail { color: #dc2626; } .icon-skip { color: #9ca3af; }
.errors-section { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
.errors-section h2 { color: #991b1b; }
.error-block { margin-bottom: 12px; }
.error-block pre { font-size: 12px; background: #fff1f2; padding: 8px; border-radius: 4px; color: #7f1d1d; }
.screenshot { max-width: 100%; border-radius: 4px; margin: 8px 0; }
.duration { color: #6b7280; font-size: 13px; }
`;
}

function banner(meta: RunReport['meta'], isPassing: boolean): string {
  const cls = isPassing ? 'pass' : 'fail';
  const label = isPassing ? 'PASS' : 'FAIL';
  const dur = formatDuration(meta.totalDuration);
  return `<div class="banner ${cls}">
  <span class="badge">${label}</span>
  <span class="banner-info">${meta.platform} · ${meta.vertical} · ${meta.tier} · target: ${meta.targetStep} · ${dur}</span>
</div>`;
}

function contextSection(ctx: RunReport['context']): string {
  const fields: [string, string | null][] = [
    ['Email', ctx.email],
    ['Password', ctx.password],
    ['Member ID', ctx.memberId],
    ['UUID', ctx.uuid],
    ['Vertical', ctx.vertical],
  ];
  const items = fields
    .map(([label, val]) => `<div class="ctx-item"><label>${label}</label><span class="mono">${val ?? '—'}</span></div>`)
    .join('\n      ');
  return `<div class="section">
  <h2>Context</h2>
  <div class="ctx-grid">
      ${items}
  </div>
</div>`;
}

function stepsSection(steps: ReportStep[], screenshots?: Record<string, Buffer>): string {
  if (steps.length === 0) return '';
  const items = steps.map(s => stepDetails(s, screenshots)).join('\n');
  return `<div class="section">
  <h2>Steps</h2>
  ${items}
</div>`;
}

function stepDetails(step: ReportStep, screenshots?: Record<string, Buffer>): string {
  const icon = step.status === 'pass' ? '<span class="icon-pass">✓</span>'
    : step.status === 'fail' ? '<span class="icon-fail">✗</span>'
    : '<span class="icon-skip">○</span>';
  const dur = formatDuration(step.duration);

  const requests = step.requests.map(r => requestDetails(r)).join('\n');
  const screenshotHtml = renderScreenshot(step.screenshot, screenshots);

  return `<details>
  <summary>${icon} ${esc(step.name)} <span class="duration">${dur}</span></summary>
  <div class="step-body">
    ${requests}
    ${screenshotHtml}
  </div>
</details>`;
}

function requestDetails(req: ReportRequest): string {
  const statusLabel = req.status != null ? String(req.status) : '—';
  const dur = formatDuration(req.duration);
  const reqBody = req.requestBody
    ? `<div><strong>Request Body</strong><pre>${esc(tryPrettyJson(req.requestBody))}</pre></div>`
    : '';
  const resBody = req.responseBody
    ? `<div><strong>Response Body</strong><pre>${esc(tryPrettyJson(req.responseBody))}</pre></div>`
    : '';

  return `<details>
  <summary class="req-summary">${esc(req.method)} ${esc(req.url)} — ${statusLabel} <span class="duration">${dur}</span></summary>
  <div class="req-body">
    ${reqBody}
    ${resBody}
  </div>
</details>`;
}

function renderScreenshot(
  screenshotPath: string | null,
  screenshots?: Record<string, Buffer>,
): string {
  if (!screenshotPath) return '';
  if (!screenshots) return `<p><a href="${esc(screenshotPath)}">${esc(screenshotPath)}</a></p>`;

  const buf = screenshots[screenshotPath];
  if (!buf) return `<p><a href="${esc(screenshotPath)}">${esc(screenshotPath)}</a></p>`;

  if (buf.length <= MAX_INLINE_SCREENSHOT_BYTES) {
    const b64 = buf.toString('base64');
    return `<img class="screenshot" src="data:image/png;base64,${b64}" alt="Screenshot" style="max-width:100%" />`;
  }

  return `<p><a href="${esc(screenshotPath)}">${esc(screenshotPath)}</a> (${(buf.length / 1024).toFixed(0)} KB)</p>`;
}

function screenshotsSection(screenshots?: Record<string, Buffer>): string {
  if (!screenshots || Object.keys(screenshots).length === 0) return '';
  const items = Object.entries(screenshots).map(([filepath, buf]) => {
    if (buf.length <= MAX_INLINE_SCREENSHOT_BYTES) {
      const b64 = buf.toString('base64');
      return `<div><p class="mono" style="font-size:12px;color:#666">${esc(filepath)}</p><img class="screenshot" src="data:image/png;base64,${b64}" alt="${esc(filepath)}" style="max-width:100%" /></div>`;
    }
    return `<p><a href="${esc(filepath)}">${esc(filepath)}</a> (${(buf.length / 1024).toFixed(0)} KB)</p>`;
  }).join('\n');
  return `<div class="section">
  <h2>Screenshots</h2>
  ${items}
</div>`;
}

function errorsSection(errors: ReportError[]): string {
  if (errors.length === 0) return '';
  const blocks = errors.map(e =>
    `<div class="error-block">
  <strong>${esc(e.step)}</strong> — ${esc(e.message)} <span class="duration">${e.timestamp}</span>
  <pre>${esc(e.stack)}</pre>
</div>`).join('\n');

  return `<div class="errors-section">
  <h2>Errors</h2>
  ${blocks}
</div>`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function tryPrettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
