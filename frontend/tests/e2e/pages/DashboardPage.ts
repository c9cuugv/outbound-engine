import { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly campaignTitle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.campaignTitle = page.locator('h2:has-text("Campaigns")');
  }

  async goto() {
    await this.page.goto('/campaigns');
    await this.page.waitForLoadState('networkidle');
  }
}
