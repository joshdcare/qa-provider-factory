import { chromium } from 'playwright';

export async function getAccessToken(
  email: string,
  baseUrl: string
): Promise<string> {
  const maxRetries = 3;

  for (let retry = 0; retry < maxRetries; retry++) {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      let accessToken: string | undefined;

      const session = await context.newCDPSession(page);
      await session.send('Network.enable');
      session.on('Network.requestWillBeSent', (payload) => {
        const authHeader = JSON.stringify(payload.request.headers);
        if (authHeader.includes('Authorization') && authHeader.includes('Bearer')) {
          const start = authHeader.indexOf('Bearer');
          const end = authHeader.indexOf('Referer');
          if (end > start) {
            accessToken = authHeader.substring(start, end - 3);
          }
        }
      });

      await page.goto(`${baseUrl}/app/id-oidc-client/index.html`);
      await page.click('button:text("Care")');
      await page.click('button:nth-match(:text("Login"), 3)');

      const usernameBox = page.locator('#emailId');
      await usernameBox.clear();
      await usernameBox.fill(email);

      const continueButton = page.getByRole('button', {
        name: 'Continue',
        exact: true,
      });
      if (await continueButton.isVisible({ timeout: 5000 })) {
        await continueButton.click();
      }

      await page.getByLabel('Password').fill('letmein1');
      const loginSubmit = page.getByRole('button', { name: 'Log In' });
      await loginSubmit.click();
      await page.getByText('OIDC User Info').waitFor({ timeout: 15000 });

      await browser.close();

      if (accessToken) {
        return accessToken;
      }
    } catch (error) {
      console.warn(`Auth attempt ${retry + 1}/${maxRetries} failed:`, error);
      if (browser) await browser.close().catch(() => {});
    }
  }

  throw new Error('Failed to retrieve access token after all retries');
}
