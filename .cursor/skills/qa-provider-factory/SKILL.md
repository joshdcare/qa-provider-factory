---
name: qa-provider-factory
description: >-
  Create test provider accounts at specific enrollment checkpoints for the PEXP
  team. Supports web and mobile (Android) platforms, multiple verticals (Child
  Care, Senior Care, Pet Care, Housekeeping, Tutoring), Basic and Premium tiers.
  Use when asked to create a test provider, generate a QA user, set up an
  enrollment test account, or run the provider factory.
---

# QA Provider Factory

CLI tool that creates provider accounts at specific enrollment checkpoints, so QA can test any point in the flow without manually clicking through enrollment.

- **Web**: Drives a real Chromium browser through the enrollment pages, stopping at the target page. The browser auto-closes after logging credentials; pass `--no-auto-close` to keep it open for manual testing.
- **Mobile**: Uses API calls to set up account state at specific checkpoints.

## Prerequisites

- Node.js 20+
- Playwright Chromium: `npx playwright install chromium`
- A `.env` file in the project root with:

```
CZEN_API_KEY=<Care.com API key>
STRIPE_KEY=<Stripe test key — required for mobile upgraded/fully-enrolled>
MYSQL_DB_PASS_DEV=<MySQL read-only password — required for mobile fully-enrolled, optional otherwise>
```

Ask a team lead for these values if you don't have them.

## Quick Start

```bash
cd qa-provider-factory
npm install
npx playwright install chromium
npm run dev -- --step <step> --platform <platform> [--vertical <vertical>] [--tier basic|premium] [--no-auto-close]
```

## Supported Verticals

| Vertical | `--vertical` flag | Status |
|----------|------------------|--------|
| Child Care | `childcare` (default) | Validated |
| Senior Care | `seniorcare` | Best-effort — validate by running |
| Pet Care | `petcare` | Best-effort — validate by running |
| Housekeeping | `housekeeping` | Best-effort — validate by running |
| Tutoring | `tutoring` | Best-effort — validate by running |

## Enrollment Steps

### Web steps (`--platform web`, default)

Web uses Playwright to navigate a real browser through each enrollment page. The browser auto-closes after logging credentials. Pass `--no-auto-close` to keep the browser open at the target step for manual testing.

| Step | URL / Page |
|------|-----------|
| `at-get-started` | `/app/vhp/get-started` |
| `at-soft-intro-combined` | `/app/vhp/provider/soft-intro-combined` |
| `at-vertical-selection` | `/app/vhp/vertical-triage` |
| `at-location` | `/app/enrollment/provider/mv/location` |
| `at-preferences` | `/app/enrollment/provider/mv/preferences` |
| `at-family-count` | `/app/enrollment/provider/mv/family-count` |
| `at-account-creation` | `/app/enrollment/provider/mv/account/combined` |
| `at-family-connection` | `/app/enrollment/provider/mv/family-connection` |
| `at-safety-screening` | `/app/enrollment/provider/mv/safety-screening` |
| `at-subscriptions` | `/app/ratecard/provider/rate-card` |
| `at-basic-payment` | `/app/checkout` (Basic tier) |
| `at-premium-payment` | `/app/checkout` (Premium tier) |
| `at-app-download` | `/app/enrollment/provider/mv/app-download` |

Steps before `at-account-creation` land on the page without creating an account. Steps after `at-account-creation` create the account and print credentials.

### Mobile steps (`--platform mobile`)

Mobile uses API calls to set up account state at each checkpoint.

| Step | Where the user lands |
|------|---------------------|
| `account-created` | Account exists, at "Where are you looking for jobs?" |
| `at-build-profile` | At "Build Your Profile" screen |
| `at-availability` | Profile built, at "Your availability" screen |
| `profile-complete` | Availability + bio set, past profile |
| `upgraded` | Subscription purchased (use `--tier`) |
| `at-disclosure` | At disclosure screen |
| `fully-enrolled` | BGC cleared, fully enrolled |

## Common Commands

```bash
# Web — stop at the location page (default: childcare)
npm run dev -- --step at-location --platform web

# Web — senior care at vertical selection
npm run dev -- --step at-vertical-selection --platform web --vertical seniorcare

# Web — stop at basic checkout page
npm run dev -- --step at-basic-payment --platform web

# Web — stop at premium checkout page
npm run dev -- --step at-premium-payment --platform web

# Web — stop at account creation form
npm run dev -- --step at-account-creation --platform web

# Mobile — user at availability screen
npm run dev -- --step at-availability --platform mobile

# Mobile — fully enrolled premium user
npm run dev -- --step fully-enrolled --platform mobile --tier premium

# Mobile — senior care fully enrolled
npm run dev -- --step fully-enrolled --platform mobile --vertical seniorcare --tier premium

# Mobile — pet care at build profile
npm run dev -- --step at-build-profile --platform mobile --vertical petcare
```

## Output

### Web output (before account creation)

```
  ⏳ Starting web enrollment flow...

  ✓ at-get-started
  ✓ at-soft-intro-combined
  ✓ at-vertical-selection
  ✓ at-location

✓ Browser stopped at: at-preferences
  URL: https://www.dev.carezen.net/app/enrollment/provider/mv/preferences

  Suggested credentials (for the account creation step):
    Email:      prov-abc123@care.com
    Password:   letmein1

  Auto-closing browser.
```

### Web output (after account creation)

Steps past `at-account-creation` print MemberId, UUID, and Vertical — the same info as mobile:

```
  ✓ at-account-creation
  ✓ at-family-connection (account created)
  ✓ at-safety-screening

✓ Browser stopped at: at-safety-screening
  URL: https://www.dev.carezen.net/app/enrollment/provider/mv/safety-screening

  Email:      prov-abc123@care.com
  Password:   letmein1
  MemberId:   1774484793
  UUID:       a6fd308d-258b-4c24-8251-0c0e0b5778e0
  Vertical:   CHILD_CARE

  Auto-closing browser.
```

### Mobile output

```
✓ Provider created at step: fully-enrolled (mobile)

  Email:      prov-xxxxxxxx@care.com
  Password:   letmein1
  MemberId:   1234567
  UUID:       xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  Vertical:   CHILD_CARE
```

## Test Data

All accounts use:
- **Password:** `letmein1`
- **Name:** Martina Goodram
- **ZIP code:** 72204 (entered at the `at-location` step)
- **Address:** 28965 Homewood Plaza, Little Rock, AR 72204
- **DOB:** 07/26/1995
- **SSN:** 490-95-9347 (for IDV/screening pass)
- **Credit card:** 4111 1111 1111 1111, Exp 09/32, CVV 123, Billing ZIP 72204

### What the web flow fills in automatically

| Step | Fields entered |
|------|---------------|
| `at-vertical-selection` | Selects "Child Care" vertical |
| `at-location` | ZIP code `72204` |
| `at-account-creation` | First/last name, email, password, gender, age checkbox |
| `at-basic-payment` / `at-premium-payment` | Name on card, credit card number, expiration, CVV, billing ZIP (via Stripe Elements) |

## Known Limitations

### Web selectors

The web flow uses Playwright selectors (role, label, text) to interact with enrollment pages. If a page's UI changes, selectors in `src/steps/web-flow.ts` may need updating. When a selector fails, the browser stays open for debugging.

### Detailed availability calendar (mobile)

The mobile app's "Your Services & Availability" screen reads from a legacy MySQL calendar table. The factory sets:
- Full-time preference (visible in the app)
- `hasMemberEverFilledOneTimeAvailability` flag (acknowledged)
- REST availability data (Mon-Fri 9am-5pm)

However, the **detailed day/time grid** in the app requires a one-time manual save: open "Your Services & Availability" > tap Edit > Save.

### Platform notes

- **Mobile** targets Android only. iOS enrollment has inconsistencies — avoid iOS for now.
- **Web** and **mobile** use completely different step names and execution strategies.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `CZEN_API_KEY environment variable is required` | Create `.env` with the three required variables |
| `Error: browserType.launch` | Run `npx playwright install chromium` |
| Web flow selector fails | Browser stays open for debugging. Update selectors in `src/steps/web-flow.ts` |
| Auth token fails (mobile) | VPN must be connected for SPI endpoints |
| BGC fails at Sterling callback (mobile) | Check that `MYSQL_DB_PASS_DEV` is set |

## Architecture (for contributors)

```
src/
├── index.ts              # CLI entry point (Commander.js)
├── types.ts              # Types, step definitions, env config
├── api/
│   ├── auth.ts           # Auth0 PKCE flow (Playwright) + SPI login
│   ├── client.ts         # HTTP client (GraphQL, REST, SPI, multipart)
│   └── graphql.ts        # All GraphQL queries and mutations
├── payloads/
│   └── childcare.ts      # Default payloads for Child Care vertical
└── steps/
    ├── web-flow.ts       # Playwright browser enrollment (web)
    ├── registry.ts       # Step pipeline (mobile)
    ├── account.ts        # Account creation (web GraphQL / mobile REST)
    ├── profile.ts        # Web profile setup + availability
    ├── mobile.ts         # Mobile-specific enrollment flow
    ├── upgrade.ts        # Stripe/Vantiv payment + subscription
    ├── disclosure.ts     # BGC disclosure acceptance
    ├── enrollment.ts     # SSN trace, eligibility, BGC, Sterling callback
    └── photo.ts          # Programmatic PNG generation + upload
```

### Adding a new web enrollment step

1. Add the step name to `WEB_STEPS` in `types.ts`
2. Add a new block in `runWebEnrollmentFlow()` in `src/steps/web-flow.ts` with the URL wait pattern and page interaction logic

### Adding a new mobile step

1. Add the step name to `MOBILE_STEPS` in `types.ts`
2. Create a runner function in the appropriate `steps/` file
3. Register it in the pipeline array in `src/steps/registry.ts`
