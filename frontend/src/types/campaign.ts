/** Campaign record from the API */
export interface Campaign {
  id: string;
  name: string;
  product_name: string | null;
  product_description: string | null;
  icp_description: string | null;
  value_prop: string | null;
  system_prompt: string | null;
  sender_email: string;
  sender_name: string;
  reply_to_email: string | null;
  sending_timezone: string;
  sending_days: string[];
  sending_window_start: string;
  sending_window_end: string;
  max_emails_per_day: number;
  min_delay_between_emails_seconds: number;
  ab_test_enabled: boolean;
  ab_split_percentage: number;
  status: CampaignStatus;
  total_leads: number;
  emails_sent: number;
  emails_opened: number;
  emails_clicked: number;
  emails_replied: number;
  emails_bounced: number;
  created_at: string;
  updated_at: string;
}

export type CampaignStatus =
  | "draft"
  | "generating"
  | "review"
  | "active"
  | "paused"
  | "completed";

/** Email template for a sequence step */
export interface EmailTemplate {
  id: string;
  name: string;
  system_prompt: string;
  generation_prompt: string;
  max_word_count: number;
  tone: string;
  sequence_position: number;
  days_delay: number;
  created_at: string;
  updated_at: string;
}

/** Generated email instance */
export interface GeneratedEmail {
  id: string;
  lead_id: string;
  campaign_id: string;
  template_id: string;
  sequence_position: number;
  subject: string;
  subject_alternatives: string[];
  body: string;
  body_original: string | null;
  was_manually_edited: boolean;
  status: EmailStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  opened_count: number;
  clicked_at: string | null;
  clicked_count: number;
  replied_at: string | null;
  bounced_at: string | null;
  bounce_type: string | null;
  created_at: string;
}

export type EmailStatus =
  | "draft"
  | "approved"
  | "scheduled"
  | "sent"
  | "opened"
  | "clicked"
  | "replied"
  | "bounced"
  | "failed";

/** Wizard form data for creating a campaign */
export interface CampaignWizardData {
  // Step 1: Product info
  name: string;
  product_name: string;
  product_description: string;
  icp_description: string;
  value_prop: string;
  // Step 2: Leads
  lead_list_ids: string[];
  // Step 3: Sequence
  template_ids: string[];
  // Step 4: Sending
  sending_timezone: string;
  sending_days: string[];
  sending_window_start: string;
  sending_window_end: string;
  max_emails_per_day: number;
  sender_email: string;
  sender_name: string;
}
