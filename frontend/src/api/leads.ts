import api from "./client";
import type { Lead, PaginatedResponse, ResearchData, ImportResult } from "../types/lead";

export interface LeadQueryParams {
  page?: number;
  per_page?: number;
  sort?: string;
  order?: "asc" | "desc";
  status?: string;
  research_status?: string;
  search?: string;
}

export async function fetchLeads(params: LeadQueryParams): Promise<PaginatedResponse<Lead>> {
  const { data } = await api.get("/leads", { params });
  return data;
}

export async function fetchLead(id: string): Promise<Lead> {
  const { data } = await api.get(`/leads/${id}`);
  return data;
}

export async function fetchLeadResearch(id: string): Promise<ResearchData> {
  const { data } = await api.get(`/leads/${id}/research`);
  return data;
}

export async function importCSV(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post("/leads/bulk", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function triggerResearch(id: string): Promise<void> {
  await api.post(`/leads/${id}/research`);
}

export async function triggerResearchAll(): Promise<{ status: string; queued_count: number }> {
  const { data } = await api.post("/leads/research-all");
  return data;
}
