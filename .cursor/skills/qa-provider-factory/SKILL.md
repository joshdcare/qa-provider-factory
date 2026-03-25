---
name: qa-provider-factory
description: >-
  Create test provider accounts at specific enrollment checkpoints for the PEXP
  team. Supports web and mobile (Android) platforms, Child Care vertical, Basic
  and Premium tiers. Use when asked to create a test provider, generate a QA
  user, set up an enrollment test account, or run the provider factory.
---

# QA Provider Factory

CLI tool that creates provider accounts at specific enrollment checkpoints via API calls, so QA can test any point in the flow without manually clicking through enrollment.

## Prerequisites

- Node.js 20+
- Playwright Chromium: `npx playwright install chromium`
- A `.env` file in the project root with:

```
CZEN_API_KEY=<Care.com API key>
STRIPE_KEY=<Stripe test key — required for upgraded/fully-enrolled>
MYSQL_DB_PASS_DEV=<MySQL read-only password — required for fully-enrolled, optional otherwise>
```

Ask a team lead for these values if you don't have them.

## Quick Start

```bash
cd qa-provider-factory
npm install
npx playwright install chromium
npm run dev -- --step <step> --platform <platform> [--tier basic|premium]
```

## Enrollment Steps

### Web steps (`--platform web`, default)

| Step | Where the user lands |
|------|---------------------|
| `account-created` | Account exists, no profile |
| `profile-complete` | Full profile with availability and biography |
| `pre-upgrade` | Stripe payment method linked, no subscription |
| `upgraded` | Subscription purchased (use `--tier`) |
| `at-disclosure` | Background check disclosure accepted |
| `fully-enrolled` | BGC cleared, fully enrolled |

### Mobile steps (`--platform mobile`)

| Step | Where the user lands |
|------|---------------------|
| `account-created` | Account exists, at "Where are you looking for jobs?" |
| `at-availability` | Profile built, at "Your availability" screen |
| `profile-complete` | Availability + bio set, past profile |
| `upgraded` | Subscription purchased (use `--tier`) |
| `at-disclosure` | At disclosure screen |
| `fully-enrolled` | BGC cleared, fully enrolled |

## Common Commands

```bash
# Mobile user at availability screen
npm run dev -- --step at-availability --platform mobile

# Fully enrolled premium user (mobile)
npm run dev -- --step fully-enrolled --platform mobile --tier premium

# Web user at disclosure
npm run dev -- --step at-disclosure --platform web

# Basic mobile user ready for testing
npm run dev -- --step fully-enrolled --platform mobile --tier basic
```

## Output

The CLI prints credentials and metadata for the created user:

```
✓ Provider created at step: fully-enrolled (mobile)

  Email:      prov-xxxxxxxx@care.com
  Password:   letmein1
  MemberId:   1234567
  UUID:       xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  Vertical:   CHILD_CARE
```

All accounts use:
- **Password:** `letmein1`
- **Name:** Martina Goodram
- **Address:** 28965 Homewood Plaza, Little Rock, AR 72204
- **DOB:** 07/26/1995
- **SSN:** 490-95-9347 (for IDV/screening pass)

## Known Limitations

### Detailed availability calendar

The mobile app's "Your Services & Availability" screen reads from a legacy MySQL calendar table. The factory sets:
- Full-time preference (visible in the app)
- `hasMemberEverFilledOneTimeAvailability` flag (acknowledged)
- REST availability data (Mon-Fri 9am-5pm)

However, the **detailed day/time grid** in the app requires a one-time manual save: open "Your Services & Availability" > tap Edit > Save. This populates the legacy calendar entries.

### Platform notes

- **Mobile** targets Android only. iOS enrollment has inconsistencies — avoid iOS for now.
- **Web** does not have an `at-availability` step (availability is part of `profile-complete`).

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `CZEN_API_KEY environment variable is required` | Create `.env` with the three required variables |
| `Error: browserType.launch` | Run `npx playwright install chromium` |
| Auth token fails | VPN must be connected for SPI endpoints |
| BGC fails at Sterling callback | Check that `MYSQL_DB_PASS_DEV` is set — the enrollment step needs DB access |
| User lands on wrong screen | Verify `--platform` flag matches the device you're testing on |

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
    ├── registry.ts       # Step pipelines (web + mobile)
    ├── account.ts        # Account creation (web GraphQL / mobile REST)
    ├── profile.ts        # Web profile setup + availability
    ├── mobile.ts         # Mobile-specific enrollment flow
    ├── upgrade.ts        # Stripe/Vantiv payment + subscription
    ├── disclosure.ts     # BGC disclosure acceptance
    ├── enrollment.ts     # SSN trace, eligibility, BGC, Sterling callback
    └── photo.ts          # Programmatic PNG generation + upload
```

### Adding a new vertical

1. Create `src/payloads/<vertical>.ts` with the same export shape as `childcare.ts`
2. Add the vertical name to the `Vertical` type in `types.ts`
3. Add a `case` to `loadPayloads()` in `index.ts`

### Adding a new step

1. Add the step name to `WEB_STEPS` and/or `MOBILE_STEPS` in `types.ts`
2. Create a runner function in the appropriate `steps/` file
3. Register it in the pipeline array in `registry.ts`
