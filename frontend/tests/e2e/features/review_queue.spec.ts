import { test, expect } from "@playwright/test";
import { mockApi } from "../helpers/mocks";
import { injectAuth } from "../helpers/auth";

test.describe("Email review queue", () => {
  test("shows draft emails awaiting review", async ({ page }) => {
    await mockApi(page);
    await injectAuth(page);
    await page.goto("/campaigns/campaign-1/review");

    await expect(page.getByRole("heading", { name: "Review drafts" })).toBeVisible();
    // The draft's subject renders in an editable input.
    await expect(page.getByRole("textbox", { name: "Subject" })).toHaveValue(
      "Quick question about Acme",
    );
    await expect(page.getByRole("button", { name: /Approve all/ })).toBeVisible();
  });

  test("shows the empty state when nothing is left to review", async ({ page }) => {
    await mockApi(page, { campaignEmails: { emails: {}, total: 0 } });
    await injectAuth(page);
    await page.goto("/campaigns/campaign-1/review");

    await expect(page.getByText("Nothing left to review")).toBeVisible();
  });
});
