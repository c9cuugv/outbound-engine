import { test, expect } from "@playwright/test";
import { mockApi } from "../helpers/mocks";

test.describe("Authentication", () => {
  test("shows the sign-in form", async ({ page }) => {
    await mockApi(page);
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("signs in and lands on leads", async ({ page }) => {
    await mockApi(page);
    await page.goto("/login");

    await page.getByPlaceholder("you@company.com").fill("test@example.com");
    await page.getByPlaceholder("••••••••").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/leads/);
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  });

  test("required fields block submit and stay on /login", async ({ page }) => {
    await mockApi(page);
    await page.goto("/login");

    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("toggles to register mode and back", async ({ page }) => {
    await mockApi(page);
    await page.goto("/login");

    await page.getByRole("button", { name: "Create one" }).click();
    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByPlaceholder("Alex Rivera")).toBeVisible();

    // In register mode the only "Sign in" button is the toggle back to login.
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("surfaces the API error message on failed sign-in", async ({ page }) => {
    await page.route("**/api/v1/auth/login", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid credentials" }),
      }),
    );

    await page.goto("/login");
    await page.getByPlaceholder("you@company.com").fill("wrong@test.com");
    await page.getByPlaceholder("••••••••").fill("badpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toContainText("Invalid credentials");
    await expect(page).toHaveURL(/\/login/);
  });
});
