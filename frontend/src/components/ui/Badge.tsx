import type { ReactNode } from "react";
import type { LeadStatus, ResearchStatus } from "../../types/lead";
import type { CampaignStatus, EmailStatus } from "../../types/campaign";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-raised text-ink-muted border-line",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  info: "bg-info-soft text-info border-info/25",
};

/*
 * Status is never encoded by colour alone — every badge renders a text label.
 * These states drive real sending decisions, so they have to survive both
 * colour-blindness and a greyscale screenshot.
 */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const LEAD_TONES: Record<LeadStatus, Tone> = {
  new: "neutral",
  researched: "info",
  in_sequence: "info",
  completed: "success",
  bounced: "danger",
  unsubscribed: "danger",
};

const RESEARCH_TONES: Record<ResearchStatus, Tone> = {
  pending: "neutral",
  in_progress: "info",
  completed: "success",
  failed: "danger",
  needs_review: "warning",
};

const CAMPAIGN_TONES: Record<CampaignStatus, Tone> = {
  draft: "neutral",
  generating: "info",
  review: "warning",
  active: "success",
  paused: "warning",
  completed: "neutral",
};

const EMAIL_TONES: Record<EmailStatus, Tone> = {
  draft: "neutral",
  approved: "info",
  scheduled: "info",
  sent: "success",
  opened: "success",
  clicked: "success",
  replied: "success",
  bounced: "danger",
  failed: "danger",
};

const label = (s: string) => s.replace(/_/g, " ");

export const LeadStatusBadge = ({ status }: { status: LeadStatus }) => (
  <Badge tone={LEAD_TONES[status] ?? "neutral"}>{label(status)}</Badge>
);

export const ResearchStatusBadge = ({ status }: { status: ResearchStatus }) => (
  <Badge tone={RESEARCH_TONES[status] ?? "neutral"}>{label(status)}</Badge>
);

export const CampaignStatusBadge = ({ status }: { status: CampaignStatus }) => (
  <Badge tone={CAMPAIGN_TONES[status] ?? "neutral"}>{label(status)}</Badge>
);

export const EmailStatusBadge = ({ status }: { status: EmailStatus }) => (
  <Badge tone={EMAIL_TONES[status] ?? "neutral"}>{label(status)}</Badge>
);
