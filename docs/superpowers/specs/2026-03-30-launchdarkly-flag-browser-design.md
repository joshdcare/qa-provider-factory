# LaunchDarkly Flag Browser

**Date:** 2026-03-30
**Status:** Ready for planning

## Purpose

Add a LaunchDarkly feature flag browser to Jumper so QA engineers can search and toggle flags without leaving the terminal. This eliminates context-switching to the LD web UI during test setup and execution.

## Audience

QA engineers who need to flip environment-wide feature flags before or during provider enrollment test runs.

## Entry Points

```
jumper flags [--env dev|stg]       → standalone flag browser
jumper start                       → wizard includes optional "Feature Flags" stage
                                   → press 'f' during execution to open flag overlay
```

Three access patterns, one shared component:

1. **Standalone command** — `jumper flags` opens the flag browser directly. Accepts `--env` (defaults to `dev`). Exit with `esc` or `q`.
2. **Wizard confirm option** — The confirm stage gains a fourth option: "Manage feature flags" which opens the flag browser inline. Pressing `esc` returns to the confirm screen. No new wizard stage is added.
3. **Execution hotkey** — Press `f` during a run to open a flag overlay on top of the execution view. Press `esc` or `f` again to dismiss.

## LaunchDarkly API Integration

### Client Module: `src/api/launchdarkly.ts`

Wraps the [LaunchDarkly REST API v2](https://apidocs.launchdarkly.com/) with two operations:

- **searchFlags(query?, envKey)** — `GET /api/v2/flags/{projectKey}?env={envKey}&filter=query~{query}&limit=20&sort=name` — returns flags matching a name/key substring. When `query` is empty, omits the filter to return the first page alphabetically. Each returned flag includes its per-environment `on` state.
- **toggleFlag(flagKey, envKey, newState)** — `PATCH /api/v2/flags/{projectKey}/{flagKey}` with a semantic patch to set the environment's `on` field:
  ```json
  [{ "op": "replace", "path": "/environments/{envKey}/on", "value": true }]
  ```

The response shape used by the component (`LDFlag`):

```typescript
interface LDFlag {
  key: string;
  name: string;
  on: boolean;  // resolved from environments[envKey].on
}
```

### Configuration

| Env Var | Purpose |
|---------|---------|
| `LD_API_TOKEN` | LaunchDarkly API access token (required) |
| `LD_PROJECT_KEY` | LaunchDarkly project key (required) |

### Environment Mapping

Jumper environments map to LD environment keys:

| Jumper | LaunchDarkly |
|--------|-------------|
| `dev` | `development` |
| `stg` | `stage` |

Production is never exposed. The client rejects any attempt to toggle a flag in an environment not in this map, enforced at the API client level.

### Error Handling

- **Missing env vars** — If `LD_API_TOKEN` or `LD_PROJECT_KEY` is not set, the flag browser shows a message with the required var names instead of crashing. The rest of Jumper works normally.
- **API errors** — Rate limits, auth failures, and network errors are shown inline in the flag browser. Toggle failures show the error and leave the flag in its previous state.
- **Stale state** — After a successful toggle, the flag list re-fetches to confirm the new state. A brief "Toggled" confirmation appears next to the flag.

## TUI Component: `src/tui/flag-browser.tsx`

A single reusable React (Ink) component used by all three entry points.

### Layout

```
┌─────────────────────────────────────────┐
│ ██ Feature Flags          dev           │
├─────────────────────────────────────────┤
│ Search: provider-enroll█                │
│                                         │
│ ● provider-enrollment-v2          ON    │
│ ○ provider-enrollment-skip-intro  OFF   │
│ ○ provider-new-onboarding-flow    OFF   │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│ ↑↓ select · enter: toggle · esc: close  │
└─────────────────────────────────────────┘
```

### Behavior

- **Search input** — Text field at the top. Debounced (300ms) API calls as the user types. Empty query calls `GET /api/v2/flags/{projectKey}?limit=20&sort=name` to show the first page of flags alphabetically.
- **Flag list** — Scrollable list of matching flags. Each row shows: status indicator (`●` on / `○` off), flag name, and current state (`ON` / `OFF`). The selected row is highlighted.
- **Toggle** — Press `enter` on a selected flag to toggle it. The row shows a brief spinner during the API call. After a successful toggle, the client re-fetches via `searchFlags` (using the current query) to confirm the new state.
- **Navigation** — `↑/↓` to move selection, `esc` to close (overlay/wizard) or quit (standalone). `q` also quits in standalone mode.

### Props

```typescript
interface FlagBrowserProps {
  env: Env;
  onClose?: () => void;  // called when user dismisses (undefined in standalone mode)
}
```

### State Management

The component manages its own state:
- `query: string` — current search text
- `flags: LDFlag[]` — current search results
- `selectedIndex: number` — highlighted flag
- `loading: boolean` — search in progress
- `togglingKey: string | null` — flag currently being toggled

No shared state with the rest of the app. The `env` prop determines which LD environment to read/write.

## Integration Points

### Standalone Command

New command registered in `src/index.ts`:

```
jumper flags [--env dev|stg]
```

Renders the `FlagBrowser` component as a full-screen Ink app. Exits on `esc` or `q`.

### Wizard (Confirm Screen Option)

The existing confirm stage's `SelectInput` gains a fourth option: "Manage feature flags". Selecting it opens the flag browser inline within the confirm panel. Pressing `esc` returns to the confirm screen. No new wizard stage is added — users who don't need flags never see an extra step.

### Execution Overlay

Pressing `f` during execution renders the `FlagBrowser` as an overlay on top of the execution view. The execution continues running underneath. Pressing `esc` or `f` dismisses the overlay. This reuses the existing `useInput` handler in `execution.tsx`.

## Safety

- **Production blocked** — The LD client function `toggleFlag` checks the environment key against an allowlist (`development`, `stage`). Any other key throws an error before making the API call.
- **No destructive operations** — The browser only toggles boolean on/off state. It does not delete flags, modify targeting rules, or change flag variations.
- **Confirmation on toggle** — No extra confirmation dialog. The toggle is a single keypress (`enter`) and immediately reversible with another `enter`. This matches the quick-toggle workflow the user described.

## New Files

| File | Purpose |
|------|---------|
| `src/api/launchdarkly.ts` | LD REST API client (search, toggle) |
| `src/tui/flag-browser.tsx` | Reusable flag browser Ink component |

## Modified Files

| File | Change |
|------|--------|
| `src/index.ts` | Add `jumper flags` command |
| `src/tui/wizard.tsx` | Add "Manage feature flags" option to confirm stage |
| `src/tui/execution.tsx` | Add `f` hotkey for flag overlay |
| `src/types.ts` | Add LD environment mapping constant |
| `.env.example` | Add `LD_API_TOKEN` and `LD_PROJECT_KEY` |

## Testing

- **LD client** — Unit tests with mocked `fetch` for search and toggle operations. Tests for error handling (auth failure, rate limit, network error). Test that production environment is rejected.
- **Flag browser component** — `ink-testing-library` tests for rendering, search input, flag selection, toggle interaction.
- **Integration** — Verify the `f` hotkey opens/closes the overlay during execution. Verify the wizard "Manage feature flags" option works.
