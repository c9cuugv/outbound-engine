import { test, expect } from '@playwright/test';
import { LeadTablePage } from '../pages/LeadTablePage';
import { injectAuth } from '../helpers/auth';
import { mockDataAPIs, MOCK_LEADS } from '../helpers/mocks';

test.describe('Lead Table View', () => {
  let leadsPage: LeadTablePage;

  test.beforeEach(async ({ page }) => {
    // 1. Mock all API endpoints
    await mockDataAPIs(page);

    // 2. Inject auth token so we pass the auth guard
    await injectAuth(page);

    // 3. Navigate to leads
    leadsPage = new LeadTablePage(page);
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');
  });

  test('should display the leads heading', async ({ page }) => {
    await expect(leadsPage.heading).toBeVisible();
    await expect(leadsPage.heading).toHaveText('Leads');
  });

  test('should render the lead table with mock data', async ({ page }) => {
    // Wait for rows to appear
    await expect(leadsPage.leadRows.first()).toBeVisible({ timeout: 10000 });

    const count = await leadsPage.getLeadCount();
    expect(count).toBe(MOCK_LEADS.items.length);
  });

  test('should show the Upload CSV button', async ({ page }) => {
    await expect(leadsPage.uploadCSVButton).toBeVisible();
  });

  test('should show the Research All button', async ({ page }) => {
    await expect(leadsPage.researchAllButton).toBeVisible();
  });

  test('should have a search input', async ({ page }) => {
    await expect(leadsPage.searchInput).toBeVisible();
  });

  test('should filter leads via search', async ({ page }) => {
    // Wait for initial data
    await expect(leadsPage.leadRows.first()).toBeVisible({ timeout: 10000 });

    // Mock the search response to return empty for a nonexistent query
    await page.route('**/api/v1/leads*', async (route) => {
      const url = new URL(route.request().url());
      const search = url.searchParams.get('search');
      if (search && search.includes('NonexistentLead')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [], total_count: 0, total_pages: 1, page: 1, per_page: 25 }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LEADS),
      });
    });

    // Type a nonexistent search term
    await leadsPage.search('NonexistentLead123xyz');

    // Expect the empty state
    await expect(leadsPage.emptyState).toBeVisible({ timeout: 5000 });
  });
});
