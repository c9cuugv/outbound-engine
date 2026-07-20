import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Live LangGraph Flow', () => {
  test('should research a live website and draft an email', async ({ page }) => {
    test.setTimeout(180000);
    // 1. Create a unique user for this test to avoid collision
    const testId = Date.now();
    const email = `testuser_${testId}@example.com`;
    const password = 'password123';

    await page.goto('/login');
    // Switch to register tab
    await page.locator('button.flex-1:has-text("register")').click();
    await page.locator('input[type="text"]').fill('Live Test User');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Wait for redirect to /leads
    await page.waitForURL('**/leads', { timeout: 15000 });

    // 2. Upload a CSV with a real live website
    const csvContent = `first_name,last_name,email,company_name,company_domain,title\nLang,Graph,lang@langchain.com,LangChain,langchain.com,Developer`;
    const csvPath = path.join(__dirname, `temp_lead_${testId}.csv`);
    fs.writeFileSync(csvPath, csvContent);

    await page.locator('button:has-text("Upload CSV")').first().click();
    await page.setInputFiles('input[type="file"]', csvPath);

    
    // Wait for the lead to appear in the table
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('p:has-text("LangChain")').first()).toBeVisible();

    // 3. Trigger research for the lead (via Research All)
    await page.locator('button:has-text("Research All")').click();
    const row = page.locator('table tbody tr', { hasText: 'LangChain' }).first();

    // Wait for the research to complete (polling UI)
    // The research status dot should eventually change from pending (gray) to completed (green)
    // and the "Research" button will disappear. We can look for the text "completed" 
    // replacing "pending" in that row.
    await expect(row.locator('text=completed')).toBeVisible({ timeout: 60000 });

    // 4. Create a Campaign
    await page.goto('/campaigns/new');
    await page.waitForLoadState('networkidle');

    // Step 1
    await page.getByPlaceholder('e.g., Enterprise Q3 SaaS Outreach').fill('LangChain Campaign');
    await page.getByPlaceholder('e.g., Acme Cloud Automator').fill('OutboundEngine AI');
    await page.getByPlaceholder('Describe what your product does').fill('Automates outbound email using LangGraph.');
    await page.getByPlaceholder('What are the quantifiable business outcomes').fill('Save 10 hours a week.');
    await page.getByPlaceholder('Specify target industries, company sizes').fill('AI Developers.');
    await page.locator('button:has-text("Next Step")').click();

    // Step 2
    await page.getByPlaceholder('e.g., Jane Cooper').fill('AI Agent');
    await page.getByPlaceholder('e.g., jane@mycompany.com').fill('agent@example.com');
    await page.locator('button:has-text("Next Step")').click();

    // Step 3
    await page.locator('button:has-text("Next Step")').click();

    // Step 4
    await page.locator('button:has-text("Launch Campaign")').click();

    // 5. Wait for redirect to review queue
    await page.waitForURL(/.*\/campaigns\/[^/]+\/review/, { timeout: 30000 });

    // Wait for emails to be generated. The campaign status goes generating -> review.
    // When review is ready, the email list will appear.
    const emailItem = page.locator('[data-testid="email-list"] button').first();
    await expect(emailItem).toBeVisible({ timeout: 120000 }); // Generation might take up to 2 mins

    // 6. Verify the drafted email is present
    await emailItem.click();
    const editor = page.locator('.prose p').first();
    await expect(editor).toBeVisible();

    const emailBody = await editor.textContent();
    console.log("GENERATED EMAIL DRAFT:");
    console.log(emailBody);

    // Clean up
    fs.unlinkSync(csvPath);
  });
});
