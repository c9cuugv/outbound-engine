import { Page, Locator } from '@playwright/test';

export class LeadTablePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly researchFilter: Locator;
  readonly uploadCSVButton: Locator;
  readonly researchAllButton: Locator;
  readonly leadRows: Locator;
  readonly emptyState: Locator;
  readonly totalLeadsCount: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h2:has-text("Leads")');
    // Match the actual placeholder from LeadTable.tsx
    this.searchInput = page.getByPlaceholder('Search by name, email, or company...');
    this.statusFilter = page.locator('select').first();
    this.researchFilter = page.locator('select').nth(1);
    // The primary action button says "Upload CSV" (not "Add Lead")
    this.uploadCSVButton = page.locator('button:has-text("Upload CSV")');
    this.researchAllButton = page.locator('button:has-text("Research All")');
    this.leadRows = page.locator('table tbody tr');
    this.emptyState = page.locator('text=No leads yet');
    this.totalLeadsCount = page.locator('text=/\\d+ total leads/');
  }

  async goto() {
    await this.page.goto('/leads');
    await this.page.waitForLoadState('networkidle');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    // Wait for debounce (300ms in the component)
    await this.page.waitForTimeout(500);
  }

  async getLeadCount() {
    return await this.leadRows.count();
  }
}
