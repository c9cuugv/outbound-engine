import { test, expect } from '@playwright/test';
import { injectAuth } from '../helpers/auth';
import { mockDataAPIs } from '../helpers/mocks';

test.describe('Email Review Queue', () => {
  test.beforeEach(async ({ page }) => {
    await mockDataAPIs(page);
    await injectAuth(page);
  });

  test('should navigate to the email review page for a campaign', async ({ page }) => {
    await page.goto('/campaigns/campaign-1/review');
    await page.waitForLoadState('networkidle');

    // The page should render without crashing — check that the page is not on /login
    await expect(page).not.toHaveURL(/.*\/login/);
  });
});
