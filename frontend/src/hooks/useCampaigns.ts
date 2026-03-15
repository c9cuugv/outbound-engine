import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCampaigns,
  fetchCampaign,
  createCampaign,
  generateEmails,
  fetchCampaignEmails,
  approveEmail,
  updateEmail,
  regenerateEmail,
  approveAllEmails,
  launchCampaign,
  fetchTemplates,
} from "../api/campaigns";
import type { CampaignWizardData } from "../types/campaign";

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ["campaign", id],
    queryFn: () => fetchCampaign(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "generating" ? 5000 : false;
    },
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
  });
}

export function useCampaignEmails(campaignId: string, status?: string) {
  return useQuery({
    queryKey: ["campaign-emails", campaignId, status],
    queryFn: () => fetchCampaignEmails(campaignId, status),
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CampaignWizardData) => createCampaign(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useGenerateEmails() {
  return useMutation({ mutationFn: generateEmails });
}

export function useApproveEmail(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (emailId: string) => approveEmail(campaignId, emailId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign-emails", campaignId] }),
  });
}

export function useUpdateEmail(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ emailId, payload }: { emailId: string; payload: { subject?: string; body?: string } }) =>
      updateEmail(campaignId, emailId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign-emails", campaignId] }),
  });
}

export function useRegenerateEmail(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (emailId: string) => regenerateEmail(campaignId, emailId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign-emails", campaignId] }),
  });
}

export function useApproveAllEmails(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => approveAllEmails(campaignId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign-emails", campaignId] }),
  });
}

export function useLaunchCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: launchCampaign,
    onSuccess: (_data, campaignId) =>
      qc.invalidateQueries({ queryKey: ["campaign", campaignId] }),
  });
}
