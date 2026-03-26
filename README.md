# QA Provider Factory

A CLI tool for the PEXP team that navigates provider enrollment to specific checkpoints. Instead of manually clicking through 15+ screens to reach a particular point in the flow, run one command and get there in seconds.

- **Web**: Opens a real Chromium browser and drives through enrollment pages, stopping at the target page with the browser open for you to take over.
- **Mobile**: Uses API calls to create an account at a specific enrollment state.

## Setup

```bash
git clone <repo-url>
cd qa-provider-factory
./setup.sh
```

The setup script handles everything: checks your Node.js version, installs npm dependencies, installs Playwright Chromium, walks you through configuring `.env`, and builds the project.

To set up manually instead, see the steps below.

<details>
<summary>Manual setup</summary>

### 1. Install dependencies

```bash
npm install
```

### 2. Install Playwright (used for web enrollment + Auth0 token acquisition)

```bash
npx playwright install chromium
```

### 3. Configure environment variables

Create a `.env` file in the project root (or copy from `.env.example`):

```
CZEN_API_KEY=<your Care.com API key>
STRIPE_KEY=<Stripe test key>
MYSQL_DB_PASS_DEV=<MySQL read-only password>
```

### 4. Build

```bash
npm run build
```

</details>

### Environment variables

| Variable | Required for | How to get it |
|----------|-------------|---------------|
| `CZEN_API_KEY` | Mobile steps, web steps past account creation | Ask a team lead or check the QA vault |
| `STRIPE_KEY` | Mobile `upgraded` and later | Stripe dashboard > Developers > API keys (test mode) |
| `MYSQL_DB_PASS_DEV` | Mobile `fully-enrolled`; optional for UUID lookup on other steps | Ask a team lead or check the QA vault |

### Network access

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

The tool runs through enrollment up to and including the step you specify.

### Web (`--platform web`)

Web drives a real Chromium browser through the enrollment flow. The browser stops at the target page and stays open for manual testing.

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

Steps before `at-account-creation` navigate the browser without creating an account — the browser stops and you fill in the form yourself. Steps at `at-account-creation` and beyond fill in forms automatically using the test data below.

#### What the web flow fills in automatically

| Step | Fields entered |
|------|---------------|
| `at-vertical-selection` | Selects the "Child Care" vertical |
| `at-location` | ZIP code `72204` |
| `at-account-creation` | First name, last name, email, password, gender, age checkbox |
| `at-basic-payment` / `at-premium-payment` | Name on card, credit card number, expiration, CVV, billing ZIP (via Stripe Elements) |

### Mobile (`--platform mobile`)

Mobile uses API calls to build account state at each checkpoint. Steps are cumulative — `--step upgraded` creates an account, completes the profile, and purchases a subscription.

| Step | What it does | Where the user lands |
|------|-------------|---------------------|
| `account-created` | Creates account via REST SPI | "Where are you looking for jobs?" screen |
| `at-build-profile` | Account created, no profile work done | "Build Your Profile" screen |
| `at-availability` | Completes profile build steps (verticals + attributes) | "Your availability" screen |
| `profile-complete` | Sets availability (Full-time, Mon-Fri) + bio + photo | Past profile |
| `upgraded` | Vantiv payment + Basic/Premium subscription | Past upgrade |
| `at-disclosure` | Reaches disclosure screen | Disclosure screen |
| `fully-enrolled` | Disclosure, SSN trace, eligibility, BGC, Sterling callback | Fully enrolled |

## Examples

```bash
# Web — stop at the location page
npm run create --step at-location --platform web

# Web — stop at the account creation form
npm run create --step at-account-creation --platform web

# Web — stop at basic checkout
npm run create --step at-basic-payment --platform web

# Web — stop at premium checkout
npm run create --step at-premium-payment --platform web

# Web — complete enrollment through app download (basic tier)
npm run create --step at-app-download --platform web --tier basic

# Mobile — stopped at the availability screen
npm run create --step at-availability --platform mobile

# Mobile — fully enrolled Basic user
npm run create --step fully-enrolled --platform mobile --tier basic

# Mobile — fully enrolled Premium user
npm run create --step fully-enrolled --platform mobile --tier premium
```

## Output

### Web (before account creation)

For steps before `at-account-creation`, the browser stops at the target page and prints suggested credentials for when you reach the account form:

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

  Close the browser when you're done.
```

### Web (after account creation)

For steps at or past `at-account-creation`, the flow fills in all forms automatically. After creating the account, it extracts the MemberId and UUID from the browser session and prints the same credential block as mobile:

```
  ⏳ Starting web enrollment flow...

  ✓ at-get-started
  ✓ at-soft-intro-combined
  ✓ at-vertical-selection
  ✓ at-location
  ✓ at-preferences
  ✓ at-family-count
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

  Close the browser when you're done.
```

If a step fails (e.g., a selector doesn't match), the browser stays open for debugging. If the account was already created, the credentials are still printed so you don't lose the user.

### Mobile

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

## Test Data

Every account uses:

| Field | Value |
|-------|-------|
| Password | `letmein1` |
| Name | Martina Goodram |
| Address | 28965 Homewood Plaza, Little Rock, AR 72204 |
| Date of birth | 07/26/1995 |
| SSN | 490-95-9347 |
| Phone | 200-100-4000 |
| Credit card | `4111 1111 1111 1111`, Exp `09/32`, CVV `123`, Billing ZIP `72204` |

The name, address, DOB, SSN, and phone are configured to pass IDV and SSN trace checks in the dev environment.

## Known Limitations

### Web selectors

The web flow uses Playwright selectors (role, label, text) to interact with enrollment pages. If a page's UI changes, selectors in `src/steps/web-flow.ts` may need updating. When the automation fails, the browser stays open so you can continue manually or debug.

### Stripe checkout (web)

The checkout page uses Stripe Elements, which render card number, expiration, and CVC fields inside separate iframes. The factory handles this by clicking the card number iframe and using keyboard input (`page.keyboard.type`) with Tab between fields. If Stripe changes its iframe structure or titles, update `fillCheckoutForm()` in `web-flow.ts`.

### Availability calendar on mobile

The mobile app's "Your Services & Availability" detail view (the day/time grid) reads from a legacy database table that is only populated when a user saves availability through the app UI. The factory sets the Full-time preference and acknowledges availability via the API, but the detailed Mon-Fri 9am-5pm grid requires one manual action after first login:

1. Open "Your Services & Availability"
2. Tap **Edit**
3. Tap **Save**

This is a one-time step per user.

### iOS

Mobile enrollment targets **Android only**. The iOS enrollment flow has inconsistencies that cause users to land on unexpected screens. Avoid iOS for factory-created users until this is resolved.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `Error: browserType.launch` | Playwright browsers not installed | Run `npx playwright install chromium` |
| Web flow stops with selector error | Page UI changed or selector is wrong | Browser stays open — continue manually or update selectors in `web-flow.ts` |
| Checkout fields not filling | Stripe iframe titles changed | Update iframe selectors in `fillCheckoutForm()` in `web-flow.ts` |
| Purchase button stays disabled | Stripe validation failed (card/exp/CVC not entered correctly) | Check browser — Stripe fields may show red error borders indicating which field failed |
| `CZEN_API_KEY environment variable is required` | Missing `.env` file or empty value | Create `.env` with all three variables |
| `INVALID_CREDENTIALS` or `403 Forbidden` on login | VPN not connected, or API key is wrong | Connect to VPN; verify `CZEN_API_KEY` |
| BGC step fails at Sterling callback | `MYSQL_DB_PASS_DEV` not set or DB unreachable | Set the env var; verify VPN connection |

## Project Structure

```
qa-provider-factory/
├── .env                          # Environment variables (not committed)
├── .env.example                  # Template for .env
├── setup.sh                      # First-time setup script
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
│       ├── web-flow.ts           # Playwright browser enrollment (web)
│       ├── registry.ts           # Step pipeline (mobile)
│       ├── account.ts            # Account creation
│       ├── profile.ts            # Profile, availability, bio
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

### Adding a new web enrollment step

1. Add the step name to `WEB_STEPS` in `src/types.ts`
2. Add a new navigation block in `runWebEnrollmentFlow()` in `src/steps/web-flow.ts`

### Adding a new mobile step

1. Add the step name to `MOBILE_STEPS` in `src/types.ts`
2. Write a runner function in the appropriate file under `src/steps/`
3. Insert it in the correct position in the pipeline array in `src/steps/registry.ts`

### Running tests

```bash
npm test             # single run
npm run test:watch   # watch mode
```
