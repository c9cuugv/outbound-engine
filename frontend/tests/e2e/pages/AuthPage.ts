import { Page, Locator } from '@playwright/test';

export class AuthPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly registerTab: Locator;
  readonly loginTab: Locator;
  readonly nameInput: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"]');
    this.passwordInput = page.locator('input[type="password"]');
    // The submit button says "Sign In" (login mode) or "Create Account" (register mode)
    this.loginButton = page.locator('button[type="submit"]');

    // Tab buttons — must use exact match to avoid colliding with the footer "Register"/"Sign in" link
    // The mode tab buttons have class "flex-1" making them distinct from the footer links
    this.registerTab = page.locator('button.flex-1:has-text("register")');
    this.loginTab = page.locator('button.flex-1:has-text("login")');

    this.nameInput = page.locator('input[type="text"]');

    // Error message container — the login page renders:
    //   <div class="...border-red-500/20 bg-red-500/10...">
    //     <p class="...text-red-400">{error}</p>
    //   </div>
    // Since Tailwind v4 may not expose class names directly, locate via the error text pattern
    this.errorMessage = page.locator('p', { hasText: /.+/ }).locator('xpath=ancestor::div[contains(@class,"border-red")]//p');
  }

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async login(email: string = 'test@example.com', password: string = 'password') {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    // Wait for navigation — the app navigates to /leads on success
    await this.page.waitForURL('**/leads', { timeout: 15000 });
  }
}
