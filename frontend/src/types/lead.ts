/** Lead record from the API */
export interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_name: string | null;
  company_domain: string | null;
  title: string | null;
  linkedin_url: string | null;
  status: LeadStatus;
  research_status: ResearchStatus;
  research_completed_at: string | null;
  tags: string[];
  source: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadStatus =
  | "new"
  | "researched"
  | "in_sequence"
  | "completed"
  | "bounced"
  | "unsubscribed";

export type ResearchStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "needs_review";

/** Research data attached to a lead */
export interface ResearchData {
  company_summary: string;
  industry: string;
  company_size_estimate: string;
  tech_stack_signals: string[];
  potential_pain_points: string[];
  personalization_hooks: string[];
  confidence_score: number;
}

/** Paginated API response shape */
export interface PaginatedResponse<T> {
  items: T[];
  total_count: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/** CSV import result */
export interface ImportResult {
  imported: number;
  skipped_duplicate: number;
  skipped_invalid: number;
  errors: Array<{ row: number; reason: string }>;
}
