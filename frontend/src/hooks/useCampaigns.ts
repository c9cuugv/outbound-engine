import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCampaigns,
  fetchCampaign,
  createCampaign,
  fetchCampaignEmails,
  approveEmail,
  updateEmail,
  approveAllEmails,
  launchCampaign,
  pauseCampaign,
  resumeCampaign,
  fetchTemplates,
  regenerateEmail,
  generateCampaignEmails,
} from "../api/campaigns";
import type { CampaignWizardData } from "../types/campaign";

function invalidateCampaignQueries(qc: ReturnType<typeof useQueryClient>, campaignId: string) {
  qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
  qc.invalidateQueries({ queryKey: ["campaigns"] });
}

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

export function useApproveAllEmails(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => approveAllEmails(campaignId),
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

export function useGenerateEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => generateCampaignEmails(campaignId),
    onSuccess: (_data, campaignId) => qc.invalidateQueries({ queryKey: ["campaign", campaignId] }),
  });
}

export function useLaunchCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: launchCampaign,
    onSuccess: (_data, campaignId) => invalidateCampaignQueries(qc, campaignId),
  });
}

export function usePauseCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: pauseCampaign,
    onSuccess: (_data, campaignId) => invalidateCampaignQueries(qc, campaignId),
  });
}

export function useResumeCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resumeCampaign,
    onSuccess: (_data, campaignId) => invalidateCampaignQueries(qc, campaignId),
  });
}
