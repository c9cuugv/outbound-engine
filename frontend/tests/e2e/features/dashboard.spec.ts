import { test, expect } from "@playwright/test";
import { mockApi } from "../helpers/mocks";
import { injectAuth } from "../helpers/auth";

test.describe("Campaign dashboard", () => {
  test("renders overview stats for the campaign", async ({ page }) => {
    await mockApi(page);
    await injectAuth(page);
    await page.goto("/campaigns/campaign-1/dashboard");

    await expect(page.getByRole("heading", { name: "Q1 Enterprise Outreach" })).toBeVisible();
    await expect(page.getByText("Open rate")).toBeVisible();
    // 0.6 open_rate renders as 60%.
    await expect(page.getByText("60%")).toBeVisible();
  });

  test("offers the launch control while in review", async ({ page }) => {
    await mockApi(page);
    await injectAuth(page);
    await page.goto("/campaigns/campaign-1/dashboard");

    // MOCK campaign status is "review", so the Launch action is available.
    await expect(page.getByRole("button", { name: "Launch" })).toBeVisible();
  });
});
