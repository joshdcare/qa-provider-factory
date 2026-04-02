# Batch Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--count` flag to create multiple provider accounts in one run for bug bashes.

**Architecture:** Add `-c, --count <n>` CLI flag. When count > 1, orchestrate N sequential runs, collect results into an array, print a summary table, and write a CSV file. Web runs headless in batch mode. Stop on first failure but preserve partial results.

**Tech Stack:** TypeScript, Commander (existing), Node fs for CSV output.

---

### Task 1: Add `count` to CLI options and types

**Files:**
- Modify: `src/types.ts` — add `count` to `CliOptions`
- Modify: `src/index.ts` — add `-c, --count` flag to Commander config
- Modify: `tests/index.test.ts` — test count flag parsing

- [ ] **Step 1: Add `count` field to CliOptions in `src/types.ts`**

Add `count: number;` to the `CliOptions` interface.

- [ ] **Step 2: Add `-c, --count` flag to parseArgs in `src/index.ts`**

Add option: `.option('-c, --count <n>', 'Number of users to create', '1')`
Parse as int and validate: count must be >= 1 and <= 50.

- [ ] **Step 3: Write tests for count flag parsing**

Test cases:
- Default count is 1 when flag not provided
- `--count 5` parses to 5
- `-c 10` parses to 10
- `--count 0` throws
- `--count -1` throws
- `--count abc` throws

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/index.ts tests/index.test.ts
git commit -m "feat: add --count flag for batch user creation"
```

---

### Task 2: Create batch output utilities (table + CSV)

**Files:**
- Create: `src/batch.ts` — table formatter and CSV writer
- Create: `tests/batch.test.ts` — tests for formatting and CSV

- [ ] **Step 1: Write failing tests for table formatting and CSV**

Test `formatResultsTable(results, step, platform)` returns a formatted string with header row and numbered entries.
Test `writeCsv(results, step, platform)` writes a CSV file and returns the filename.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/batch.ts`**

```typescript
export interface BatchResult {
  email: string;
  password: string;
  memberId: string;
  uuid: string;
  vertical: string;
  tier: string;
}

export function formatResultsTable(results: BatchResult[]): string
// Returns formatted table with columns: #, Email, Password, MemberId, UUID, Vertical, Tier

export function writeCsv(results: BatchResult[], step: string, platform: string): string
// Writes CSV to batch-YYYY-MM-DD-HHMM.csv, returns filename
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/batch.ts tests/batch.test.ts
git commit -m "feat: add batch output utilities (table + CSV)"
```

---

### Task 3: Refactor mobile flow to return results

**Files:**
- Modify: `src/index.ts` — extract mobile result into a return value

- [ ] **Step 1: Refactor `runMobileFlow` to return `BatchResult`**

Instead of console.logging credentials at the end, return a `BatchResult` object.
Move the output logging to the caller.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all pass (no behavior change for count=1).

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "refactor: make runMobileFlow return result for batch support"
```

---

### Task 4: Add headless parameter to web flow

**Files:**
- Modify: `src/steps/web-flow.ts` — add `headless` param to `runWebEnrollmentFlow`
- Modify: `src/index.ts` — pass headless based on count

- [ ] **Step 1: Add `headless` parameter to `runWebEnrollmentFlow`**

Add `headless = false` parameter. Pass it to `chromium.launch({ headless })`.

- [ ] **Step 2: Refactor `runWebFlow` to return `BatchResult`**

Convert the `WebFlowResult` into a `BatchResult` and return it instead of logging.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/steps/web-flow.ts src/index.ts
git commit -m "refactor: add headless param to web flow, return result for batch"
```

---

### Task 5: Implement batch orchestration

**Files:**
- Modify: `src/index.ts` — add batch loop in `run()`

- [ ] **Step 1: Implement batch loop**

In `run()`, when `count > 1`:
- Print "Creating N providers at step: X (platform)..."
- Loop N times, calling runMobileFlow or runWebFlow
- Web: use headless=true; on last iteration respect --no-auto-close
- Collect BatchResult[] 
- On failure: catch, print error, break out of loop
- After loop (success or partial): print table using formatResultsTable
- If results.length > 0: write CSV using writeCsv
- Print CSV filename

When `count === 1`: existing behavior (print single result as before).

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: implement batch orchestration for --count flag"
```

---

### Task 6: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document --count flag**

Add to usage table, add batch examples, mention CSV output.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document batch mode and --count flag"
```
