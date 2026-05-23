import { Page } from '@playwright/test';

/* ── Mock lead data ── */
export const MOCK_LEADS = {
  items: [
    {
      id: 'lead-1',
      first_name: 'Jane',
      last_name: 'Cooper',
      email: 'jane@acmecorp.com',
      company_name: 'Acme Corp',
      company_domain: 'acmecorp.com',
      title: 'VP Engineering',
      status: 'new',
      research_status: 'pending',
      created_at: '2025-01-15T10:00:00Z',
    },
    {
      id: 'lead-2',
      first_name: 'Michael',
      last_name: 'Chen',
      email: 'mchen@globex.io',
      company_name: 'Globex',
      company_domain: 'globex.io',
      title: 'CTO',
      status: 'researched',
      research_status: 'completed',
      created_at: '2025-01-14T09:00:00Z',
    },
    {
      id: 'lead-3',
      first_name: 'Sarah',
      last_name: 'Williams',
      email: 'swilliams@initech.com',
      company_name: 'Initech',
      company_domain: 'initech.com',
      title: 'Director of Sales',
      status: 'in_sequence',
      research_status: 'completed',
      created_at: '2025-01-13T08:00:00Z',
    },
  ],
  total_count: 3,
  total_pages: 1,
  page: 1,
  per_page: 25,
};

/* ── Mock campaign data ── */
export const MOCK_CAMPAIGNS = [
  {
    id: 'campaign-1',
    name: 'Q1 Enterprise Outreach',
    product_name: 'Widget Pro',
    status: 'review',
    total_leads: 50,
    created_at: '2025-01-10T12:00:00Z',
  },
  {
    id: 'campaign-2',
    name: 'Follow-up Sequence',
    product_name: null,
    status: 'active',
    total_leads: 120,
    created_at: '2025-01-05T12:00:00Z',
  },
];

export const MOCK_CAMPAIGN_DETAIL = {
  id: 'campaign-1',
  name: 'Q1 Enterprise Outreach',
  product_name: 'Widget Pro',
  status: 'review',
  total_leads: 50,
  created_at: '2025-01-10T12:00:00Z',
};

export const MOCK_CAMPAIGN_EMAILS = [
  {
    id: 'email-1',
    lead_id: 'lead-1',
    campaign_id: 'campaign-1',
    subject: 'Quick question about Acme',
    body: '<p>Hi Jane, I noticed your team has been scaling…</p>',
    status: 'pending_review',
    lead: { first_name: 'Jane', last_name: 'Cooper', email: 'jane@acmecorp.com', company_name: 'Acme Corp' },
  },
  {
    id: 'email-2',
    lead_id: 'lead-2',
    campaign_id: 'campaign-1',
    subject: 'Globex partnership opportunity',
    body: '<p>Hi Michael, I wanted to reach out regarding…</p>',
    status: 'pending_review',
    lead: { first_name: 'Michael', last_name: 'Chen', email: 'mchen@globex.io', company_name: 'Globex' },
  },
];

export const MOCK_TEMPLATES = [
  { id: 'tpl-1', name: 'Cold Outreach', subject: 'Quick question', body: 'Hi {{first_name}}' },
];

/**
 * Installs API route mocks for all data endpoints.
 * Call this before navigating to pages that fetch data.
 */
export async function mockDataAPIs(page: Page) {
  // ── Leads ──
  await page.route('**/api/v1/leads*', async (route) => {
    const url = route.request().url();
    // Check if it's a research-all POST
    if (route.request().method() === 'POST' && url.includes('research-all')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'ok' }) });
    }
    // Return the paginated leads response
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_LEADS),
    });
  });

  // ── Campaigns list ──
  await page.route('**/api/v1/campaigns', async (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'campaign-new', ...MOCK_CAMPAIGN_DETAIL }),
      });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CAMPAIGNS),
    });
  });

  // ── Individual campaign ──
  await page.route('**/api/v1/campaigns/*/emails*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CAMPAIGN_EMAILS),
    });
  });

  await page.route(/\/api\/v1\/campaigns\/[^/]+$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CAMPAIGN_DETAIL),
    });
  });

  // ── Templates ──
  await page.route('**/api/v1/templates*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TEMPLATES),
    });
  });

  // ── Analytics ──
  await page.route('**/api/v1/analytics*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_sent: 150,
        total_opened: 90,
        total_clicked: 30,
        total_replied: 10,
        open_rate: 60,
        click_rate: 20,
        reply_rate: 6.7,
      }),
    });
  });

  // ── Lead lists ──
  await page.route('**/api/v1/lists', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'list-1', name: 'Premium ICP List', member_count: 12, is_dynamic: false, created_at: '2025-01-10T12:00:00Z' }
      ]),
    });
  });

  // ── Campaign generate ──
  await page.route('**/api/v1/campaigns/*/generate', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'accepted', message: 'Email generation queued' }),
    });
  });
}
