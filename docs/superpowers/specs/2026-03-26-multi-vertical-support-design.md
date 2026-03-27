# Multi-Vertical Support for QA Provider Factory

## Summary

Expand the qa-provider-factory from Child Care only to support five verticals: Child Care, Senior Care, Pet Care, Housekeeping, and Tutoring. Both web (Playwright) and mobile (API) platforms get multi-vertical support. The architecture uses per-vertical payload files and a central vertical registry, keeping the existing step flow intact.

## Approach

**Payload-per-vertical with a shared flow.** Each vertical gets its own payload file exporting the same constants as `childcare.ts`. The step runners and web flow read vertical-specific values from payloads and a registry instead of hardcoding `CHILD_CARE`. Flow logic stays shared — minor per-vertical differences are handled with conditionals as discovered.

### Why this approach

- Minimal changes to existing step logic
- Each vertical's data is isolated and easy to debug/tweak
- Child Care keeps working as-is throughout development
- No premature abstraction — we discover real flow differences by running each vertical, not guessing

### Alternatives considered

- **Single config with overrides:** Less duplication but harder to debug (mental merge of base + override).
- **Strategy pattern:** Most extensible but over-engineered before we know the real differences between verticals.

## Design

### 1. Vertical Registry (`src/verticals.ts`)

A new file mapping each vertical name to its API configuration.

```typescript
export interface VerticalConfig {
  serviceId: string;         // mobile enroll/upgrade serviceId
  subServiceId: string;      // mobile enroll/upgrade subServiceId
  webTilePattern: RegExp;    // regex to find the tile on vertical-triage page
  webTestIdToken: string;    // plain string for data-testid selectors, e.g. 'childcare'
}

export const VERTICAL_REGISTRY: Record<Vertical, VerticalConfig> = {
  childcare:    { serviceId: 'CHILDCARE',  subServiceId: 'babysitter',  webTilePattern: /child\s*care/i, webTestIdToken: 'childcare' },
  seniorcare:   { serviceId: 'SENIRCARE',  subServiceId: 'seniorcare',  webTilePattern: /senior\s*care/i, webTestIdToken: 'seniorcare' },
  petcare:      { serviceId: 'PETCAREXX',  subServiceId: 'petcare',     webTilePattern: /pet\s*care/i, webTestIdToken: 'petcare' },
  housekeeping: { serviceId: 'HOUSEKEEP',  subServiceId: 'housekeeper', webTilePattern: /house\s*keep/i, webTestIdToken: 'housekeeping' },
  tutoring:     { serviceId: 'TUTORINGX',  subServiceId: 'tutor',       webTilePattern: /tutor/i, webTestIdToken: 'tutoring' },
};
```

`serviceType` is intentionally excluded from the registry. It lives only in payload files (where API request bodies need it). The registry holds only values that are not part of payload objects: mobile enrollment IDs and the web tile pattern.

The `serviceId` and `subServiceId` values for non-childcare verticals are best guesses from API patterns. They'll be validated when each vertical is first run.

Note: `SENIRCARE`, `PETCAREXX`, `HOUSEKEEP`, and `TUTORINGX` are the actual Care.com API service type codes (not misspellings). They already appear in the existing `childcare.ts` payload file under `saveMultipleVerticalsInput`. The `serviceId` and `subServiceId` fields for mobile enrollment may use different codes — those are unverified and will be corrected during discovery.

### 2. Payload Files

Each vertical gets a payload file in `src/payloads/`:

| File | Status |
|------|--------|
| `childcare.ts` | Existing, updated to add new exports: `mobilePreferencesInput`, `mobileSkillsInput`, `mobileBioInput`, `availabilityNotes` |
| `seniorcare.ts` | New |
| `petcare.ts` | New |
| `housekeeping.ts` | New |
| `tutoring.ts` | New |

Each file exports the same named constants as `childcare.ts`:

**Shared across verticals** (same values, duplicated per file):
- `providerNameUpdateInput` — Martina Goodram
- `p2pStripeAccountInput` — address, DOB, SSN last 4
- `legalInfoInput` / `legalAddressInput` — identity info
- `ssnInput` — SSN for screening
- `pricingConfig` — pricing scheme IDs
- `notificationSettingCreateInput` — SMS settings

**Vertical-specific** (values change per vertical):
- `providerCreateDefaults` — includes `serviceType` (e.g. `'CHILD_CARE'`, `'SENIRCARE'`)
- `saveMultipleVerticalsInput` — secondary verticals (exclude the primary)
- `caregiverAttributesUpdateInput` — vertical-appropriate attributes and `serviceType`
- `providerJobInterestUpdateInput` — `serviceType`
- `providerBiographyInput` — `serviceType` + relevant bio text
- `caregiverAttributesSecondUpdateInput` — vertical-specific skills and `serviceType`
- `universalProviderAttributesUpdateInput` — may vary per vertical
- `providerUniversalAvailabilityInput` — same across verticals, duplicated for consistency
- `mobilePreferencesInput` — **new export**, SPI attribute key-value pairs for the PREFERENCES page
- `mobileSkillsInput` — **new export**, SPI attribute key-value pairs for the SKILLS page
- `mobileBioInput` — **new export**, bio text for `enroll/update/bio` (currently hardcoded in `mobileCompleteProfile()`)
- `availabilityNotes` — **new export**, string for the `additionalNotes` field in availability setup (currently hardcoded as "Available for child care work")

**Ownership rules — each value lives in exactly one place:**
- **Payload files** own `serviceType` and all data sent in API request bodies (GraphQL variables, REST/SPI payloads).
- **Vertical registry** owns `serviceId`, `subServiceId` (used only in `enroll/upgrade/provider`), and `webTilePattern` (used only by Playwright). These values never appear in payload files.
- Step runners receive both the payloads and the `VerticalConfig` and use whichever is appropriate for the call they're making.

### 3. Flow Changes

Files that need modification:

**`src/types.ts`**
- Expand `Vertical` type to `'childcare' | 'seniorcare' | 'petcare' | 'housekeeping' | 'tutoring'`

**`src/index.ts`**
- `loadPayloads()`: add switch cases for each vertical
- `runWebFlow()`: pass vertical to `runWebEnrollmentFlow()`

**`src/steps/web-flow.ts`**
- `runWebEnrollmentFlow()`: accept a `vertical` parameter, look up config from registry
- `selectVertical()`: parameterize the entire function to use `verticalConfig.webTilePattern` instead of hardcoded `/child\s*care/i`. The text-based strategies (role/radio/label matchers, `hasText` filters, error message) all derive from `webTilePattern`. The `data-testid` selectors (e.g. `[data-testid*="childcare" i]`) need a plain string token — add a `webTestIdToken` field to `VerticalConfig` (e.g. `'childcare'`, `'seniorcare'`) to generate these selectors. The function signature becomes `selectVertical(page, verticalConfig)`.
- Replace hardcoded `const vertical = 'CHILD_CARE'` with the `serviceType` from the loaded payloads

**`src/steps/account.ts`**
- `createAccountMobile()`: replace hardcoded `serviceId: 'CHILDCARE'` and `subServiceId: 'babysitter'` with values from the vertical registry. The `VerticalConfig` object is passed to step runners as an additional parameter alongside payloads. The registry owns these mobile enrollment IDs; they don't appear in payload files.

**`src/steps/mobile.ts`**
- `mobileCompleteProfile()`: SPI calls for PREFERENCES and SKILLS contain child-care-specific attribute keys (e.g. `attr-service.childCare.numberOfChildren`). Each vertical's payload file exports a `mobilePreferencesInput` and `mobileSkillsInput` object containing the appropriate key-value pairs for that vertical's SPI calls. The step runner reads these from payloads rather than using conditionals, consistent with the payload-per-vertical approach.

**No changes needed:**
- `upgrade.ts`, `disclosure.ts`, `enrollment.ts`, `photo.ts` — payment, BGC, and photo are vertical-agnostic
- `registry.ts` — mobile step pipeline stays the same
- `api/client.ts`, `api/auth.ts`, `api/graphql.ts` — transport layer is vertical-agnostic

### 4. CLI Changes

- `--vertical` option validates against all five vertical names
- Default remains `childcare` for backwards compatibility
- Help text lists available verticals

### 5. Documentation

Update SKILL.md to:
- List all supported verticals in the description
- Add examples for non-childcare verticals
- Note which verticals have been validated vs. best-effort

## Constraints

- **No commits until validated:** No code is committed until at least one non-childcare vertical (target: Senior Care) is working end-to-end alongside Child Care on both platforms.
- **Child Care must not break:** All changes are backwards-compatible. Running with `--vertical childcare` (or no `--vertical` flag) must produce identical observable/API behavior to today. Internal refactoring (e.g. moving hardcoded values into payload exports) is expected and allowed.
- **Best-effort payloads:** Non-childcare payload files start as educated guesses. API field names, attribute keys, and sub-service IDs will be corrected as each vertical is run and tested.

## Discovery Plan

1. Build the multi-vertical architecture with Child Care still working
2. Create Senior Care payload file (most similar to Child Care)
3. Run Senior Care web flow step by step, fixing selectors and payloads
4. Run Senior Care mobile flow step by step, fixing API payloads
5. Once Senior Care works end-to-end, commit all changes
6. Repeat for Pet Care, Housekeeping, and Tutoring
