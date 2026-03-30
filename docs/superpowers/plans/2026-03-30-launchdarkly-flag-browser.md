# LaunchDarkly Flag Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a LaunchDarkly feature flag browser to Jumper that lets QA engineers search and toggle flags from the TUI, the wizard, or as a standalone command.

**Architecture:** A shared `FlagBrowser` Ink component backed by a thin LD REST API client. The component is mounted three ways: standalone `jumper flags` command, inline from the wizard confirm screen, and as an overlay during execution via `f` hotkey.

**Tech Stack:** TypeScript, Ink (React for CLI), LaunchDarkly REST API v2, vitest

---

### Task 1: LD Environment Mapping + Config

**Files:**
- Modify: `src/types.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add LD environment mapping to `src/types.ts`**

Add after the `ENV_CONFIGS` export:

```typescript
export const LD_ENV_MAP: Record<Env, string> = {
  dev: 'development',
  stg: 'stage',
};
```

- [ ] **Step 2: Add LD env vars to `.env.example`**

Append to `.env.example`:

```
LD_API_TOKEN=
LD_PROJECT_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts .env.example
git commit -m "feat: add LaunchDarkly environment mapping and config vars"
```

---

### Task 2: LaunchDarkly API Client

**Files:**
- Create: `src/api/launchdarkly.ts`
- Create: `tests/launchdarkly.test.ts`

- [ ] **Step 1: Write failing tests for `searchFlags`**

Create `tests/launchdarkly.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LDClient } from '../src/api/launchdarkly.js';

function mockFetch(response: object, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  });
}

describe('LDClient', () => {
  let client: LDClient;

  beforeEach(() => {
    client = new LDClient('test-token', 'test-project');
  });

  describe('searchFlags', () => {
    it('returns flags with on state for the given environment', async () => {
      const fetchMock = mockFetch({
        items: [
          {
            key: 'flag-a',
            name: 'Flag A',
            environments: { development: { on: true } },
          },
          {
            key: 'flag-b',
            name: 'Flag B',
            environments: { development: { on: false } },
          },
        ],
      });
      const flags = await client.searchFlags('flag', 'development', fetchMock);
      expect(flags).toEqual([
        { key: 'flag-a', name: 'Flag A', on: true },
        { key: 'flag-b', name: 'Flag B', on: false },
      ]);
      expect(fetchMock).toHaveBeenCalledOnce();
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('filter=query~flag');
      expect(url).toContain('env=development');
    });

    it('omits filter param when query is empty', async () => {
      const fetchMock = mockFetch({ items: [] });
      await client.searchFlags('', 'development', fetchMock);
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).not.toContain('filter=');
    });

    it('throws on API error', async () => {
      const fetchMock = mockFetch({ message: 'Unauthorized' }, 401);
      await expect(client.searchFlags('x', 'development', fetchMock))
        .rejects.toThrow('LaunchDarkly API error (401)');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/launchdarkly.test.ts
```

Expected: FAIL — `LDClient` does not exist.

- [ ] **Step 3: Implement `LDClient` with `searchFlags`**

Create `src/api/launchdarkly.ts`:

```typescript
import type { Env } from '../types.js';
import { LD_ENV_MAP } from '../types.js';

export interface LDFlag {
  key: string;
  name: string;
  on: boolean;
}

type FetchFn = typeof globalThis.fetch;

const ALLOWED_ENVS = new Set(Object.values(LD_ENV_MAP));

export class LDClient {
  private readonly token: string;
  private readonly projectKey: string;
  private readonly baseUrl = 'https://app.launchdarkly.com/api/v2';

  constructor(token: string, projectKey: string) {
    this.token = token;
    this.projectKey = projectKey;
  }

  async searchFlags(
    query: string,
    ldEnv: string,
    fetchImpl: FetchFn = globalThis.fetch,
  ): Promise<LDFlag[]> {
    const params = new URLSearchParams({
      env: ldEnv,
      limit: '20',
      sort: 'name',
    });
    if (query) {
      params.set('filter', `query~${query}`);
    }

    const url = `${this.baseUrl}/flags/${this.projectKey}?${params}`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        `LaunchDarkly API error (${res.status}): ${(body as any).message ?? 'Unknown error'}`,
      );
    }

    const data = await res.json() as { items: Array<{
      key: string;
      name: string;
      environments: Record<string, { on: boolean }>;
    }> };

    return data.items.map(item => ({
      key: item.key,
      name: item.name,
      on: item.environments[ldEnv]?.on ?? false,
    }));
  }
}
```

- [ ] **Step 4: Run tests to verify `searchFlags` passes**

```bash
npx vitest run tests/launchdarkly.test.ts
```

Expected: 3 PASS

- [ ] **Step 5: Write failing tests for `toggleFlag`**

Add to `tests/launchdarkly.test.ts`:

```typescript
  describe('toggleFlag', () => {
    it('sends semantic patch and returns updated flag', async () => {
      const fetchMock = mockFetch({
        key: 'flag-a',
        name: 'Flag A',
        environments: { development: { on: true } },
      });
      const result = await client.toggleFlag('flag-a', 'development', true, fetchMock);
      expect(result).toEqual({ key: 'flag-a', name: 'Flag A', on: true });
      expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body).toEqual([
        { op: 'replace', path: '/environments/development/on', value: true },
      ]);
    });

    it('rejects production environment', async () => {
      const fetchMock = mockFetch({});
      await expect(client.toggleFlag('flag-a', 'production', true, fetchMock))
        .rejects.toThrow('not allowed');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws on API error', async () => {
      const fetchMock = mockFetch({ message: 'Rate limited' }, 429);
      await expect(client.toggleFlag('flag-a', 'development', true, fetchMock))
        .rejects.toThrow('LaunchDarkly API error (429)');
    });
  });
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
npx vitest run tests/launchdarkly.test.ts
```

Expected: 3 new FAIL — `toggleFlag` does not exist.

- [ ] **Step 7: Implement `toggleFlag`**

Add to `LDClient` class in `src/api/launchdarkly.ts`:

```typescript
  async toggleFlag(
    flagKey: string,
    ldEnv: string,
    newState: boolean,
    fetchImpl: FetchFn = globalThis.fetch,
  ): Promise<LDFlag> {
    if (!ALLOWED_ENVS.has(ldEnv)) {
      throw new Error(
        `Toggling flags in "${ldEnv}" is not allowed. Allowed: ${[...ALLOWED_ENVS].join(', ')}`,
      );
    }

    const url = `${this.baseUrl}/flags/${this.projectKey}/${flagKey}`;
    const res = await fetchImpl(url, {
      method: 'PATCH',
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json; domain-model=launchdarkly.semanticpatch',
      },
      body: JSON.stringify([
        { op: 'replace', path: `/environments/${ldEnv}/on`, value: newState },
      ]),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        `LaunchDarkly API error (${res.status}): ${(body as any).message ?? 'Unknown error'}`,
      );
    }

    const item = await res.json() as {
      key: string;
      name: string;
      environments: Record<string, { on: boolean }>;
    };

    return {
      key: item.key,
      name: item.name,
      on: item.environments[ldEnv]?.on ?? false,
    };
  }
```

- [ ] **Step 8: Run all tests to verify everything passes**

```bash
npx vitest run tests/launchdarkly.test.ts
```

Expected: 6 PASS

- [ ] **Step 9: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add src/api/launchdarkly.ts tests/launchdarkly.test.ts
git commit -m "feat: add LaunchDarkly API client with search and toggle"
```

---

### Task 3: Flag Browser TUI Component

**Files:**
- Create: `src/tui/flag-browser.tsx`
- Create: `tests/tui/flag-browser.test.tsx`

- [ ] **Step 1: Write failing test for FlagBrowser rendering**

Create `tests/tui/flag-browser.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { FlagBrowser } from '../../src/tui/flag-browser.js';

vi.mock('../../src/api/launchdarkly.js', () => {
  const mockSearch = vi.fn().mockResolvedValue([
    { key: 'flag-a', name: 'Flag A', on: true },
    { key: 'flag-b', name: 'Flag B', on: false },
  ]);
  const mockToggle = vi.fn().mockResolvedValue({ key: 'flag-b', name: 'Flag B', on: true });
  return {
    LDClient: vi.fn().mockImplementation(() => ({
      searchFlags: mockSearch,
      toggleFlag: mockToggle,
    })),
    __mockSearch: mockSearch,
    __mockToggle: mockToggle,
  };
});

describe('FlagBrowser', () => {
  beforeEach(() => {
    process.env.LD_API_TOKEN = 'test-token';
    process.env.LD_PROJECT_KEY = 'test-project';
  });

  it('renders header with environment name', () => {
    const { lastFrame } = render(React.createElement(FlagBrowser, { env: 'dev' }));
    const frame = lastFrame();
    expect(frame).toContain('Feature Flags');
    expect(frame).toContain('dev');
  });

  it('shows missing config message when env vars are not set', () => {
    delete process.env.LD_API_TOKEN;
    const { lastFrame } = render(React.createElement(FlagBrowser, { env: 'dev' }));
    expect(lastFrame()).toContain('LD_API_TOKEN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tui/flag-browser.test.tsx
```

Expected: FAIL — `FlagBrowser` does not exist.

- [ ] **Step 3: Implement FlagBrowser component**

Create `src/tui/flag-browser.tsx`:

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import type { Env } from '../types.js';
import { LD_ENV_MAP } from '../types.js';
import { LDClient, type LDFlag } from '../api/launchdarkly.js';
import { COLORS } from './theme.js';

export interface FlagBrowserProps {
  env: Env;
  onClose?: () => void;
}

export function FlagBrowser({ env, onClose }: FlagBrowserProps): React.ReactElement {
  const { exit } = useApp();
  const [query, setQuery] = useState('');
  const [flags, setFlags] = useState<LDFlag[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggledKey, setToggledKey] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const clientRef = useRef<LDClient | null>(null);

  const token = process.env.LD_API_TOKEN;
  const projectKey = process.env.LD_PROJECT_KEY;
  const ldEnv = LD_ENV_MAP[env];

  if (!token || !projectKey) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={COLORS.stepError} bold>Missing LaunchDarkly configuration</Text>
        <Text color={COLORS.dimText}>Set these environment variables in .env:</Text>
        {!token && <Text color={COLORS.stepError}>  LD_API_TOKEN</Text>}
        {!projectKey && <Text color={COLORS.stepError}>  LD_PROJECT_KEY</Text>}
      </Box>
    );
  }

  if (!clientRef.current) {
    clientRef.current = new LDClient(token, projectKey);
  }
  const client = clientRef.current;

  const fetchFlags = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = await client.searchFlags(q, ldEnv);
      setFlags(results);
      setSelectedIndex(0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [client, ldEnv]);

  useEffect(() => {
    fetchFlags('');
  }, [fetchFlags]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchFlags(value), 300);
  }, [fetchFlags]);

  const handleToggle = useCallback(async () => {
    const flag = flags[selectedIndex];
    if (!flag || togglingKey) return;
    setTogglingKey(flag.key);
    setError(null);
    try {
      await client.toggleFlag(flag.key, ldEnv, !flag.on);
      setToggledKey(flag.key);
      setTimeout(() => setToggledKey(null), 2000);
      await fetchFlags(query);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTogglingKey(null);
    }
  }, [flags, selectedIndex, togglingKey, client, ldEnv, query, fetchFlags]);

  useInput((input, key) => {
    if (key.upArrow) setSelectedIndex(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIndex(i => Math.min(flags.length - 1, i + 1));
    if (key.return) handleToggle();
    if (key.escape) {
      if (onClose) onClose();
      else exit();
    }
    if (input === 'q' && !onClose) exit();
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={COLORS.chrome}>
      <Box paddingX={1} justifyContent="space-between">
        <Text color={COLORS.banner} bold>██ Feature Flags</Text>
        <Text color={COLORS.contextValue}>{env}</Text>
      </Box>

      <Box paddingX={1} marginTop={1}>
        <Text>Search: </Text>
        <TextInput value={query} onChange={handleQueryChange} />
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1} flexGrow={1}>
        {loading && flags.length === 0 && (
          <Text color={COLORS.dimText}>Loading...</Text>
        )}
        {!loading && flags.length === 0 && !error && (
          <Text color={COLORS.dimText}>No flags found</Text>
        )}
        {flags.map((flag, i) => {
          const selected = i === selectedIndex;
          const toggling = flag.key === togglingKey;
          const justToggled = flag.key === toggledKey;
          return (
            <Box key={flag.key}>
              <Text
                color={selected ? COLORS.stepRunning : undefined}
                bold={selected}
              >
                {selected ? '▸ ' : '  '}
                {flag.on ? '●' : '○'} {flag.name}
              </Text>
              <Box flexGrow={1} />
              {toggling ? (
                <Text color={COLORS.stepRunning}>...</Text>
              ) : justToggled ? (
                <Text color={COLORS.stepComplete}>Toggled</Text>
              ) : (
                <Text color={flag.on ? COLORS.stepComplete : COLORS.stepError}>
                  {flag.on ? 'ON' : 'OFF'}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {error && (
        <Box paddingX={1}>
          <Text color={COLORS.stepError}>{error}</Text>
        </Box>
      )}

      <Box paddingX={1} borderStyle="single" borderColor={COLORS.chrome} borderTop borderBottom={false} borderLeft={false} borderRight={false}>
        <Text color={COLORS.dimText}>↑↓ select · enter: toggle · esc: {onClose ? 'close' : 'quit'}</Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/tui/flag-browser.test.tsx
```

Expected: 2 PASS

- [ ] **Step 5: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/tui/flag-browser.tsx tests/tui/flag-browser.test.tsx
git commit -m "feat: add FlagBrowser TUI component"
```

---

### Task 4: Standalone `jumper flags` Command

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add `flags` command to `createRootProgram()`**

In `src/index.ts`, inside `createRootProgram()`, after the `start` command, add:

```typescript
  program
    .command('flags')
    .description('Browse and toggle LaunchDarkly feature flags')
    .option(
      '--env <env>',
      `Target environment (${ALL_ENVS.join(', ')})`,
      (value: string) => {
        if (!ALL_ENVS.includes(value as Env)) {
          throw new Error(`Invalid env "${value}". Valid: ${ALL_ENVS.join(', ')}`);
        }
        return value as Env;
      },
      'dev' as Env,
    )
    .action(async (opts: { env: Env }) => {
      const { render } = await import('ink');
      const React = await import('react');
      const { FlagBrowser } = await import('./tui/flag-browser.js');
      render(React.createElement(FlagBrowser, { env: opts.env }));
    });
```

- [ ] **Step 2: Update the main block to route `flags` through `runInteractiveCli`**

In the main block at the bottom of `src/index.ts`, the current `if (argv[0] === 'start')` check sends only `start` through `runInteractiveCli` (which uses `createRootProgram()`). The `flags` command is also on `createRootProgram()`, so it needs the same routing. Update the condition:

```typescript
  if (argv[0] === 'start' || argv[0] === 'flags') {
    runInteractiveCli(argv).catch((err) => {
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Build and verify command is registered**

```bash
npm run build && node dist/index.js flags --help
```

Expected: shows flags command help with `--env` option

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: add standalone 'jumper flags' command"
```

---

### Task 5: Wizard Confirm Screen Integration

**Files:**
- Modify: `src/tui/wizard.tsx`

- [ ] **Step 1: Add flag browser state and import**

At the top of `src/tui/wizard.tsx`, add the import:

```typescript
import { FlagBrowser } from './flag-browser.js';
```

Inside the `Wizard` component, add state:

```typescript
const [showFlags, setShowFlags] = useState(false);
```

Gate the existing `useInput` handler so it does nothing while the flag browser is open (the `FlagBrowser` has its own `useInput`). Add at the very top of the `useInput` callback:

```typescript
  useInput((input, key) => {
    if (showFlags) return;
    // ... existing escape/q handling ...
  });
```

- [ ] **Step 2: Add "Manage feature flags" option to confirm stage**

In the `renderStage()` function, inside the `confirm` case, find the `SelectInput` items array and add the new option. Also wrap the return to handle the `showFlags` state:

```typescript
      case 'confirm': {
        const warnings = validateEnvVars(platform, step, env);
        const parsedCount = parseInt(count, 10);
        const countValid = !isNaN(parsedCount) && parsedCount >= 1 && parsedCount <= 50;

        if (showFlags) {
          return <FlagBrowser env={env} onClose={() => setShowFlags(false)} />;
        }

        return (
          // ... existing confirm UI ...
          // Add to SelectInput items:
          { label: 'Manage feature flags', value: 'flags' },
          // Add to onSelect handler:
          if (item.value === 'flags') {
            setShowFlags(true);
          }
```

The full updated `SelectInput` items array becomes (note: the `back` target must stay `'platform'` to match existing behavior):

```typescript
<SelectInput
  items={[
    { label: 'Run all steps automatically', value: 'run-all' },
    { label: 'Step through one at a time', value: 'step-through' },
    { label: 'Manage feature flags', value: 'flags' },
    { label: '← Go back and edit', value: 'back' },
  ]}
  onSelect={(item) => {
    if (item.value === 'back') {
      setStage('platform');
    } else if (item.value === 'flags') {
      setShowFlags(true);
    } else if (countValid && warnings.length === 0) {
      onComplete({
        platform, verticals, step, tier, env,
        count: parsedCount,
        autoClose,
        executionMode: item.value as 'run-all' | 'step-through',
      });
    }
  }}
/>
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/tui/wizard.tsx
git commit -m "feat: add 'Manage feature flags' option to wizard confirm screen"
```

---

### Task 6: Execution Overlay Integration

**Files:**
- Modify: `src/tui/execution.tsx`

- [ ] **Step 1: Add flag browser state and import**

At the top of `src/tui/execution.tsx`, add:

```typescript
import { FlagBrowser } from './flag-browser.js';
```

Add `env` to the destructured imports from `'../types.js'`:

```typescript
import type { Step, Platform, Tier, Vertical, Env } from '../types.js';
```

Update the `ExecutionProps` interface — change `env: string` to `env: Env`.

Inside the `Execution` component, add state:

```typescript
const [showFlags, setShowFlags] = useState(false);
```

- [ ] **Step 2: Add `f` hotkey to `useInput` handler**

In the `useInput` callback in `execution.tsx`, add the `f` key handler. Add it in the section that handles input when NOT done (after the existing `if (input === 'q')` block around line 182):

```typescript
    if (input === 'f') {
      setShowFlags(prev => !prev);
      return;
    }
```

Also add to the `done` section (around line 159) so it works after completion too:

```typescript
    if (input === 'f') {
      setShowFlags(prev => !prev);
      return;
    }
```

When `showFlags` is true, `esc` should close the flag browser, not trigger other escape behavior. Add at the very top of the `useInput` handler:

```typescript
    if (showFlags) {
      if (key.escape || input === 'f') setShowFlags(false);
      return;
    }
```

- [ ] **Step 3: Render the flag browser overlay when active**

In the component's JSX return, wrap the existing layout to conditionally show the flag browser. Before the main `<Box>` return, add:

```typescript
if (showFlags) {
  return (
    <Box flexDirection="column" height="100%">
      <FlagBrowser env={env as Env} onClose={() => setShowFlags(false)} />
    </Box>
  );
}
```

- [ ] **Step 4: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/tui/execution.tsx
git commit -m "feat: add 'f' hotkey for flag browser overlay during execution"
```

---

### Task 7: Build, Full Test Suite, and Validate

**Files:** (none new — validation only)

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass (existing + new)

- [ ] **Step 3: Build dist**

```bash
npm run build
```

Expected: builds cleanly

- [ ] **Step 4: Verify standalone command works**

```bash
node dist/index.js flags --help
```

Expected: shows `--env` option with `dev, stg` choices

- [ ] **Step 5: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: build dist for LaunchDarkly flag browser"
```
