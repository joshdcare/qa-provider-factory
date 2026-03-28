# Run Recorder — Design Spec

**Date:** 2026-03-27
**Status:** Draft
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
    "authToken": "..."
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
  "errors": [
    {
      "step": "at-upgraded",
      "message": "enroll/upgrade/provider: 500 Internal Server Error",
      "stack": "Error: ...",
      "timestamp": "2026-03-27T14:30:34.000Z"
    }
  ]
}
```

- Request/response bodies truncated at 2KB max
- Each step owns its `requests` array — clear mapping of network calls to steps
- Web steps include `screenshot` filename; mobile steps set it to `null`
- Top-level `errors` array collects failures with stack traces

## RunRecorder Class

**File:** `jumper/src/recorder/run-recorder.ts`

### Constructor

```typescript
interface RunRecorderConfig {
  platform: 'mobile' | 'web';
  vertical: string;
  tier: string;
  targetStep: string;
}

const recorder = new RunRecorder(config);
```

Creates the timestamped run directory under `jumper/runs/`.

### API

| Method | Purpose |
|--------|---------|
| `attach(emitter: RunEmitter)` | Subscribe to emitter events. Captures step start/complete/error and network events (including request/response bodies). |
| `playwrightContextOptions()` | Returns Playwright `BrowserContext` options with `recordVideo` configured to save into the run directory. Called before creating the browser context. Web flows only. |
| `startTrace(context: BrowserContext)` | Calls `context.tracing.start({ screenshots: true, snapshots: true })`. Web flows only. |
| `screenshot(page: Page, stepName: string)` | Takes a full-page screenshot, saves to `screenshots/{index}_{stepName}.png`. Web flows only. |
| `finish(ctx: ProviderContext)` | Stops tracing (saves `trace.zip`), moves the video file into place, writes `report.json`, generates `report.html`, logs the run folder path. |

### Lifecycle

```
// Construction — creates run dir
const recorder = new RunRecorder({ platform, vertical, tier, targetStep });

// Attach to emitter — captures all events
recorder.attach(emitter);

// Web only — configure Playwright
const context = await browser.newContext(recorder.playwrightContextOptions());
await recorder.startTrace(context);

// Web only — after each step
await recorder.screenshot(page, stepName);

// End of run
await recorder.finish(providerContext);
```

## ApiClient Change

`trackedFetch` in `jumper/src/api/client.ts` currently emits network events with method, URL, status, and duration. Two new fields are added to the emitted event:

- `requestBody: string` — the outgoing body, truncated to 2KB
- `responseBody: string` — the response text, truncated to 2KB

The TUI display logic ignores these fields (they aren't rendered). Only `RunRecorder` consumes them.

### Truncation Helper

```typescript
function truncate(str: string, maxLen = 2048): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + `...[truncated, ${str.length} bytes total]`;
}
```

## HTML Report

Self-contained single `.html` file with inline CSS. No external dependencies.

**Layout:**
- **Banner** — pass/fail badge, platform, vertical, tier, total duration
- **Context** — email, password, memberID, UUID
- **Steps timeline** — each step as a collapsible card showing status, duration, and nested request/response details
- **Screenshots** — embedded as base64 thumbnails (clickable to expand), web flows only
- **Errors** — highlighted section at the bottom if any failures occurred

## Integration Points

### Web Flow (`web-flow.ts`)

```typescript
// Before browser launch
const recorder = new RunRecorder({ platform: 'web', vertical, tier, targetStep });
recorder.attach(emitter);

// Browser context creation
const context = await browser.newContext({
  ...recorder.playwrightContextOptions(),
  // existing options
});
await recorder.startTrace(context);

// After each step completes
await recorder.screenshot(page, stepName);

// End
await recorder.finish(providerContext);
```

### Mobile Flow (`index.ts` / pipeline orchestration)

```typescript
const recorder = new RunRecorder({ platform: 'mobile', vertical, tier, targetStep });
recorder.attach(emitter);

// ... run pipeline as normal ...

await recorder.finish(providerContext);
```

### .gitignore

Add `runs/` to `jumper/.gitignore` — run artifacts are local-only.

## Files Changed / Created

| File | Action |
|------|--------|
| `src/recorder/run-recorder.ts` | **New** — RunRecorder class |
| `src/recorder/html-template.ts` | **New** — HTML report generation |
| `src/api/client.ts` | **Modified** — add requestBody/responseBody to network events |
| `src/tui/emitter.ts` | **Modified** — add requestBody/responseBody to NetworkEvent type |
| `src/steps/web-flow.ts` | **Modified** — wire in recorder (context options, tracing, screenshots) |
| `src/index.ts` | **Modified** — wire in recorder for mobile flows |
| `.gitignore` | **Modified** — add `runs/` |

## Edge Cases

- **Run interrupted (Ctrl+C):** `finish()` should be called in a `finally` block or process exit handler so partial reports are still written.
- **Disk space:** Video files can be large. No automatic cleanup — user manages the `runs/` folder.
- **Batch runs (multiple providers):** Each provider in a batch gets its own run folder.
- **Failed screenshots:** If a screenshot fails (page crashed, browser closed), log the error in the step but don't abort the run.
