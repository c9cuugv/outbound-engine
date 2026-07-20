import { test, expect } from '@playwright/test';
import { injectAuth, mockAuthAPI } from '../helpers/auth';
import { mockDataAPIs } from '../helpers/mocks';

test.describe('Quick Draft Feature', () => {
  test.beforeEach(async ({ page }) => {
    await mockDataAPIs(page);
    await mockAuthAPI(page);
    await injectAuth(page);
  });

  test('Test 1: Happy path - scrape and draft', async ({ page }) => {
    await page.route('**/api/v1/quick-draft', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subject: 'Test Subject',
          body: 'Test body text',
          scraped_signals: { '/': 'homepage content' },
          website_url: 'example.com'
        }),
      });
    });

    await page.goto('/quick-draft');
    await page.waitForLoadState('networkidle');

    await page.locator('input[placeholder="e.g. stripe.com"]').fill('example.com');
    // Using testid to scope fields
    await page.locator('[data-testid="quick-draft-form"] input').nth(1).fill('TestProduct');
    await page.locator('input[placeholder="one sentence"]').fill('We save you time');
    await page.locator('[data-testid="quick-draft-form"] input').nth(3).fill('Jane Doe');
    await page.locator('input[type="email"]').fill('jane@example.com');

    await page.locator('[data-testid="scrape-btn"]').click();

    await expect(page.locator('[data-testid="draft-section"]')).toBeVisible();

    await expect(page.locator('[data-testid="draft-section"] input')).toHaveValue('Test Subject');
    await expect(page.locator('[data-testid="draft-section"] textarea')).toHaveValue('Test body text');

    await expect(page.locator('[data-testid="scraped-signals"]')).toBeVisible();
    await expect(page.locator('[data-testid="scraped-signals"]')).toContainText('/');
  });

  test('Test 2: Invalid URL - shows error', async ({ page }) => {
    await page.route('**/api/v1/quick-draft', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Could not scrape any content from that website. Check the URL and try again.' }),
      });
    });

    await page.goto('/quick-draft');
    await page.waitForLoadState('networkidle');

    await page.locator('input[placeholder="e.g. stripe.com"]').fill('thisisnotarealurlxyz123456.com');
    await page.locator('[data-testid="quick-draft-form"] input').nth(1).fill('TestProduct');
    await page.locator('input[placeholder="one sentence"]').fill('We save you time');
    await page.locator('[data-testid="quick-draft-form"] input').nth(3).fill('Jane Doe');
    await page.locator('input[type="email"]').fill('jane@example.com');

    await page.locator('[data-testid="scrape-btn"]').click();

    await expect(page.locator('[data-testid="error-alert"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-alert"]')).toContainText('Could not scrape');
    await expect(page.locator('[data-testid="draft-section"]')).not.toBeVisible();
  });

  test('Test 3: Copy to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.route('**/api/v1/quick-draft', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subject: 'Test Subject',
          body: 'Test body text',
          scraped_signals: { '/': 'homepage' },
          website_url: 'example.com'
        }),
      });
    });

    await page.goto('/quick-draft');
    await page.waitForLoadState('networkidle');

    await page.locator('input[placeholder="e.g. stripe.com"]').fill('example.com');
    await page.locator('[data-testid="quick-draft-form"] input').nth(1).fill('TestProduct');
    await page.locator('input[placeholder="one sentence"]').fill('We save you time');
    await page.locator('[data-testid="quick-draft-form"] input').nth(3).fill('Jane Doe');
    await page.locator('input[type="email"]').fill('jane@example.com');

    await page.locator('[data-testid="scrape-btn"]').click();

    await expect(page.locator('[data-testid="draft-section"]')).toBeVisible();

    await page.locator('[data-testid="copy-btn"]').click();
    await expect(page.locator('[data-testid="copy-btn"]')).toContainText('Copied!');
  });

  test('Test 4: Nav link exists and is reachable', async ({ page }) => {
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');

    // Wait for aside/sidebar to be visible
    await expect(page.locator('aside')).toBeVisible();

    const navLink = page.locator('aside a').filter({ hasText: 'Quick Draft' });
    await expect(navLink).toBeVisible();

    await navLink.click();

    await expect(page).toHaveURL(/.*\/quick-draft/);
    await expect(page.locator('h2', { hasText: 'Quick Draft' })).toBeVisible();
  });
});