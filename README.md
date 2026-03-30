# Jumper

A CLI + TUI tool for the PEXP team that navigates provider enrollment to specific checkpoints. Instead of manually clicking through 15+ screens to reach a particular point in the flow, run one command and get there in seconds.

Supports **five verticals**: Child Care, Senior Care, Pet Care, Housekeeping, and Tutoring.

- **Web**: Opens a real Chromium browser and drives through enrollment pages, stopping at the target page. The browser stays open after logging credentials so you can continue testing; pass `--auto-close` to close it automatically.
- **Mobile**: Uses API calls to create an account at a specific enrollment state.

Every run (CLI and TUI) is automatically recorded to `runs/` with a structured JSON report, an HTML report, and — for web flows — a video recording, Playwright trace, and per-step screenshots.

## Setup

```bash
git clone git@github.com:joshdcare/jumper.git
cd jumper
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
MYSQL_DB_PASS_DEV=<MySQL read-only password>
```

### 4. Build and link

```bash
npm run build
npm link
```

After linking, the `jumper` command is available globally in your terminal.

</details>

### Environment variables

| Variable | Required for | How to get it |
|----------|-------------|---------------|
| `CZEN_API_KEY` | Dev mobile steps, web steps past account creation | Ask a team lead or check the QA vault |
| `CZEN_API_KEY_STG` | Staging mobile/web steps | Ask a team lead or check the QA vault |
| `MYSQL_DB_PASS_DEV` | Dev `fully-enrolled` (Sterling BGC callback) | Ask a team lead or check the QA vault |
| `MYSQL_DB_PASS_STG` | Staging `fully-enrolled` (Sterling BGC callback) | Ask a team lead or check the QA vault |
| `LD_API_TOKEN` | LaunchDarkly flag toggling (optional) | LaunchDarkly → Account settings → API access tokens |
| `LD_PROJECT_KEY` | LaunchDarkly flag toggling (optional) | LaunchDarkly → Projects → your project key |

### Network access

You must be connected to the **VPN** for SPI endpoints and the dev database to be reachable.

---

## Interactive Mode (TUI)

The easiest way to use Jumper. A guided wizard walks you through configuration, then runs or steps through each enrollment stage with full visibility into what's happening.

```bash
jumper start
```

<p align="center">
  <img src="docs/demo.gif" alt="Jumper TUI demo — wizard and execution screen" width="800" />
</p>

### Wizard

The wizard walks through up to eight screens:

1. **Environment** — Dev or Staging
2. **Platform** — Web or Mobile
3. **Vertical** — Child Care, Senior Care, Pet Care, Housekeeping, or Tutoring
4. **Step** — The enrollment checkpoint to stop at (platform-specific list with descriptions)
5. **Feature Flags** — Optionally toggle LaunchDarkly flags for the session (changes revert on exit)
6. **Tier** — Basic or Premium (only shown for steps that require payment)
7. **Options** — Count (how many providers to create) and execution mode (Run All or Step Through)
8. **Confirm** — Review selections, see any toggled flags, and launch

Environment variable warnings are shown if your `.env` is missing keys required for the selected flow.

### Execution screen

Once the wizard completes, the execution screen takes over:

**Left panel** — Step list with status icons (`○` pending, `▸` running, `✓` complete, `✗` error) and per-step log counts. Below the steps, a context section shows extracted values (email, memberId, UUID) as they become available.

**Right panel** — Current step header with description, recent activity lines, and a collapsible log drawer.

**Bottom bar** — Environment indicator, keybindings, step counter, and elapsed time.

### Keyboard shortcuts

| Key | During execution | After completion |
|-----|-----------------|------------------|
| `l` | Toggle log drawer open/closed | Toggle log drawer |
| `d` | Toggle detail mode (verbose log entries) | Toggle detail mode |
| `tab` / `shift+tab` | Browse logs by step | Browse logs by step |
| `a` | Show all logs (across all steps) | Show all logs |
| `enter` | Continue (step-through mode) | Confirm menu selection |
| `↑` / `↓` | — | Navigate completion menu |
| `q` | Quit | Quit |
| `esc` | Close log drawer / pause (run-all) | Close log drawer |
| `r` | Retry (after error) | — |

### Log drawer

Press `l` to expand the log drawer. Logs are grouped by step — use `tab`/`shift+tab` to switch between steps, or `a` to see all logs combined. Each step shows its log count in the step list.

Logs include:
- **Network requests/responses** — method, URL, status, duration
- **Browser actions** (web) — fields filled, buttons clicked, checkboxes toggled, page navigations
- **API details** (mobile) — request/response payloads
- **Step lifecycle** — start, complete, error events with context

### Execution modes

- **Run All** — Executes every step automatically from start to finish. Press `esc` to pause.
- **Step Through** — Pauses after each step completes. Press `enter` to advance to the next step.

### After completion

When the run finishes, a completion screen shows:
- Step results summary
- Provider details (email, password, memberId, UUID, vertical)
- A **What next?** menu:
  - **Create another (same settings)** — re-run with the same wizard configuration
  - **New configuration** — go back to the wizard
  - **Quit** — exit

Logs remain accessible on the completion screen via `l`, `tab`, and `a`.

---

## CLI Mode

For scripting or when you already know exactly what you want:

```bash
jumper --step <step> [--platform web|mobile] [--tier basic|premium] [--vertical childcare] [--env dev] [--auto-close]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--step` | *(required)* | Enrollment checkpoint to stop at |
| `--platform` | `web` | Target platform — `web` or `mobile` (Android) |
| `--tier` | `premium` | Subscription tier — `basic` or `premium` |
| `--vertical` | `childcare` | Service vertical — `childcare`, `seniorcare`, `petcare`, `housekeeping`, `tutoring` |
| `--env` | `dev` | Target environment |
| `--auto-close` | *(off)* | Close the browser automatically after completion (web only) |

### Examples

```bash
# Web — stop at the location page (Child Care, the default)
jumper --step at-location --platform web

# Web — Senior Care provider at account creation
jumper --step at-account-creation --platform web --vertical seniorcare

# Web — Pet Care provider through premium checkout
jumper --step at-premium-payment --platform web --vertical petcare

# Mobile — Housekeeping provider stopped at the availability screen
jumper --step at-availability --platform mobile --vertical housekeeping

# Mobile — fully enrolled Basic user
jumper --step fully-enrolled --platform mobile --tier basic

# Mobile — fully enrolled Tutoring Premium user
jumper --step fully-enrolled --platform mobile --tier premium --vertical tutoring
```

---

## Run Recording

Every run automatically generates a timestamped folder under `runs/` with full debug artifacts. No flags required — recording is always on.

```
runs/
└── 2026-03-28_14-22-05_web_childcare/
    ├── report.json        # Structured run data (steps, requests, errors, context)
    ├── report.html        # Self-contained HTML report with embedded screenshots
    ├── video.webm         # Browser recording (web only)
    ├── trace.zip          # Playwright trace — open with `npx playwright show-trace trace.zip` (web only)
    └── screenshots/       # Per-step screenshots (web only)
        ├── 01_at-get-started.png
        ├── 02_at-soft-intro-combined.png
        └── ...
```

### What's captured

| Artifact | Web | Mobile | Description |
|----------|-----|--------|-------------|
| `report.json` | ✓ | ✓ | Steps with pass/fail status, duration, network requests (truncated bodies), errors with stack traces, and provider context |
| `report.html` | ✓ | ✓ | Human-readable report with collapsible sections and embedded screenshots |
| `video.webm` | ✓ | — | Full browser video from context creation to close |
| `trace.zip` | ✓ | — | Playwright trace with DOM snapshots — replayable with `npx playwright show-trace` |
| `screenshots/` | ✓ | — | PNG screenshot after each completed step |

### Viewing reports

Open the HTML report directly in a browser:

```bash
open runs/2026-03-28_14-22-05_web_childcare/report.html
```

Replay a Playwright trace for detailed debugging:

```bash
npx playwright show-trace runs/2026-03-28_14-22-05_web_childcare/trace.zip
```

The `runs/` directory is git-ignored. Reports stay local to your machine.

---

## Enrollment Steps

### Web (`--platform web`)

Web drives a real Chromium browser through the enrollment flow. The browser stays open after logging credentials so you can continue testing. Use `--auto-close` to close it automatically.

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
| `at-vertical-selection` | Selects the vertical specified by `--vertical` |
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
jumper/
├── .env                          # Environment variables (not committed)
├── .env.example                  # Template for .env
├── setup.sh                      # First-time setup script
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # CLI entry point + `start` subcommand
│   ├── types.ts                  # Types, step lists, env config
│   ├── verticals.ts              # Vertical registry (service IDs, web selectors)
│   ├── api/
│   │   ├── auth.ts               # Cookie-based auth via headless browser login
│   │   ├── client.ts             # HTTP client — GraphQL, REST JSON, SPI, multipart
│   │   ├── graphql.ts            # All GraphQL queries and mutations
│   │   └── launchdarkly.ts       # LaunchDarkly REST API client (search + toggle flags)
│   ├── payloads/
│   │   ├── childcare.ts          # Child Care payloads
│   │   ├── seniorcare.ts         # Senior Care payloads
│   │   ├── petcare.ts            # Pet Care payloads
│   │   ├── housekeeping.ts       # Housekeeping payloads
│   │   └── tutoring.ts           # Tutoring payloads
│   ├── recorder/
│   │   ├── run-recorder.ts       # Core recorder — collects events, generates reports
│   │   ├── types.ts              # Report schema (RunReport, ReportStep, etc.)
│   │   ├── html-template.ts      # Self-contained HTML report generator
│   │   └── truncate.ts           # Shared body truncation utility
│   ├── steps/
│   │   ├── web-flow.ts           # Playwright browser enrollment (web)
│   │   ├── registry.ts           # Step pipeline (mobile)
│   │   ├── account.ts            # Account creation
│   │   ├── profile.ts            # Profile, availability, bio
│   │   ├── mobile.ts             # Mobile-specific enrollment runners
│   │   ├── upgrade.ts            # Payment setup + subscription (Stripe / Vantiv)
│   │   ├── disclosure.ts         # BGC disclosure acceptance
│   │   ├── enrollment.ts         # SSN trace, eligibility, BGC, Sterling callback
│   │   └── photo.ts              # Programmatic profile photo generation + upload
│   └── tui/
│       ├── app.tsx               # Root TUI component + state machine
│       ├── wizard.tsx            # Configuration wizard (8-stage)
│       ├── execution.tsx         # Execution screen with step list + log drawer
│       ├── log-panel.tsx         # Scrollable, filterable log renderer
│       ├── emitter.ts            # RunEmitter event system
│       ├── flag-browser.tsx      # LaunchDarkly flag search + toggle component
│       ├── flag-session.ts       # Session-scoped flag toggle tracking + revert
│       ├── results-table.tsx     # Batch results table
│       ├── step-descriptions.ts  # Human-readable step descriptions
│       └── theme.ts              # TUI color constants
├── tests/
│   ├── index.test.ts
│   ├── client.test.ts
│   ├── registry.test.ts
│   ├── verticals.test.ts
│   └── recorder/
│       ├── run-recorder.test.ts  # RunRecorder unit tests
│       ├── html-template.test.ts # HTML report generation tests
│       └── truncate.test.ts      # Truncation utility tests
├── runs/                         # Generated run artifacts (git-ignored)
├── demo.tape                     # VHS tape for recording the demo GIF
└── docs/
    ├── demo.gif                  # TUI demo recording
    ├── specs/                    # Design specs
    └── plans/                    # Implementation plans
```

## Extending the Tool

### Adding a new web enrollment step

1. Add the step name to `WEB_STEPS` in `src/types.ts`
2. Add a new navigation block in `runWebEnrollmentFlow()` in `src/steps/web-flow.ts`
3. Add a description in `src/tui/step-descriptions.ts`

### Adding a new mobile step

1. Add the step name to `MOBILE_STEPS` in `src/types.ts`
2. Write a runner function in the appropriate file under `src/steps/`
3. Insert it in the correct position in the pipeline array in `src/steps/registry.ts`
4. Add a description in `src/tui/step-descriptions.ts`

### Adding a new vertical

1. Add the vertical name to `ALL_VERTICALS` in `src/types.ts`
2. Add an entry in `VERTICAL_REGISTRY` in `src/verticals.ts` with the service ID and web tile pattern
3. Create a payload file at `src/payloads/<vertical>.ts` (copy an existing one and update the service-specific fields)
4. Add the dynamic import case in `loadPayloads()` in `src/index.ts`

### Running tests

```bash
npm test             # single run
npm run test:watch   # watch mode
```
