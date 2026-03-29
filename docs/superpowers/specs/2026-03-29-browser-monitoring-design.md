# Browser Monitoring Mode

**Date:** 2026-03-29
**Status:** Approved

## Problem

After a web enrollment flow completes, the Chrome browser stays open (default behavior) so the user can continue manually. However, the TUI immediately transitions to a "done" state and stops showing activity. The Playwright page listeners are still active and firing events, but the TUI doesn't surface them.

## Solution

Split the web flow into two phases — **automation** and **monitoring** — so the TUI can show a live activity feed of user-driven browser interactions after the automated steps finish.

## Design

### Web flow return type

`runWebEnrollmentFlow` returns a new shape instead of a bare `WebFlowResult`:

```typescript
interface WebFlowReturn {
  result: WebFlowResult;
  monitoring?: Promise<void>; // resolves when browser disconnects
}
```

The `stop()` helper returns the result immediately and packages the `browser.once('disconnected')` promise as `monitoring`. When `autoClose` is true, `monitoring` is undefined — no monitoring phase.

### New emitter event

```typescript
| { type: 'monitoring-start' }
```

Emitted by `runWebExecution` in `app.tsx` after automation completes but before awaiting the monitoring promise.

### app.tsx orchestration

`runWebExecution` changes:

1. `runWebEnrollmentFlow` returns `{ result, monitoring }`
2. Recorder finishes (captures automation artifacts)
3. If `monitoring` exists:
   - Emit `monitoring-start`
   - Await `monitoring` (resolves on browser disconnect)
4. Emit `run-complete`

To support `q` quitting during monitoring, pass a shared `AbortController` signal. When the user presses `q`, the controller aborts, which resolves the monitoring promise via `Promise.race`. After the monitoring promise resolves (regardless of how), `run-complete` always fires so the TUI transitions to the normal completion screen. In the `q` case specifically, the TUI then immediately calls `exit()` after emitting `run-complete`, so the user sees a clean exit without the menu flash.

### execution.tsx — monitoring state

New boolean state `monitoring`, set true by the `monitoring-start` event.

**Right panel when monitoring:**
- Header: "Monitoring browser..." with a spinner
- Shows created user credentials (email, password, memberId, etc.)
- Subtitle: "Navigate the browser — activity appears below. Close browser or press q to finish."

**Preserved behavior:**
- Step sidebar stays as-is with all completed steps
- Log panel continues receiving navigation/network events from the existing Playwright listeners
- `recentLines` feed updates so the user sees live activity without opening logs
- Automation logs remain in the log panel alongside monitoring events

**Transition out of monitoring:**
- Browser disconnects → monitoring promise resolves → `run-complete` emitted → normal completion screen
- User presses `q` → abort signal fires → monitoring promise resolves → TUI exits

### Scope constraints

- Web platform only; mobile runs are unaffected
- Only active when `autoClose` is false (the default)
- No attempt to map URL changes to step names; monitoring is a raw activity feed
- No changes to the RunRecorder — recorder finishes before monitoring begins

## Files changed

| File | Change |
|---|---|
| `src/tui/emitter.ts` | Add `monitoring-start` event type and `monitoringStart()` method |
| `src/steps/web-flow.ts` | Split `stop()` to return result + monitoring promise separately; change return type to `WebFlowReturn` |
| `src/tui/app.tsx` | Handle `WebFlowReturn`, emit monitoring-start, race monitoring with abort, pass abort to Execution |
| `src/tui/execution.tsx` | Add `monitoring` state, monitoring UI, handle abort on `q` during monitoring |
| `src/index.ts` | Unwrap `WebFlowReturn.result` at the CLI call site (destructure `.result` for recorder and console output) |
