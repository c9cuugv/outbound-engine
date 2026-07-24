import { test, expect } from "@playwright/test";
import { mockApi } from "../helpers/mocks";
import { injectAuth } from "../helpers/auth";

test.describe("Quick draft", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await injectAuth(page);
    await page.goto("/quick-draft");
  });

  test("draft button is gated until the required fields are filled", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Quick draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Draft email" })).toBeDisabled();
  });

  test("scrapes and shows the generated email", async ({ page }) => {
    await page.getByPlaceholder("example.com", { exact: true }).fill("acmecorp.com");
    await page.getByPlaceholder("OutboundEngine").fill("OutboundEngine");
    await page.getByPlaceholder(/We automate outreach/).fill("We save 10 hours a week.");

    await page.getByRole("button", { name: "Draft email" }).click();

    await expect(page.getByText("Cutting Acme's provisioning time")).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy/ })).toBeVisible();
    // The scraped signal is surfaced alongside the draft.
    await expect(page.getByText("Acme builds cloud infra.")).toBeVisible();
  });
});
