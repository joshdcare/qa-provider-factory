import { chromium, type Page, type Browser } from 'playwright';
import { nanoid } from 'nanoid';
import type { EnvConfig, Tier } from '../types.js';
import type { VerticalConfig } from '../verticals.js';
import type { RunEmitter } from '../tui/emitter.js';
import { STEP_DESCRIPTIONS } from '../tui/step-descriptions.js';
import type { RunRecorder } from '../recorder/run-recorder.js';
import { truncate } from '../recorder/truncate.js';

export interface WebFlowResult {
  email: string;
  password: string;
  accountCreated: boolean;
  memberId?: string;
  uuid?: string;
  vertical?: string;
}

/**
 * Drives a visible Chromium browser through the web provider enrollment flow,
 * stopping at the target page and leaving the browser open for manual testing.
 */
export async function runWebEnrollmentFlow(
  targetStep: string,
  tier: Tier,
  envConfig: EnvConfig,
  verticalConfig: VerticalConfig,
  serviceType: string,
  autoClose = false,
  emitter?: RunEmitter,
  onStepComplete?: () => Promise<void>,
  recorder?: RunRecorder,
): Promise<WebFlowResult> {
  const email = `prov-${nanoid(6).toLowerCase()}@care.com`;
  const password = 'letmein1';
  let accountCreated = false;
  let memberId: string | undefined;
  let uuid: string | undefined;
  const vertical = serviceType;

  const browser = await chromium.launch({
    headless: false,
    args: ['--incognito'],
  });
  const contextOptions = recorder?.playwrightContextOptions() ?? {};
  const context = await browser.newContext(contextOptions);
  if (recorder) {
    await recorder.startTrace(context, browser);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);

  if (emitter) {
    const STATIC_EXTS = /\.(js|css|png|jpg|jpeg|svg|gif|woff2?|ico|map)(\?|$)/;
    const requestTimes = new Map<string, number>();

    page.on('request', (req) => {
      const url = req.url();
      if (STATIC_EXTS.test(url)) return;
      requestTimes.set(url, Date.now());
      const shortUrl = url.replace(envConfig.baseUrl, '');
      emitter.networkRequest(req.method(), shortUrl, truncate(req.postData() ?? ''));
    });

    page.on('response', async (res) => {
      const url = res.url();
      if (STATIC_EXTS.test(url)) return;
      const start = requestTimes.get(url);
      const duration = start ? Date.now() - start : 0;
      requestTimes.delete(url);
      const shortUrl = url.replace(envConfig.baseUrl, '');
      const body = await res.text().catch(() => '');
      emitter.networkResponse(res.status(), shortUrl, duration, truncate(body));
    });

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        emitter.navigation(frame.url().replace(envConfig.baseUrl, ''));
      }
    });
  }

  async function stop(stepName: string): Promise<WebFlowResult> {
    console.log(`\n✓ Browser stopped at: ${stepName}`);
    console.log(`  URL: ${page.url()}`);
    if (accountCreated) {
      if (!memberId) {
        const extracted = await extractAccountInfo(page);
        memberId = extracted.memberId;
        uuid = extracted.uuid;
      }
      console.log('');
      console.log(`  Email:      ${email}`);
      console.log(`  Password:   ${password}`);
      console.log(`  MemberId:   ${memberId ?? '(not found)'}`);
      console.log(`  UUID:       ${uuid ?? '(not found)'}`);
      console.log(`  Vertical:   ${vertical}`);
    } else {
      console.log(`\n  Suggested credentials (for the account creation step):`);
      console.log(`    Email:      ${email}`);
      console.log(`    Password:   ${password}`);
    }
    if (autoClose) {
      if (!recorder) {
        console.log('\n  Auto-closing browser.\n');
        await browser.close();
      }
    } else {
      console.log('\n  Close the browser when you\'re done.\n');
      await new Promise<void>(resolve => {
        browser.once('disconnected', () => resolve());
      });
    }
    return { email, password, accountCreated, memberId, uuid, vertical };
  }

  let stepIndex = 0;

  try {
    await page.goto(envConfig.baseUrl);
    console.log('  ⏳ Starting web enrollment flow...\n');

    /* ── Homepage → at-get-started ─────────────────────────── */
    emitter?.stepStart('at-get-started', STEP_DESCRIPTIONS['at-get-started']);
    await waitForPageReady(page);
    await page.getByRole('link', { name: /join now/i }).first().click();
    await page.waitForURL('**/app/vhp/get-started**');
    await waitForPageReady(page);
    console.log('  ✓ at-get-started');
    emitter?.stepComplete('at-get-started');
    stepIndex++;
    await recorder?.screenshot(page, 'at-get-started', stepIndex);
    if (onStepComplete) await onStepComplete();
    if (targetStep === 'at-get-started') return await stop('at-get-started');

    /* ── at-get-started → at-soft-intro-combined ───────────── */
    emitter?.stepStart('at-soft-intro-combined', STEP_DESCRIPTIONS['at-soft-intro-combined']);
    await page.getByText(/find jobs/i).first().click();
    await page.waitForURL('**/provider/soft-intro-combined**');
    await waitForPageReady(page);
    console.log('  ✓ at-soft-intro-combined');
    emitter?.stepComplete('at-soft-intro-combined');
    stepIndex++;
    await recorder?.screenshot(page, 'at-soft-intro-combined', stepIndex);
    if (onStepComplete) await onStepComplete();
    if (targetStep === 'at-soft-intro-combined') return await stop('at-soft-intro-combined');

    /* ── at-soft-intro-combined → at-vertical-selection ────── */
    emitter?.stepStart('at-vertical-selection', STEP_DESCRIPTIONS['at-vertical-selection']);
    await clickEnabledButton(page, /next/i);
    await page.waitForURL('**/vertical-triage**');
    await waitForPageReady(page);
    console.log('  ✓ at-vertical-selection');
    emitter?.stepComplete('at-vertical-selection');
    stepIndex++;
    await recorder?.screenshot(page, 'at-vertical-selection', stepIndex);
    if (onStepComplete) await onStepComplete();
    if (targetStep === 'at-vertical-selection') return await stop('at-vertical-selection');

    /* ── at-vertical-selection → at-location ───────────────── */
    emitter?.stepStart('at-location', STEP_DESCRIPTIONS['at-location']);
    await selectVertical(page, verticalConfig);
    const alreadyNavigated = page.url().includes('/enrollment/provider/mv/location');
    if (!alreadyNavigated) {
      const verticalNext = page.getByRole('button', { name: /continue|next/i }).first();
      if (await verticalNext.isVisible({ timeout: 3000 }).catch(() => false)) {
        await clickEnabledButton(page, /continue|next/i);
      }
    }
    await page.waitForURL('**/enrollment/provider/mv/location**', { timeout: 15_000 });
    await waitForPageReady(page);
    console.log('  ✓ at-location');
    emitter?.stepComplete('at-location');
    stepIndex++;
    await recorder?.screenshot(page, 'at-location', stepIndex);
    if (onStepComplete) await onStepComplete();
    if (targetStep === 'at-location') return await stop('at-location');

    /* ── at-location → at-preferences ──────────────────────── */
    emitter?.stepStart('at-preferences', STEP_DESCRIPTIONS['at-preferences']);
    await page.getByLabel(/zip/i).first().fill('72204');
    await clickEnabledButton(page, /next/i);
    await page.waitForURL(
      url => url.pathname.includes('/enrollment/provider/mv/') && !url.pathname.includes('/location'),
      { timeout: 15_000 },
    );
    await waitForPageReady(page);
    console.log('  ✓ at-preferences');
    emitter?.stepComplete('at-preferences');
    stepIndex++;
    await recorder?.screenshot(page, 'at-preferences', stepIndex);
    if (onStepComplete) await onStepComplete();
    if (targetStep === 'at-preferences') return await stop('at-preferences');

    /* ── at-preferences → at-family-count (or skip to account) */
    await fillPreferences(page);
    await clickEnabledButton(page, /next/i);
    await page.waitForURL(
      url => /\/(family-count|account)/.test(url.pathname),
      { timeout: 15_000 },
    );
    await waitForPageReady(page);

    if (page.url().includes('/family-count')) {
      emitter?.stepStart('at-family-count', STEP_DESCRIPTIONS['at-family-count']);
      console.log('  ✓ at-family-count');
      emitter?.stepComplete('at-family-count');
      stepIndex++;
      await recorder?.screenshot(page, 'at-family-count', stepIndex);
      if (onStepComplete) await onStepComplete();
      if (targetStep === 'at-family-count') return await stop('at-family-count');

      await clickEnabledButton(page, /next/i);
      await page.waitForURL('**/enrollment/provider/mv/account/combined**');
      await waitForPageReady(page);
    } else {
      console.log('  ✓ at-family-count (skipped — not applicable for this vertical)');
    }

    emitter?.stepStart('at-account-creation', STEP_DESCRIPTIONS['at-account-creation']);
    console.log('  ✓ at-account-creation');
    emitter?.stepComplete('at-account-creation');
    stepIndex++;
    await recorder?.screenshot(page, 'at-account-creation', stepIndex);
    if (onStepComplete) await onStepComplete();
    if (targetStep === 'at-account-creation') return await stop('at-account-creation');

    /* ── at-account-creation → at-family-connection ────────── */
    emitter?.stepStart('at-family-connection', STEP_DESCRIPTIONS['at-family-connection']);
    await fillAccountForm(page, email, password);
    await clickEnabledButton(page, /join now|create|submit|next/i, 30_000);
    accountCreated = true;
    await page.waitForURL('**/enrollment/provider/mv/family-connection**', { timeout: 30_000 });
    await waitForPageReady(page);
    console.log('  ✓ at-family-connection (account created)');
    emitter?.stepComplete('at-family-connection');
    stepIndex++;
    await recorder?.screenshot(page, 'at-family-connection', stepIndex);
    if (onStepComplete) await onStepComplete();
    if (targetStep === 'at-family-connection') return await stop('at-family-connection');

    /* ── at-family-connection → at-safety-screening ────────── */
    emitter?.stepStart('at-safety-screening', STEP_DESCRIPTIONS['at-safety-screening']);
    await clickEnabledButton(page, /next|continue/i);
    await page.waitForURL('**/enrollment/provider/mv/safety-screening**');
    await waitForPageReady(page);
    console.log('  ✓ at-safety-screening');
    emitter?.stepComplete('at-safety-screening');
    stepIndex++;
    await recorder?.screenshot(page, 'at-safety-screening', stepIndex);
    if (onStepComplete) await onStepComplete();
    if (targetStep === 'at-safety-screening') return await stop('at-safety-screening');

    /* ── at-safety-screening → at-subscriptions ────────────── */
    emitter?.stepStart('at-subscriptions', STEP_DESCRIPTIONS['at-subscriptions']);
    await clickEnabledButton(page, /got it|next|continue/i);
    await page.waitForURL('**/ratecard/provider/rate-card**');
    await waitForPageReady(page);
    console.log('  ✓ at-subscriptions');
    emitter?.stepComplete('at-subscriptions');
    stepIndex++;
    await recorder?.screenshot(page, 'at-subscriptions', stepIndex);
    if (onStepComplete) await onStepComplete();
    if (targetStep === 'at-subscriptions') return await stop('at-subscriptions');

    /* ── at-subscriptions → payment page (branches) ────────── */
    const goPremium =
      targetStep === 'at-premium-payment' ||
      (targetStep === 'at-app-download' && tier === 'premium');

    if (goPremium) {
      await clickEnabledButton(page, /premium/i);
    } else {
      await clickEnabledButton(page, /continue|basic/i);
    }
    await page.waitForURL('**/app/checkout**');
    await waitForPageReady(page);

    if (goPremium) {
      emitter?.stepStart('at-premium-payment', STEP_DESCRIPTIONS['at-premium-payment']);
      console.log('  ✓ at-premium-payment');
      emitter?.stepComplete('at-premium-payment');
      stepIndex++;
      await recorder?.screenshot(page, 'at-premium-payment', stepIndex);
      if (onStepComplete) await onStepComplete();
      if (targetStep === 'at-premium-payment') return await stop('at-premium-payment');
    } else {
      emitter?.stepStart('at-basic-payment', STEP_DESCRIPTIONS['at-basic-payment']);
      console.log('  ✓ at-basic-payment');
      emitter?.stepComplete('at-basic-payment');
      stepIndex++;
      await recorder?.screenshot(page, 'at-basic-payment', stepIndex);
      if (onStepComplete) await onStepComplete();
      if (targetStep === 'at-basic-payment') return await stop('at-basic-payment');
    }

    /* ── payment → at-app-download ─────────────────────────── */
    emitter?.stepStart('at-app-download', STEP_DESCRIPTIONS['at-app-download']);
    await fillCheckoutForm(page);
    // Give Stripe a moment to validate all fields before we try the button.
    await page.waitForTimeout(2000);
    const purchaseBtn = page.getByRole('button', { name: /purchase|pay|submit|complete/i }).first();
    const isEnabled = await purchaseBtn.isEnabled().catch(() => false);
    console.log(`    [checkout] Purchase button enabled: ${isEnabled}`);
    if (!isEnabled) {
      // Tab out of the last Stripe field to trigger validation, then wait.
      await page.keyboard.press('Tab');
      await page.waitForTimeout(2000);
      const retryEnabled = await purchaseBtn.isEnabled().catch(() => false);
      console.log(`    [checkout] Purchase button enabled after Tab: ${retryEnabled}`);
    }
    await clickEnabledButton(page, /purchase|pay|submit|complete/i, 30_000);
    console.log('    [checkout] Purchase button clicked, waiting for navigation...');
    await page.waitForURL('**/enrollment/provider/mv/app-download**', { timeout: 60_000 });
    await waitForPageReady(page);
    console.log('  ✓ at-app-download');
    emitter?.stepComplete('at-app-download');
    stepIndex++;
    await recorder?.screenshot(page, 'at-app-download', stepIndex);
    if (onStepComplete) await onStepComplete();
    if (targetStep === 'at-app-download') return await stop('at-app-download');

  } catch (error) {
    console.error(`\n✗ Error during web enrollment: ${(error as Error).message}`);
    console.log(`  URL: ${page.url()}`);
    if (accountCreated) {
      if (!memberId) {
        const extracted = await extractAccountInfo(page);
        memberId = extracted.memberId;
        uuid = extracted.uuid;
      }
      console.log('');
      console.log(`  Email:      ${email}`);
      console.log(`  Password:   ${password}`);
      console.log(`  MemberId:   ${memberId ?? '(not found)'}`);
      console.log(`  UUID:       ${uuid ?? '(not found)'}`);
      console.log(`  Vertical:   ${vertical}`);
    }
    if (autoClose) {
      console.log('\n  Auto-closing browser.\n');
      await browser.close();
    } else {
      console.log('\n  Browser left open for debugging. Close it when done.\n');
      await new Promise<void>(resolve => {
        browser.once('disconnected', () => resolve());
      });
    }
  }

  return { email, password, accountCreated, memberId, uuid, vertical };
}

/* ── Account info extraction ──────────────────────────────── */

/**
 * After account creation, extract memberId and UUID from the browser session.
 * Checks cookies, localStorage, and the page's JS context.
 */
async function extractAccountInfo(page: Page): Promise<{ memberId?: string; uuid?: string }> {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const numericRe = /^\d+$/;
  const candidates: string[] = [];

  try {
    const vals = await page.evaluate(() => {
      const out: string[] = [];

      // Collect all localStorage values
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) ?? '';
        const val = localStorage.getItem(key) ?? '';
        out.push(val);
        try {
          const parsed = JSON.parse(val);
          if (typeof parsed === 'object' && parsed !== null) {
            for (const v of Object.values(parsed)) {
              if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
            }
          }
        } catch { /* not JSON */ }
      }

      // Check window-level globals
      const w = window as any;
      if (w.__MEMBER_ID__) out.push(String(w.__MEMBER_ID__));
      if (w.__MEMBER_UUID__) out.push(String(w.__MEMBER_UUID__));
      if (w.czen?.member?.id) out.push(String(w.czen.member.id));
      if (w.czen?.member?.uuid) out.push(String(w.czen.member.uuid));

      return out;
    });
    candidates.push(...vals);
  } catch { /* page context may not be available */ }

  // Collect cookie values
  try {
    const cookies = await page.context().cookies();
    for (const c of cookies) candidates.push(c.value);
  } catch { /* cookie access may fail */ }

  // Classify: UUID-formatted strings vs numeric IDs
  let memberId: string | undefined;
  let uuid: string | undefined;
  for (const val of candidates) {
    if (!uuid && uuidRe.test(val)) uuid = val;
    if (!memberId && numericRe.test(val) && val.length >= 4) memberId = val;
  }

  return { memberId, uuid };
}

/* ── Navigation & click helpers ────────────────────────────── */

/** Wait for the page to settle after a navigation or heavy render. */
async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
}

/**
 * Wait for a button matching the locator to be visible AND enabled, then click.
 * MUI disables buttons while forms validate — this avoids clicking too early.
 */
async function clickEnabledButton(
  page: Page,
  namePattern: RegExp,
  timeout = 15_000,
): Promise<void> {
  const btn = page.getByRole('button', { name: namePattern }).first();
  await btn.waitFor({ state: 'visible', timeout });
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await btn.isEnabled().catch(() => false)) {
      await btn.click();
      return;
    }
    await page.waitForTimeout(250);
  }
  // Last resort: click anyway (force past disabled state) so the error is
  // visible in the browser rather than a silent timeout.
  await btn.click({ force: true });
}

/* ── Page interaction helpers ──────────────────────────────── */

async function selectVertical(page: Page, verticalConfig: VerticalConfig): Promise<void> {
  // Wait for the page to settle — vertical triage tiles may lazy-load.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);

  // Strategy 1: Standard form controls
  const formStrategies = [
    () => page.getByRole('checkbox', { name: verticalConfig.webTilePattern }).first(),
    () => page.getByRole('radio', { name: verticalConfig.webTilePattern }).first(),
    () => page.getByLabel(verticalConfig.webTilePattern).first(),
  ];

  for (const getLocator of formStrategies) {
    const el = getLocator();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(500);
      return;
    }
  }

  // Strategy 2: Clickable tile/card — look for a container whose text includes
  // "child care" that is an interactive element (link, button, role="option", etc.)
  const tileSelectors = [
    'a',
    'button',
    '[role="option"]',
    '[role="listbox"] > *',
    '[role="radiogroup"] > *',
    `[data-testid*="${verticalConfig.webTestIdToken}" i]`,
    `[data-testid*="${verticalConfig.webTestIdToken.replace(/care$/i, '-care')}" i]`,
    `[data-testid*="${verticalConfig.webTestIdToken.replace(/care$/i, '_care')}" i]`,
    '[data-testid*="vertical" i]',
    '[class*="card" i]',
    '[class*="tile" i]',
    '[class*="option" i]',
    '[class*="selection" i]',
    'label',
    'li',
  ];

  for (const selector of tileSelectors) {
    const el = page.locator(selector).filter({ hasText: verticalConfig.webTilePattern }).first();
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(500);
      return;
    }
  }

  // Strategy 3: Broad text match — click the element directly, then also try
  // clicking its parent (in case the text node isn't the interactive target).
  const textEl = page.getByText(verticalConfig.webTilePattern).first();
  if (await textEl.isVisible({ timeout: 1500 }).catch(() => false)) {
    // Click the parent element in case the text itself isn't the clickable target
    const patternSource = verticalConfig.webTilePattern.source;
    const parentCard = page.locator(`:has(> :text-matches("${patternSource}", "i"))`).first();
    if (await parentCard.isVisible({ timeout: 1000 }).catch(() => false)) {
      await parentCard.click();
    } else {
      await textEl.click();
    }
    await page.waitForTimeout(500);
    return;
  }

  throw new Error(
    `Could not find the ${verticalConfig.webTestIdToken} vertical on the vertical-triage page. ` +
    'The UI may have changed — update selectVertical() in web-flow.ts.',
  );
}

async function fillPreferences(page: Page): Promise<void> {
  // Preference pages vary by vertical — some require checkbox/radio selections
  // before "Next" is enabled. Select any visible unchecked checkboxes and the
  // first radio option in each group to satisfy required fields generically.
  await waitForPageReady(page);

  const checkboxes = page.getByRole('checkbox');
  const count = await checkboxes.count().catch(() => 0);
  for (let i = 0; i < Math.min(count, 5); i++) {
    const cb = checkboxes.nth(i);
    if (await cb.isVisible().catch(() => false) && !(await cb.isChecked().catch(() => true))) {
      await cb.click();
      await page.waitForTimeout(200);
    }
  }

  const radioGroups = page.getByRole('radiogroup');
  const groupCount = await radioGroups.count().catch(() => 0);
  for (let i = 0; i < groupCount; i++) {
    const firstRadio = radioGroups.nth(i).getByRole('radio').first();
    if (await firstRadio.isVisible().catch(() => false) && !(await firstRadio.isChecked().catch(() => true))) {
      await firstRadio.click();
      await page.waitForTimeout(200);
    }
  }
}

async function fillAccountForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await waitForPageReady(page);
  await page.getByLabel(/first name/i).first().fill('Martina');
  await page.getByLabel(/last name/i).first().fill('Goodram');
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);

  // Gender — may be a radio button, dropdown, or selectable card
  const femaleOption = page.getByLabel(/female/i).first();
  if (await femaleOption.isVisible({ timeout: 2000 }).catch(() => false)) {
    await femaleOption.click();
  }

  // Age verification checkbox — MUI hides the native input, so role-based
  // selectors are the most reliable. Fall back to clicking the label or
  // any unchecked checkbox on the page.
  const ageStrategies = [
    () => page.getByRole('checkbox', { name: /18/i }).first(),
    () => page.getByRole('checkbox', { name: /age/i }).first(),
    () => page.getByRole('checkbox', { name: /confirm/i }).first(),
    () => page.locator('label').filter({ hasText: /18/ }).first(),
    () => page.locator('span[class*="Checkbox"], span[class*="checkbox"]').filter({ hasText: /18/ }).first(),
    () => page.locator('.MuiFormControlLabel-root').filter({ hasText: /18/ }).first(),
    () => page.locator('.MuiFormControlLabel-root').filter({ hasText: /age/i }).first(),
  ];

  for (const getLocator of ageStrategies) {
    const el = getLocator();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(300);
      break;
    }
  }

  // Last resort: if there's exactly one unchecked checkbox left, check it.
  const unchecked = page.getByRole('checkbox').and(page.locator(':not(:checked)'));
  const count = await unchecked.count().catch(() => 0);
  if (count === 1) {
    await unchecked.first().click();
    await page.waitForTimeout(300);
  }
}

async function fillCheckoutForm(page: Page): Promise<void> {
  await waitForPageReady(page);
  // Extra wait — payment iframes and scripts often load after the main page.
  await page.waitForTimeout(2000);

  // Discover all iframes on the page so we can log what we're working with.
  const iframes = page.locator('iframe');
  const iframeCount = await iframes.count();
  console.log(`    [checkout] Found ${iframeCount} iframe(s) on page`);
  for (let i = 0; i < iframeCount; i++) {
    const attrs = await iframes.nth(i).evaluate(el => ({
      name: el.getAttribute('name') ?? '',
      id: el.id,
      title: el.getAttribute('title') ?? '',
      src: (el.getAttribute('src') ?? '').slice(0, 80),
    }));
    console.log(`    [checkout]   iframe[${i}]: name="${attrs.name}" id="${attrs.id}" title="${attrs.title}" src="${attrs.src}"`);
  }

  // ── Name on card ────────────────────────────────────────
  const nameFilled = await fillField(page, 'Name on card', [
    () => page.getByLabel(/name on card/i).first(),
    () => page.getByPlaceholder(/name on card/i).first(),
    () => page.locator('input[name*="cardName" i], input[name*="nameOnCard" i], input[name*="card_name" i], input[name*="holderName" i]').first(),
    () => page.locator('input[autocomplete="cc-name"]').first(),
  ], 'Martina Goodram');

  // ── Stripe Elements: card / exp / cvv ────────────────────
  // Stripe auto-advances focus between fields, so we click the card number
  // iframe once, type the card, then Tab through expiration and CVC.
  let stripeFilled = false;
  const cardIframe = page.locator('iframe[title*="Secure card number"]').first();
  if (await cardIframe.isVisible({ timeout: 3000 }).catch(() => false)) {
    try {
      await cardIframe.scrollIntoViewIfNeeded();
      await cardIframe.click();
      await page.waitForTimeout(300);
      await page.keyboard.type('4111111111111111', { delay: 50 });
      console.log('    [checkout] ✓ Stripe: card number');

      // Stripe auto-advances after valid card, but Tab is more reliable.
      await page.waitForTimeout(500);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      await page.keyboard.type('0932', { delay: 50 });
      console.log('    [checkout] ✓ Stripe: expiration');

      await page.waitForTimeout(500);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);

      await page.keyboard.type('123', { delay: 50 });
      console.log('    [checkout] ✓ Stripe: CVC');
      await page.waitForTimeout(500);
      stripeFilled = true;
    } catch (err) {
      console.log(`    [checkout] ✗ Stripe sequential fill failed: ${(err as Error).message.slice(0, 100)}`);
    }
  }

  // ── Fallback: eProtect or page-level fields ─────────────
  if (!stripeFilled) {
    const cardFilled =
      await fillEprotectField(page, ['#accountNumber', 'input[name="accountNumber"]', 'input[type="tel"]'], '4111111111111111') ||
      await fillField(page, 'Card number', [
        () => page.getByLabel(/card number|credit card/i).first(),
        () => page.getByPlaceholder(/card number/i).first(),
        () => page.locator('input[name*="cardNumber" i], input[autocomplete="cc-number"]').first(),
      ], '4111111111111111');

    const expFilled = await fillField(page, 'Exp date', [
      () => page.getByLabel(/exp.*date|mm\s*\/\s*yy|expir/i).first(),
      () => page.getByPlaceholder(/mm\s*\/\s*yy/i).first(),
      () => page.locator('input[name*="expDate" i], input[name*="expiration" i], input[autocomplete="cc-exp"]').first(),
    ], '09/32');

    if (!expFilled) {
      await fillField(page, 'Exp month', [
        () => page.getByLabel(/month/i).first(),
        () => page.locator('input[name*="expMonth" i], input[autocomplete="cc-exp-month"]').first(),
      ], '09');
      await fillField(page, 'Exp year', [
        () => page.getByLabel(/year/i).first(),
        () => page.locator('input[name*="expYear" i], input[autocomplete="cc-exp-year"]').first(),
      ], '32');
    }

    const cvvFilled =
      await fillEprotectField(page, ['#cvv', 'input[name="cvv"]'], '123') ||
      await fillField(page, 'CVV', [
        () => page.getByLabel(/cvv|cvc|security code/i).first(),
        () => page.getByPlaceholder(/cvv|cvc/i).first(),
        () => page.locator('input[name*="cvv" i], input[name*="cvc" i], input[autocomplete="cc-csc"]').first(),
      ], '123');
  }

  // ── Billing ZIP code ────────────────────────────────────
  const zipFilled = await fillField(page, 'Billing ZIP', [
    () => page.getByLabel(/billing.*zip|zip.*code|postal/i).first(),
    () => page.getByPlaceholder(/zip|postal/i).first(),
    () => page.locator('input[name*="zip" i], input[name*="postal" i], input[autocomplete="postal-code"]').first(),
  ], '72204');

  console.log(`    [checkout] Fields filled — name:${nameFilled} stripe:${stripeFilled} zip:${zipFilled}`);
}

/**
 * Try locator strategies to fill a field on the main page. Logs success/failure.
 */
async function fillField(
  page: Page,
  label: string,
  strategies: Array<() => ReturnType<Page['locator']>>,
  value: string,
): Promise<boolean> {
  for (const getLocator of strategies) {
    const el = getLocator();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.click();
      await el.fill(value);
      await page.waitForTimeout(300);
      console.log(`    [checkout] ✓ ${label}`);
      return true;
    }
  }
  console.log(`    [checkout] ✗ ${label} — no matching field found on page`);
  return false;
}


/**
 * Vantiv eProtect: card number and CVV share a single iframe.
 */
async function fillEprotectField(
  page: Page,
  selectors: string[],
  value: string,
): Promise<boolean> {
  const iframePatterns = [
    'iframe[name*="eProtect"]',
    'iframe[id*="eProtect"]',
    'iframe[src*="eProtect"]',
    'iframe[name*="vantiv"]',
    'iframe[id*="vantiv"]',
  ];

  for (const iframeSel of iframePatterns) {
    const iframeEl = page.locator(iframeSel).first();
    if (await iframeEl.isVisible({ timeout: 1500 }).catch(() => false)) {
      const frame = page.frameLocator(iframeSel).first();
      for (const sel of selectors) {
        try {
          const field = frame.locator(sel).first();
          await field.waitFor({ state: 'visible', timeout: 2000 });
          await field.fill(value);
          await page.waitForTimeout(200);
          return true;
        } catch {
          continue;
        }
      }
    }
  }
  return false;
}
