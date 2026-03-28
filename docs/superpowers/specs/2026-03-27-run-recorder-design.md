# Run Recorder — Design Spec

**Date:** 2026-03-27
**Status:** Review
**Scope:** `jumper` (TypeScript)

## Problem

Web flows open a visible browser, but there's no persistent artifact of what happened. Mobile flows are API-only with no visual record at all. When a run fails (or succeeds and you need to prove it), there's nothing to review after the fact.

## Goals

1. **Video + trace recording** for web flows (Playwright `.webm` video and `.zip` trace)
2. **Screenshots** at each web flow step
3. **Structured run reports** for all runs (mobile and web) with full debug detail
4. **Self-contained HTML report** for easy human review
5. **One folder per run** stored locally under `jumper/runs/`

## Non-Goals

- Remote storage or upload of artifacts
- Mobile device emulator integration
- Real-time streaming of run data
- Batch run orchestration (each provider run is independent; multi-provider batching is future work)

## Security Note

Run artifacts contain sensitive test data: emails, passwords, auth tokens, and API request/response bodies. The `runs/` directory is `.gitignore`d and local-only. No redaction is applied in v1 — these are test accounts on dev environments. If this tool is ever used against production-like data, redaction should be added.

## Run Folder Structure

Each run produces a timestamped folder:

```
jumper/runs/2026-03-27_14-30-22_mobile_childcare/
├── report.json
├── report.html
├── video.webm           # web only
├── trace.zip            # web only
└── screenshots/         # web only
    ├── 01_at-get-started.png
    ├── 02_at-soft-intro.png
    └── ...
```

Folder name format: `YYYY-MM-DD_HH-mm-ss_{platform}_{vertical}`

Mobile runs contain only `report.json` and `report.html`.

## report.json Schema

```json
{
  "meta": {
    "timestamp": "2026-03-27T14:30:22.000Z",
    "platform": "mobile | web",
    "vertical": "childcare | seniorcare | petcare | housekeeping | tutoring",
    "tier": "basic | premium",
    "targetStep": "at-upgraded",
    "totalDuration": 12340,
    "outcome": "pass | fail"
  },
  "context": {
    "email": "prov-abc123@care.com",
    "password": "letmein1",
    "memberId": "123456",
    "uuid": "abc-def-...",
    "authToken": "...",
    "accessToken": "...",
    "vertical": "CHILDCARE"
  },
  "steps": [
    {
      "name": "at-account-created",
      "status": "pass | fail | skipped",
      "duration": 2150,
      "startedAt": "2026-03-27T14:30:22.100Z",
      "requests": [
        {
          "method": "POST",
          "url": "https://www.dev.carezen.net/platform/spi/enroll/lite?...",
          "status": 200,
          "duration": 680,
          "requestBody": "...truncated to 2KB...",
          "responseBody": "...truncated to 2KB...",
          "timestamp": "2026-03-27T14:30:22.150Z"
        }
      ],
      "screenshot": "screenshots/01_at-account-created.png",
      "error": null
    }
  ],
  "errors": []
}
```

### Schema Rules

- **Truncation:** All request/response bodies truncated at 2KB max using a shared `truncate()` helper. This applies uniformly to `ApiClient.trackedFetch`, web flow fetch listeners, and the recorder.
- **Request/response pairing:** The recorder pairs `network-request` and `network-response` events into a single `requests[]` entry by matching on URL (short URL) and temporal ordering (the next response for a given URL after a request). Unpaired requests (no response received) are included with `status: null`. This assumes sequential requests per URL, which holds for jumper's current serial step execution. If parallel requests to the same URL are introduced in the future, a correlation ID should be added to the emitter events.
- **`step.error` vs `errors[]`:** `step.error` is the error message string for that step (from the emitter's `step-error` event). `errors[]` is a top-level array that duplicates failed step errors with full stack traces. Stack traces are captured at the **catch site** in the pipeline loop (via `(err as Error).stack ?? (err as Error).message`) and passed to the recorder through a new `recorder.recordError(step, error)` method — not through the emitter, which only carries message strings. A failed step populates both. `errors[]` exists for quick "what went wrong" scanning without walking the steps array.
- **`context` fields:** All fields from `ProviderContext` are included. Fields not available for a given platform are set to `null` (e.g., `accessToken` is `null` for web flows that don't acquire one).
- **`screenshot`:** Set to the relative filename for web steps, `null` for mobile steps or if the screenshot failed.
- **Multipart/FormData bodies:** Serialized as `"[FormData: N fields]"` in `requestBody` since the raw multipart encoding is not useful in a report.

## Truncation Helper

Shared utility used by `ApiClient`, web flow listeners, and the recorder:

```typescript
export function truncate(str: string, maxLen = 2048): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `...[truncated, ${str.length} bytes total]`;
}
```

## RunRecorder Class

**File:** `jumper/src/recorder/run-recorder.ts`

### ReportContext

A unified type for the `finish()` call that covers both platforms:

```typescript
interface ReportContext {
  email: string;
  password: string;
  memberId?: string;
  uuid?: string;
  authToken?: string;
  accessToken?: string;
  vertical?: string;
}
```

Both `ProviderContext` (mobile) and `WebFlowResult` (web) satisfy this. At the call site, pass whichever you have — missing fields become `null` in `report.json`.

### Constructor

```typescript
interface RunRecorderConfig {
  platform: 'mobile' | 'web';
  vertical: string;
  tier: string;
  targetStep: string;
}

const recorder = new RunRecorder(config);
// Creates: jumper/runs/2026-03-27_14-30-22_web_childcare/
// Also creates screenshots/ subdirectory for web runs
```

Creates the timestamped run directory (and `screenshots/` subdirectory for web) under `jumper/runs/` synchronously at construction time using `mkdirSync`.

### Internal State

The recorder holds private `browserContext?: BrowserContext` and `browser?: Browser` references, set by `startTrace()`. These are used by `finish()` to stop tracing, close the context and browser, and finalize video. Mobile runs never set these, so `finish()` skips tracing/video steps when `browserContext` is `undefined`.

### API

| Method | Purpose |
|--------|---------|
| `attach(emitter: RunEmitter)` | Subscribe to all emitter events. Captures step transitions and network events (including `body` fields). Pairs request/response by URL+order. |
| `playwrightContextOptions()` | Returns `{ recordVideo: { dir: '<runDir>' } }` for Playwright `BrowserContext` creation. Web only. |
| `startTrace(context: BrowserContext, browser: Browser)` | Stores `context` and `browser` internally, then calls `context.tracing.start({ screenshots: true, snapshots: true })`. Web only. |
| `screenshot(page: Page, stepName: string, index: number)` | Takes a full-page screenshot via `page.screenshot({ path, fullPage: true })`, saves to `screenshots/{index:02d}_{stepName}.png`. Wrapped in try/catch — failure logs a warning but does not abort the run. Web only. |
| `recordError(step: string, err: Error)` | Stores the error with full stack trace for the `errors[]` array in `report.json`. Called from the pipeline's catch block. |
| `finish(ctx: ReportContext)` | **Web:** stops tracing, closes context and browser (see shutdown sequence below; all browser operations wrapped in `try/catch` to tolerate an already-closed browser, e.g. when `!autoClose` and the user closed Chromium first), resolves the video file (globs `<runDir>/*.webm`, renames first match to `video.webm`). **Both:** writes `report.json`, generates `report.html`, logs the run folder path to console. Idempotent — second call is a no-op. |

### Web Shutdown Sequence (inside `finish()`)

`finish()` owns the entire web shutdown sequence. Callers must **not** close the browser context before calling `finish()`. All browser operations in `finish()` are wrapped in `try/catch` so an already-closed browser or context does not throw (e.g. `!autoClose` and the user closed Chromium first). The order:

1. `this.browserContext.tracing.stop({ path: '<runDir>/trace.zip' })` — tracing must stop while context is still open
2. `this.browserContext.close()` — triggers video finalization
3. `this.browser.close()` — closes the Chromium process
4. Glob `<runDir>/*.webm`, rename first match to `<runDir>/video.webm` (if no `.webm` found, log a warning; don't fail)
5. Write `report.json` and `report.html`

For mobile runs, steps 1-4 are skipped (no `browserContext`); step 5 still runs.

### Lifecycle — Web Flow

```typescript
const recorder = new RunRecorder({ platform: 'web', vertical, tier, targetStep });
const emitter = new RunEmitter();
recorder.attach(emitter);

// Inside runWebEnrollmentFlow, recorder configures browser context:
const context = await browser.newContext(recorder.playwrightContextOptions());
await recorder.startTrace(context, browser);  // stores context + browser internally

// After each step completes inside the flow:
await recorder.screenshot(page, stepName, stepIndex);

// End — do NOT close context or browser yourself. finish() handles tracing stop → context close → browser close → video.
await recorder.finish({ email, password, memberId, vertical });
```

### Lifecycle — Mobile Flow

```typescript
const recorder = new RunRecorder({ platform: 'mobile', vertical, tier, targetStep });
const emitter = new RunEmitter();
recorder.attach(emitter);

const client = new ApiClient(baseUrl, apiKey);
client.setEmitter(emitter);

// Run pipeline as normal — step runners already call emitter methods

await recorder.finish(providerContext);
```

## Emitter Changes

**No type changes needed.** The existing `RunEvent` union already has `body?: string` on both `network-request` and `network-response`. The recorder uses these existing fields.

The only change: ensure `ApiClient.trackedFetch` passes response bodies through the emitter's `networkResponse` call (it may currently truncate too aggressively or omit them). Standardize to 2KB truncation using the shared `truncate()` helper.

## ApiClient Changes

In `trackedFetch`:

1. Capture the outgoing body. For `string` bodies, pass through `truncate()`. For `FormData` bodies, emit `"[FormData: N fields]"`.
2. Capture the response text via `res.text()` (already done), pass through `truncate()`.
3. Emit both via `emitter.networkRequest(method, url, truncatedRequestBody)` and `emitter.networkResponse(status, url, duration, truncatedResponseBody)`.

The existing `body` field on both event types carries this data. No new fields on the `RunEvent` type.

## HTML Report

**File:** `jumper/src/recorder/html-template.ts`

Self-contained single `.html` file with inline CSS. No external dependencies.

**Layout:**
- **Banner** — pass/fail badge, platform, vertical, tier, total duration
- **Context** — email, password, memberID, UUID, vertical
- **Steps timeline** — each step as a collapsible `<details>` element showing status, duration, and nested request/response bodies in `<pre>` blocks
- **Screenshots** — embedded as base64 `<img>` thumbnails (clickable to expand full-size in a lightbox-style overlay). Web flows only. Capped at 500KB per image to prevent bloated HTML; if a screenshot exceeds this, link to the file instead of embedding.
- **Errors** — highlighted red section at the bottom if any failures occurred, with full stack traces

## Graceful Shutdown

Current `index.ts` uses `process.exit(1)` on mobile failures, which skips cleanup. Changes:

1. Add a `registerShutdownHandlers(recorder: RunRecorder)` helper in `index.ts` that registers `SIGINT` and `SIGTERM` handlers calling `recorder.finish()` before exiting. This is called at the top of both `runMobileFlow` and `runWebFlow` after recorder construction, giving the signal handlers closure access to the recorder instance.
2. Both mobile and web error paths use `try/finally` to call `recorder.finish(ctx)` before `process.exit(1)`.
3. The `finish()` method is idempotent — safe to call multiple times (second call is a no-op). Signal handlers and `finally` blocks may both invoke it without conflict.

```typescript
function registerShutdownHandlers(recorder: RunRecorder) {
  const handler = async () => {
    await recorder.finish({ email: '', password: '' });
    process.exit(1);
  };
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);
}
```

## Integration Points

### `index.ts` — Mobile

```typescript
async function runMobileFlow(opts, envConfig) {
  const emitter = new RunEmitter();
  const recorder = new RunRecorder({
    platform: 'mobile', vertical: opts.vertical,
    tier: opts.tier, targetStep: opts.step,
  });
  recorder.attach(emitter);
  registerShutdownHandlers(recorder);

  const client = new ApiClient(envConfig.baseUrl, envConfig.apiKey);
  client.setEmitter(emitter);

  let failed = false;
  try {
    // ... existing pipeline loop, step runners emit via client's emitter ...
  } catch (err) {
    recorder.recordError(currentStepName, err as Error);
    failed = true;
  } finally {
    await recorder.finish(ctx);
  }

  if (failed) process.exit(1);
}
```

### `index.ts` — Web

```typescript
async function runWebFlow(opts, envConfig) {
  const emitter = new RunEmitter();
  const recorder = new RunRecorder({
    platform: 'web', vertical: opts.vertical,
    tier: opts.tier, targetStep: opts.step,
  });
  recorder.attach(emitter);
  registerShutdownHandlers(recorder);

  let webResult: WebFlowResult | undefined;
  try {
    webResult = await runWebEnrollmentFlow(
      opts.step, opts.tier, envConfig, verticalConfig,
      serviceType, opts.autoClose, emitter, undefined, recorder,
    );
  } catch (err) {
    recorder.recordError('web-flow', err as Error);
  } finally {
    await recorder.finish({
      email: webResult?.email ?? '',
      password: webResult?.password ?? '',
      memberId: webResult?.memberId,
      vertical: webResult?.vertical,
    });
  }

  if (!webResult) process.exit(1);
}
```

### `web-flow.ts`

```typescript
export async function runWebEnrollmentFlow(
  ...,
  emitter?: RunEmitter,
  onStepComplete?: () => Promise<void>,
  recorder?: RunRecorder,
)
```

- Accept optional `emitter`, `onStepComplete`, and `recorder` after existing parameters. `onStepComplete` is retained for step-through mode (`app.tsx`). When a recorder is present, call `await recorder?.screenshot(page, stepName, index)` after each step; still invoke `onStepComplete` when provided so the UI can advance.
- Configure browser context with `recorder?.playwrightContextOptions()` merged into existing options
- Call `recorder?.startTrace(context, browser)` after context creation
- Do not close context or browser in the flow; `recorder.finish()` owns shutdown so video finalizes
- Map the returned `WebFlowResult` to `ReportContext` at the call site in `index.ts`:
  ```typescript
  const reportCtx: ReportContext = {
    email: webResult.email,
    password: webResult.password,
    memberId: webResult.memberId,
    vertical: webResult.vertical,
  };
  await recorder.finish(reportCtx);
  ```

### `.gitignore`

Add `runs/` to `jumper/.gitignore`.

## Files Changed / Created

| File | Action |
|------|--------|
| `src/recorder/run-recorder.ts` | **New** — RunRecorder class |
| `src/recorder/html-template.ts` | **New** — HTML report generation |
| `src/recorder/truncate.ts` | **New** — shared truncation utility |
| `src/api/client.ts` | **Modified** — pass request/response bodies through emitter using `truncate()` |
| `src/steps/web-flow.ts` | **Modified** — optional `emitter`, `onStepComplete`, `recorder`; screenshots + tracing |
| `src/index.ts` | **Modified** — wire RunRecorder + RunEmitter into both mobile and web paths |
| `.gitignore` | **Modified** — add `runs/` |

## Edge Cases

- **Run interrupted (Ctrl+C):** `SIGINT`/`SIGTERM` handlers call `recorder.finish()` so partial reports are still written. `finish()` is idempotent.
- **Disk space:** Video files can be large. No automatic cleanup — user manages the `runs/` folder.
- **Failed screenshots:** Wrapped in try/catch. Failure logs a warning, sets `screenshot: null` in the report, does not abort the run.
- **No video produced:** If browser crashes before video finalizes, glob returns empty. Log a warning, skip `video.webm`.
- **HTML size:** Screenshots embedded as base64 are capped at 500KB each. Larger screenshots are linked as file paths instead.
