import { test, expect } from '@playwright/test';
import { mockDataAPIs } from '../helpers/mocks';

const E2E_EMAIL = 'e2e-live@example.com';
const E2E_PASSWORD = 'E2eLiveTest123!';
const BACKEND = 'http://localhost:8000';

test.describe('Live Quick Draft Feature', () => {
  // We use test.setTimeout to give the real LLM time to generate
  test.setTimeout(120000);

  test('should scrape a real website and draft an email against the live backend', async ({ page, request }) => {
    // 1. Mock non-quick-draft dashboard APIs so the UI shell loads
    await mockDataAPIs(page);

    // 2. Obtain a real JWT from the live backend
    let token: string;
    const registerRes = await request.post(`${BACKEND}/api/v1/auth/register`, {
      data: { email: E2E_EMAIL, name: 'E2E User', password: E2E_PASSWORD },
    });
    if (registerRes.ok()) {
      token = (await registerRes.json()).access_token;
    } else {
      // User already exists — log in
      const loginRes = await request.post(`${BACKEND}/api/v1/auth/login`, {
        data: { email: E2E_EMAIL, password: E2E_PASSWORD },
      });
      expect(loginRes.ok(), `Login failed: ${await loginRes.text()}`).toBeTruthy();
      token = (await loginRes.json()).access_token;
    }

    // Inject the real token before the page module initialises
    await page.addInitScript((accessToken: string) => {
      sessionStorage.setItem('access_token', accessToken);
      sessionStorage.setItem('refresh_token', '');
    }, token);

    // 3. Go to the newly added Quick Draft page in the UI
    await page.goto('/quick-draft');
    await page.waitForLoadState('networkidle');

    // 4. Fill in the form with a LIVE website
    await page.locator('input[placeholder="e.g. stripe.com"]').fill('langchain.com');
    await page.locator('[data-testid="quick-draft-form"] input').nth(1).fill('OutboundEngine');
    await page.locator('input[placeholder="one sentence"]').fill('We automate outreach and save 10 hours a week.');
    await page.locator('[data-testid="quick-draft-form"] input').nth(3).fill('Harrison');
    await page.locator('input[type="email"]').fill('harrison@langchain.com');

    // 5. Click the Scrape & Draft button (this hits the real backend since we didn't mock /quick-draft)
    await page.locator('[data-testid="scrape-btn"]').click();

    // 5.5 Quickly check if it failed with a validation or 500 error
    try {
      await expect(page.locator('[data-testid="error-alert"]')).toBeVisible({ timeout: 10000 });
      const errorText = await page.locator('[data-testid="error-alert"]').textContent();
      throw new Error("UI showed an error alert: " + errorText);
    } catch (e) {
      if (e.message.includes("UI showed an error alert")) {
        throw e;
      }
      // Otherwise, the error alert didn't appear within 10s, which is good. Proceed to wait for draft.
    }

    // 6. Wait for the draft to be returned
    await expect(page.locator('[data-testid="draft-section"]')).toBeVisible({ timeout: 90000 });

    // 7. Print the generated outputs to verify it actually worked!
    const subject = await page.locator('[data-testid="draft-section"] input').inputValue();
    const body = await page.locator('[data-testid="draft-section"] textarea').inputValue();
    const signals = await page.locator('[data-testid="scraped-signals"]').innerText();

    console.log("=========================================");
    console.log("🔥 LIVE SCRAPE & DRAFT SUCCESSFUL! 🔥");
    console.log("=========================================");
    console.log("SUBJECT:", subject);
    console.log("BODY:\\n", body);
    console.log("SIGNALS FOUND:\\n", signals.substring(0, 500) + '...');
  });
});
