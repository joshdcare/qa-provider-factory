#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

step=0
total_steps=5

progress() {
  step=$((step + 1))
  echo ""
  echo -e "${CYAN}[$step/$total_steps]${RESET} ${BOLD}$1${RESET}"
}

success() {
  echo -e "  ${GREEN}✓${RESET} $1"
}

warn() {
  echo -e "  ${YELLOW}⚠${RESET} $1"
}

fail() {
  echo -e "  ${RED}✗${RESET} $1"
  exit 1
}

echo ""
echo -e "${BOLD}qa-provider-factory setup${RESET}"
echo -e "${DIM}────────────────────────${RESET}"

# ── 1. Check Node.js ──────────────────────────────────────────────

progress "Checking Node.js version"

if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install Node.js 20+ and re-run this script."
fi

node_version=$(node -v | sed 's/^v//')
node_major=$(echo "$node_version" | cut -d. -f1)

if [ "$node_major" -lt 20 ]; then
  fail "Node.js $node_version found — version 20+ is required."
fi

success "Node.js $node_version"

# ── 2. Install npm dependencies ───────────────────────────────────

progress "Installing npm dependencies"

if npm install --loglevel=error; then
  success "npm packages installed"
else
  fail "npm install failed. Check the output above."
fi

# ── 3. Install Playwright Chromium ────────────────────────────────

progress "Installing Playwright Chromium browser"

if npx playwright install chromium 2>&1 | tail -1; then
  success "Playwright Chromium installed"
else
  fail "Playwright install failed. Check the output above."
fi

# ── 4. Configure .env ─────────────────────────────────────────────

progress "Configuring environment variables"

if [ -f .env ]; then
  echo -e "  ${DIM}Existing .env file found.${RESET}"
  read -rp "  Overwrite it? (y/N): " overwrite
  if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
    success "Kept existing .env"
    skip_env=true
  else
    skip_env=false
  fi
else
  skip_env=false
fi

if [ "$skip_env" = false ]; then
  echo ""
  echo -e "  ${DIM}Enter values for each variable (leave blank to skip).${RESET}"
  echo -e "  ${DIM}You can always edit .env later.${RESET}"
  echo ""

  read -rp "  CZEN_API_KEY (Care.com API key): " czen_key
  read -rp "  STRIPE_KEY (Stripe test key):    " stripe_key
  read -rp "  MYSQL_DB_PASS_DEV (MySQL password): " mysql_pass

  cat > .env <<EOF
CZEN_API_KEY=${czen_key}
STRIPE_KEY=${stripe_key}
MYSQL_DB_PASS_DEV=${mysql_pass}
EOF

  success ".env file written"

  missing=()
  [ -z "$czen_key" ]   && missing+=("CZEN_API_KEY")
  [ -z "$stripe_key" ] && missing+=("STRIPE_KEY")
  [ -z "$mysql_pass" ] && missing+=("MYSQL_DB_PASS_DEV")

  if [ ${#missing[@]} -gt 0 ]; then
    warn "Missing values: ${missing[*]} — some features will be limited until these are set."
  fi
fi

# ── 5. Build TypeScript ───────────────────────────────────────────

progress "Building TypeScript"

if npm run build --silent; then
  success "Build complete"
else
  fail "TypeScript build failed. Run 'npm run build' to see errors."
fi

# ── Done ──────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}✓ Setup complete!${RESET}"
echo ""
echo -e "  ${BOLD}Quick start:${RESET}"
echo -e "    ${DIM}# Web — stop at the location page${RESET}"
echo -e "    npm run create -- --step at-location --platform web"
echo ""
echo -e "    ${DIM}# Mobile — fully enrolled Premium user${RESET}"
echo -e "    npm run create -- --step fully-enrolled --platform mobile"
echo ""
echo -e "  ${BOLD}Reminders:${RESET}"
echo -e "    • Connect to the ${BOLD}VPN${RESET} before running — SPI endpoints and the dev DB require it."
echo -e "    • Run ${CYAN}npm test${RESET} to verify the test suite passes."
echo -e "    • See ${CYAN}README.md${RESET} for all available steps and options."
echo ""
