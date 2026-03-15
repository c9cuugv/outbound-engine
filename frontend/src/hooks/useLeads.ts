import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLeads, fetchLeadResearch, importCSV, triggerResearchAll } from "../api/leads";
import type { LeadQueryParams } from "../api/leads";

export function useLeads(params: LeadQueryParams) {
  return useQuery({
    queryKey: ["leads", params],
    queryFn: () => fetchLeads(params),
    staleTime: 30_000,
  });
}

export function useLeadResearch(leadId: string | null) {
  return useQuery({
    queryKey: ["lead-research", leadId],
    queryFn: () => fetchLeadResearch(leadId!),
    enabled: !!leadId,
  });
}

export function useImportCSV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importCSV,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useResearchAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: triggerResearchAll,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}
