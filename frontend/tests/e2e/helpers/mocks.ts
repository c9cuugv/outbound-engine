import type { Page, Route } from "@playwright/test";

/*
 * Mock data shaped to match the real backend contract that the rebuilt
 * components consume (see frontend/src/types/*). The previous mocks returned
 * shapes the API never emits — a flat email array, `analytics.total_sent` —
 * which is why they could not survive the UI rebuild. These mirror
 * backend/app/api/v1/*.py.
 */

export const MOCK_LEADS = {
  items: [
    {
      id: "lead-1",
      first_name: "Jane",
      last_name: "Cooper",
      email: "jane@acmecorp.com",
      company_name: "Acme Corp",
      company_domain: "acmecorp.com",
      title: "VP Engineering",
      linkedin_url: null,
      status: "new",
      research_status: "pending",
      research_completed_at: null,
      tags: [],
      source: "csv",
      created_at: "2026-01-15T10:00:00Z",
      updated_at: "2026-01-15T10:00:00Z",
    },
    {
      id: "lead-2",
      first_name: "Michael",
      last_name: "Chen",
      email: "mchen@globex.io",
      company_name: "Globex",
      company_domain: "globex.io",
      title: "CTO",
      linkedin_url: null,
      status: "researched",
      research_status: "completed",
      research_completed_at: "2026-01-14T10:00:00Z",
      tags: [],
      source: "csv",
      created_at: "2026-01-14T09:00:00Z",
      updated_at: "2026-01-14T10:00:00Z",
    },
    {
      id: "lead-3",
      first_name: "Sarah",
      last_name: "Williams",
      email: "swilliams@initech.com",
      company_name: "Initech",
      company_domain: "initech.com",
      title: "Director of Sales",
      linkedin_url: null,
      status: "in_sequence",
      research_status: "completed",
      research_completed_at: "2026-01-13T10:00:00Z",
      tags: [],
      source: "csv",
      created_at: "2026-01-13T08:00:00Z",
      updated_at: "2026-01-13T10:00:00Z",
    },
  ],
  total_count: 3,
  page: 1,
  per_page: 25,
  total_pages: 1,
};

export const EMPTY_LEADS = {
  items: [],
  total_count: 0,
  page: 1,
  per_page: 25,
  total_pages: 1,
};

export const MOCK_CAMPAIGNS = [
  {
    id: "campaign-1",
    name: "Q1 Enterprise Outreach",
    product_name: "Widget Pro",
    product_description: "Automated provisioning.",
    icp_description: "Growth-stage SaaS.",
    value_prop: "Save 15 hours a week.",
    system_prompt: null,
    sender_email: "jane@widget.co",
    sender_name: "Jane Cooper",
    reply_to_email: null,
    sending_timezone: "UTC",
    sending_days: ["mon", "tue", "wed", "thu", "fri"],
    sending_window_start: "09:00",
    sending_window_end: "17:00",
    max_emails_per_day: 50,
    min_delay_between_emails_seconds: 60,
    ab_test_enabled: false,
    ab_split_percentage: 0,
    status: "review",
    total_leads: 50,
    emails_sent: 20,
    emails_opened: 12,
    emails_clicked: 4,
    emails_replied: 2,
    emails_bounced: 1,
    created_at: "2026-01-10T12:00:00Z",
    updated_at: "2026-01-10T12:00:00Z",
  },
  {
    id: "campaign-2",
    name: "Follow-up Sequence",
    product_name: null,
    product_description: null,
    icp_description: null,
    value_prop: null,
    system_prompt: null,
    sender_email: "jane@widget.co",
    sender_name: "Jane Cooper",
    reply_to_email: null,
    sending_timezone: "UTC",
    sending_days: ["mon", "tue", "wed", "thu", "fri"],
    sending_window_start: "09:00",
    sending_window_end: "17:00",
    max_emails_per_day: 50,
    min_delay_between_emails_seconds: 60,
    ab_test_enabled: false,
    ab_split_percentage: 0,
    status: "active",
    total_leads: 120,
    emails_sent: 300,
    emails_opened: 180,
    emails_clicked: 60,
    emails_replied: 20,
    emails_bounced: 5,
    created_at: "2026-01-05T12:00:00Z",
    updated_at: "2026-01-05T12:00:00Z",
  },
];

export const MOCK_CAMPAIGN_EMAILS = {
  emails: {
    "lead-1": [
      {
        id: "email-1",
        lead_id: "lead-1",
        campaign_id: "campaign-1",
        template_id: "tpl-1",
        sequence_position: 1,
        subject: "Quick question about Acme",
        subject_alternatives: [],
        body: "Hi Jane, I noticed your team has been scaling fast.",
        body_original: null,
        was_manually_edited: false,
        status: "draft",
        scheduled_at: null,
        sent_at: null,
        opened_at: null,
        opened_count: 0,
        clicked_at: null,
        clicked_count: 0,
        replied_at: null,
        bounced_at: null,
        bounce_type: null,
        created_at: "2026-01-11T12:00:00Z",
      },
    ],
  },
  total: 1,
};

const MOCK_TEMPLATES = [
  {
    id: "tpl-1",
    name: "Cold Outreach",
    system_prompt: "Be concise.",
    generation_prompt: "Write a cold email.",
    max_word_count: 120,
    tone: "direct",
    sequence_position: 1,
    days_delay: 0,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
  },
  {
    id: "tpl-2",
    name: "Follow-up",
    system_prompt: "Be brief.",
    generation_prompt: "Write a follow-up.",
    max_word_count: 90,
    tone: "friendly",
    sequence_position: 2,
    days_delay: 3,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
  },
];

const MOCK_LISTS = [
  {
    id: "list-1",
    name: "Premium ICP List",
    description: "Top accounts",
    is_dynamic: false,
    member_count: 12,
    created_at: "2026-01-10T12:00:00Z",
  },
];

const MOCK_ANALYTICS = {
  overview: {
    total_leads: 50,
    emails_sent: 20,
    open_rate: 0.6,
    click_rate: 0.2,
    reply_rate: 0.1,
    bounce_rate: 0.05,
  },
  by_sequence_step: [{ step: 1, sent: 20, opened: 12, clicked: 4, replied: 2 }],
  by_day: [{ date: "2026-01-11", sent: 20, opened: 12, clicked: 4, replied: 2 }],
  reply_sentiment_breakdown: { interested: 2 },
  top_performing_subjects: [],
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

export interface MockOverrides {
  leads?: unknown;
  campaigns?: unknown;
  campaignEmails?: unknown;
  analytics?: unknown;
  quickDraft?: unknown;
}

/**
 * One handler for every /api/v1 call, dispatched by method + pathname. A single
 * dispatcher avoids the route-precedence bugs that come from stacking many
 * overlapping glob patterns (Playwright resolves the last-registered match).
 *
 * Pass `overrides` to swap a response for one test (e.g. an empty lead list).
 */
export async function mockApi(page: Page, overrides: MockOverrides = {}) {
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const method = req.method();
    const path = new URL(req.url()).pathname;

    // ── Auth ──
    if (path.endsWith("/auth/login") || path.endsWith("/auth/register")) {
      return json(route, { access_token: "e2e-token", refresh_token: "e2e-refresh" });
    }
    if (path.endsWith("/auth/refresh")) {
      return json(route, { access_token: "e2e-token-2", refresh_token: "e2e-refresh" });
    }

    // ── Leads ──
    if (path.endsWith("/leads/research-all") && method === "POST") {
      return json(route, { status: "queued", queued_count: 3 });
    }
    if (path.endsWith("/leads/bulk") && method === "POST") {
      return json(route, { imported: 3, skipped_duplicate: 0, skipped_invalid: 0, errors: [] });
    }
    if (path.endsWith("/leads") && method === "GET") {
      return json(route, overrides.leads ?? MOCK_LEADS);
    }

    // ── Campaigns ──
    if (path.endsWith("/campaigns") && method === "POST") {
      return json(route, MOCK_CAMPAIGNS[0], 201);
    }
    if (path.endsWith("/campaigns") && method === "GET") {
      return json(route, overrides.campaigns ?? MOCK_CAMPAIGNS);
    }
    if (path.endsWith("/generate") && method === "POST") {
      return json(route, { status: "accepted" }, 202);
    }
    if (path.endsWith("/emails") && method === "GET") {
      return json(route, overrides.campaignEmails ?? MOCK_CAMPAIGN_EMAILS);
    }
    if (path.endsWith("/analytics") && method === "GET") {
      return json(route, overrides.analytics ?? MOCK_ANALYTICS);
    }
    if (/\/campaigns\/[^/]+$/.test(path) && method === "GET") {
      return json(route, MOCK_CAMPAIGNS[0]);
    }
    if (/\/campaigns\/[^/]+$/.test(path) && method === "PATCH") {
      const updates = req.postDataJSON();
      return json(route, { ...MOCK_CAMPAIGNS[0], ...updates });
    }

    // ── Templates / lists ──
    if (path.endsWith("/templates") && method === "GET") {
      return json(route, MOCK_TEMPLATES);
    }
    if (path.endsWith("/lists") && method === "GET") {
      return json(route, MOCK_LISTS);
    }

    // ── Quick draft ──
    if (path.endsWith("/quick-draft") && method === "POST") {
      return json(
        route,
        overrides.quickDraft ?? {
          subject: "Cutting Acme's provisioning time",
          body: "Hi Jane,\n\nNoticed Acme is scaling fast.",
          scraped_signals: { homepage: "Acme builds cloud infra." },
          website_url: "acmecorp.com",
        },
      );
    }

    // Anything unmocked resolves empty rather than reaching a real server.
    return json(route, {});
  });
}
