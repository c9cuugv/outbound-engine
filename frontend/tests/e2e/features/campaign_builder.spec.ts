import { test, expect } from '@playwright/test';
import { CampaignBuilderPage } from '../pages/CampaignBuilderPage';
import { injectAuth } from '../helpers/auth';
import { mockDataAPIs } from '../helpers/mocks';

test.describe('Campaign Builder Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockDataAPIs(page);
    await injectAuth(page);
  });

  test('should show Create Campaign button on the campaign list page', async ({ page }) => {
    const builder = new CampaignBuilderPage(page);
    await builder.gotoList();

    await expect(builder.createCampaignButton).toBeVisible();
  });

  test('should navigate from campaign list to the builder wizard', async ({ page }) => {
    const builder = new CampaignBuilderPage(page);
    await builder.gotoList();

    await builder.startNewCampaign();

    // Should now be on /campaigns/new
    await expect(page).toHaveURL(/\/campaigns\/new/);
    await expect(builder.heading).toBeVisible();
  });

  test('should display step 1 (Product Strategy) in the builder', async ({ page }) => {
    const builder = new CampaignBuilderPage(page);
    await builder.gotoBuilder();

    // Should show "Create Campaign" heading
    await expect(builder.heading).toBeVisible();

    // Should show the campaign name input
    await expect(builder.campaignNameInput).toBeVisible();

    // Should show the product name input
    await expect(builder.productNameInput).toBeVisible();

    // Should show "Next Step" button
    await expect(builder.nextStepButton).toBeVisible();
  });

  test('should successfully complete the 4-step wizard and launch campaign', async ({ page }) => {
    const builder = new CampaignBuilderPage(page);
    await builder.gotoBuilder();

    // ── Step 1: Product Strategy Context ──
    await builder.fillStep1(
      'Enterprise Q3 SaaS Outreach',
      'Acme Cloud Automator',
      'An automated cloud provisioning agent.',
      'Saves 15 hours/week per engineer.',
      'High-growth tech startups in US.'
    );
    await builder.goToNextStep();

    // ── Step 2: Sender & Schedule Configurations ──
    await expect(builder.senderNameInput).toBeVisible();
    await builder.fillStep2('Jane Cooper', 'jane@mycompany.com');
    await builder.goToNextStep();

    // ── Step 3: Sequence Timeline Steps ──
    await expect(page.locator('text=Active Email Sequence Timeline')).toBeVisible();
    await builder.goToNextStep();

    // ── Step 4: Summary Review & Launch ──
    await expect(page.locator('text=Review Campaign Configuration')).toBeVisible();

    // Click Launch Campaign
    await builder.clickLaunch();

    // Should eventually auto-redirect to campaign review queue page
    await expect(page).toHaveURL(/.*\/campaigns\/[^/]+\/review/, { timeout: 15000 });
  });
});
