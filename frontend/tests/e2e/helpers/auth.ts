import { Page } from '@playwright/test';

/**
 * Injects a fake auth token into sessionStorage so the AppLayout
 * auth-guard (`getAccessToken()`) lets us through without hitting the real API.
 *
 * Uses addInitScript to ensure the token is set BEFORE any page JS runs,
 * which is critical for Firefox compatibility.
 */
export async function injectAuth(page: Page) {
  // addInitScript runs before every page load/navigation in this context
  await page.addInitScript(() => {
    sessionStorage.setItem('access_token', 'e2e-test-token');
    sessionStorage.setItem('refresh_token', 'e2e-refresh-token');
  });

  // Navigate to the origin so sessionStorage is associated with the right domain
  await page.goto('/login');
}

/**
 * Sets up API route mocking so tests don't need a running backend.
 * Intercepts /api/v1/auth/* calls and returns appropriate mock data.
 */
export async function mockAuthAPI(page: Page) {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-test-token',
        refresh_token: 'e2e-refresh-token',
      }),
    });
  });

  await page.route('**/api/v1/auth/register', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-test-token',
        refresh_token: 'e2e-refresh-token',
      }),
    });
  });

  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-refreshed-token',
        refresh_token: 'e2e-refresh-token',
      }),
    });
  });
}
