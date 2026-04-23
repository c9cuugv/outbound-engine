import api from "./client";
import type { EmailTemplate } from "../types/campaign";

export const fetchTemplates = async (): Promise<EmailTemplate[]> => {
  const { data } = await api.get("/campaigns/templates");
  return data;
};

export const createTemplate = async (payload: Partial<EmailTemplate>): Promise<EmailTemplate> => {
  const { data } = await api.post("/campaigns/templates", payload);
  return data;
};

export const updateTemplate = async (id: string, payload: Partial<EmailTemplate>): Promise<EmailTemplate> => {
  const { data } = await api.patch(`/campaigns/templates/${id}`, payload);
  return data;
};

export const deleteTemplate = async (id: string): Promise<void> => {
  await api.delete(`/campaigns/templates/${id}`);
};
