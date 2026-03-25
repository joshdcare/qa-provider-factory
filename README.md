# QA Provider Factory

A CLI tool for the PEXP team that creates provider accounts at specific enrollment checkpoints. Instead of manually tapping through 15+ screens to reach a particular point in the flow, run one command and get a user ready to test in seconds.

## Setup

### 1. Install dependencies

```bash
git clone <repo-url>
cd qa-provider-factory
npm install
```

### 2. Install Playwright (used for Auth0 token acquisition)

```bash
npx playwright install chromium
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```
CZEN_API_KEY=<your Care.com API key>
STRIPE_KEY=<Stripe test key>
MYSQL_DB_PASS_DEV=<MySQL read-only password>
```

| Variable | Required for | How to get it |
|----------|-------------|---------------|
| `CZEN_API_KEY` | All steps | Ask a team lead or check the QA vault |
| `STRIPE_KEY` | `upgraded` and later | Stripe dashboard > Developers > API keys (test mode) |
| `MYSQL_DB_PASS_DEV` | `fully-enrolled`; optional for UUID lookup on other steps | Ask a team lead or check the QA vault |

### 4. Network access

You must be connected to the **VPN** for SPI endpoints and the dev database to be reachable.

## Usage

```bash
npm run create --step <step> [--platform web|mobile] [--tier basic|premium] [--vertical childcare] [--env dev]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--step` | *(required)* | Enrollment checkpoint to stop at |
| `--platform` | `web` | Target platform — `web` or `mobile` (Android) |
| `--tier` | `premium` | Subscription tier — `basic` or `premium` |
| `--vertical` | `childcare` | Service vertical |
| `--env` | `dev` | Target environment |

## Enrollment Steps

The tool runs every step up to and including the one you specify. Steps are cumulative — `--step upgraded` creates an account, completes the profile, sets up payment, and purchases a subscription.

### Web (`--platform web`)

| Step | What it does | Where the user lands |
|------|-------------|---------------------|
| `account-created` | Creates account via GraphQL | Login screen, no profile |
| `profile-complete` | Sets name, verticals, attributes, availability, bio, photo | Past profile, ready for payment |
| `pre-upgrade` | Links a Stripe payment method | Payment screen, no subscription |
| `upgraded` | Purchases Basic or Premium subscription | Past upgrade |
| `at-disclosure` | Accepts BGC disclosure | Past disclosure |
| `fully-enrolled` | SSN trace, eligibility check, BGC submission, Sterling callback | Fully enrolled dashboard |

### Mobile (`--platform mobile`)

| Step | What it does | Where the user lands |
|------|-------------|---------------------|
| `account-created` | Creates account via REST SPI | "Where are you looking for jobs?" screen |
| `at-build-profile` | Account created, no profile work done | "Build Your Profile" screen |
| `at-availability` | Completes profile build steps (verticals + attributes) | "Your availability" screen |
| `profile-complete` | Sets availability (Full-time, Mon-Fri) + bio + photo | Past profile |
| `upgraded` | Vantiv payment + Basic/Premium subscription | Past upgrade |
| `at-disclosure` | Reaches disclosure screen | Disclosure screen |
| `fully-enrolled` | Disclosure, CareChat onboard, SSN trace, eligibility, BGC, Sterling callback | Fully enrolled |

## Examples

```bash
# Simplest: just an account
npm run create --step account-created

# Mobile user at the Build Your Profile screen
npm run create --step at-build-profile --platform mobile

# Mobile user stopped at the availability screen
npm run create --step at-availability --platform mobile

# Fully enrolled Basic user on mobile
npm run create --step fully-enrolled --platform mobile --tier basic

# Fully enrolled Premium user on web
npm run create --step fully-enrolled --platform web --tier premium

# Web user at disclosure
npm run create --step at-disclosure --platform web
```

## Output

On success the CLI prints the credentials you need to log in:

```
✓ Provider created at step: fully-enrolled (mobile)

  Email:      prov-a1b2c3d4@care.com
  Password:   letmein1
  MemberId:   1373700
  UUID:       776ca774-fe58-44c5-bd1c-a3df3750d0ed
  Vertical:   CHILD_CARE

  ℹ Availability: Full-time preference is set. Detailed day/time schedule
    is not visible in "Your Services & Availability" on first login.
    Tap "Edit" > save once in the app to populate the calendar view.
```

Every account uses:

| Field | Value |
|-------|-------|
| Password | `letmein1` |
| Name | Martina Goodram |
| Address | 28965 Homewood Plaza, Little Rock, AR 72204 |
| Date of birth | 07/26/1995 |
| SSN | 490-95-9347 |
| Phone | 200-100-4000 |

The name, address, DOB, SSN, and phone are configured to pass IDV and SSN trace checks in the dev environment.

## Known Limitations

### Availability calendar on mobile

The mobile app's "Your Services & Availability" detail view (the day/time grid) reads from a legacy database table that is only populated when a user saves availability through the app UI. The factory sets the Full-time preference and acknowledges availability via the API, but the detailed Mon-Fri 9am-5pm grid requires one manual action after first login:

1. Open "Your Services & Availability"
2. Tap **Edit**
3. Tap **Save**

This is a one-time step per user.

### iOS

Mobile enrollment targets **Android only**. The iOS enrollment flow has inconsistencies that cause users to land on unexpected screens. Avoid iOS for factory-created users until this is resolved.

### Web availability

The web platform does not have a separate `at-availability` step. Availability is set as part of `profile-complete`.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `CZEN_API_KEY environment variable is required` | Missing `.env` file or empty value | Create `.env` with all three variables |
| `Error: browserType.launch` | Playwright browsers not installed | Run `npx playwright install chromium` |
| `INVALID_CREDENTIALS` or `403 Forbidden` on login | VPN not connected, or API key is wrong | Connect to VPN; verify `CZEN_API_KEY` |
| BGC step fails at Sterling callback | `MYSQL_DB_PASS_DEV` not set or DB unreachable | Set the env var; verify VPN connection |
| User lands on wrong screen (mobile) | Used `--platform web` but testing on a device | Use `--platform mobile` for device testing |
| `Step "at-availability" is not valid for web platform` | `at-availability` only exists in the mobile pipeline | Use `--platform mobile` or pick a valid web step |

## Project Structure

```
qa-provider-factory/
├── .env                          # Environment variables (not committed)
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # CLI entry point
│   ├── types.ts                  # Types, step lists, env config
│   ├── api/
│   │   ├── auth.ts               # Auth0 PKCE token flow (Playwright headless)
│   │   ├── client.ts             # HTTP client — GraphQL, REST JSON, SPI, multipart
│   │   └── graphql.ts            # All GraphQL queries and mutations
│   ├── payloads/
│   │   └── childcare.ts          # Default payloads for the Child Care vertical
│   └── steps/
│       ├── registry.ts           # Step pipeline definitions (web + mobile)
│       ├── account.ts            # Account creation
│       ├── profile.ts            # Web profile, availability, bio
│       ├── mobile.ts             # Mobile-specific enrollment runners
│       ├── upgrade.ts            # Payment setup + subscription (Stripe / Vantiv)
│       ├── disclosure.ts         # BGC disclosure acceptance
│       ├── enrollment.ts         # SSN trace, eligibility, BGC, Sterling callback
│       └── photo.ts              # Programmatic profile photo generation + upload
├── tests/
│   ├── index.test.ts
│   ├── client.test.ts
│   └── registry.test.ts
└── docs/
    ├── specs/                    # Design spec
    └── plans/                    # Implementation plan
```

## Extending the Tool

### Adding a new vertical

1. Create `src/payloads/<vertical>.ts` matching the export shape of `childcare.ts`
2. Add the vertical name to the `Vertical` type in `src/types.ts`
3. Add a `case` to the `loadPayloads()` switch in `src/index.ts`

### Adding a new enrollment step

1. Add the step name to `WEB_STEPS` and/or `MOBILE_STEPS` in `src/types.ts`
2. Write a runner function in the appropriate file under `src/steps/`
3. Insert it in the correct position in the pipeline array in `src/steps/registry.ts`

### Running tests

```bash
npm test             # single run
npm run test:watch   # watch mode
```
