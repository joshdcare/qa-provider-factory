import { chromium } from 'playwright';
import crypto from 'crypto';

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function getAccessToken(
  email: string,
  baseUrl: string
): Promise<string> {
  const maxRetries = 3;

  // Auth0 config from the OIDC client page
  const auth0Authority = 'https://login.dev.carezen.net';
  const clientId = 'RtFw57ig6jKyP1efQdBB7HefNgUx044L';
  const audience = `${baseUrl}/api`;
  const scope = 'openid profile email offline_access';
  const redirectUri = `${baseUrl}/app/id-oidc-client/signin-callback.html`;

  for (let retry = 0; retry < maxRetries; retry++) {
    let browser;
    try {
      const { verifier, challenge } = generatePKCE();
      const state = crypto.randomBytes(16).toString('hex');

      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      // Intercept ALL redirects to the callback to capture the auth code
      let authCode: string | undefined;
      let callbackUrl: string | undefined;

      page.on('request', (req) => {
        const url = req.url();
        if (url.includes('signin-callback') && url.includes('code=')) {
          const parsed = new URL(url);
          authCode = parsed.searchParams.get('code') ?? undefined;
          callbackUrl = url;
        }
      });

      // Navigate directly to Auth0 authorize endpoint
      const authUrl = new URL(`${auth0Authority}/authorize`);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('audience', audience);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      await page.goto(authUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Fill login form on Auth0 page
      const usernameBox = page.locator('#username, #emailId').first();
      await usernameBox.waitFor({ timeout: 15000 });
      await usernameBox.clear();
      await usernameBox.fill(email);

      const continueButton = page.getByRole('button', {
        name: 'Continue',
        exact: true,
      });
      if (await continueButton.isVisible({ timeout: 3000 })) {
        await continueButton.click();
      }

      await page.locator('#password').fill('letmein1');

      const loginSubmit = page.getByRole('button', { name: 'Continue' }).or(
        page.getByRole('button', { name: 'Log In' })
      );
      await loginSubmit.first().waitFor({ state: 'visible', timeout: 10000 });
      await loginSubmit.first().click();

      // Wait for the callback redirect
      for (let i = 0; i < 30; i++) {
        if (authCode) break;
        await page.waitForTimeout(1000);
      }

      // Debug if no code captured
      if (!authCode) {
        console.warn(`  Debug URL: ${page.url()}`);
        await page.screenshot({ path: `/tmp/auth0-debug-${retry}.png` });
      }

      await browser.close();

      if (!authCode) {
        console.warn(`Auth attempt ${retry + 1}/${maxRetries}: no auth code captured`);
        continue;
      }

      // Exchange the auth code for tokens at Auth0 token endpoint
      const tokenResponse = await fetch(`${auth0Authority}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          code: authCode,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.access_token) {
        return `Bearer ${tokenData.access_token}`;
      }

      console.warn(`Auth attempt ${retry + 1}/${maxRetries}: token exchange failed:`, tokenData);
    } catch (error) {
      console.warn(`Auth attempt ${retry + 1}/${maxRetries} failed:`, (error as Error).message);
      if (browser) await browser.close().catch(() => {});
    }
  }

  throw new Error('Failed to retrieve access token after all retries');
}
