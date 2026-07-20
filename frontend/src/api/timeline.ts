import api from "./client";

export interface TimelineEvent {
  type: string;
  timestamp: string;
  data: {
    subject?: string;
    step?: number;
    open_count?: number;
    click_count?: number;
    preview?: string;
    bounce_type?: string;
  };
}

export interface TimelineResponse {
  lead_id: string;
  campaign_id: string;
  timeline: TimelineEvent[];
}

export async function fetchLeadTimeline(campaignId: string, leadId: string): Promise<TimelineResponse> {
  const { data } = await api.get<TimelineResponse>(
    `/campaigns/${campaignId}/leads/${leadId}/timeline`
  );
  return data;
}
