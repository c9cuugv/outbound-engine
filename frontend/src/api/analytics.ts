import api from "./client";
import type { CampaignAnalytics, TimelineEvent } from "../types/analytics";
import type { Lead } from "../types/lead";

export async function fetchCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  const { data } = await api.get(`/campaigns/${campaignId}/analytics`);
  return data;
}

export async function fetchLeadTimeline(
  campaignId: string,
  leadId: string,
): Promise<{ lead: Lead; events: TimelineEvent[] }> {
  const { data } = await api.get(`/campaigns/${campaignId}/leads/${leadId}/timeline`);
  return data;
}
