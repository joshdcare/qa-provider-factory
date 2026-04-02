---
name: jumper
description: >-
  Create test provider accounts at specific enrollment checkpoints for the PEXP
  team. Supports web and mobile (Android) platforms, multiple verticals (Child
  Care, Senior Care, Pet Care, Housekeeping, Tutoring), Basic and Premium tiers,
  Dev and Staging environments, and session-scoped LaunchDarkly flag toggling.
  Use when asked to create a test provider, generate a QA user, set up an
  enrollment test account, or run jumper.
---

# Jumper

CLI + TUI tool that creates provider accounts at specific enrollment checkpoints, so QA can test any point in the flow without manually clicking through enrollment.

- **Web**: Drives a real Chromium browser through enrollment pages, stopping at the target page. The browser stays open after logging credentials so you can continue testing; pass `--auto-close` to close it automatically.
- **Mobile**: Uses API calls to set up account state at specific checkpoints.
- **TUI**: Interactive wizard (`jumper start`) walks through environment, platform, vertical, step, feature flags, tier, and options before launching.

## Prerequisites

- Node.js 18+
- Playwright Chromium: `npx playwright install chromium`
- A `.env` file in the project root (see `.env.example`):

```
CZEN_API_KEY=<Care.com API key for dev>
CZEN_API_KEY_STG=<Care.com API key for staging>
MYSQL_DB_PASS_DEV=<MySQL read-only password for dev — required for mobile fully-enrolled>
MYSQL_DB_PASS_STG=<MySQL read-only password for staging>
LD_API_TOKEN=<LaunchDarkly API token — optional, for flag toggling>
LD_PROJECT_KEY=<LaunchDarkly project key — optional, for flag toggling>
```

## Quick Start

```bash
cd jumper
npm install
npx playwright install chromium
npm run build && npm link

# Interactive mode (recommended)
jumper start

# CLI mode
jumper --step <step> --platform <platform> [--vertical <vertical>] [--tier basic|premium] [--env dev|stg] [--auto-close]
```

## Supported Verticals

| Vertical | `--vertical` flag | Status |
|----------|------------------|--------|
| Child Care | `childcare` (default) | Validated |
| Senior Care | `seniorcare` | Best-effort — validate by running |
| Pet Care | `petcare` | Best-effort — validate by running |
| Housekeeping | `housekeeping` | Best-effort — validate by running |
| Tutoring | `tutoring` | Best-effort — validate by running |

## Environments

| Environment | `--env` flag | Base URL |
|-------------|-------------|----------|
| Development | `dev` (default) | `https://www.dev.carezen.net` |
| Staging | `stg` | `https://www.stg.carezen.net` |

Production is never used.

## Enrollment Steps

### Web steps (`--platform web`, default)

| Step | Page URL |
|------|----------|
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

### Mobile steps (`--platform mobile`)

| Step | Where the user lands |
|------|---------------------|
| `account-created` | Account exists, at "Where are you looking for jobs?" |
| `at-build-profile` | At "Build Your Profile" screen |
| `at-availability` | Profile built, at "Your availability" screen |
| `profile-complete` | Availability + bio set, past profile |
| `upgraded` | Subscription purchased (use `--tier`) |
| `at-disclosure` | At disclosure screen |
| `fully-enrolled` | BGC cleared, fully enrolled |

## LaunchDarkly Feature Flags

When `LD_API_TOKEN` and `LD_PROJECT_KEY` are set, the TUI wizard offers a flag browser where you can search and toggle flags before running. Flags toggled during a session are automatically reverted to their original state on exit. The flag browser is also accessible during execution via the `f` hotkey.

## Common Commands

```bash
# Interactive TUI wizard
jumper start

# Web — stop at the location page (default: childcare, dev)
jumper --step at-location --platform web

# Web — senior care on staging
jumper --step at-account-creation --platform web --vertical seniorcare --env stg

# Mobile — user at availability screen
jumper --step at-availability --platform mobile

# Mobile — fully enrolled premium user
jumper --step fully-enrolled --platform mobile --tier premium

# Standalone flag browser
jumper flags
```

## Test Data

All accounts use:
- **Password:** `letmein1`
- **Name:** Martina Goodram
- **ZIP code:** 72204
- **Address:** 28965 Homewood Plaza, Little Rock, AR 72204
- **DOB:** 07/26/1995
- **SSN:** 490-95-9347 (passes IDV/screening in dev)
- **Credit card:** 4111 1111 1111 1111, Exp 09/32, CVV 123, Billing ZIP 72204

## Architecture

```
src/
├── index.ts              # CLI entry point (Commander.js)
├── types.ts              # Types, step definitions, env config
├── api/
│   ├── auth.ts           # Cookie-based auth via headless browser login
│   ├── client.ts         # HTTP client (GraphQL, REST, SPI, multipart)
│   ├── graphql.ts        # All GraphQL queries and mutations
│   └── launchdarkly.ts   # LaunchDarkly REST API client
├── payloads/             # Per-vertical API payloads
├── recorder/             # Run recording (JSON + HTML reports, traces)
├── steps/
│   ├── web-flow.ts       # Playwright browser enrollment (web)
│   ├── registry.ts       # Step pipeline (mobile)
│   ├── account.ts        # Account creation
│   ├── profile.ts        # Profile, availability, bio
│   ├── mobile.ts         # Mobile-specific enrollment flow
│   ├── upgrade.ts        # Payment + subscription
│   ├── disclosure.ts     # BGC disclosure acceptance
│   ├── enrollment.ts     # SSN trace, eligibility, BGC, Sterling callback
│   └── photo.ts          # Programmatic profile photo generation + upload
└── tui/
    ├── app.tsx           # Root TUI component + state machine
    ├── wizard.tsx        # Configuration wizard (8-stage)
    ├── execution.tsx     # Execution screen with step list + log drawer
    ├── flag-browser.tsx  # LaunchDarkly flag search + toggle component
    ├── flag-session.ts   # Session-scoped flag toggle tracking + revert
    ├── log-panel.tsx     # Scrollable, filterable log renderer
    ├── emitter.ts        # RunEmitter event system
    └── theme.ts          # TUI color constants
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `CZEN_API_KEY environment variable is required` | Create `.env` with the required variables |
| `Error: browserType.launch` | Run `npx playwright install chromium` |
| Web flow selector fails | Browser stays open for debugging. Update selectors in `src/steps/web-flow.ts` |
| Auth token fails (mobile) | VPN must be connected for SPI endpoints |
| BGC fails at Sterling callback | Check that `MYSQL_DB_PASS_DEV` (or `_STG`) is set |
| LaunchDarkly not configured | Set `LD_API_TOKEN` and `LD_PROJECT_KEY` in `.env` |
