import { test, expect } from "@playwright/test";
import { mockApi, EMPTY_LEADS } from "../helpers/mocks";
import { injectAuth } from "../helpers/auth";

test.describe("Leads", () => {
  test("renders the lead table with data", async ({ page }) => {
    await mockApi(page);
    await injectAuth(page);
    await page.goto("/leads");

    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
    await expect(page.getByText("3 total")).toBeVisible();
    await expect(page.locator("table tbody tr")).toHaveCount(3);
    await expect(page.getByText("jane@acmecorp.com")).toBeVisible();
  });

  test("exposes the import and research actions", async ({ page }) => {
    await mockApi(page);
    await injectAuth(page);
    await page.goto("/leads");

    await expect(page.getByRole("button", { name: "Import CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Research all" })).toBeVisible();
    await expect(page.getByPlaceholder("Search name, email, or company")).toBeVisible();
  });

  test("shows the empty state when there are no leads", async ({ page }) => {
    await mockApi(page, { leads: EMPTY_LEADS });
    await injectAuth(page);
    await page.goto("/leads");

    await expect(page.getByText("No leads yet")).toBeVisible();
    // The empty state offers the primary import action as its call to action.
    await expect(page.getByRole("button", { name: "Import CSV" })).toHaveCount(2);
  });

  test("opens the research panel when a row is clicked", async ({ page }) => {
    await mockApi(page);
    await injectAuth(page);
    await page.goto("/leads");

    await page.getByText("Michael Chen").click();
    await expect(page.getByRole("button", { name: "Close research panel" })).toBeVisible();
  });
});
