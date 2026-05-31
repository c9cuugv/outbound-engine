import { test, expect } from '@playwright/test';
import { AuthPage } from '../pages/AuthPage';
import { mockAuthAPI } from '../helpers/auth';

test.describe('Authentication', () => {
  test('should display the login form with Sign In button', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.goto();

    await expect(authPage.emailInput).toBeVisible();
    await expect(authPage.passwordInput).toBeVisible();
    await expect(authPage.loginButton).toBeVisible();
    await expect(authPage.loginButton).toHaveText('Sign In');
  });

  test('should login successfully with mocked API', async ({ page }) => {
    // Mock the auth endpoint so login succeeds
    await mockAuthAPI(page);

    const authPage = new AuthPage(page);
    await authPage.goto();
    await authPage.login('test@example.com', 'password');

    // Should be redirected to leads page
    await expect(page).toHaveURL(/.*\/leads/);
  });

  test('should show validation errors for empty fields', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.goto();

    // Click submit without filling in anything — HTML5 required validation
    await authPage.loginButton.click();

    // Should NOT navigate away from /login
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('should toggle between login and register modes', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.goto();

    // Initially in login mode
    await expect(authPage.loginButton).toHaveText('Sign In');

    // Switch to register — use the footer "Register" link (more reliable)
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(authPage.loginButton).toHaveText('Create Account');
    await expect(authPage.nameInput).toBeVisible();

    // Switch back to login — use the footer "Sign in" link
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(authPage.loginButton).toHaveText('Sign In');
  });

  test('should show error message on failed login', async ({ page }) => {
    // Mock the auth endpoint to return 401
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' }),
      });
    });

    const authPage = new AuthPage(page);
    await authPage.goto();

    await authPage.emailInput.fill('wrong@test.com');
    await authPage.passwordInput.fill('badpassword');
    await authPage.loginButton.click();

    // Wait for the error message — locate by the actual text content
    const errorText = page.getByText('Invalid credentials');
    await expect(errorText).toBeVisible({ timeout: 10000 });

    // Should stay on login page
    await expect(page).toHaveURL(/.*\/login/);
  });
});
