# LaunchDarkly Variation Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add variation selection to the LaunchDarkly flag browser so users can set which variation is served when a flag is ON, with session-scoped revert on exit.

**Architecture:** Extend the existing `LDFlag` type to carry variations and fallthrough info, add a `setFallthroughVariation` API method, expand session tracking to snapshot and revert both ON/OFF and fallthrough state, and add a detail view to the flag browser component.

**Tech Stack:** TypeScript, Ink (React for CLI), LaunchDarkly REST API v2 (semantic patch), Vitest

**Spec:** `docs/superpowers/specs/2026-03-30-ld-variation-selection-design.md`

---

### Task 1: Extend LDFlag type and update searchFlags

**Files:**
- Modify: `src/api/launchdarkly.ts`
- Test: `tests/launchdarkly.test.ts`

- [ ] **Step 1: Write failing test for new searchFlags shape**

In `tests/launchdarkly.test.ts`, **replace** the existing `returns flags with correct on state from environments` test with:

```typescript
it('returns flags with variations and fallthroughVariationId', async () => {
  fetchImpl.mockResolvedValueOnce(
    mockJsonResponse({
      items: [
        {
          key: 'flag-a',
          name: 'Flag A',
          variations: [
            { _id: 'v1', name: 'control', value: 'control' },
            { _id: 'v2', name: 'test', value: 'test' },
          ],
          environments: {
            dev: { on: true, fallthrough: { variation: 1 } },
          },
        },
      ],
    })
  );

  const client = new LDClient('api-token', PROJECT, fetchImpl);
  const flags = await client.searchFlags('q', 'dev');

  expect(flags[0]).toEqual({
    key: 'flag-a',
    name: 'Flag A',
    on: true,
    variations: [
      { id: 'v1', name: 'control', value: 'control' },
      { id: 'v2', name: 'test', value: 'test' },
    ],
    fallthroughVariationId: 'v2',
  });
});
```

Add a test for rollout-based fallthrough:

```typescript
it('sets fallthroughVariationId to null for rollout-based fallthrough', async () => {
  fetchImpl.mockResolvedValueOnce(
    mockJsonResponse({
      items: [
        {
          key: 'flag-r',
          name: 'Rollout Flag',
          variations: [
            { _id: 'v1', name: 'off', value: false },
            { _id: 'v2', name: 'on', value: true },
          ],
          environments: {
            dev: {
              on: true,
              fallthrough: {
                rollout: { variations: [{ variation: 0, weight: 50000 }, { variation: 1, weight: 50000 }] },
              },
            },
          },
        },
      ],
    })
  );

  const client = new LDClient('api-token', PROJECT, fetchImpl);
  const flags = await client.searchFlags('q', 'dev');

  expect(flags[0].fallthroughVariationId).toBeNull();
});
```

Also update the `omits filter when query is empty` test to not assert the full shape (it only checks URL params, so no change needed there).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/launchdarkly.test.ts`
Expected: FAIL — `LDFlag` doesn't have `variations` or `fallthroughVariationId` yet.

- [ ] **Step 3: Update LDFlag type and mapItemToFlag**

In `src/api/launchdarkly.ts`:

1. Add the `LDVariation` interface (exported, above `LDFlag`):

```typescript
export interface LDVariation {
  id: string;
  name?: string;
  value: unknown;
}
```

2. Replace `LDFlag`:

```typescript
export interface LDFlag {
  key: string;
  name: string;
  on: boolean;
  variations: LDVariation[];
  fallthroughVariationId: string | null;
}
```

3. Replace `mapItemToFlag` — it now reads the full item shape including `variations[]` and `environments[env].fallthrough`:

```typescript
function mapItemToFlag(
  item: {
    key: string;
    name: string;
    variations?: Array<{ _id: string; name?: string; value: unknown }>;
    environments?: Record<string, { on?: boolean; fallthrough?: { variation?: number; rollout?: unknown } }>;
  },
  envKey: string
): LDFlag {
  const envData = item.environments?.[envKey];
  const on = envData?.on ?? false;

  const variations: LDVariation[] = (item.variations ?? []).map(v => ({
    id: v._id,
    name: v.name,
    value: v.value,
  }));

  let fallthroughVariationId: string | null = null;
  const ft = envData?.fallthrough;
  if (ft && typeof ft.variation === 'number' && variations[ft.variation]) {
    fallthroughVariationId = variations[ft.variation].id;
  }

  return { key: item.key, name: item.name, on, variations, fallthroughVariationId };
}
```

4. Update the type assertion in `toggleFlag` to match the wider shape used by `mapItemToFlag` (the PATCH response includes variations and fallthrough too):

Replace the existing `res.json() as { ... }` cast in `toggleFlag` with:

```typescript
const item = (await res.json()) as {
  key: string;
  name: string;
  variations?: Array<{ _id: string; name?: string; value: unknown }>;
  environments?: Record<string, { on?: boolean; fallthrough?: { variation?: number; rollout?: unknown } }>;
};
```

- [ ] **Step 4: Fix existing tests and run**

The existing `toggleFlag` test (`sends correct PATCH body and returns updated flag`) needs its mock response and assertion updated. Update the mock `updated` object to include `variations`:

```typescript
const updated = {
  key: flagKey,
  name: 'My Feature',
  variations: [
    { _id: 'v1', name: 'off', value: false },
    { _id: 'v2', name: 'on', value: true },
  ],
  environments: {
    stg: { on: true, fallthrough: { variation: 0 } },
  },
};
```

Update the assertion to include new fields:

```typescript
expect(result).toEqual({
  key: flagKey,
  name: 'My Feature',
  on: true,
  variations: [
    { id: 'v1', name: 'off', value: false },
    { id: 'v2', name: 'on', value: true },
  ],
  fallthroughVariationId: 'v1',
});
```

Run: `npx vitest run tests/launchdarkly.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/launchdarkly.ts tests/launchdarkly.test.ts
git commit -m "feat(ld): extend LDFlag with variations and fallthroughVariationId"
```

---

### Task 2: Add setFallthroughVariation API method

**Files:**
- Modify: `src/api/launchdarkly.ts`
- Test: `tests/launchdarkly.test.ts`

- [ ] **Step 1: Write failing tests**

In `tests/launchdarkly.test.ts`, add a new `describe('setFallthroughVariation')` block:

```typescript
describe('setFallthroughVariation', () => {
  it('sends correct semantic patch and returns updated flag', async () => {
    const updated = {
      key: 'my-flag',
      name: 'My Flag',
      variations: [
        { _id: 'v1', name: 'control', value: 'control' },
        { _id: 'v2', name: 'test', value: 'test' },
      ],
      environments: {
        dev: { on: true, fallthrough: { variation: 1 } },
      },
    };
    fetchImpl.mockResolvedValueOnce(mockJsonResponse(updated));

    const client = new LDClient('api-token', PROJECT, fetchImpl);
    const result = await client.setFallthroughVariation('my-flag', 'dev', 'v2');

    expect(result.fallthroughVariationId).toBe('v2');

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/flags/${PROJECT}/my-flag`);
    expect(init.method).toBe('PATCH');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json; domain-model=launchdarkly.semanticpatch',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      environmentKey: 'dev',
      instructions: [{ kind: 'updateFallthroughVariationOrRollout', variationId: 'v2' }],
    });
  });

  it('rejects unknown environment', async () => {
    const client = new LDClient('api-token', PROJECT, fetchImpl);
    await expect(
      client.setFallthroughVariation('flag', 'prod' as never, 'v1')
    ).rejects.toThrow(/not allowed/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/launchdarkly.test.ts`
Expected: FAIL — `setFallthroughVariation` does not exist.

- [ ] **Step 3: Implement setFallthroughVariation**

In `src/api/launchdarkly.ts`, add to the `LDClient` class after `toggleFlag`:

```typescript
async setFallthroughVariation(
  flagKey: string,
  ldEnv: string,
  variationId: string,
  fetchImpl: FetchImpl = this.defaultFetch
): Promise<LDFlag> {
  if (!(ldEnv in LD_ENV_MAP)) {
    throw new Error('Toggling in that environment is not allowed');
  }
  const envKey = LD_ENV_MAP[ldEnv as Env];
  const url = `${LD_API_BASE}/flags/${encodeURIComponent(this.projectKey)}/${encodeURIComponent(flagKey)}`;
  const body = JSON.stringify({
    environmentKey: envKey,
    instructions: [{ kind: 'updateFallthroughVariationOrRollout', variationId }],
  });

  const res = await fetchImpl(url, {
    method: 'PATCH',
    headers: {
      Authorization: this.token,
      'Content-Type': 'application/json; domain-model=launchdarkly.semanticpatch',
    },
    body,
  });

  await throwIfNotOk(res);
  const item = (await res.json()) as {
    key: string;
    name: string;
    variations?: Array<{ _id: string; name?: string; value: unknown }>;
    environments?: Record<string, { on?: boolean; fallthrough?: { variation?: number; rollout?: unknown } }>;
  };
  return mapItemToFlag(item, envKey);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/launchdarkly.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/launchdarkly.ts tests/launchdarkly.test.ts
git commit -m "feat(ld): add setFallthroughVariation API method"
```

---

### Task 3: Expand session tracking to snapshot variations

**Files:**
- Modify: `src/tui/flag-session.ts`
- Create: `tests/tui/flag-session.test.ts`
- Modify: `src/tui/flag-browser.tsx` (update call sites from `recordToggle` to `recordSnapshot`)
- Modify: `src/tui/wizard.tsx` (update confirm screen display)

**Note:** This task depends on Task 1 having already landed — `flag-browser.tsx` now passes `flag.fallthroughVariationId` which only exists on the extended `LDFlag`.

- [ ] **Step 1: Write failing tests for flag-session**

Create `tests/tui/flag-session.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Dynamic import mock — we need to intercept the LDClient that revertSessionToggles uses
const toggleFlagMock = vi.fn();
const setFallthroughVariationMock = vi.fn();

vi.mock('../../src/api/launchdarkly.js', () => ({
  LDClient: class {
    toggleFlag = toggleFlagMock;
    setFallthroughVariation = setFallthroughVariationMock;
  },
}));

// Import after mock
import {
  recordSnapshot,
  hasSessionToggles,
  getSessionToggleCount,
  getSessionToggleEntries,
  revertSessionToggles,
} from '../../src/tui/flag-session.js';

describe('flag-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear session state by reverting with no env vars set
    // (revertSessionToggles clears the map if no token/projectKey)
    const origToken = process.env.LD_API_TOKEN;
    const origProject = process.env.LD_PROJECT_KEY;
    delete process.env.LD_API_TOKEN;
    delete process.env.LD_PROJECT_KEY;
    // Force clear by calling revert with no credentials
    return revertSessionToggles().then(() => {
      process.env.LD_API_TOKEN = origToken;
      process.env.LD_PROJECT_KEY = origProject;
    });
  });

  it('records first snapshot and ignores subsequent calls for same key', () => {
    recordSnapshot('flag-a', true, 'v1', 'dev');
    recordSnapshot('flag-a', false, 'v2', 'dev');

    const entries = getSessionToggleEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      key: 'flag-a',
      originalOn: true,
      originalFallthroughId: 'v1',
      env: 'dev',
    });
  });

  it('tracks multiple flags independently', () => {
    recordSnapshot('flag-a', true, 'v1', 'dev');
    recordSnapshot('flag-b', false, null, 'stg');

    expect(getSessionToggleCount()).toBe(2);
    expect(hasSessionToggles()).toBe(true);
  });

  it('returns entries with originalFallthroughId shape', () => {
    recordSnapshot('flag-a', true, 'v1', 'dev');
    const entries = getSessionToggleEntries();
    expect(entries[0]).toHaveProperty('originalFallthroughId', 'v1');
    expect(entries[0]).toHaveProperty('originalOn', true);
    expect(entries[0]).toHaveProperty('env', 'dev');
  });

  describe('revertSessionToggles', () => {
    beforeEach(() => {
      process.env.LD_API_TOKEN = 'test-token';
      process.env.LD_PROJECT_KEY = 'test-project';
      toggleFlagMock.mockResolvedValue(undefined);
      setFallthroughVariationMock.mockResolvedValue(undefined);
    });

    it('calls setFallthroughVariation then toggleFlag per flag', async () => {
      recordSnapshot('flag-a', true, 'v1', 'dev');

      await revertSessionToggles();

      expect(setFallthroughVariationMock).toHaveBeenCalledWith('flag-a', 'dev', 'v1');
      expect(toggleFlagMock).toHaveBeenCalledWith('flag-a', 'dev', true);

      // setFallthroughVariation should be called before toggleFlag
      const ftOrder = setFallthroughVariationMock.mock.invocationCallOrder[0];
      const toggleOrder = toggleFlagMock.mock.invocationCallOrder[0];
      expect(ftOrder).toBeLessThan(toggleOrder);
    });

    it('skips setFallthroughVariation when originalFallthroughId is null', async () => {
      recordSnapshot('flag-a', false, null, 'dev');

      await revertSessionToggles();

      expect(setFallthroughVariationMock).not.toHaveBeenCalled();
      expect(toggleFlagMock).toHaveBeenCalledWith('flag-a', 'dev', false);
    });

    it('clears session after revert', async () => {
      recordSnapshot('flag-a', true, 'v1', 'dev');

      await revertSessionToggles();

      expect(hasSessionToggles()).toBe(false);
      expect(getSessionToggleCount()).toBe(0);
    });

    it('continues reverting remaining flags when one fails', async () => {
      recordSnapshot('flag-a', true, 'v1', 'dev');
      recordSnapshot('flag-b', false, 'v2', 'stg');

      toggleFlagMock.mockRejectedValueOnce(new Error('API error'));
      toggleFlagMock.mockResolvedValueOnce(undefined);

      await revertSessionToggles();

      expect(toggleFlagMock).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tui/flag-session.test.ts`
Expected: FAIL — `recordSnapshot` doesn't exist yet (still `recordToggle` with different signature).

- [ ] **Step 3: Rewrite flag-session.ts**

Replace the full contents of `src/tui/flag-session.ts` with:

```typescript
import type { Env } from '../types.js';

interface ToggleRecord {
  originalOn: boolean;
  originalFallthroughId: string | null;
  originalFallthroughName: string | null;
  env: Env;
}

const sessionToggles = new Map<string, ToggleRecord>();

/**
 * Snapshot original state of a flag before the first change this session.
 * Subsequent changes to the same flag are ignored — we only need the
 * state to restore on exit.
 */
export function recordSnapshot(
  flagKey: string,
  originalOn: boolean,
  originalFallthroughId: string | null,
  env: Env,
  originalFallthroughName?: string | null
): void {
  if (!sessionToggles.has(flagKey)) {
    sessionToggles.set(flagKey, {
      originalOn,
      originalFallthroughId,
      originalFallthroughName: originalFallthroughName ?? null,
      env,
    });
  }
}

export function hasSessionToggles(): boolean {
  return sessionToggles.size > 0;
}

export function getSessionToggleCount(): number {
  return sessionToggles.size;
}

export function getSessionToggleEntries(): Array<{
  key: string;
  originalOn: boolean;
  originalFallthroughId: string | null;
  originalFallthroughName: string | null;
  env: Env;
}> {
  return [...sessionToggles.entries()].map(([key, rec]) => ({
    key,
    originalOn: rec.originalOn,
    originalFallthroughId: rec.originalFallthroughId,
    originalFallthroughName: rec.originalFallthroughName,
    env: rec.env,
  }));
}

/**
 * Revert all flags changed this session back to their original state.
 * Per-flag revert is sequential (fallthrough first, then ON/OFF).
 * All flags revert in parallel. Best-effort — individual failures are
 * swallowed so remaining flags still get reverted.
 */
export async function revertSessionToggles(): Promise<void> {
  if (sessionToggles.size === 0) return;

  const token = process.env.LD_API_TOKEN;
  const projectKey = process.env.LD_PROJECT_KEY;
  if (!token || !projectKey) {
    sessionToggles.clear();
    return;
  }

  const { LDClient } = await import('../api/launchdarkly.js');
  const client = new LDClient(token, projectKey);

  const entries = [...sessionToggles.entries()];
  sessionToggles.clear();

  await Promise.allSettled(
    entries.map(async ([flagKey, { originalOn, originalFallthroughId, env }]) => {
      if (originalFallthroughId !== null) {
        await client.setFallthroughVariation(flagKey, env, originalFallthroughId);
      }
      await client.toggleFlag(flagKey, env, originalOn);
    }),
  );
}
```

- [ ] **Step 4: Run session tests**

Run: `npx vitest run tests/tui/flag-session.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Update call sites in flag-browser.tsx**

In `src/tui/flag-browser.tsx`:
- Change import: `recordToggle` → `recordSnapshot` (also keep `getSessionToggleCount`).
- In the `handleToggle` callback, change:
  `recordToggle(flag.key, flag.on, env)`
  to:
  `recordSnapshot(flag.key, flag.on, flag.fallthroughVariationId, env, ftVariationName)`
  where `ftVariationName` is resolved from the flag's variations array:
  ```typescript
  const ftVar = flag.variations.find(v => v.id === flag.fallthroughVariationId);
  const ftVariationName = ftVar?.name ?? null;
  recordSnapshot(flag.key, flag.on, flag.fallthroughVariationId, env, ftVariationName);
  ```

- [ ] **Step 6: Update confirm screen in wizard.tsx**

In `src/tui/wizard.tsx`, in the confirm `case`, the `toggledFlags` rendering references `f.originalState`. Update to `f.originalOn` and add variation change display:

```tsx
{toggledFlags.map(f => (
  <Box key={f.key} flexDirection="column">
    <Text>
      <Text color={COLORS.dimText}>  </Text>
      <Text color={f.originalOn ? COLORS.stepError : COLORS.stepComplete}>
        {f.originalOn ? '● OFF' : '● ON '}
      </Text>
      <Text color={COLORS.dimText}> ← </Text>
      <Text color={f.originalOn ? COLORS.stepComplete : COLORS.stepError}>
        {f.originalOn ? 'ON' : 'OFF'}
      </Text>
      <Text color={COLORS.contextValue}>  {f.key}</Text>
    </Text>
    {f.originalFallthroughName && (
      <Text>
        <Text color={COLORS.dimText}>{'                 variation: '}</Text>
        <Text color={COLORS.contextValue}>{f.originalFallthroughName}</Text>
        <Text color={COLORS.dimText}>{' → changed'}</Text>
      </Text>
    )}
  </Box>
))}
```

The `originalFallthroughName` being non-null signals that this flag had a variation at the time of snapshot. The actual current variation name isn't stored (it would require re-fetching), so we show `→ changed` to indicate the variation was modified.

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/tui/flag-session.ts tests/tui/flag-session.test.ts src/tui/flag-browser.tsx src/tui/wizard.tsx
git commit -m "feat(ld): expand session tracking to snapshot and revert variations"
```

---

### Task 4: Add detail view to flag browser

**Files:**
- Modify: `src/tui/flag-browser.tsx`
- Test: `tests/tui/flag-browser.test.tsx`

- [ ] **Step 1: Update the test mock and write failing tests**

In `tests/tui/flag-browser.test.tsx`:

First, add `setFallthroughVariationMock` to the mock class so the detail view can call it:

```typescript
const searchFlagsMock = vi.fn();
const toggleFlagMock = vi.fn();
const setFallthroughVariationMock = vi.fn();

vi.mock('../../src/api/launchdarkly.js', () => ({
  LDClient: class {
    searchFlags = searchFlagsMock;
    toggleFlag = toggleFlagMock;
    setFallthroughVariation = setFallthroughVariationMock;
  },
}));
```

Add `setFallthroughVariationMock` to the `beforeEach`, and update `toggleFlagMock` return to include the new `LDFlag` fields:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  // ... existing setup ...
  toggleFlagMock.mockImplementation(async (_key: string, _env: string, _state: boolean) => ({
    key: 'k', name: 'n', on: true, variations: [], fallthroughVariationId: null,
  }));
  setFallthroughVariationMock.mockResolvedValue({
    key: 'k', name: 'n', on: true, variations: [], fallthroughVariationId: null,
  });
});
```

Then add the detail view test:

```typescript
it('opens detail view on Enter and shows variations', async () => {
  process.env.LD_API_TOKEN = 'test-token';
  process.env.LD_PROJECT_KEY = 'test-project';

  searchFlagsMock.mockResolvedValue([
    {
      key: 'my-flag',
      name: 'My Flag',
      on: true,
      variations: [
        { id: 'v1', name: 'control', value: 'control' },
        { id: 'v2', name: 'test', value: 'test' },
      ],
      fallthroughVariationId: 'v1',
    },
  ]);

  const inst = render(<FlagBrowser env="dev" />);

  await vi.waitFor(
    () => { expect(inst.lastFrame()).toContain('my-flag'); },
    { timeout: 3000 }
  );

  inst.stdin.write('\r');

  await vi.waitFor(
    () => {
      const frame = inst.lastFrame()!;
      expect(frame).toContain('Fallthrough variation');
      expect(frame).toContain('control');
      expect(frame).toContain('test');
      expect(frame).toContain('← current');
    },
    { timeout: 3000 }
  );

  inst.unmount();
});
```

And a test for selecting a variation:

```typescript
it('sets fallthrough variation on Enter in detail view', async () => {
  process.env.LD_API_TOKEN = 'test-token';
  process.env.LD_PROJECT_KEY = 'test-project';

  const flag = {
    key: 'my-flag',
    name: 'My Flag',
    on: true,
    variations: [
      { id: 'v1', name: 'control', value: 'control' },
      { id: 'v2', name: 'test', value: 'test' },
    ],
    fallthroughVariationId: 'v1',
  };
  searchFlagsMock.mockResolvedValue([flag]);
  setFallthroughVariationMock.mockResolvedValue({ ...flag, fallthroughVariationId: 'v2' });

  const inst = render(<FlagBrowser env="dev" />);

  await vi.waitFor(
    () => { expect(inst.lastFrame()).toContain('my-flag'); },
    { timeout: 3000 }
  );

  // Open detail view
  inst.stdin.write('\r');

  await vi.waitFor(
    () => { expect(inst.lastFrame()).toContain('Fallthrough variation'); },
    { timeout: 3000 }
  );

  // Move down to second variation and select it
  inst.stdin.write('\x1B[B'); // down arrow
  inst.stdin.write('\r');     // enter

  await vi.waitFor(
    () => {
      expect(setFallthroughVariationMock).toHaveBeenCalledWith('my-flag', 'dev', 'v2');
    },
    { timeout: 3000 }
  );

  inst.unmount();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tui/flag-browser.test.tsx`
Expected: FAIL — no detail view exists yet.

- [ ] **Step 3: Implement detail view in flag-browser.tsx**

In `src/tui/flag-browser.tsx`:

1. Import `LDVariation` from the LD client (for the helper function type):

```typescript
import { LDClient, type LDFlag, type LDVariation } from '../api/launchdarkly.js';
```

2. Add a helper function above the `FlagBrowser` component:

```typescript
function variationDisplayName(v: LDVariation, index: number): string {
  if (v.name) return v.name;
  const valStr = JSON.stringify(v.value);
  if (valStr.length <= 40) return valStr;
  return `Variation ${index}`;
}
```

3. Add new state declarations (alongside existing state):

```typescript
const [view, setView] = useState<'list' | 'detail'>('list');
const [detailFlag, setDetailFlag] = useState<LDFlag | null>(null);
const [variationIndex, setVariationIndex] = useState(0);
const [settingVariation, setSettingVariation] = useState(false);
```

4. Add `handleSetVariation` callback (alongside existing `handleToggle`):

```typescript
const handleSetVariation = useCallback(async () => {
  if (!client || !detailFlag || settingVariation) return;
  const variation = detailFlag.variations[variationIndex];
  if (!variation || variation.id === detailFlag.fallthroughVariationId) return;
  setSettingVariation(true);
  setError(null);
  try {
    const origFtVar = detailFlag.variations.find(v => v.id === detailFlag.fallthroughVariationId);
    recordSnapshot(detailFlag.key, detailFlag.on, detailFlag.fallthroughVariationId, env, origFtVar?.name ?? null);
    await client.setFallthroughVariation(detailFlag.key, env, variation.id);
    setToggledKey(detailFlag.key);
    if (toggledTimeoutRef.current) clearTimeout(toggledTimeoutRef.current);
    toggledTimeoutRef.current = setTimeout(() => {
      setToggledKey(null);
      toggledTimeoutRef.current = null;
    }, 2000);
    await loadFlags();
    // Update detail flag from refreshed data
    setDetailFlag(prev => {
      if (!prev) return prev;
      return { ...prev, fallthroughVariationId: variation.id };
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    setSettingVariation(false);
  }
}, [client, env, detailFlag, variationIndex, loadFlags, settingVariation]);
```

5. Update the `handleToggle` callback to work from both views. Add a derived `activeFlag`:

```typescript
const activeFlag = view === 'detail' ? detailFlag : (flags[selectedIndex] ?? null);
```

Rewrite `handleToggle` to use `activeFlag` instead of `flags[selectedIndex]`:

```typescript
const handleToggle = useCallback(async () => {
  if (!client || !activeFlag || togglingKey) return;
  setTogglingKey(activeFlag.key);
  setError(null);
  try {
    const origFtVar = activeFlag.variations.find(v => v.id === activeFlag.fallthroughVariationId);
    recordSnapshot(activeFlag.key, activeFlag.on, activeFlag.fallthroughVariationId, env, origFtVar?.name ?? null);
    const newState = !activeFlag.on;
    await client.toggleFlag(activeFlag.key, env, newState);
    setTogglingKey(null);
    setToggledKey(activeFlag.key);
    if (toggledTimeoutRef.current) clearTimeout(toggledTimeoutRef.current);
    toggledTimeoutRef.current = setTimeout(() => {
      setToggledKey(null);
      toggledTimeoutRef.current = null;
    }, 2000);
    await loadFlags();
    if (view === 'detail') {
      setDetailFlag(prev => prev ? { ...prev, on: newState } : prev);
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    setTogglingKey(null);
  }
}, [client, env, activeFlag, loadFlags, togglingKey, view]);
```

6. Update the `useInput` handler. Replace the current key handling with view-aware logic:

```typescript
useInput((input, key) => {
  if (!config.ok) {
    if (key.escape) { if (onClose) onClose(); else exit(); }
    if (input === 'q' && onClose === undefined) exit();
    return;
  }

  // Detail view keys
  if (view === 'detail' && detailFlag) {
    if (key.escape) {
      setView('list');
      setDetailFlag(null);
      void loadFlags();
      return;
    }
    if (key.upArrow) {
      setVariationIndex(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setVariationIndex(i => Math.min(detailFlag.variations.length - 1, i + 1));
      return;
    }
    if (key.return) {
      if (detailFlag.fallthroughVariationId !== null) void handleSetVariation();
      return;
    }
    if (input === 't') {
      void handleToggle();
      return;
    }
    return;
  }

  // List view keys
  if (key.escape) { if (onClose) onClose(); else exit(); return; }
  if (input === 'q' && onClose === undefined) { exit(); return; }
  if (key.upArrow) { setSelectedIndex(i => Math.max(0, i - 1)); return; }
  if (key.downArrow) { setSelectedIndex(i => Math.min(flags.length - 1, i + 1)); return; }

  if (key.return) {
    if (flags.length > 0) {
      const flag = flags[selectedIndex];
      setDetailFlag(flag);
      const ftIdx = flag.variations.findIndex(v => v.id === flag.fallthroughVariationId);
      setVariationIndex(ftIdx >= 0 ? ftIdx : 0);
      setView('detail');
    }
    return;
  }

  if (key.backspace || key.delete) { setQuery(q => q.slice(0, -1)); return; }
  if (input && !key.ctrl && !key.meta && input.length === 1) { setQuery(q => q + input); }
});
```

7. Update the list view rendering. In each flag row, add the fallthrough variation name in brackets:

```tsx
{flags.map((f, i) => {
  const selected = i === selectedIndex;
  const prefix = selected ? '▸' : ' ';
  const stateDot = f.on ? '●' : '○';
  const isBusy = togglingKey === f.key;
  const stateLabel = isBusy ? '...' : f.on ? 'ON' : 'OFF';
  const stateColor = isBusy ? COLORS.stepRunning : f.on ? COLORS.stepComplete : COLORS.dimText;
  const showToggled = toggledKey === f.key && !isBusy;

  const ftVariation = f.variations.find(v => v.id === f.fallthroughVariationId);
  const ftLabel = ftVariation ? variationDisplayName(ftVariation, f.variations.indexOf(ftVariation)) : '';

  return (
    <Box key={f.key}>
      <Text color={selected ? COLORS.stepRunning : COLORS.dimText}>
        {prefix} {stateDot} {padName(f.key)}
      </Text>
      <Text color={stateColor}> {stateLabel}</Text>
      {ftLabel && <Text color={COLORS.dimText}> [{ftLabel}]</Text>}
      {showToggled && <Text color={COLORS.stepComplete}>  Toggled</Text>}
    </Box>
  );
})}
```

8. Add the detail view rendering. Wrap the main content area in a conditional on `view`:

When `view === 'detail'` and `detailFlag` is non-null, render:

```tsx
<Box flexDirection="column">
  <Text color={COLORS.contextValue} bold>{detailFlag.key}</Text>
  <Text color={detailFlag.on ? COLORS.stepComplete : COLORS.dimText}>
    {detailFlag.on ? '● ON' : '○ OFF'}
  </Text>

  {error && (
    <Box marginTop={1}><Text color={COLORS.stepError}>{error}</Text></Box>
  )}

  <Box marginTop={1} flexDirection="column">
    <Text color={COLORS.dimText}>Fallthrough variation (served when flag is ON):</Text>
    {detailFlag.fallthroughVariationId === null ? (
      <Text color={COLORS.stepRunning}>  Rollout (not editable)</Text>
    ) : (
      detailFlag.variations.map((v, i) => {
        const selected = i === variationIndex;
        const isCurrent = v.id === detailFlag.fallthroughVariationId;
        const prefix = selected ? '▸' : ' ';
        const valStr = JSON.stringify(v.value).slice(0, 30);
        const isBusy = settingVariation && selected;
        return (
          <Box key={v.id}>
            <Text color={selected ? COLORS.stepRunning : COLORS.dimText}>
              {prefix} {variationDisplayName(v, i).padEnd(36)} {valStr}
            </Text>
            {isBusy && <Text color={COLORS.stepRunning}> ...</Text>}
            {isCurrent && !isBusy && <Text color={COLORS.stepComplete}> ← current</Text>}
            {toggledKey === detailFlag.key && selected && !isBusy && !isCurrent && (
              <Text color={COLORS.stepComplete}> ✓</Text>
            )}
          </Box>
        );
      })
    )}
  </Box>

  {getSessionToggleCount() > 0 && (
    <Box marginTop={1}>
      <Text color={COLORS.dimText}>
        Session: {getSessionToggleCount()} flag(s) changed — will revert on exit
      </Text>
    </Box>
  )}
</Box>
```

9. Update the footer to be view-aware:

```typescript
const listFooter = onClose === undefined
  ? '↑↓ select · enter: details · esc: close · q: quit'
  : '↑↓ select · enter: details · esc: close';

const detailFooter = '↑↓ select · enter: set variation · t: toggle on/off · esc: back';

const footer = view === 'detail' ? detailFooter : listFooter;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/flag-browser.tsx tests/tui/flag-browser.test.tsx
git commit -m "feat(ld): add detail view with variation selection to flag browser"
```

---

### Task 5: Build, smoke test, and final commit

**Files:**
- All modified files

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: Clean compilation, no errors.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Manual smoke test**

Run: `jumper start` → select Dev → any platform → any vertical → any step → at the Flags stage, select "Manage feature flags" → verify:
1. Flag list loads with variation names in brackets (e.g., `[holdout]`).
2. Press Enter on a flag → detail view opens showing all variations.
3. Current fallthrough variation shows `← current`.
4. Arrow keys navigate between variations.
5. Press Enter on a different variation → brief confirmation, variation changes.
6. Press `t` → flag toggles ON/OFF.
7. Press Esc → back to flag list, list refreshes.
8. Continue to Confirm screen → toggled flags shown with original state.
9. Press `q` → flags revert to original state.

- [ ] **Step 4: Verify revert worked**

After quitting, check the flag in LaunchDarkly (or re-run `jumper flags`) to confirm the flag is back to its original ON/OFF state and fallthrough variation.

- [ ] **Step 5: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix(ld): address smoke test issues"
```
