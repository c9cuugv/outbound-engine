import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

/*
 * Live integration smoke. Hits the real backend + real AI provider, so it is
 * NON-DETERMINISTIC and OFF by default — the mocked specs are the CI gate.
 * Enable with: RUN_LIVE_E2E=1 npx playwright test features/live.spec.ts
 *
 * D6 fix: the previous live specs wrote temp_lead_*.csv into
 * tests/e2e/features/ and never cleaned up, leaking fixtures into the repo.
 * These write to test.info().outputDir (under the gitignored test-results/)
 * and delete on teardown.
 */
const LIVE = process.env.RUN_LIVE_E2E === "1";
const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

test.describe("Live backend smoke", () => {
  test.skip(!LIVE, "Set RUN_LIVE_E2E=1 to run against a real backend + AI provider");
  test.setTimeout(180_000);

  async function authToken(request: import("@playwright/test").APIRequestContext) {
    const creds = {
      email: `e2e-live-${Date.now()}@example.com`,
      name: "E2E Live",
      password: "E2eLiveTest123!",
    };
    const res = await request.post(`${BACKEND}/api/v1/auth/register`, { data: creds });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).access_token as string;
  }

  test("imports a CSV via the real bulk endpoint", async ({ request }, testInfo) => {
    const token = await authToken(request);

    // Temp fixture lives in the per-test output dir, not the repo.
    const csvPath = path.join(testInfo.outputDir, "leads.csv");
    fs.mkdirSync(testInfo.outputDir, { recursive: true });
    fs.writeFileSync(
      csvPath,
      "first_name,last_name,email,company_name,company_domain,title\n" +
        "Harrison,Chase,harrison@langchain.com,LangChain,langchain.com,CEO\n",
    );

    const res = await request.post(`${BACKEND}/api/v1/leads/bulk`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: { file: fs.createReadStream(csvPath) },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).imported).toBeGreaterThanOrEqual(1);

    fs.rmSync(csvPath, { force: true });
  });

  test("drafts an email against the real quick-draft endpoint", async ({ request }) => {
    const token = await authToken(request);
    const res = await request.post(`${BACKEND}/api/v1/quick-draft`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        website_url: "langchain.com",
        product_name: "OutboundEngine",
        value_proposition: "We automate outreach and save 10 hours a week.",
        prospect_name: "Harrison",
        prospect_email: "harrison@langchain.com",
      },
      timeout: 150_000,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.subject).toBeTruthy();
    expect(body.body).toBeTruthy();
  });
});
