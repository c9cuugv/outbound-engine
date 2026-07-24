import type { Page } from "@playwright/test";

/**
 * Seeds a fake JWT into sessionStorage before any page JS runs, so the
 * AppLayout auth-guard (getAccessToken()) lets the test through without a
 * login round-trip. addInitScript re-runs on every navigation in the context.
 *
 * Call this after mockApi(page) and before navigating to a guarded route.
 */
export async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("access_token", "e2e-token");
    sessionStorage.setItem("refresh_token", "e2e-refresh");
  });
}
