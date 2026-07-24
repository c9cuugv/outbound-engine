import { test, expect } from "@playwright/test";
import { mockApi } from "../helpers/mocks";
import { injectAuth } from "../helpers/auth";

test.describe("Campaign list", () => {
  test("lists campaigns with their status", async ({ page }) => {
    await mockApi(page);
    await injectAuth(page);
    await page.goto("/campaigns");

    await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
    await expect(page.getByText("Q1 Enterprise Outreach")).toBeVisible();
    await expect(page.locator("table tbody tr")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "New campaign" })).toBeVisible();
  });
});

test.describe("Campaign builder wizard", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await injectAuth(page);
    await page.goto("/campaigns/new");
  });

  test("starts on the Product step", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "New campaign" })).toBeVisible();
    await expect(page.getByPlaceholder(/Q3 outbound/)).toBeVisible();
    // Continue is gated until the required product fields are filled.
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  test("walks all four steps and launches generation", async ({ page }) => {
    // Step 1 — Product
    await page.getByPlaceholder(/Q3 outbound/).fill("Enterprise Q3 Outreach");
    await page.getByPlaceholder("OutboundEngine").fill("Acme Cloud Automator");
    await page.getByPlaceholder(/We automate outbound research/).fill("Saves 15 hours a week.");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2 — Audience
    await page.getByPlaceholder("Alex Rivera").fill("Jane Cooper");
    await page.getByPlaceholder("alex@company.com").fill("jane@widget.co");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3 — Sequence (templates loaded from the API)
    await expect(page.getByText("Cold Outreach")).toBeVisible();
    await page.getByText("Cold Outreach").click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4 — Review, then create + generate
    await expect(page.getByText("Enterprise Q3 Outreach")).toBeVisible();
    await page.getByRole("button", { name: "Create and generate drafts" }).click();

    await expect(page).toHaveURL(/\/campaigns\/[^/]+\/review/);
  });
});
