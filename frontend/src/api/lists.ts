import api from "./client";

export interface LeadList {
  id: string;
  name: string;
  description?: string;
  is_dynamic: boolean;
  member_count: number;
  created_at: string;
}

export async function fetchLists(): Promise<LeadList[]> {
  const { data } = await api.get("/lists");
  return data;
}
