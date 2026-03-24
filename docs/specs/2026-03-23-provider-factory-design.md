# QA Provider Factory — Design Spec

**Date:** 2026-03-23
**Author:** Josh Davis
**Status:** Review

## Problem

Testing the PEXP provider enrollment flow requires walking through every step of enrollment from scratch — creating an account, filling out profile details, setting availability, upgrading, completing background check disclosure, and finishing SSN/legal verification. This is extremely time-consuming when you only need to test behavior at a specific point in the flow.

## Solution

A standalone Node.js CLI tool (`qa-provider-factory`) that creates a provider via API and stops at any specified enrollment checkpoint. The tool reuses the same GraphQL mutations and REST endpoints that the existing `qa-playwright` test framework uses, but without the Playwright dependency.

## CLI Interface

```bash
npx qa-provider-factory --step <step> [--tier basic|premium] [--vertical childcare] [--env dev]
```

### Flags

| Flag | Required | Default | Values |
|------|----------|---------|--------|
| `--step` | Yes | — | `account-created`, `at-availability`, `profile-complete`, `pre-upgrade`, `upgraded`, `at-disclosure`, `fully-enrolled` |
| `--tier` | No | `premium` | `basic`, `premium` |
| `--vertical` | No | `childcare` | `childcare` (see Future Verticals) |
| `--env` | No | `dev` | `dev` |

### Output

```
✓ Provider created at step: pre-upgrade

  Email:      prov-a8f3kx@care.com
  Password:   letmein1
  MemberId:   12345678
  UUID:       abc-def-123-456
  Vertical:   CHILD_CARE
```

- Email always ends in `@care.com`
- Password is always `letmein1`
- MemberId and UUID come from the `providerCreate` response

## Enrollment Steps

Each step is cumulative — it includes all API calls from previous steps.

**Important: Step order vs. `GQLProviderActions.createNewProvider()`.**
The step ordering in this spec reflects the intended UI enrollment flow checkpoints, NOT the API call sequence in `createNewProvider()`. The reference implementation in `qa-playwright` calls APIs in a different order (e.g., availability/biography happen after upgrade and SSN steps). This spec intentionally reorders calls to match where a user would be in the UI at each checkpoint. Based on the existing `qa-playwright` tests calling these APIs in varying orders successfully, individual API calls are believed to have no server-enforced ordering dependencies after account creation. This assumption should be validated during implementation by testing each checkpoint end-to-end. If a dependency is discovered, the step ordering can be adjusted.

### Step 1: `account-created`

Creates the provider account. No profile information.

**API calls:**
- `providerCreate` (GraphQL) → returns `memberId`, `authToken`, `oneTimeToken`

**Provider state:** Account exists, email and password set. No profile data.

### Step 2: `at-availability`

Profile fields populated but availability has NOT been set. The provider would land on the availability screen in the UI.

**API calls (in addition to Step 1):**
- `providerNameUpdate` (GraphQL) — sets first/last name
- `saveMultipleVerticals` (GraphQL) — selects additional service verticals
- `caregiverAttributesUpdate` (GraphQL) — age groups, number of children
- `providerJobInterestUpdate` (GraphQL) — job rate preferences
- `universalProviderAttributesUpdate` (GraphQL) — education, languages, qualities

**Provider state:** Name, verticals, care attributes, job interest, and universal attributes all set. Availability is empty.

### Step 3: `profile-complete`

Full profile with availability and biography.

**API calls (in addition to Step 2):**
- `setProviderUniversalAvailability` (GraphQL) — days of week, times of day
- `caregiverServiceBiographyUpdate` (GraphQL) — experience summary and title
- `caregiverAttributesUpdate` (GraphQL, second call) — detailed attributes (transportation, CPR, etc.)

**Provider state:** Complete profile. Ready for upgrade.

### Step 4: `pre-upgrade`

Profile complete with Stripe account linked but no subscription purchased.

**API calls (in addition to Step 3):**
- `addP2PStripeAccount` (REST, POST `/platform/spi/payment/stripe/addAccount`)

**Provider state:** P2P Stripe account linked. At the rate card / payment screen.

### Step 5: `upgraded`

Subscription purchased. Respects `--tier basic|premium` flag.

**API calls (in addition to Step 4):**
- `paymentMethodsInformationGet` (GraphQL) — creates Stripe customer
- Stripe API: `paymentMethods.create` — creates a test card payment method
- `paymentProviderSubscriptionUpgrade` (GraphQL) — upgrades subscription

**Pricing scheme IDs:**
- Premium: `pricingSchemeId: 'JUN231'`, `pricingPlanId: 'JUN231001'`, `promoCode: 'SYSTEM$4DISCOUNT'`
- Basic: `pricingSchemeId: 'PROVIDER_PAID_BASIC3'`, `pricingPlanId: 'PROVIDER_PAID_BASIC3_001'`, `promoCode: ''`

**Provider state:** Active basic or premium subscriber. No background check yet.

### Step 6: `at-disclosure`

Background check disclosure accepted but SSN/legal info not submitted.

**API calls (in addition to Step 5):**
- `backgroundCheckAccepted` (REST, POST `/platform/spi/enroll/backgroundCheckAccepted`)

**Provider state:** At the disclosure/SSN screen.

### Step 7: `fully-enrolled`

Everything complete including background check and screening.

**API calls (in addition to Step 6):**
- `featureSSNCheck` (REST, GET `/platform/spi/util/feature/ssnCheck`)
- `updateProviderLegalInfo` (REST, POST `/platform/spi/provider/ssnCheck/updateAccount`) — gender, DOB, name
- `updateProviderLegalAddress` (REST, POST `/platform/spi/provider/ssnCheck/updateAccount`) — address
- `updateProviderSSNVerification` (REST, POST `/platform/spi/infoVerification/ssnTrace`) — SSN
- `notificationSettingCreate` (GraphQL) — SMS notification for screening
- `createProviderEligibilityCheck` (REST, GET `/platform/spi/backgroundcheck/createEligibilityCheckForMember/{memberId}`)
- 4-second delay for screening processing
- Database query: `GET_SCREENING_ID` for the member
- `sterlingCallBackUpdateExecution` (REST, POST to safety-background-check service)

**Provider state:** Fully enrolled with cleared background check.

## Project Structure

```
qa-provider-factory/
├── package.json
├── tsconfig.json
├── docs/
│   └── specs/
│       └── 2026-03-23-provider-factory-design.md  (this file)
├── src/
│   ├── index.ts              # CLI entry point — arg parsing, orchestration, output
│   ├── types.ts              # Shared types (Step enum, ProviderResult, Config)
│   ├── api/
│   │   ├── client.ts         # Thin fetch wrapper (base URL, headers, retry logic)
│   │   │                     #   GraphQL endpoint: POST {baseUrl}/api/graphql
│   │   │                     #   REST endpoints: various paths under {baseUrl}/platform/spi/
│   │   ├── auth.ts           # Token acquisition (authToken from create, accessToken via OIDC)
│   │   │                     #   Requires: npx playwright install chromium (Phase 1)
│   │   ├── graphql.ts        # All GraphQL mutation/query strings
│   │   └── rest.ts           # REST/SPI endpoint call functions
│   ├── steps/
│   │   ├── registry.ts       # Ordered step definitions — maps step names to runner functions
│   │   ├── account.ts        # Step 1: providerCreate
│   │   ├── profile.ts        # Steps 2-3: name, verticals, attributes, availability, bio
│   │   ├── upgrade.ts        # Steps 4-5: P2P stripe, payment, subscription
│   │   ├── disclosure.ts     # Step 6: background check accepted
│   │   └── enrollment.ts     # Step 7: SSN, legal, eligibility, sterling
│   └── payloads/
│       └── childcare.ts      # Default payloads for CHILD_CARE vertical
```

### Step Registry Pattern

`registry.ts` defines steps as an ordered array:

```typescript
const STEP_PIPELINE: StepDefinition[] = [
  { name: 'account-created',  runner: createAccount },
  { name: 'at-availability',  runner: setupProfile },
  { name: 'profile-complete', runner: completeProfile },
  { name: 'pre-upgrade',      runner: setupPayment },
  { name: 'upgraded',         runner: upgradeSubscription },
  { name: 'at-disclosure',    runner: acceptDisclosure },
  { name: 'fully-enrolled',   runner: completeEnrollment },
];
```

The orchestrator walks this array and stops after executing the target step. Adding a new checkpoint is inserting an entry at the right position.

### Payload Pattern

Each vertical gets its own payload file exporting the same shape:

```typescript
// payloads/childcare.ts
export const providerCreateInput = { ... };
export const caregiverAttributesInput = { ... };
export const jobInterestInput = { ... };
// etc.
```

Step functions receive the loaded payload module, so they're vertical-agnostic.

## Authentication

The tool needs two types of tokens:

1. **authToken** — returned by `providerCreate`, used for REST/SPI endpoints via `X-Care.com-AuthToken` header
2. **accessToken** — OIDC Bearer token, used for GraphQL endpoints via `Authorization` header with `Pragma: crcm-x-authorized`

The `authToken` is available immediately from account creation.

The `accessToken` is harder. The existing `qa-playwright` framework gets it by launching headless Chromium, navigating to the OIDC client page (`/app/id-oidc-client/index.html`), logging in, and intercepting the `Authorization` header from a network request.

**When each token is needed:**

- `authToken` — available immediately from `providerCreate`. Used for all REST/SPI calls. Sufficient for the `account-created` step on its own.
- `accessToken` — needed starting at `at-availability` (Step 2) for GraphQL mutations that require `Authorization` + `Pragma: crcm-x-authorized`. NOT needed for `account-created`, because `providerCreate` itself only uses `Pragma: crcm-x-authorized` without a Bearer token.

The access token is acquired lazily: only fetched when the first post-creation GraphQL call is about to run. This means `--step account-created` has zero Playwright dependency.

**Strategy (two-phase):**

1. **Phase 1 (MVP):** Use Playwright as a lightweight dev dependency solely for the OIDC token acquisition, isolated in `auth.ts`. This mirrors what `qa-playwright` already does and is proven to work. The rest of the CLI uses plain `fetch` — Playwright is not used for any API calls. Only invoked when `--step` is `at-availability` or later.
2. **Phase 2 (optimization):** If a direct OAuth2 Resource Owner Password Credentials (ROPC) grant endpoint is available in the dev identity provider, replace the Playwright-based auth with a direct HTTP call. This eliminates the browser dependency entirely. This is a follow-up improvement, not a blocker for v1.

The auth module exports a single function: `getAccessToken(email: string, baseUrl: string): Promise<string>`. Swapping Phase 1 for Phase 2 changes only the internals of `auth.ts`.

## Environment Configuration

```typescript
const ENV_CONFIG = {
  dev: {
    baseUrl: 'https://www.dev.carezen.net',
    apiKey: process.env.CZEN_API_KEY,
    stripeKey: process.env.STRIPE_KEY,
    sterlingCallbackUrl: 'https://safety-background-check.useast1.dev.omni.carezen.net',
    db: {
      host: 'dev-czendb-ro.use.dom.carezen.net',
      user: 'readOnly',
      password: process.env.MYSQL_DB_PASS_DEV,
      database: 'czen',
    },
  },
};
```

Required environment variables:
- `CZEN_API_KEY` — Care.com API key for REST endpoints
- `STRIPE_KEY` — Stripe test key for payment method creation
- `MYSQL_DB_PASS_DEV` — Read-only MySQL password for dev (only needed for `fully-enrolled` step, which queries `BACKGROUND_CHECK_EXECUTION` to get the screening ID for the Sterling callback)

### Database Dependency

Only the `fully-enrolled` step requires a database connection. It runs the `GET_SCREENING_ID` query against the `czen` database to retrieve `SCREENING_ID`, `PACKAGE_ID`, and `BRAVO_BACKGROUND_CHECK_ID` for the newly created provider, then passes those to the Sterling callback endpoint.

This mirrors the existing `qa-playwright` implementation:
- Connection config: same host/user/database as `Mysqldb.ts` in qa-playwright
- Query: `SELECT BCE.SCREENING_ID, BCE.PACKAGE_ID, ... FROM BACKGROUND_CHECK BC, BACKGROUND_CHECK_EXECUTION BCE WHERE BC.ID = BCE.BACKGROUND_CHECK_ID AND BC.MEMBER_ID = ?`
- Uses the `mysql` npm package with a connection pool

Steps prior to `fully-enrolled` have no database dependency.

### Sterling Callback

The `fully-enrolled` step calls the Sterling safety-background-check service to simulate a completed background screening. The endpoint URL is environment-specific:
- Dev: `https://safety-background-check.useast1.dev.omni.carezen.net/updateExecution`
- Auth: Basic auth header (`Authorization: Basic QXBpVXNlckNhcmU6U3RlcmxpbmcyMDIwIQ==`)

**Request body shape** (values from DB query substituted into `id`, `packageId`, `candidateId`):

```json
{
  "type": "screening",
  "payload": {
    "id": "<SCREENING_ID from DB>",
    "packageId": "<PACKAGE_ID from DB>",
    "packageName": "Preliminary Member Check",
    "accountName": "Care.com",
    "accountId": "82704",
    "billCode": "",
    "jobPosition": "Preliminary Member Check",
    "candidateId": "<BRAVO_BGC_ID from DB>",
    "status": "Complete",
    "result": "Clear",
    "links": { "admin": { "web": "https://qasecure.sterlingdirect.com/..." } },
    "reportItems": [
      { "id": "17631573", "type": "Enhanced Nationwide Criminal Search", "status": "Complete", "result": "Clear" },
      { "id": "17631574", "type": "DOJ Sex Offender Search", "status": "Complete", "result": "Clear" }
    ],
    "submittedAt": "<current ISO timestamp>",
    "updatedAt": "<current ISO timestamp>"
  }
}
```

Reference implementation: `GQLProviderActions.sterlingCallBackUpdateExecution()` in `qa-playwright/src/utils/fixtures/graphql/GQLProviderActions.ts`.

## Error Handling

- Each API call retries up to 3 times with no backoff delay (matching existing `qa-playwright` retry behavior)
- On failure, the CLI prints which step failed, the error message, and the provider credentials created so far (so the partial user isn't lost)
- Non-zero exit code on failure

## Dependencies

- `typescript` — type safety
- `commander` — CLI argument parsing
- `stripe` — Stripe payment method creation (already used in qa-playwright)
- `nanoid` — short random string generation for email addresses

- `playwright` — used only for OIDC access token acquisition in `auth.ts` (Phase 1; see Authentication section)
- `mysql` — used only for `fully-enrolled` step's screening ID query

## Future Verticals

The tool is designed to support additional verticals with minimal changes. This section documents what's needed for each.

### How to Add a Vertical

1. **Create a new payload file** at `src/payloads/<vertical>.ts`
2. **Export the same payload shape** as `childcare.ts` — each step function expects the same interface
3. **Update the `--vertical` flag** choices in `src/index.ts`
4. **Update the payload loader** in the orchestrator to select the right file based on `--vertical`

No changes to step functions, registry, API client, or auth are needed.

### Vertical-Specific Payload Differences

Each vertical needs its own values for these payloads:

| Payload | What Changes Per Vertical |
|---------|--------------------------|
| `providerCreateInput` | `serviceType` field (`CHILD_CARE`, `SENIOR_CARE`, `PET_CARE`, `HOUSEKEEPING`, `TUTORING`) |
| `caregiverAttributesInput` | `serviceType` + vertical-specific fields (e.g., `childcare.ageGroups` vs `seniorcare` equivalents) |
| `jobInterestInput` | `serviceType` + rate ranges |
| `biographyInput` | `serviceType` |
| `saveMultipleVerticals` | `serviceIds` array (which other verticals to enable) |

### Verticals to Add

- **Senior Care** (`SENIOR_CARE` / `SENIRCARE`) — similar structure to childcare, different age/care attributes. Note: `SENIRCARE` is the actual enum value used in `MultipleVerticalsTypes` in the codebase (not a typo in this spec).
- **Pet Care** (`PET_CARE` / `PETCAREXX`) — different attribute set (pet types, sizes)
- **Housekeeping** (`HOUSEKEEPING` / `HOUSEKEEP`) — different attribute set (cleaning types, frequency)
- **Tutoring** (`TUTORING` / `TUTORINGX`) — different attribute set (subjects, grade levels)

### Notes for Implementers

- The `ServiceType` enum values used in GraphQL may differ from the `MultipleVerticalsTypes` enum values — verify against the GraphQL schema
- Some verticals may have additional or fewer enrollment steps — test each vertical's UI flow to confirm the step mapping still holds
- The existing `GQLProviderActions` only supports `CHILD_CARE` and throws for others — the vertical payload files will need real data captured from actual enrollments
