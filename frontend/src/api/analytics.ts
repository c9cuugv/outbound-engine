import api from "./client";
import type { CampaignAnalytics } from "../types/analytics";

export async function fetchCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  const { data } = await api.get(`/campaigns/${campaignId}/analytics`);
  return data;
}

/*
 * The lead-timeline client lives in ./timeline.ts. A second copy used to sit
 * here declaring `{ lead, events }` — a shape the backend never emits. The
 * endpoint actually returns `{ lead_id, campaign_id, timeline }`
 * (backend/app/api/v1/analytics.py:142). Removed so there is one client per
 * endpoint and the types match reality.
 */

