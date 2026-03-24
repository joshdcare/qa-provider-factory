# QA Provider Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js CLI tool that creates providers at specific enrollment checkpoints via API, eliminating the need to walk through the full enrollment UI.

**Architecture:** Standalone TypeScript CLI using native `fetch` for API calls and Playwright (Phase 1) for OIDC token acquisition. Steps are defined in an ordered registry; the runner executes steps sequentially and stops at the target. Payloads are isolated per vertical for future extensibility.

**Tech Stack:** TypeScript, Node.js 20+, Commander (CLI), Stripe SDK, Playwright (auth only), mysql (fully-enrolled only)

**Spec:** `docs/specs/2026-03-23-provider-factory-design.md`

---

## File Structure

```
qa-provider-factory/
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts              # CLI entry point — arg parsing, orchestration, output
│   ├── types.ts              # Enums, interfaces, env config
│   ├── api/
│   │   ├── client.ts         # Fetch wrapper with retry, auth headers (handles both GraphQL + REST)
│   │   ├── auth.ts           # OIDC access token via Playwright
│   │   └── graphql.ts        # GraphQL mutation strings
│   ├── steps/
│   │   ├── registry.ts       # Ordered step pipeline, runner
│   │   ├── account.ts        # Step 1: providerCreate
│   │   ├── profile.ts        # Steps 2-3: name, verticals, attributes, availability, bio
│   │   ├── upgrade.ts        # Steps 4-5: P2P stripe, payment, subscription
│   │   ├── disclosure.ts     # Step 6: background check accepted
│   │   └── enrollment.ts     # Step 7: SSN, legal, eligibility, sterling
│   └── payloads/
│       └── childcare.ts      # Default payloads for CHILD_CARE vertical
├── tests/
│   ├── registry.test.ts
│   ├── client.test.ts
│   └── index.test.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "qa-provider-factory",
  "version": "1.0.0",
  "description": "CLI tool to create providers at specific enrollment checkpoints",
  "type": "module",
  "bin": {
    "qa-provider-factory": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node --no-warnings dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 4: Install dependencies**

```bash
cd ~/projects/qa-provider-factory
npm install commander stripe mysql2 nanoid playwright
npm install -D typescript tsx vitest @types/node
```

Note: Using `mysql2` instead of `mysql` — it has promise support built in and is actively maintained. Using `nanoid` for random email generation.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with dependencies"
```

---

### Task 2: Types and Environment Config

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export const STEPS = [
  'account-created',
  'at-availability',
  'profile-complete',
  'pre-upgrade',
  'upgraded',
  'at-disclosure',
  'fully-enrolled',
] as const;

export type Step = (typeof STEPS)[number];

export type Tier = 'basic' | 'premium';

export type Vertical = 'childcare';

export interface CliOptions {
  step: Step;
  tier: Tier;
  vertical: Vertical;
  env: string;
}

export interface EnvConfig {
  baseUrl: string;
  apiKey: string;
  stripeKey: string;
  sterlingCallbackUrl: string;
  db: {
    host: string;
    user: string;
    password: string;
    database: string;
  };
}

export interface ProviderContext {
  email: string;
  password: string;
  memberId: string;
  uuid?: string;
  authToken: string;
  accessToken?: string;
  tier: Tier;
  vertical: string;
}

export interface ProviderResult {
  email: string;
  password: string;
  memberId: string;
  uuid: string;
  vertical: string;
}

export const ENV_CONFIGS: Record<string, EnvConfig> = {
  dev: {
    baseUrl: 'https://www.dev.carezen.net',
    apiKey: process.env.CZEN_API_KEY ?? '',
    stripeKey: process.env.STRIPE_KEY ?? '',
    sterlingCallbackUrl:
      'https://safety-background-check.useast1.dev.omni.carezen.net',
    db: {
      host: 'dev-czendb-ro.use.dom.carezen.net',
      user: 'readOnly',
      password: process.env.MYSQL_DB_PASS_DEV ?? '',
      database: 'czen',
    },
  },
};
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsx --eval "import './src/types.js'; console.log('types OK')"
```

Expected: `types OK`

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add types and environment config"
```

---

### Task 3: API Client with Retry

**Files:**
- Create: `src/api/client.ts`
- Create: `tests/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../src/api/client.js';

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('https://example.com', 'test-api-key');
  });

  describe('retryRequest', () => {
    it('retries on failure and returns on success', async () => {
      let attempt = 0;
      const result = await client.retryRequest(async () => {
        attempt++;
        if (attempt < 3) throw new Error('fail');
        return 'success';
      }, 3, 'test op');
      expect(result).toBe('success');
      expect(attempt).toBe(3);
    });

    it('throws after exhausting retries', async () => {
      await expect(
        client.retryRequest(async () => {
          throw new Error('always fails');
        }, 3, 'test op')
      ).rejects.toThrow('always fails');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/client.test.ts
```

Expected: FAIL — cannot resolve `../src/api/client.js`

- [ ] **Step 3: Write the implementation**

Create `src/api/client.ts`:

```typescript
import type { EnvConfig } from '../types.js';

export class ApiClient {
  readonly baseUrl: string;
  readonly apiKey: string;
  private accessToken?: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    authToken?: string
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Pragma: 'crcm-x-authorized',
    };
    if (this.accessToken) {
      headers['Authorization'] = this.accessToken;
    }

    const res = await fetch(`${this.baseUrl}/api/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const json = await res.json();
    if (json.errors) {
      throw new Error(JSON.stringify(json.errors));
    }
    return json.data as T;
  }

  async restPost(
    path: string,
    authToken: string,
    body: Record<string, string> | object,
    contentType: 'json' | 'form' = 'form'
  ): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Care.com-APIKey': this.apiKey,
      'X-Care.com-AuthToken': authToken,
    };

    let bodyStr: string;
    if (contentType === 'form') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      bodyStr = new URLSearchParams(body as Record<string, string>).toString();
    } else {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: bodyStr,
    });

    return res.json();
  }

  async restGet(
    path: string,
    authToken: string,
    extraHeaders?: Record<string, string>
  ): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Care.com-APIKey': this.apiKey,
      'X-Care.com-AuthToken': authToken,
      ...extraHeaders,
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers,
    });

    return res.json();
  }

  async retryRequest<T>(
    fn: () => Promise<T>,
    attempts: number,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        console.warn(
          `${operationName} attempt ${i + 1}/${attempts} failed: ${lastError.message}`
        );
      }
    }
    throw lastError;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/client.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts tests/client.test.ts
git commit -m "feat: add API client with retry logic"
```

---

### Task 4: GraphQL Mutations

**Files:**
- Create: `src/api/graphql.ts`

These are string constants ported from `qa-playwright/src/utils/fixtures/graphql/gql.ts`. No tests needed — they're data-only.

- [ ] **Step 1: Create `src/api/graphql.ts`**

```typescript
export const PROVIDER_CREATE = `
  mutation providerCreate($submitValues: ProviderCreateInput!) {
    providerCreate(input: $submitValues) {
      ... on ProviderCreateSuccess {
        memberId
        oneTimeToken
        authToken
      }
      ... on ProviderCreateError {
        errors {
          message
        }
      }
    }
  }
`;

export const PROVIDER_NAME_UPDATE = `
  mutation providerNameUpdate($input: ProviderNameUpdateInput!) {
    providerNameUpdate(input: $input) {
      __typename
      ... on ProviderNameUpdateSuccess {
        dummy
        __typename
      }
    }
  }
`;

export const SAVE_MULTIPLE_VERTICAL = `
  mutation SaveMultipleVerticals($input: MultipleVerticalsInput) {
    saveMultipleVerticals(input: $input) {
      ... on MultipleVerticalsUpdateSuccess {
        success
        __typename
      }
      ... on MultipleVerticalsUpdateError {
        message
        __typename
      }
      __typename
    }
  }
`;

export const CAREGIVER_ATTRIBUTES_UPDATE = `
  mutation caregiverAttributesUpdate($input: CaregiverAttributesUpdateInput!) {
    caregiverAttributesUpdate(input: $input) {
      __typename
      ... on CaregiverAttributesUpdateSuccess {
        dummy
        __typename
      }
    }
  }
`;

export const PROVIDER_JOB_INTEREST_UPDATE = `
  mutation providerJobInterestUpdate($input: ProviderJobInterestUpdateInput!) {
    providerJobInterestUpdate(input: $input) {
      __typename
      ... on ProviderJobInterestUpdateSuccess {
        dummy
        __typename
      }
    }
  }
`;

export const UNIVERSAL_PROVIDER_ATTRIBUTES_UPDATE = `
  mutation UniversalProviderAttributesUpdate($input: UniversalProviderAttributesUpdateInput!) {
    universalProviderAttributesUpdate(input: $input) {
      ... on UniversalProviderAttributesUpdateSuccess {
        success
      }
    }
  }
`;

export const SET_PROVIDER_UNIVERSAL_AVAILABILITY = `
  mutation SetProviderUniversalAvailability($input: ProviderUniversalAvailabilityInput!) {
    setProviderUniversalAvailability(input: $input) {
      ... on SetProviderAvailabilitySuccess {
        success
      }
      ... on SetProviderUniversalAvailabilityError {
        error
      }
    }
  }
`;

export const CAREGIVER_SERVICE_BIOGRAPHY_UPDATE = `
  mutation CaregiverServiceBiographyUpdate($input: CaregiverServiceBiographyUpdateInput!) {
    caregiverServiceBiographyUpdate(input: $input) {
      ... on CaregiverServiceBiographyUpdateSuccess {
        success
      }
      ... on CaregiverServiceBiographyUpdateResultError {
        errors {
          message
        }
      }
    }
  }
`;

export const GET_PAYMENT_METHODS_INFORMATION = `
  query PaymentMethodsInformation {
    paymentMethodsInformationGet {
      ... on PaymentMethodsInformation {
        braintreeClientToken
        paymentMethods {
          default
          details {
            ... on StripePaymentMethodCreditCard {
              billingZIP
              cardType
              expirationMonth
              expirationYear
              familyName
              givenName
              id
              lastFourDigits
              walletType
            }
          }
          externalID
          id
          provider
          status
          type
        }
        stripeCustomerId
      }
    }
  }
`;

export const UPGRADE_PROVIDER_SUBSCRIPTION = `
  mutation paymentProviderSubscriptionUpgrade($input: PaymentProviderSubscriptionUpgradeInput!) {
    paymentProviderSubscriptionUpgrade(input: $input) {
      __typename
      ... on PaymentProviderSubscriptionUpgradeSuccessResponse {
        upgrade {
          status
          __typename
        }
        __typename
      }
      ... on PaymentProviderSubscriptionUpgradeErrorResponse {
        errors {
          message
          __typename
        }
        __typename
      }
    }
  }
`;

export const NOTIFICATION_SETTING_CREATE = `
  mutation NotificationSettingCreate($input: NotificationSettingCreateInput!) {
    notificationSettingCreate(input: $input) {
      ... on NotificationSettingCreateSuccess {
        dummy
      }
      ... on NotificationSettingErrors {
        errors {
          message
        }
      }
    }
  }
`;
```

- [ ] **Step 2: Commit**

```bash
git add src/api/graphql.ts
git commit -m "feat: add GraphQL mutation strings"
```

---

### Task 5: Childcare Payloads

**Files:**
- Create: `src/payloads/childcare.ts`

Ported from `qa-playwright/src/utils/fixtures/graphql/gql-pyaloads.ts`.

- [ ] **Step 1: Create `src/payloads/childcare.ts`**

```typescript
export const providerCreateDefaults = {
  serviceType: 'CHILD_CARE',
  zipcode: '02451',
  howDidYouHearAboutUs: 'TV',
  referrerCookie: '',
};

export const providerNameUpdateInput = {
  firstName: 'Harvey',
  lastName: 'Zellarzi',
};

export const saveMultipleVerticalsInput = {
  serviceIds: ['PETCAREXX', 'HOUSEKEEP', 'SENIRCARE', 'TUTORINGX'],
  test: 'mv_PTA',
  testVariance: 'mv_unlimited_PTA',
};

export const caregiverAttributesUpdateInput = {
  childcare: {
    ageGroups: ['NEWBORN', 'EARLY_SCHOOL', 'TODDLER', 'ELEMENTARY_SCHOOL'],
    numberOfChildren: 2,
  },
  serviceType: 'CHILD_CARE',
};

export const providerJobInterestUpdateInput = {
  source: 'ENROLLMENT',
  serviceType: 'CHILD_CARE',
  recurringJobInterest: {
    jobRate: {
      maximum: { amount: '21', currencyCode: 'USD' },
      minimum: { amount: '14', currencyCode: 'USD' },
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
  daysOfWeek: ['THURSDAY', 'TUESDAY', 'MONDAY', 'SUNDAY', 'WEDNESDAY'],
  timesOfDay: ['AFTERNOONS', 'EVENINGS', 'MORNINGS'],
};

export const providerBiographyInput = {
  experienceSummary:
    'I have 3 year of experience. I can help with caregiver. I have some other experience as well.I have 3 year of experience. I can help with caregiver. I have some other experience as well.',
  serviceType: 'CHILD_CARE',
  title:
    'I have 3 year of experience. I can help with caregiver. I have some other experience as well.',
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
  childcare: {
    ageGroups: null,
    careForSickChild: false,
    carpooling: true,
    certifiedNursingAssistant: false,
    certifiedRegistedNurse: false,
    certifiedTeacher: true,
    childDevelopmentAssociate: false,
    cprTrained: true,
    craftAssistance: false,
    doula: false,
    earlyChildDevelopmentCoursework: true,
    earlyChildhoodEducation: false,
    errands: true,
    expSpecialNeedsChildren: false,
    experienceWithTwins: false,
    firstAidTraining: true,
    groceryShopping: true,
    laundryAssistance: true,
    lightHousekeeping: true,
    mealPreparation: true,
    nafccCertified: false,
    trustlineCertifiedCalifornia: false,
    travel: true,
    swimmingSupervision: true,
    remoteLearningAssistance: false,
    numberOfChildren: 1,
  },
  serviceType: 'CHILD_CARE',
};

export const notificationSettingCreateInput = {
  domain: 'PROVIDER_SCREENING',
  phoneNumber: '+17817956755',
  type: 'SMS',
};

export const pricingConfig = {
  premium: {
    pricingSchemeId: 'JUN231',
    pricingPlanId: 'JUN231001',
    promoCode: 'SYSTEM$4DISCOUNT',
  },
  basic: {
    pricingSchemeId: 'PROVIDER_PAID_BASIC3',
    pricingPlanId: 'PROVIDER_PAID_BASIC3_001',
    promoCode: '',
  },
};

export const p2pStripeAccountInput = {
  firstName: 'Harvey',
  lastName: 'Zellarzi',
  addressLine1: '201 Jones road',
  dateOfBirth: '1973-08-26',
  lastFourSSN: '1111',
  city: 'Waltham',
  state: 'MA',
  zip: '02451',
};

export const legalInfoInput = {
  gender: 'M',
  dateOfBirth: '10/10/1990',
  screenName: 'Name',
  firstName: 'Harvey',
  middleName: 'Ks',
  lastName: 'Zellarzi',
};

export const legalAddressInput = {
  addressLine1: '201 Jones road',
  addressLine2: '100th street',
  screenName: 'Address',
  zip: '02451',
  city: 'Waltham',
  state: 'MA',
};

export const ssnInput = {
  ssn: '773011779',
  ssnInfoAccepted: '1',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/payloads/childcare.ts
git commit -m "feat: add childcare vertical payloads"
```

---

### Task 6: Auth Module

**Files:**
- Create: `src/api/auth.ts`

Uses Playwright to log in via the OIDC client page and intercept the Bearer token from network requests. Ported from `qa-playwright/src/utils/fixtures/graphql/get-access-token.ts`.

- [ ] **Step 1: Create `src/api/auth.ts`**

```typescript
import { chromium } from 'playwright';

export async function getAccessToken(
  email: string,
  baseUrl: string
): Promise<string> {
  const maxRetries = 3;

  for (let retry = 0; retry < maxRetries; retry++) {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      let accessToken: string | undefined;

      const session = await context.newCDPSession(page);
      await session.send('Network.enable');
      session.on('Network.requestWillBeSent', (payload) => {
        const authHeader = JSON.stringify(payload.request.headers);
        if (authHeader.includes('Authorization') && authHeader.includes('Bearer')) {
          const start = authHeader.indexOf('Bearer');
          const end = authHeader.indexOf('Referer');
          if (end > start) {
            accessToken = authHeader.substring(start, end - 3);
          }
        }
      });

      await page.goto(`${baseUrl}/app/id-oidc-client/index.html`);
      await page.click('button:text("Care")');
      await page.click('button:nth-match(:text("Login"), 3)');

      const usernameBox = page.locator('#emailId');
      await usernameBox.clear();
      await usernameBox.fill(email);

      const continueButton = page.getByRole('button', {
        name: 'Continue',
        exact: true,
      });
      if (await continueButton.isVisible({ timeout: 5000 })) {
        await continueButton.click();
      }

      await page.getByLabel('Password').fill('letmein1');
      const loginSubmit = page.getByRole('button', { name: 'Log In' });
      await loginSubmit.click();
      await page.getByText('OIDC User Info').waitFor({ timeout: 15000 });

      await browser.close();

      if (accessToken) {
        return accessToken;
      }
    } catch (error) {
      console.warn(`Auth attempt ${retry + 1}/${maxRetries} failed:`, error);
      if (browser) await browser.close().catch(() => {});
    }
  }

  throw new Error('Failed to retrieve access token after all retries');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/auth.ts
git commit -m "feat: add OIDC auth module via Playwright"
```

---

### Task 7: Enrollment Step Functions

**Files:**
- Create: `src/steps/account.ts`
- Create: `src/steps/profile.ts`
- Create: `src/steps/upgrade.ts`
- Create: `src/steps/disclosure.ts`
- Create: `src/steps/enrollment.ts`

Each file exports a function that takes `(client: ApiClient, ctx: ProviderContext, payloads: typeof import('../payloads/childcare.js'))` and mutates `ctx` as needed.

- [ ] **Step 1: Create `src/steps/account.ts`**

```typescript
import { nanoid } from 'nanoid';
import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';
import { PROVIDER_CREATE } from '../api/graphql.js';

export async function createAccount(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  const suffix = nanoid(6).toLowerCase();
  ctx.email = `prov-${suffix}@care.com`;
  ctx.password = 'letmein1';

  const input = {
    ...payloads.providerCreateDefaults,
    email: ctx.email,
    password: ctx.password,
  };

  const data = await client.retryRequest(
    () =>
      client.graphql<{ providerCreate: any }>(PROVIDER_CREATE, {
        submitValues: input,
      }),
    3,
    'Provider creation'
  );

  const result = data.providerCreate;
  if (!result.memberId) {
    throw new Error(
      `Provider creation failed: ${JSON.stringify(result.errors)}`
    );
  }

  ctx.memberId = result.memberId;
  ctx.authToken = result.authToken;
  console.log(`  ✓ Account created: ${ctx.email} (ID: ${ctx.memberId})`);
}
```

- [ ] **Step 2: Create `src/steps/profile.ts`**

This file handles both `at-availability` (partial profile) and `profile-complete` (full profile).

```typescript
import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';
import {
  PROVIDER_NAME_UPDATE,
  SAVE_MULTIPLE_VERTICAL,
  CAREGIVER_ATTRIBUTES_UPDATE,
  PROVIDER_JOB_INTEREST_UPDATE,
  UNIVERSAL_PROVIDER_ATTRIBUTES_UPDATE,
  SET_PROVIDER_UNIVERSAL_AVAILABILITY,
  CAREGIVER_SERVICE_BIOGRAPHY_UPDATE,
} from '../api/graphql.js';

export async function setupProfile(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  await client.retryRequest(
    () =>
      client.graphql(PROVIDER_NAME_UPDATE, {
        input: payloads.providerNameUpdateInput,
      }),
    3,
    'Provider name update'
  );

  await client.retryRequest(
    () =>
      client.graphql(SAVE_MULTIPLE_VERTICAL, {
        input: payloads.saveMultipleVerticalsInput,
      }),
    3,
    'Save multiple verticals'
  );

  await client.retryRequest(
    () =>
      client.graphql(CAREGIVER_ATTRIBUTES_UPDATE, {
        input: payloads.caregiverAttributesUpdateInput,
      }),
    3,
    'Caregiver attributes update'
  );

  await client.retryRequest(
    () =>
      client.graphql(PROVIDER_JOB_INTEREST_UPDATE, {
        input: payloads.providerJobInterestUpdateInput,
      }),
    3,
    'Provider job interest update'
  );

  await client.retryRequest(
    () =>
      client.graphql(UNIVERSAL_PROVIDER_ATTRIBUTES_UPDATE, {
        input: payloads.universalProviderAttributesUpdateInput,
      }),
    3,
    'Universal provider attributes update'
  );

  console.log('  ✓ Profile set up (availability not set)');
}

export async function completeProfile(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  await client.retryRequest(
    () =>
      client.graphql(SET_PROVIDER_UNIVERSAL_AVAILABILITY, {
        input: payloads.providerUniversalAvailabilityInput,
      }),
    3,
    'Set provider availability'
  );

  await client.retryRequest(
    () =>
      client.graphql(CAREGIVER_SERVICE_BIOGRAPHY_UPDATE, {
        input: payloads.providerBiographyInput,
      }),
    3,
    'Caregiver biography update'
  );

  await client.retryRequest(
    () =>
      client.graphql(CAREGIVER_ATTRIBUTES_UPDATE, {
        input: payloads.caregiverAttributesSecondUpdateInput,
      }),
    3,
    'Caregiver attributes second update'
  );

  console.log('  ✓ Profile complete (availability + biography set)');
}
```

- [ ] **Step 3: Create `src/steps/upgrade.ts`**

```typescript
import Stripe from 'stripe';
import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';
import {
  GET_PAYMENT_METHODS_INFORMATION,
  UPGRADE_PROVIDER_SUBSCRIPTION,
} from '../api/graphql.js';

export async function setupPayment(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  await client.restPost(
    '/platform/spi/payment/stripe/addAccount',
    ctx.authToken,
    payloads.p2pStripeAccountInput,
    'form'
  );

  console.log('  ✓ P2P Stripe account linked');
}

export async function upgradeSubscription(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  // This call creates the Stripe customer on Care.com's side.
  // It uses the accessToken already set on the client (set before any post-account step runs).
  await client.retryRequest(
    () => client.graphql(GET_PAYMENT_METHODS_INFORMATION, {}),
    3,
    'Get payment methods (create Stripe customer)'
  );

  const stripeKey = process.env.STRIPE_KEY;
  if (!stripeKey) {
    throw new Error('STRIPE_KEY environment variable is required for upgrade step');
  }
  const stripe = new Stripe(stripeKey);

  const paymentMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: {
      number: '4111111111111111',
      exp_month: 10,
      exp_year: 2030,
      cvc: '134',
    },
    billing_details: {
      name: 'Harvey Zellarzi',
      address: { postal_code: '02451' },
    },
  });

  if (!paymentMethod.id) {
    throw new Error('Stripe payment method creation returned no ID');
  }

  const pricing = payloads.pricingConfig[ctx.tier];
  const upgradeInput = {
    billingZIP: '02451',
    familyName: 'Zellarzi',
    givenName: 'Harvey',
    pricingSchemeId: pricing.pricingSchemeId,
    pricingPlanId: pricing.pricingPlanId,
    promoCode: pricing.promoCode,
    paymentIdentifier: {
      id: paymentMethod.id,
      type: 'STRIPE_PAYMENT_METHOD_ID',
    },
  };

  await client.retryRequest(
    () =>
      client.graphql(UPGRADE_PROVIDER_SUBSCRIPTION, {
        input: upgradeInput,
      }),
    3,
    'Upgrade provider subscription'
  );

  console.log(`  ✓ Upgraded to ${ctx.tier}`);
}
```

- [ ] **Step 4: Create `src/steps/disclosure.ts`**

```typescript
import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';

export async function acceptDisclosure(
  client: ApiClient,
  ctx: ProviderContext,
  _payloads: any
): Promise<void> {
  const now = new Date().toISOString();
  const currentTime = `${now.split('T')[0]} ${now.split('T')[1].split('.')[0]}`;

  await client.restPost(
    '/platform/spi/enroll/backgroundCheckAccepted',
    ctx.authToken,
    {
      federalDisclosureAcceptedDate: currentTime,
      requestCopyOfBGC: 'false',
    },
    'form'
  );

  console.log('  ✓ Background check disclosure accepted');
}
```

- [ ] **Step 5: Create `src/steps/enrollment.ts`**

```typescript
import mysql from 'mysql2/promise';
import type { ApiClient } from '../api/client.js';
import type { ProviderContext, EnvConfig } from '../types.js';
import { NOTIFICATION_SETTING_CREATE } from '../api/graphql.js';

const GET_SCREENING_ID = `
  SELECT BCE.SCREENING_ID, BCE.PACKAGE_ID,
    LOWER(INSERT(INSERT(INSERT(INSERT(HEX(BCE.BRAVO_BACKGROUND_CHECK_ID), 9, 0, '-'), 14, 0, '-'), 19, 0, '-'), 24, 0, '-')) AS BRAVO_BGC_ID
  FROM BACKGROUND_CHECK BC, BACKGROUND_CHECK_EXECUTION BCE
  WHERE BC.ID = BCE.BACKGROUND_CHECK_ID AND BC.MEMBER_ID = ?
`;

export async function completeEnrollment(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig
): Promise<void> {
  await client.restGet(
    '/platform/spi/util/feature/ssnCheck',
    ctx.authToken
  );

  await client.restPost(
    '/platform/spi/provider/ssnCheck/updateAccount',
    ctx.authToken,
    payloads.legalInfoInput,
    'json'
  );

  await client.restPost(
    '/platform/spi/provider/ssnCheck/updateAccount',
    ctx.authToken,
    payloads.legalAddressInput,
    'json'
  );

  await client.restPost(
    '/platform/spi/infoVerification/ssnTrace',
    ctx.authToken,
    payloads.ssnInput,
    'json'
  );

  await client.retryRequest(
    () =>
      client.graphql(NOTIFICATION_SETTING_CREATE, {
        input: payloads.notificationSettingCreateInput,
      }),
    3,
    'Notification setting create'
  );

  const eligibilityResponse = await client.restGet(
    `/platform/spi/backgroundcheck/createEligibilityCheckForMember/${ctx.memberId}`,
    ctx.authToken,
    {
      'X-Care.com-OS': 'Android',
      'X-Care.com-AppVersion': '19.2',
      'X-Care.com-AppBuildNr': '8000',
    }
  );

  console.log('  ✓ Eligibility check created, waiting for processing...');
  await new Promise((resolve) => setTimeout(resolve, 4000));

  if (!envConfig) {
    throw new Error('EnvConfig required for fully-enrolled step (DB connection)');
  }

  const connection = await mysql.createConnection({
    host: envConfig.db.host,
    user: envConfig.db.user,
    password: envConfig.db.password,
    database: envConfig.db.database,
  });

  try {
    const [rows] = await connection.execute(GET_SCREENING_ID, [ctx.memberId]);
    const screening = (rows as any[])[0];
    if (!screening) {
      throw new Error(`No screening record found for member ${ctx.memberId}`);
    }

    const now = new Date().toISOString();
    const sterlingPayload = {
      type: 'screening',
      payload: {
        id: screening.SCREENING_ID,
        packageId: screening.PACKAGE_ID,
        packageName: 'Preliminary Member Check',
        accountName: 'Care.com',
        accountId: '82704',
        billCode: '',
        jobPosition: 'Preliminary Member Check',
        candidateId: screening.BRAVO_BGC_ID ?? eligibilityResponse?.data?.screeningId,
        status: 'Complete',
        result: 'Clear',
        links: {
          admin: {
            web: 'https://qasecure.sterlingdirect.com/gateway/OneClick.aspx',
          },
        },
        reportItems: [
          {
            id: '17631573',
            type: 'Enhanced Nationwide Criminal Search',
            status: 'Complete',
            result: 'Clear',
            updatedAt: now,
            estimatedCompletionTime: now,
          },
          {
            id: '17631574',
            type: 'DOJ Sex Offender Search',
            status: 'Complete',
            result: 'Clear',
            updatedAt: now,
            estimatedCompletionTime: now,
          },
        ],
        submittedAt: now,
        updatedAt: now,
      },
    };

    const sterlingRes = await fetch(
      `${envConfig.sterlingCallbackUrl}/updateExecution`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic QXBpVXNlckNhcmU6U3RlcmxpbmcyMDIwIQ==',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sterlingPayload),
      }
    );
    const sterlingResult = await sterlingRes.json();
    if (!sterlingResult?.success) {
      console.warn('Sterling callback may not have succeeded:', sterlingResult);
    }
  } finally {
    await connection.end();
  }

  console.log('  ✓ Fully enrolled (background check cleared)');
}
```

- [ ] **Step 6: Commit**

```bash
git add src/steps/
git commit -m "feat: add all enrollment step functions"
```

---

### Task 8: Step Registry and Runner

**Files:**
- Create: `src/steps/registry.ts`
- Create: `tests/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getStepsUpTo, STEP_PIPELINE } from '../src/steps/registry.js';

describe('Step Registry', () => {
  it('returns only account-created step for that target', () => {
    const steps = getStepsUpTo('account-created');
    expect(steps).toHaveLength(1);
    expect(steps[0].name).toBe('account-created');
  });

  it('returns cumulative steps up to upgraded', () => {
    const steps = getStepsUpTo('upgraded');
    expect(steps.map((s) => s.name)).toEqual([
      'account-created',
      'at-availability',
      'profile-complete',
      'pre-upgrade',
      'upgraded',
    ]);
  });

  it('returns all steps for fully-enrolled', () => {
    const steps = getStepsUpTo('fully-enrolled');
    expect(steps).toHaveLength(STEP_PIPELINE.length);
  });

  it('throws for unknown step', () => {
    expect(() => getStepsUpTo('unknown' as any)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/registry.test.ts
```

Expected: FAIL — cannot resolve `../src/steps/registry.js`

- [ ] **Step 3: Create `src/steps/registry.ts`**

```typescript
import type { ApiClient } from '../api/client.js';
import type { ProviderContext, Step, EnvConfig } from '../types.js';
import { createAccount } from './account.js';
import { setupProfile, completeProfile } from './profile.js';
import { setupPayment, upgradeSubscription } from './upgrade.js';
import { acceptDisclosure } from './disclosure.js';
import { completeEnrollment } from './enrollment.js';

export interface StepDefinition {
  name: Step;
  runner: (
    client: ApiClient,
    ctx: ProviderContext,
    payloads: any,
    envConfig?: EnvConfig
  ) => Promise<void>;
}

export const STEP_PIPELINE: StepDefinition[] = [
  { name: 'account-created', runner: createAccount },
  { name: 'at-availability', runner: setupProfile },
  { name: 'profile-complete', runner: completeProfile },
  { name: 'pre-upgrade', runner: setupPayment },
  { name: 'upgraded', runner: upgradeSubscription },
  { name: 'at-disclosure', runner: acceptDisclosure },
  { name: 'fully-enrolled', runner: completeEnrollment },
];

export function getStepsUpTo(targetStep: Step): StepDefinition[] {
  const index = STEP_PIPELINE.findIndex((s) => s.name === targetStep);
  if (index === -1) {
    throw new Error(
      `Unknown step: "${targetStep}". Valid steps: ${STEP_PIPELINE.map((s) => s.name).join(', ')}`
    );
  }
  return STEP_PIPELINE.slice(0, index + 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/registry.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/steps/registry.ts tests/registry.test.ts
git commit -m "feat: add step registry with ordered pipeline"
```

---

### Task 9: CLI Entry Point

**Files:**
- Create: `src/index.ts`
- Create: `tests/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/index.js';
import { STEPS } from '../src/types.js';

describe('parseArgs', () => {
  it('parses required --step flag', () => {
    const opts = parseArgs(['--step', 'upgraded']);
    expect(opts.step).toBe('upgraded');
    expect(opts.tier).toBe('premium');
    expect(opts.vertical).toBe('childcare');
    expect(opts.env).toBe('dev');
  });

  it('parses all flags', () => {
    const opts = parseArgs([
      '--step', 'pre-upgrade',
      '--tier', 'basic',
      '--vertical', 'childcare',
      '--env', 'dev',
    ]);
    expect(opts.step).toBe('pre-upgrade');
    expect(opts.tier).toBe('basic');
  });

  it('rejects invalid step', () => {
    expect(() => parseArgs(['--step', 'invalid'])).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/index.test.ts
```

Expected: FAIL — cannot resolve `../src/index.js`

- [ ] **Step 3: Create `src/index.ts`**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { STEPS, ENV_CONFIGS } from './types.js';
import type { Step, Tier, Vertical, CliOptions, ProviderContext } from './types.js';
import { ApiClient } from './api/client.js';
import { getAccessToken } from './api/auth.js';
import { getStepsUpTo } from './steps/registry.js';

export function parseArgs(argv: string[]): CliOptions {
  const program = new Command();
  program
    .requiredOption(
      '--step <step>',
      `Enrollment checkpoint (${STEPS.join(', ')})`,
      (value: string) => {
        if (!STEPS.includes(value as Step)) {
          throw new Error(
            `Invalid step "${value}". Valid: ${STEPS.join(', ')}`
          );
        }
        return value as Step;
      }
    )
    .option('--tier <tier>', 'Subscription tier', 'premium')
    .option('--vertical <vertical>', 'Service vertical', 'childcare')
    .option('--env <env>', 'Target environment', 'dev');

  program.parse(argv, { from: 'user' });
  return program.opts() as CliOptions;
}

async function loadPayloads(vertical: Vertical) {
  switch (vertical) {
    case 'childcare':
      return import('./payloads/childcare.js');
    default:
      throw new Error(`Unsupported vertical: ${vertical}`);
  }
}

async function run(opts: CliOptions): Promise<void> {
  const envConfig = ENV_CONFIGS[opts.env];
  if (!envConfig) {
    throw new Error(`Unknown environment: ${opts.env}`);
  }

  if (!envConfig.apiKey) {
    throw new Error('CZEN_API_KEY environment variable is required');
  }

  const client = new ApiClient(envConfig.baseUrl, envConfig.apiKey);
  const payloads = await loadPayloads(opts.vertical);

  const ctx: ProviderContext = {
    email: '',
    password: 'letmein1',
    memberId: '',
    authToken: '',
    tier: opts.tier as Tier,
    vertical: payloads.providerCreateDefaults.serviceType,
  };

  const steps = getStepsUpTo(opts.step);

  console.log(`\nCreating provider at step: ${opts.step}\n`);

  for (const step of steps) {
    if (step.name !== 'account-created' && !ctx.accessToken) {
      console.log('  ⏳ Acquiring access token...');
      ctx.accessToken = await getAccessToken(ctx.email, envConfig.baseUrl);
      client.setAccessToken(ctx.accessToken);
    }

    try {
      await step.runner(client, ctx, payloads, envConfig);
    } catch (err) {
      console.error(`\n✗ Failed at step: ${step.name}`);
      console.error(`  Error: ${(err as Error).message}`);
      if (ctx.email) {
        console.log('\n  Partial provider created:');
        console.log(`    Email:    ${ctx.email}`);
        console.log(`    Password: ${ctx.password}`);
        if (ctx.memberId) console.log(`    MemberId: ${ctx.memberId}`);
      }
      process.exit(1);
    }
  }

  console.log(`\n✓ Provider created at step: ${opts.step}\n`);
  console.log(`  Email:      ${ctx.email}`);
  console.log(`  Password:   ${ctx.password}`);
  console.log(`  MemberId:   ${ctx.memberId}`);
  console.log(`  UUID:       ${ctx.uuid ?? '(set MYSQL_DB_PASS_DEV to retrieve)'}`);
  console.log(`  Vertical:   ${ctx.vertical}`);
  console.log('');
}

const isMainModule = process.argv[1]?.includes('index');
if (isMainModule) {
  const opts = parseArgs(process.argv.slice(2));
  run(opts).catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
```

Note: UUID is not returned by `providerCreate` — it's retrieved via DB query in `account.ts` (Task 10). This is best-effort: if `MYSQL_DB_PASS_DEV` is not set, UUID is omitted from output and the tool still works. The spec states DB is only *required* for `fully-enrolled`; for UUID, it's optional.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/index.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: add CLI entry point with arg parsing and orchestration"
```

---

### Task 10: UUID Retrieval

**Files:**
- Modify: `src/steps/account.ts`

The spec requires UUID in the output. The `providerCreate` mutation doesn't return it, but `seekerCreate` does (as `memberUuid`). We need a DB query to get it for providers.

- [ ] **Step 1: Add UUID query to account step**

Add to `src/steps/account.ts` — after account creation, query the DB for the UUID. Import `mysql2/promise` and accept `envConfig` parameter.

```typescript
import { nanoid } from 'nanoid';
import mysql from 'mysql2/promise';
import type { ApiClient } from '../api/client.js';
import type { ProviderContext, EnvConfig } from '../types.js';
import { PROVIDER_CREATE } from '../api/graphql.js';

const GET_MEMBER_UUID = `
  SELECT BIN_TO_UUID(A.USER_UUID) AS UUID
  FROM AUTHENTICATION A
  JOIN MEMBER M ON M.AUTHENTICATION_ID = A.ID
  WHERE M.ID = ?
`;

export async function createAccount(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any,
  envConfig?: EnvConfig
): Promise<void> {
  const suffix = nanoid(6).toLowerCase();
  ctx.email = `prov-${suffix}@care.com`;
  ctx.password = 'letmein1';

  const input = {
    ...payloads.providerCreateDefaults,
    email: ctx.email,
    password: ctx.password,
  };

  const data = await client.retryRequest(
    () =>
      client.graphql<{ providerCreate: any }>(PROVIDER_CREATE, {
        submitValues: input,
      }),
    3,
    'Provider creation'
  );

  const result = data.providerCreate;
  if (!result.memberId) {
    throw new Error(
      `Provider creation failed: ${JSON.stringify(result.errors)}`
    );
  }

  ctx.memberId = result.memberId;
  ctx.authToken = result.authToken;

  // UUID lookup is best-effort — DB not required for early steps.
  // If MYSQL_DB_PASS_DEV is set, we fetch the UUID; otherwise we skip it gracefully.
  if (envConfig?.db.password) {
    try {
      const connection = await mysql.createConnection({
        host: envConfig.db.host,
        user: envConfig.db.user,
        password: envConfig.db.password,
        database: envConfig.db.database,
      });
      try {
        const [rows] = await connection.execute(GET_MEMBER_UUID, [ctx.memberId]);
        const row = (rows as any[])[0];
        if (row?.UUID) {
          ctx.uuid = row.UUID;
        }
      } finally {
        await connection.end();
      }
    } catch (err) {
      console.warn(`  ⚠ Could not retrieve UUID (DB unavailable): ${(err as Error).message}`);
    }
  }

  console.log(`  ✓ Account created: ${ctx.email} (ID: ${ctx.memberId})`);
}
```

- [ ] **Step 2: Verify `uuid` field exists on `ProviderContext` in `src/types.ts`**

Confirm `uuid?: string` is already present (added in Task 2). No changes needed.

- [ ] **Step 3: Verify `src/index.ts` output includes UUID**

Confirm the output line `ctx.uuid ?? '(set MYSQL_DB_PASS_DEV to retrieve)'` is already in `index.ts` (added in Task 9). No changes needed.

- [ ] **Step 4: Commit**

```bash
git add src/steps/account.ts src/types.ts src/index.ts
git commit -m "feat: retrieve and display provider UUID from DB"
```

---

### Task 11: Build and Manual Verification

**Files:** None new — this is verification.

- [ ] **Step 1: Build the project**

```bash
cd ~/projects/qa-provider-factory
npm run build
```

Expected: Clean compilation, `dist/` populated.

- [ ] **Step 2: Test `--help` output**

```bash
node dist/index.js --help
```

Expected: Shows usage with `--step`, `--tier`, `--vertical`, `--env` flags.

- [ ] **Step 3: Test with `--step account-created` against dev**

Ensure `CZEN_API_KEY` and `MYSQL_DB_PASS_DEV` are set in your environment.

```bash
node dist/index.js --step account-created
```

Expected output:
```
Creating provider at step: account-created

  ✓ Account created: prov-xxxxxx@care.com (ID: 12345678)

✓ Provider created at step: account-created

  Email:      prov-xxxxxx@care.com
  Password:   letmein1
  MemberId:   12345678
  UUID:       xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  Vertical:   CHILD_CARE
```

- [ ] **Step 4: Test with `--step at-availability`**

```bash
node dist/index.js --step at-availability
```

Expected: Account created, profile steps run, access token acquired. Availability NOT set.

- [ ] **Step 5: Test with `--step upgraded --tier basic`**

```bash
node dist/index.js --step upgraded --tier basic
```

Expected: All steps through upgrade, with basic tier.

- [ ] **Step 6: Test with `--step fully-enrolled`**

```bash
node dist/index.js --step fully-enrolled
```

Expected: All steps complete including background check.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```

---

### Task 12: Final Cleanup and Documentation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# QA Provider Factory

CLI tool to create providers at specific enrollment checkpoints via API.

## Prerequisites

- Node.js 20+
- Environment variables:
  - `CZEN_API_KEY` — Care.com API key
  - `STRIPE_KEY` — Stripe test key (for `upgraded` and later)
  - `MYSQL_DB_PASS_DEV` — MySQL read-only password (required for `fully-enrolled`; optional for UUID lookup on other steps)
- Playwright browsers: `npx playwright install chromium`

## Usage

```bash
# Install
npm install

# Create a provider at a specific enrollment step
npm run dev -- --step <step> [--tier basic|premium] [--vertical childcare] [--env dev]
```

### Steps

| Step | Description |
|------|-------------|
| `account-created` | Account exists, no profile |
| `at-availability` | Profile set up, availability screen (none set) |
| `profile-complete` | Full profile with availability and biography |
| `pre-upgrade` | Profile complete, Stripe linked, no subscription |
| `upgraded` | Subscription purchased (use `--tier`) |
| `at-disclosure` | Background check disclosure accepted |
| `fully-enrolled` | Everything complete, background check cleared |

### Examples

```bash
npm run dev -- --step account-created
npm run dev -- --step upgraded --tier basic
npm run dev -- --step fully-enrolled
```

## Adding a Vertical

See `docs/specs/2026-03-23-provider-factory-design.md` § Future Verticals.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage and setup instructions"
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: final cleanup"
```
