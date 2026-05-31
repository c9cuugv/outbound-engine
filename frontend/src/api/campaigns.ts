import api from "./client";
import type {
  Campaign,
  EmailTemplate,
  GeneratedEmail,
  CampaignWizardData,
  CampaignEmailGroupsResponse,
} from "../types/campaign";

export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data } = await api.get("/campaigns");
  return data;
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  const { data } = await api.get(`/campaigns/${id}`);
  return data;
}

export async function createCampaign(payload: CampaignWizardData): Promise<Campaign> {
  const { data } = await api.post("/campaigns", payload);
  return data;
}

export async function launchCampaign(campaignId: string): Promise<Campaign> {
  const { data } = await api.post(`/campaigns/${campaignId}/launch`);
  return data;
}

export async function pauseCampaign(campaignId: string): Promise<Campaign> {
  const { data } = await api.post(`/campaigns/${campaignId}/pause`);
  return data;
}

export async function resumeCampaign(campaignId: string): Promise<Campaign> {
  const { data } = await api.post(`/campaigns/${campaignId}/resume`);
  return data;
}

export async function fetchTemplates(): Promise<EmailTemplate[]> {
  const { data } = await api.get("/templates");
  return data;
}

export async function fetchCampaignEmails(
  campaignId: string,
  status?: string,
): Promise<CampaignEmailGroupsResponse> {
  const { data } = await api.get(`/campaigns/${campaignId}/emails`, {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function approveEmail(campaignId: string, emailId: string): Promise<void> {
  await api.post(`/campaigns/${campaignId}/emails/${emailId}/approve`);
}

export async function updateEmail(
  campaignId: string,
  emailId: string,
  payload: { subject?: string; body?: string },
): Promise<GeneratedEmail> {
  const { data } = await api.patch(`/campaigns/${campaignId}/emails/${emailId}`, payload);
  return data;
}

export async function approveAllEmails(campaignId: string): Promise<{ approved: number }> {
  const { data } = await api.post(`/campaigns/${campaignId}/emails/approve-all`);
  return data;
}

export async function regenerateEmail(campaignId: string, emailId: string): Promise<GeneratedEmail> {
  const { data } = await api.post(`/campaigns/${campaignId}/emails/${emailId}/regenerate`);
  return data;
}

export async function generateCampaignEmails(campaignId: string): Promise<void> {
  await api.post(`/campaigns/${campaignId}/generate`);
}
