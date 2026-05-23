import { Page, Locator } from '@playwright/test';

export class CampaignBuilderPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createCampaignButton: Locator;
  
  // Step 1: Product Strategy Context
  readonly campaignNameInput: Locator;
  readonly productNameInput: Locator;
  readonly productDescInput: Locator;
  readonly valuePropInput: Locator;
  readonly icpDescInput: Locator;
  
  // Step 2: Sender & Schedule Configurations
  readonly senderNameInput: Locator;
  readonly senderEmailInput: Locator;
  
  // Wizards Buttons
  readonly nextStepButton: Locator;
  readonly backButton: Locator;
  readonly launchCampaignButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h2:has-text("Create Campaign")');
    this.createCampaignButton = page.locator('button:has-text("Create Campaign")');
    
    // Step 1 Locators
    this.campaignNameInput = page.getByPlaceholder('e.g., Enterprise Q3 SaaS Outreach');
    this.productNameInput = page.getByPlaceholder('e.g., Acme Cloud Automator');
    this.productDescInput = page.getByPlaceholder('Describe what your product does');
    this.valuePropInput = page.getByPlaceholder('What are the quantifiable business outcomes');
    this.icpDescInput = page.getByPlaceholder('Specify target industries, company sizes');
    
    // Step 2 Locators
    this.senderNameInput = page.getByPlaceholder('e.g., Jane Cooper');
    this.senderEmailInput = page.getByPlaceholder('e.g., jane@mycompany.com');
    
    // Step Navigation
    this.nextStepButton = page.locator('button:has-text("Next Step")');
    this.backButton = page.locator('button:has-text("Back")');
    this.launchCampaignButton = page.locator('button:has-text("Launch Campaign")');
  }

  async gotoList() {
    await this.page.goto('/campaigns');
    await this.page.waitForLoadState('networkidle');
  }

  async gotoBuilder() {
    await this.page.goto('/campaigns/new');
    await this.page.waitForLoadState('networkidle');
  }

  async startNewCampaign() {
    await this.createCampaignButton.click();
    await this.page.waitForURL('**/campaigns/new');
  }

  async fillStep1(name: string, product: string, desc: string, valueProp: string, icp: string) {
    await this.campaignNameInput.fill(name);
    await this.productNameInput.fill(product);
    await this.productDescInput.fill(desc);
    await this.valuePropInput.fill(valueProp);
    await this.icpDescInput.fill(icp);
  }

  async fillStep2(senderName: string, senderEmail: string) {
    await this.senderNameInput.fill(senderName);
    await this.senderEmailInput.fill(senderEmail);
  }

  async goToNextStep() {
    await this.nextStepButton.click();
  }

  async clickLaunch() {
    await this.launchCampaignButton.click();
  }
}
