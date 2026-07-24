import { test, expect } from "@playwright/test";
import { mockApi } from "../helpers/mocks";
import { injectAuth } from "../helpers/auth";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await injectAuth(page);
    await page.goto("/settings");
  });

  test("is reachable from the sidebar and prefills the current campaign", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByPlaceholder("Alex Rivera")).toHaveValue("Jane Cooper");
  });

  test("saves sender name and sending window", async ({ page }) => {
    await page.getByPlaceholder("Alex Rivera").fill("Jordan Lee");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Saved.")).toBeVisible();
  });
});
