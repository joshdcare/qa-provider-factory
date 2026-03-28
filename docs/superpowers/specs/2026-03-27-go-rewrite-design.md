# Jumper Go Rewrite — Design Spec

**Date**: 2026-03-27
**Goal**: Rewrite jumper in Go to improve speed (concurrent API calls) and reliability (explicit error handling, structured retries, typed errors) while replicating the full TUI and both platform flows.

## Motivation

The current TypeScript/Node implementation has two core problems:

1. **Speed** — the mobile/API pipeline runs 10+ HTTP calls sequentially. Many are independent and could run concurrently but Node's async model makes this awkward.
2. **Reliability** — flaky API responses, VPN drops, stale auth tokens, and eventual consistency issues cause intermittent failures. JavaScript's exception-based error handling makes it easy to miss failure paths.

Secondary wins from Go: single-binary distribution (no Node/npm/Playwright install), instant cold start, strong compile-time type safety.

## Architecture

Four layers:

```
┌─────────────────────────────────────┐
│  TUI (Bubble Tea)                   │
│  wizard · execution · log drawer    │
├─────────────────────────────────────┤
│  Orchestrator                       │
│  step pipeline · context passing    │
│  event channel → TUI                │
├──────────────────┬──────────────────┤
│  API Client      │  Web Driver      │
│  HTTP + retries  │  playwright-go   │
│  health checks   │  browser control │
└──────────────────┴──────────────────┘
```

- **TUI**: Bubble Tea models for wizard (6 stages) and execution screen. Receives events from orchestrator over a Go channel.
- **Orchestrator**: Manages step pipeline. Runs steps sequentially but parallelizes independent API calls within steps using goroutines. Collects `StepResult` values and merges context forward.
- **API Client**: HTTP client with per-request `context.WithTimeout` (default 15s), exponential backoff retries (3 attempts, 1s/2s/4s), typed errors (`ErrTimeout`, `ErrAuth`, `ErrUpstream`), and a health-check preflight.
- **Web Driver**: `playwright-go` for Chromium browser automation. Handles the web enrollment flow including Stripe Elements iframe interaction.

## Mobile Pipeline

Steps for `fully-enrolled`:

```
account-created → at-build-profile → at-availability → profile-complete → upgraded → at-disclosure → fully-enrolled
```

### Concurrency within steps

| Step | Calls | Concurrency |
|------|-------|-------------|
| `account-created` | providerCreate (GQL) | Single call |
| `at-build-profile` | saveMultipleVerticals, caregiverAttributesUpdate, providerJobInterestUpdate | All 3 in parallel |
| `at-availability` | universalProviderAttributesUpdate, setAvailability, acknowledgeAvailability, bio update, photo upload | Attributes + availability in parallel, then bio + photo in parallel |
| `upgraded` | addStripeAccount, getPaymentMethods, createStripeToken, upgradeSubscription | Mostly sequential; stripe token + getPaymentMethods can overlap |
| `at-disclosure` | disclosure acceptance | Single call |
| `fully-enrolled` | SSN trace, eligibility, BGC, Sterling callback | Mostly sequential; SSN trace + eligibility can overlap |

### Step result type

```go
type StepResult struct {
    Step     string
    Duration time.Duration
    Err      error
    Context  map[string]string
}
```

The orchestrator collects results and merges `Context` forward — `account-created` produces `authToken` and `memberId` that later steps consume.

### Error handling

- Every API call gets `context.WithTimeout` (default 15s, configurable).
- Retries: exponential backoff, 3 attempts (1s, 2s, 4s delays).
- Errors are typed: `ErrTimeout`, `ErrAuth`, `ErrUpstream`, `ErrValidation`.
- The TUI displays meaningful messages based on error type.
- The orchestrator decides whether to retry or abort based on error type.

### Health-check preflight

Before starting any flow, run in parallel:
- VPN reachability (ping the API base URL)
- Auth endpoint responds
- DB connectable (if step requires it)

Fail fast with a clear message if any check fails.

## Web Flow

Uses `playwright-go` (community Go binding for Playwright). Same Chromium browser, same selector strategies.

### Page functions

Each enrollment page gets its own function:

- `fillGetStarted(page) error`
- `fillSoftIntro(page) error`
- `fillVerticalSelection(page, vertical) error`
- `fillLocation(page) error`
- `fillPreferences(page) error`
- `fillAccountCreation(page, creds) error`
- `fillCheckout(page) error`

### Stripe checkout

Same iframe approach as current: locate `iframe[title*="Secure card number"]`, click, type card details via keyboard, Tab between fields.

### Browser lifecycle

- Launch headless Chromium at flow start.
- On `--no-auto-close`, leave open after completion.
- On error, leave open for manual debugging.

### Auth0 PKCE flow

Headless Playwright → navigate to Auth0 login → fill credentials → extract token. Same logic, Go syntax.

### Risk

`playwright-go` is third-party, not officially maintained by Microsoft. Actively developed and tracks Playwright releases. Fallback: shell out to a Node script for the web flow only.

## TUI (Bubble Tea)

### Wizard

Six stages, each a Bubble Tea model with list selection (`bubbles/list`):

1. **Platform** — Web or Mobile
2. **Vertical** — Child Care, Senior Care, Pet Care, Housekeeping, Tutoring
3. **Step** — Enrollment checkpoint (platform-specific list with descriptions)
4. **Tier** — Basic or Premium
5. **Options** — Count + execution mode (Run All / Step Through)
6. **Confirm** — Review selections, show env var warnings, launch

### Execution screen

Two-panel layout:
- **Left**: step list with status icons (○ pending, ▸ running, ✓ complete, ✗ error), per-step log counts, context values (email, memberId, UUID)
- **Right**: current step header + description, recent activity lines, collapsible log drawer
- **Bottom bar**: environment indicator, keybindings, step counter, elapsed time

### Log system

Orchestrator sends events over a Go channel:

```go
type LogEvent struct {
    Step      string
    Level     string    // "info", "error", "debug"
    Message   string
    Timestamp time.Time
}
```

The TUI model receives events in `Update()`. Type-safe, naturally concurrent, no EventEmitter pattern.

### Keybindings

| Key | During execution | After completion |
|-----|-----------------|------------------|
| `l` | Toggle log drawer | Toggle log drawer |
| `d` | Toggle detail mode | Toggle detail mode |
| `tab` / `shift+tab` | Browse logs by step | Browse logs by step |
| `a` | Show all logs | Show all logs |
| `enter` | Continue (step-through) | Confirm menu selection |
| `↑` / `↓` | — | Navigate completion menu |
| `q` | Quit | Quit |
| `esc` | Close drawer / pause | Close drawer |
| `r` | Retry (after error) | — |

### Completion screen

Step results summary, provider details, "What next?" menu: create another (same settings), new config, quit.

### Styling

Use `lipgloss` for colors, borders, and layout — Bubble Tea's companion styling library.

## Configuration

### Environment variables

Loaded from `.env` via `godotenv`:

| Variable | Required for |
|----------|-------------|
| `CZEN_API_KEY` | All API flows |
| `MYSQL_DB_PASS_DEV` | `fully-enrolled` (Sterling callback) |

Stripe uses a hardcoded test publishable key (`pk_test_...`) — no env var needed.

### Payloads

Vertical payloads (childcare, seniorcare, etc.) are Go structs compiled into the binary. No runtime file loading.

### GraphQL queries

String constants in a `graphql` package. Same queries as the TypeScript version.

## Project Layout

```
jumper-go/
├── main.go
├── cmd/
│   └── start.go
├── internal/
│   ├── api/
│   │   ├── client.go
│   │   ├── graphql.go
│   │   └── auth.go
│   ├── steps/
│   │   ├── pipeline.go
│   │   ├── account.go
│   │   ├── profile.go
│   │   ├── upgrade.go
│   │   ├── disclosure.go
│   │   └── enrollment.go
│   ├── web/
│   │   ├── flow.go
│   │   └── checkout.go
│   ├── tui/
│   │   ├── wizard.go
│   │   ├── execution.go
│   │   ├── logpanel.go
│   │   └── theme.go
│   └── payloads/
│       ├── childcare.go
│       ├── seniorcare.go
│       ├── petcare.go
│       ├── housekeeping.go
│       └── tutoring.go
├── go.mod
├── go.sum
└── README.md
```

## Distribution

Single binary via `go build`:

```bash
go build -o jumper           # current platform
GOOS=darwin GOARCH=arm64 go build -o jumper-mac
GOOS=linux GOARCH=amd64 go build -o jumper-linux
```

No Node, npm, or runtime dependencies. Mobile-only users never need Playwright/Chromium.

For web flow users: `jumper install-browser` downloads Chromium on first use, or auto-downloads on first web run.

## Out of Scope for PoC

- iOS support (same limitation as current)
- Batch mode (can be added after PoC is proven)
- CI/CD pipeline for building releases
