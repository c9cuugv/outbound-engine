import { Page, Locator } from '@playwright/test';

export class EmailReviewPage {
  readonly page: Page;
  readonly emailList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailList = page.locator('[data-testid="email-list"]');
  }

  async goto(campaignId: string) {
    await this.page.goto(`/campaigns/${campaignId}/review`);
    await this.page.waitForLoadState('networkidle');
  }
}
