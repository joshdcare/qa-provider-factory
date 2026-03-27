# Multi-Vertical Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the provider factory from Child Care only to support Senior Care, Pet Care, Housekeeping, and Tutoring on both web and mobile platforms.

**Architecture:** Per-vertical payload files + a central vertical registry. Step runners read from payloads and registry instead of hardcoding Child Care values. The shared flow stays intact; minor vertical differences are discovered by running each vertical.

**Tech Stack:** TypeScript, Vitest, Commander.js, Playwright

**Constraint:** No git commits until Senior Care works end-to-end alongside Child Care.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/verticals.ts` | Vertical registry — maps vertical names to `serviceId`, `subServiceId`, `webTilePattern`, `webTestIdToken` |
| Modify | `src/types.ts` | Expand `Vertical` type to include all five verticals |
| Modify | `src/index.ts` | `loadPayloads()` switch cases, pass vertical config through to flows |
| Modify | `src/payloads/childcare.ts` | Add new exports: `mobilePreferencesInput`, `mobileSkillsInput`, `mobileBioInput`, `availabilityNotes` |
| Create | `src/payloads/seniorcare.ts` | Senior Care payload file (same export shape as childcare.ts) |
| Create | `src/payloads/petcare.ts` | Pet Care payload file |
| Create | `src/payloads/housekeeping.ts` | Housekeeping payload file |
| Create | `src/payloads/tutoring.ts` | Tutoring payload file |
| Modify | `src/steps/web-flow.ts` | Accept vertical param, parameterize `selectVertical()`, remove hardcoded `CHILD_CARE` |
| Modify | `src/steps/account.ts` | `createAccountMobile()` reads `serviceId`/`subServiceId` from vertical config |
| Modify | `src/steps/mobile.ts` | `mobileCompleteProfile()` reads SPI payloads from payload exports instead of hardcoding |
| Modify | `src/steps/registry.ts` | `StepDefinition.runner` signature adds `VerticalConfig` param |
| Modify | `tests/index.test.ts` | Add tests for new verticals in CLI parsing |
| Create | `tests/verticals.test.ts` | Tests for vertical registry |
| Modify | `.cursor/skills/qa-provider-factory/SKILL.md` | Document all supported verticals |

---

### Task 1: Expand the Vertical type and create the registry

**Files:**
- Modify: `src/types.ts:37`
- Create: `src/verticals.ts`
- Create: `tests/verticals.test.ts`

- [ ] **Step 1: Write failing test for registry**

Create `tests/verticals.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { VERTICAL_REGISTRY } from '../src/verticals.js';
import type { Vertical } from '../src/types.js';

describe('VERTICAL_REGISTRY', () => {
  const ALL_VERTICALS: Vertical[] = [
    'childcare', 'seniorcare', 'petcare', 'housekeeping', 'tutoring',
  ];

  it('has an entry for every Vertical', () => {
    for (const v of ALL_VERTICALS) {
      expect(VERTICAL_REGISTRY[v]).toBeDefined();
    }
  });

  it('each entry has required fields', () => {
    for (const v of ALL_VERTICALS) {
      const cfg = VERTICAL_REGISTRY[v];
      expect(cfg.serviceId).toBeTruthy();
      expect(cfg.subServiceId).toBeTruthy();
      expect(cfg.webTilePattern).toBeInstanceOf(RegExp);
      expect(typeof cfg.webTestIdToken).toBe('string');
      expect(cfg.webTestIdToken.length).toBeGreaterThan(0);
    }
  });

  it('childcare config matches known values', () => {
    const cc = VERTICAL_REGISTRY.childcare;
    expect(cc.serviceId).toBe('CHILDCARE');
    expect(cc.subServiceId).toBe('babysitter');
    expect(cc.webTilePattern.test('Child Care')).toBe(true);
    expect(cc.webTestIdToken).toBe('childcare');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verticals.test.ts`
Expected: FAIL — `src/verticals.ts` does not exist.

- [ ] **Step 3: Expand the Vertical type**

In `src/types.ts`, change line 37 from:

```typescript
export type Vertical = 'childcare';
```

to:

```typescript
export type Vertical = 'childcare' | 'seniorcare' | 'petcare' | 'housekeeping' | 'tutoring';
```

- [ ] **Step 4: Create the vertical registry**

Create `src/verticals.ts`:

```typescript
import type { Vertical } from './types.js';

export interface VerticalConfig {
  serviceId: string;
  subServiceId: string;
  webTilePattern: RegExp;
  webTestIdToken: string;
}

export const VERTICAL_REGISTRY: Record<Vertical, VerticalConfig> = {
  childcare: {
    serviceId: 'CHILDCARE',
    subServiceId: 'babysitter',
    webTilePattern: /child\s*care/i,
    webTestIdToken: 'childcare',
  },
  seniorcare: {
    serviceId: 'SENIRCARE',
    subServiceId: 'seniorcare',
    webTilePattern: /senior\s*care/i,
    webTestIdToken: 'seniorcare',
  },
  petcare: {
    serviceId: 'PETCAREXX',
    subServiceId: 'petcare',
    webTilePattern: /pet\s*care/i,
    webTestIdToken: 'petcare',
  },
  housekeeping: {
    serviceId: 'HOUSEKEEP',
    subServiceId: 'housekeeper',
    webTilePattern: /house\s*keep/i,
    webTestIdToken: 'housekeeping',
  },
  tutoring: {
    serviceId: 'TUTORINGX',
    subServiceId: 'tutor',
    webTilePattern: /tutor/i,
    webTestIdToken: 'tutoring',
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/verticals.test.ts`
Expected: PASS

---

### Task 2: Update CLI parsing to accept all verticals

**Files:**
- Modify: `src/index.ts:28-29`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Write failing tests for new verticals**

Add to `tests/index.test.ts`:

```typescript
it('accepts all vertical names', () => {
  const verticals = ['childcare', 'seniorcare', 'petcare', 'housekeeping', 'tutoring'];
  for (const v of verticals) {
    const opts = parseArgs(['--step', 'at-location', '--vertical', v]);
    expect(opts.vertical).toBe(v);
  }
});

it('rejects invalid vertical', () => {
  expect(() => parseArgs(['--step', 'at-location', '--vertical', 'dogwalking'])).toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — `seniorcare` etc. not accepted by CLI.

- [ ] **Step 3: Update CLI vertical validation**

In `src/index.ts`, update the `--vertical` option (around line 28) to validate against all verticals:

```typescript
.option(
  '--vertical <vertical>',
  'Service vertical (childcare, seniorcare, petcare, housekeeping, tutoring)',
  (value: string) => {
    const valid = ['childcare', 'seniorcare', 'petcare', 'housekeeping', 'tutoring'];
    if (!valid.includes(value)) {
      throw new Error(`Invalid vertical "${value}". Valid: ${valid.join(', ')}`);
    }
    return value as Vertical;
  },
  'childcare'
)
```

Also add `Vertical` to the type import at the top of `index.ts` if not already imported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/index.test.ts`
Expected: All PASS (including existing tests — child care default behavior unchanged).

---

### Task 3: Add new exports to childcare.ts payload

**Files:**
- Modify: `src/payloads/childcare.ts`

These exports capture values currently hardcoded in `src/steps/mobile.ts`. Adding them here first so the shape is defined before we create other vertical payloads.

- [ ] **Step 1: Add `mobilePreferencesInput` export**

Append to `src/payloads/childcare.ts`:

```typescript
export const mobilePreferencesInput = {
  pageId: 'PREFERENCES',
  milesWillingToTravel: '10',
  ownTransportation: 'true',
  'attr-sitter.smokes': 'false',
  acceptsCreditCard: 'true',
  availability: 'FULL_TIME',
  hourlyRate: '10,25',
  'attr-sitter.covid.vaccine.status': 'true',
};
```

- [ ] **Step 2: Add `mobileSkillsInput` export**

Append to `src/payloads/childcare.ts`:

```typescript
export const mobileSkillsInput = {
  pageId: 'SKILLS',
  'attr-service.childCare.numberOfChildren': '4',
  yearsOfExperience: '5',
  'attr-sitter.languagesSpoken': 'LANGUAGES020',
  educationLevel: 'GRADUATE',
};
```

- [ ] **Step 3: Add `mobileBioInput` export**

Append to `src/payloads/childcare.ts`:

```typescript
export const mobileBioInput = {
  experienceSummary:
    'I have 3 years of experience in child care. I am reliable, caring, and passionate about providing safe and fun environments for children.',
};
```

- [ ] **Step 4: Add `availabilityNotes` export**

Append to `src/payloads/childcare.ts`:

```typescript
export const availabilityNotes = 'Available for child care work';
```

- [ ] **Step 5: Verify build still works**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 4: Refactor mobile step runners to use payload exports

**Files:**
- Modify: `src/steps/mobile.ts`
- Modify: `src/steps/account.ts`
- Modify: `src/steps/registry.ts`

Replace hardcoded values in mobile step runners with values from payloads and vertical config.

- [ ] **Step 1: Update `StepDefinition` runner signature in registry.ts**

In `src/steps/registry.ts`, update the `StepDefinition` interface to include `VerticalConfig`:

```typescript
import type { VerticalConfig } from '../verticals.js';

export interface StepDefinition {
  name: Step;
  runner: (
    client: ApiClient,
    ctx: ProviderContext,
    payloads: any,
    envConfig?: EnvConfig,
    verticalConfig?: VerticalConfig
  ) => Promise<void>;
}
```

- [ ] **Step 2: Update `createAccountMobile` in account.ts**

In `src/steps/account.ts`, update `createAccountMobile` to accept `VerticalConfig` and use it:

Add import at top:

```typescript
import type { VerticalConfig } from '../verticals.js';
```

Change the `createAccountMobile` signature and replace the hardcoded `serviceId: 'CHILDCARE'` and `subServiceId: 'babysitter'` in the `enroll/upgrade/provider` call:

```typescript
export async function createAccountMobile(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig,
  verticalConfig?: VerticalConfig
): Promise<void> {
```

In the `enroll/upgrade/provider` call body, change:

```typescript
      serviceId: 'CHILDCARE',
      subServiceId: 'babysitter',
```

to:

```typescript
      serviceId: verticalConfig?.serviceId ?? 'CHILDCARE',
      subServiceId: verticalConfig?.subServiceId ?? 'babysitter',
```

- [ ] **Step 3: Update `mobileCompleteProfile` in mobile.ts**

In `src/steps/mobile.ts`, replace the two hardcoded SPI `enroll/update/attribute` calls and the bio call with payload exports.

Change the first `restPostSpi('enroll/update/attribute', ...)` call (PREFERENCES) from hardcoded object to:

```typescript
await client.restPostSpi('enroll/update/attribute', ctx.authToken, payloads.mobilePreferencesInput);
```

Change the second `restPostSpi('enroll/update/attribute', ...)` call (SKILLS) from hardcoded object to:

```typescript
await client.restPostSpi('enroll/update/attribute', ctx.authToken, payloads.mobileSkillsInput);
```

Change the `restPostSpi('enroll/update/bio', ...)` call from hardcoded string to:

```typescript
const bioResult = await client.restPostSpi('enroll/update/bio', ctx.authToken, payloads.mobileBioInput);
```

- [ ] **Step 4: Update `addAvailability` in mobile.ts**

In the `addAvailability` function, change the hardcoded `additionalNotes` value:

```typescript
additionalNotes: payloads.availabilityNotes ?? 'Available for work',
```

Note: `addAvailability` is a private function that doesn't receive payloads directly. You need to pass payloads through from `mobileCompleteProfile`. Update the `addAvailability` signature:

```typescript
async function addAvailability(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
```

And the call site in `mobileCompleteProfile`:

```typescript
await addAvailability(client, ctx, payloads);
```

(This call already passes payloads — just confirm it's there.)

- [ ] **Step 5: Update the runner calls in index.ts to pass verticalConfig**

In `src/index.ts`, update `runMobileFlow` to look up and pass the vertical config:

Add import at top:

```typescript
import { VERTICAL_REGISTRY } from './verticals.js';
```

In `runMobileFlow`, after `const payloads = await loadPayloads(opts.vertical);`, add:

```typescript
const verticalConfig = VERTICAL_REGISTRY[opts.vertical];
```

Update the step runner call in the for-loop:

```typescript
await step.runner(client, ctx, payloads, envConfig, verticalConfig);
```

- [ ] **Step 6: Verify build and existing tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No type errors, all tests pass.

---

### Task 5: Parameterize the web flow for vertical support

**Files:**
- Modify: `src/steps/web-flow.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update `runWebEnrollmentFlow` signature**

In `src/steps/web-flow.ts`, add import and update the function signature:

```typescript
import type { VerticalConfig } from '../verticals.js';
```

Change the signature to:

```typescript
export async function runWebEnrollmentFlow(
  targetStep: string,
  tier: Tier,
  envConfig: EnvConfig,
  verticalConfig: VerticalConfig,
  serviceType: string,
): Promise<WebFlowResult> {
```

Replace `const vertical = 'CHILD_CARE';` (line 28) with:

```typescript
const vertical = serviceType;
```

- [ ] **Step 2: Parameterize `selectVertical`**

Change the `selectVertical` function signature:

```typescript
async function selectVertical(page: Page, verticalConfig: VerticalConfig): Promise<void> {
```

Replace all hardcoded `/child\s*care/i` references with `verticalConfig.webTilePattern`.

Replace the `data-testid` selectors. Change:

```typescript
    '[data-testid*="childcare" i]',
    '[data-testid*="child-care" i]',
    '[data-testid*="child_care" i]',
```

to:

```typescript
    `[data-testid*="${verticalConfig.webTestIdToken}" i]`,
    `[data-testid*="${verticalConfig.webTestIdToken.replace(/care$/i, '-care')}" i]`,
    `[data-testid*="${verticalConfig.webTestIdToken.replace(/care$/i, '_care')}" i]`,
```

Replace the `formStrategies` array to use the pattern:

```typescript
const formStrategies = [
  () => page.getByRole('checkbox', { name: verticalConfig.webTilePattern }).first(),
  () => page.getByRole('radio', { name: verticalConfig.webTilePattern }).first(),
  () => page.getByLabel(verticalConfig.webTilePattern).first(),
];
```

Replace Strategy 2's `hasText` filter:

```typescript
const el = page.locator(selector).filter({ hasText: verticalConfig.webTilePattern }).first();
```

Replace Strategy 3 text match:

```typescript
const textEl = page.getByText(verticalConfig.webTilePattern).first();
```

And the parent card locator — build the CSS escaped regex string dynamically:

```typescript
const patternSource = verticalConfig.webTilePattern.source;
const parentCard = page.locator(`:has(> :text-matches("${patternSource}", "i"))`).first();
```

Update the error message:

```typescript
throw new Error(
  `Could not find the ${verticalConfig.webTestIdToken} vertical on the vertical-triage page. ` +
  'The UI may have changed — update selectVertical() in web-flow.ts.',
);
```

- [ ] **Step 3: Update the `selectVertical` call site**

In `runWebEnrollmentFlow`, change:

```typescript
await selectVertical(page);
```

to:

```typescript
await selectVertical(page, verticalConfig);
```

- [ ] **Step 4: Update `runWebFlow` in index.ts to pass new params**

In `src/index.ts`, update `runWebFlow`:

```typescript
async function runWebFlow(opts: CliOptions, envConfig: typeof ENV_CONFIGS[string]): Promise<void> {
  const { runWebEnrollmentFlow } = await import('./steps/web-flow.js');
  const verticalConfig = VERTICAL_REGISTRY[opts.vertical];
  const payloads = await loadPayloads(opts.vertical);
  console.log(`\nStarting web enrollment → ${opts.step} (${opts.vertical})\n`);
  await runWebEnrollmentFlow(opts.step, opts.tier as Tier, envConfig, verticalConfig, payloads.providerCreateDefaults.serviceType);
}
```

- [ ] **Step 5: Verify build and tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No type errors, all tests pass.

---

### Task 6: Add `loadPayloads` cases for all verticals

**Files:**
- Modify: `src/index.ts:64-71`

- [ ] **Step 1: Update the `loadPayloads` switch statement**

In `src/index.ts`, replace the `loadPayloads` function:

```typescript
async function loadPayloads(vertical: Vertical) {
  switch (vertical) {
    case 'childcare':
      return import('./payloads/childcare.js');
    case 'seniorcare':
      return import('./payloads/seniorcare.js');
    case 'petcare':
      return import('./payloads/petcare.js');
    case 'housekeeping':
      return import('./payloads/housekeeping.js');
    case 'tutoring':
      return import('./payloads/tutoring.js');
    default:
      throw new Error(`Unsupported vertical: ${vertical}`);
  }
}
```

- [ ] **Step 2: Verify build (will fail until payload files exist)**

Run: `npx tsc --noEmit`
Expected: Errors about missing payload modules (that's fine — we create them in the next tasks).

---

### Task 7: Create Senior Care payload file

**Files:**
- Create: `src/payloads/seniorcare.ts`

This is the first non-childcare vertical. Values are best-effort guesses; we'll fix them during discovery runs.

- [ ] **Step 1: Create `src/payloads/seniorcare.ts`**

```typescript
export const providerCreateDefaults = {
  serviceType: 'SENIRCARE',
  zipcode: '72204',
  firstName: 'Martina',
  lastName: 'Goodram',
  gender: 'FEMALE',
  howDidYouHearAboutUs: 'OTHER',
  referrerCookie: '',
};

export const providerNameUpdateInput = {
  firstName: 'Martina',
  lastName: 'Goodram',
};

export const saveMultipleVerticalsInput = {
  serviceIds: ['PETCAREXX', 'HOUSEKEEP', 'CHILDCARE', 'TUTORINGX'],
  test: 'mv_PTA',
  testVariance: 'mv_unlimited_PTA',
};

export const caregiverAttributesUpdateInput = {
  seniorcare: {
    specificNeeds: ['ALZHEIMERS', 'ARTHRITIS', 'DIABETES'],
    numberOfSeniors: 1,
  },
  serviceType: 'SENIRCARE',
};

export const providerJobInterestUpdateInput = {
  source: 'ENROLLMENT',
  serviceType: 'SENIRCARE',
  recurringJobInterest: {
    jobRate: {
      maximum: { amount: '25', currencyCode: 'USD' },
      minimum: { amount: '15', currencyCode: 'USD' },
    },
  },
};

export const universalProviderAttributesUpdateInput = {
  education: 'SOME_COLLEGE',
  languages: ['ENGLISH', 'FRENCH', 'SPANISH'],
  qualities: ['COMFORTABLE_WITH_PETS', 'OWN_TRANSPORTATION'],
  vaccinated: true,
};

export const providerUniversalAvailabilityInput = {
  daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  timesOfDay: ['MORNINGS', 'AFTERNOONS'],
};

export const providerBiographyInput = {
  experienceSummary:
    'I have 3 years of experience in senior care. I am reliable, compassionate, and dedicated to providing quality care and companionship for elderly individuals.',
  serviceType: 'SENIRCARE',
  title:
    'I have 3 years of experience in senior care. I am compassionate and dedicated to quality elder care.',
};

export const caregiverAttributesSecondUpdateInput = {
  caregiver: {
    comfortableWithPets: true,
    covidVaccinated: true,
    education: 'SOME_HIGH_SCHOOL',
    languages: ['ENGLISH', 'FRENCH', 'SPANISH'],
    ownTransportation: true,
    smokes: true,
    yearsOfExperience: 3,
  },
  seniorcare: {
    alzheimersOrDementia: true,
    bathing: true,
    companionship: true,
    dressing: true,
    errands: true,
    feeding: true,
    heavyLifting: true,
    lightHousekeeping: true,
    mealPreparation: true,
    medicationAdministration: true,
    mobility: true,
    specialNeedsCare: false,
    transportation: true,
    numberOfSeniors: 1,
  },
  serviceType: 'SENIRCARE',
};

export const notificationSettingCreateInput = {
  domain: 'PROVIDER_SCREENING',
  phoneNumber: '+12001004000',
  type: 'SMS',
};

export const pricingConfig = {
  premium: {
    pricingSchemeId: 'PRO_FEAT_FEB2512',
    pricingPlanId: 'PRO_FEAT_FEB2512001',
    promoCode: '',
  },
  basic: {
    pricingSchemeId: 'PRO_PB_FEB2512',
    pricingPlanId: 'PRO_PB_FEB2512001',
    promoCode: '',
  },
};

export const p2pStripeAccountInput = {
  firstName: 'Martina',
  lastName: 'Goodram',
  addressLine1: '28965 Homewood Plaza',
  dateOfBirth: '1995-07-26',
  lastFourSSN: '9347',
  city: 'Little Rock',
  state: 'AR',
  zip: '72204',
};

export const legalInfoInput = {
  gender: 'F',
  dateOfBirth: '07/26/1995',
  screenName: 'Name',
  firstName: 'Martina',
  middleName: '',
  lastName: 'Goodram',
};

export const legalAddressInput = {
  addressLine1: '28965 Homewood Plaza',
  addressLine2: '',
  screenName: 'Address',
  zip: '72204',
  city: 'Little Rock',
  state: 'AR',
};

export const ssnInput = {
  ssn: '490959347',
  ssnInfoAccepted: true,
};

export const mobilePreferencesInput = {
  pageId: 'PREFERENCES',
  milesWillingToTravel: '10',
  ownTransportation: 'true',
  'attr-sitter.smokes': 'false',
  acceptsCreditCard: 'true',
  availability: 'FULL_TIME',
  hourlyRate: '10,25',
  'attr-sitter.covid.vaccine.status': 'true',
};

export const mobileSkillsInput = {
  pageId: 'SKILLS',
  yearsOfExperience: '5',
  'attr-sitter.languagesSpoken': 'LANGUAGES020',
  educationLevel: 'GRADUATE',
};

export const mobileBioInput = {
  experienceSummary:
    'I have 3 years of experience in senior care. I am reliable, compassionate, and dedicated to providing quality care and companionship for elderly individuals.',
};

export const availabilityNotes = 'Available for senior care work';
```

- [ ] **Step 2: Verify build passes**

Run: `npx tsc --noEmit`
Expected: May still fail if other payload files are missing. That's expected.

---

### Task 8: Create remaining vertical payload files

**Files:**
- Create: `src/payloads/petcare.ts`
- Create: `src/payloads/housekeeping.ts`
- Create: `src/payloads/tutoring.ts`

These follow the same pattern as `seniorcare.ts`. Shared fields are identical; vertical-specific fields use best-effort values.

- [ ] **Step 1: Create `src/payloads/petcare.ts`**

Same structure as seniorcare.ts but with:
- `serviceType: 'PETCAREXX'`
- `saveMultipleVerticalsInput.serviceIds`: `['CHILDCARE', 'HOUSEKEEP', 'SENIRCARE', 'TUTORINGX']` (exclude PETCAREXX)
- `caregiverAttributesUpdateInput`: pet-care-specific attributes (`petTypes: ['DOG', 'CAT']`, `serviceType: 'PETCAREXX'`)
- `providerJobInterestUpdateInput.serviceType`: `'PETCAREXX'`
- `providerBiographyInput`: pet care bio, `serviceType: 'PETCAREXX'`
- `caregiverAttributesSecondUpdateInput.serviceType`: `'PETCAREXX'` with pet-specific skills
- `mobileSkillsInput`: no `attr-service.childCare.numberOfChildren` — use pet-appropriate attributes
- `mobileBioInput`: pet care bio
- `availabilityNotes`: `'Available for pet care work'`
- All shared fields (name, address, pricing, legal, SSN) identical to childcare

- [ ] **Step 2: Create `src/payloads/housekeeping.ts`**

Same structure with:
- `serviceType: 'HOUSEKEEP'`
- `saveMultipleVerticalsInput.serviceIds`: `['CHILDCARE', 'PETCAREXX', 'SENIRCARE', 'TUTORINGX']`
- Housekeeping-specific attributes and bio
- `availabilityNotes`: `'Available for housekeeping work'`

- [ ] **Step 3: Create `src/payloads/tutoring.ts`**

Same structure with:
- `serviceType: 'TUTORINGX'`
- `saveMultipleVerticalsInput.serviceIds`: `['CHILDCARE', 'PETCAREXX', 'HOUSEKEEP', 'SENIRCARE']`
- Tutoring-specific attributes and bio
- `availabilityNotes`: `'Available for tutoring work'`

- [ ] **Step 4: Verify full build passes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No type errors, all tests pass.

---

### Task 9: Verify Child Care still works (regression)

**Files:** None — this is a manual verification task.

- [ ] **Step 1: Run Child Care web flow to at-vertical-selection**

Run: `npm run dev -- --step at-vertical-selection --platform web`
Expected: Browser opens, navigates to vertical-triage page, selects Child Care tile. Same behavior as before.

- [ ] **Step 2: Run Child Care mobile flow to account-created**

Run: `npm run dev -- --step account-created --platform mobile`
Expected: Account created successfully with `CHILD_CARE` vertical. Output shows email, password, memberId.

- [ ] **Step 3: Verify default vertical is childcare**

Run: `npm run dev -- --step at-location`
Expected: Same as `--vertical childcare` — no behavior change when flag is omitted.

---

### Task 10: Test Senior Care and fix issues (discovery)

**Files:** Potentially any modified file — fixes discovered during testing.

- [ ] **Step 1: Run Senior Care web flow to at-vertical-selection**

Run: `npm run dev -- --step at-vertical-selection --platform web --vertical seniorcare`
Expected: Browser opens, navigates to vertical-triage page. Verify the Senior Care tile gets selected. If it fails, update `webTilePattern` or `webTestIdToken` in `src/verticals.ts` and/or fix selectors in `src/steps/web-flow.ts`.

- [ ] **Step 2: Run Senior Care web flow to at-location**

Run: `npm run dev -- --step at-location --platform web --vertical seniorcare`
Expected: Navigates past vertical selection to the location page. Fix any issues.

- [ ] **Step 3: Run Senior Care web flow to at-account-creation**

Run: `npm run dev -- --step at-account-creation --platform web --vertical seniorcare`
Expected: Reaches account creation form. Fix any page differences.

- [ ] **Step 4: Run Senior Care mobile flow to account-created**

Run: `npm run dev -- --step account-created --platform mobile --vertical seniorcare`
Expected: Account created with `SENIRCARE` vertical. If `serviceId` or `subServiceId` are wrong, fix them in `src/verticals.ts`.

- [ ] **Step 5: Run Senior Care mobile flow to profile-complete**

Run: `npm run dev -- --step profile-complete --platform mobile --vertical seniorcare`
Expected: Profile built with senior care attributes. Fix payload values in `src/payloads/seniorcare.ts` if SPI calls fail.

- [ ] **Step 6: Run Senior Care mobile flow to fully-enrolled (if possible)**

Run: `npm run dev -- --step fully-enrolled --platform mobile --vertical seniorcare --tier premium`
Expected: Full enrollment. Fix any issues. If BGC or payment steps differ for senior care, add notes.

- [ ] **Step 7: Document any vertical-specific differences discovered**

If any steps behave differently for Senior Care, add comments in the relevant step files explaining the difference and how it's handled.

---

### Task 11: Update SKILL.md documentation

**Files:**
- Modify: `.cursor/skills/qa-provider-factory/SKILL.md`

- [ ] **Step 1: Update SKILL.md description and examples**

Update the YAML frontmatter description to mention all verticals. Add a "Supported Verticals" section listing all five with their status (validated vs. best-effort). Add example commands for non-childcare verticals:

```
# Web — senior care to location page
npm run dev -- --step at-location --platform web --vertical seniorcare

# Mobile — pet care fully enrolled
npm run dev -- --step fully-enrolled --platform mobile --vertical petcare --tier premium
```

---

### Task 12: Run all tests and commit

**Files:** None — verification and commit.

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit all changes**

```bash
git add -A
git commit -m "feat: add multi-vertical support (Senior Care, Pet Care, Housekeeping, Tutoring)

Expand provider factory from Child Care only to five verticals.
Both web (Playwright) and mobile (API) platforms supported.

- Add vertical registry (src/verticals.ts) for per-vertical config
- Create payload files for each vertical
- Parameterize web flow selectVertical() and mobile step runners
- Update CLI to accept --vertical flag with all verticals
- Senior Care validated end-to-end; others are best-effort"
```
