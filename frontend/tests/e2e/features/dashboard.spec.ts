import { test, expect } from '@playwright/test';
import { injectAuth } from '../helpers/auth';
import { mockDataAPIs } from '../helpers/mocks';

test.describe('Campaign Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockDataAPIs(page);
    await injectAuth(page);
  });

  test('should display the campaigns list with mock data', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');

    // Should show the heading
    await expect(page.locator('h2:has-text("Campaigns")')).toBeVisible();

    // Should show the campaign rows
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 });

    // Should show campaign name
    await expect(page.locator('text=Q1 Enterprise Outreach')).toBeVisible();
  });

  test('should show the Create Campaign button', async ({ page }) => {
    await page.goto('/campaigns');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('button:has-text("Create Campaign")')).toBeVisible();
  });
});
