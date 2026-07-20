import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchLead, fetchLeadResearch } from "../api/leads";
import { fetchLeadTimeline, type TimelineEvent } from "../api/timeline";
import Badge, { statusVariant } from "../components/ui/Badge";
import { FullPageSpinner } from "../components/ui/Spinner";
import {
  ArrowLeft,
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Building2,
  User,
  Mail,
  Briefcase,
} from "lucide-react";

interface ResearchData {
  company_summary: string;
  industry: string;
  company_size_estimate: string;
  tech_stack_signals: string[];
  potential_pain_points: string[];
  personalization_hooks: string[];
  confidence_score: number;
}

/* ── Event display config ── */

const EVENT_CONFIG: Record<
  string,
  { icon: typeof Send; label: string; color: string; bgColor: string; borderColor: string }
> = {
  email_generated: {
    icon: Sparkles,
    label: "Email Generated",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20",
  },
  email_sent: {
    icon: Send,
    label: "Email Sent",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  email_opened: {
    icon: Eye,
    label: "Email Opened",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  email_clicked: {
    icon: MousePointerClick,
    label: "Link Clicked",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
  },
  email_replied: {
    icon: MessageSquare,
    label: "Reply Received",
    color: "text-[var(--color-accent)]",
    bgColor: "bg-[var(--color-accent)]/10",
    borderColor: "border-[var(--color-accent)]/20",
  },
  email_bounced: {
    icon: AlertTriangle,
    label: "Email Bounced",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
};

/* ── Main Component ── */

export default function LeadTimeline() {
  const { id: campaignId, leadId } = useParams<{ id: string; leadId: string }>();
  const navigate = useNavigate();
  const [researchOpen, setResearchOpen] = useState(false);

  const { data: lead, isLoading: leadLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => fetchLead(leadId!),
    enabled: !!leadId,
  });

  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ["lead-timeline", campaignId, leadId],
    queryFn: () => fetchLeadTimeline(campaignId!, leadId!),
    enabled: !!campaignId && !!leadId,
  });

  const { data: research } = useQuery({
    queryKey: ["lead-research", leadId],
    queryFn: () => fetchLeadResearch(leadId!),
    enabled: !!leadId,
  });

  if (leadLoading || timelineLoading) {
    return <FullPageSpinner label="Loading timeline..." />;
  }

  if (!lead || !timelineData) return null;

  const timeline = timelineData.timeline;

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col">
      {/* Header */}
      <div className="mb-6 shrink-0">
        <button
          onClick={() => navigate(`/campaigns/${campaignId}/dashboard`)}
          className="mb-4 flex items-center gap-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <ArrowLeft size={16} />
          Back to Campaign Dashboard
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight text-on-surface">
              {lead.first_name} {lead.last_name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
              {lead.title && (
                <span className="flex items-center gap-1.5">
                  <Briefcase size={14} className="text-on-surface-variant/60" />
                  {lead.title}
                </span>
              )}
              {lead.company_name && (
                <span className="flex items-center gap-1.5">
                  <Building2 size={14} className="text-on-surface-variant/60" />
                  {lead.company_name}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Mail size={14} className="text-on-surface-variant/60" />
                {lead.email}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={statusVariant(lead.status)}>
              {lead.status}
            </Badge>
            <Badge variant={statusVariant(lead.research_status)}>
              Research: {lead.research_status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 gap-6 overflow-hidden">
        {/* Left: Timeline */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-outline/10 bg-surface-container/40 shadow-sm backdrop-blur-sm">
          <div className="flex shrink-0 items-center justify-between border-b border-outline/10 p-5">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">
              Activity Timeline
            </h3>
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              {timeline.length} events
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {timeline.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-highest">
                  <Send size={20} className="text-on-surface-variant" />
                </div>
                <p className="text-sm text-on-surface-variant">No activity yet for this lead.</p>
              </div>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-5 top-0 bottom-0 w-px bg-outline/10" />

                <div className="space-y-0">
                  {timeline.map((event, i) => (
                    <TimelineEventRow key={`${event.type}-${event.timestamp}-${i}`} event={event} isLast={i === timeline.length - 1} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Research Panel */}
        <div className="w-[360px] shrink-0 overflow-y-auto rounded-xl border border-outline/10 bg-surface-container/40 shadow-sm backdrop-blur-sm">
          <button
            onClick={() => setResearchOpen(!researchOpen)}
            className="flex w-full items-center justify-between border-b border-outline/10 p-5 text-left transition-colors hover:bg-surface-container-highest/30"
          >
            <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
              <User size={16} className="text-primary" />
              Research Summary
            </h3>
            {researchOpen ? (
              <ChevronUp size={16} className="text-on-surface-variant" />
            ) : (
              <ChevronDown size={16} className="text-on-surface-variant" />
            )}
          </button>

          <AnimatePresence>
            {researchOpen && research && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <ResearchSummary research={research} />
              </motion.div>
            )}
          </AnimatePresence>

          {!researchOpen && (
            <div className="p-5">
              <LeadInfoCard lead={lead} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Timeline Event Row ── */

function TimelineEventRow({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const config = EVENT_CONFIG[event.type] ?? {
    icon: Send,
    label: event.type,
    color: "text-on-surface-variant",
    bgColor: "bg-surface-container-highest",
    borderColor: "border-outline/10",
  };
  const Icon = config.icon;
  const timeAgo = getRelativeTime(event.timestamp);
  const absTime = new Date(event.timestamp).toLocaleString();

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className={`relative flex items-start gap-4 pb-6 ${isLast ? "" : ""}`}
    >
      {/* Icon node */}
      <div
        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${config.borderColor} ${config.bgColor}`}
      >
        <Icon size={16} className={config.color} />
      </div>

      {/* Content */}
      <div className="flex-1 pt-1">
        <div className="flex items-center justify-between">
          <span className="font-label-md text-label-md font-semibold text-on-surface">
            {config.label}
          </span>
          <span
            className="font-label-sm text-label-sm text-on-surface-variant cursor-default"
            title={absTime}
          >
            {timeAgo}
          </span>
        </div>

        {/* Event-specific data */}
        <EventDetails event={event} />
      </div>
    </motion.div>
  );
}

/* ── Event-specific detail rendering ── */

function EventDetails({ event }: { event: TimelineEvent }) {
  const { data } = event;

  switch (event.type) {
    case "email_generated":
      return (
        <div className="mt-1.5">
          {data.subject && (
            <p className="text-sm text-on-surface-variant">
              Subject: <span className="text-on-surface">{String(data.subject)}</span>
            </p>
          )}
          {data.step != null && (
            <span className="mt-1 inline-block rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-400">
              Step {String(data.step)}
            </span>
          )}
        </div>
      );

    case "email_sent":
      return data.subject ? (
        <p className="mt-1 text-sm text-on-surface-variant">
          Subject: <span className="text-on-surface">{String(data.subject)}</span>
        </p>
      ) : null;

    case "email_opened":
      return (
        <p className="mt-1 text-sm text-on-surface-variant">
          Opened {data.open_count ? `${String(data.open_count)} time${Number(data.open_count) > 1 ? "s" : ""}` : ""}
        </p>
      );

    case "email_clicked":
      return (
        <p className="mt-1 text-sm text-on-surface-variant">
          {data.click_count ? `${String(data.click_count)} click${Number(data.click_count) > 1 ? "s" : ""}` : "Link clicked"}
        </p>
      );

    case "email_replied":
      return (
        <div className="mt-1.5">
          {data.preview ? (
            <ReplyPreview text={String(data.preview)} />
          ) : (
            <p className="text-sm text-on-surface-variant">Reply received</p>
          )}
        </div>
      );

    case "email_bounced":
      return (
        <p className="mt-1 text-sm text-red-400">
          {data.bounce_type === "hard" ? "Hard bounce — address invalid" : "Soft bounce — temporary failure"}
        </p>
      );

    default:
      return null;
  }
}

/* ── Reply Preview (truncate + expand) ── */

function ReplyPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > 200;

  return (
    <div className="rounded-lg border border-outline/10 bg-surface-container-highest/50 p-3">
      <p className="text-sm leading-relaxed text-on-surface-variant">
        {expanded || !truncated ? text : `${text.slice(0, 200)}...`}
      </p>
      {truncated && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs font-medium text-primary hover:text-primary/80"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/* ── Lead Info Card ── */

function LeadInfoCard({ lead }: { lead: { first_name: string; last_name: string; email: string; company_name: string | null; title: string | null; company_domain: string | null; status: string; tags: string[] } }) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <InfoRow label="Name" value={`${lead.first_name} ${lead.last_name}`} />
        <InfoRow label="Email" value={lead.email} />
        {lead.company_name && <InfoRow label="Company" value={lead.company_name} />}
        {lead.title && <InfoRow label="Title" value={lead.title} />}
        {lead.company_domain && <InfoRow label="Domain" value={lead.company_domain} />}
      </div>
      {lead.tags && lead.tags.length > 0 && (
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            Tags
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {lead.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <span className="font-body-md text-body-md text-on-surface">{value}</span>
    </div>
  );
}

/* ── Research Summary ── */

function ResearchSummary({ research }: { research: ResearchData }) {
  const confidenceColor =
    research.confidence_score >= 0.8
      ? "text-emerald-400"
      : research.confidence_score >= 0.6
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="space-y-4 p-5">
      {/* Confidence */}
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          Confidence
        </span>
        <span className={`font-label-md text-label-md font-bold ${confidenceColor}`}>
          {Math.round(research.confidence_score * 100)}%
        </span>
      </div>

      {/* Summary */}
      <div>
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          Company Summary
        </span>
        <p className="mt-1 text-sm leading-relaxed text-on-surface">{research.company_summary}</p>
      </div>

      {/* Industry & Size */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Industry</span>
          <p className="mt-0.5 text-sm text-on-surface">{research.industry}</p>
        </div>
        <div>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Size</span>
          <p className="mt-0.5 text-sm text-on-surface">{research.company_size_estimate}</p>
        </div>
      </div>

      {/* Tech Stack */}
      {research.tech_stack_signals.length > 0 && (
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            Tech Stack
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {research.tech_stack_signals.map((tech) => (
              <span
                key={tech}
                className="rounded-full bg-surface-container-highest px-2 py-0.5 text-[11px] font-medium text-on-surface"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pain Points */}
      {research.potential_pain_points.length > 0 && (
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            Pain Points
          </span>
          <ul className="mt-1.5 space-y-1">
            {research.potential_pain_points.map((pp) => (
              <li key={pp} className="flex items-start gap-2 text-sm text-on-surface-variant">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                {pp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Personalization Hooks */}
      {research.personalization_hooks.length > 0 && (
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            Personalization Hooks
          </span>
          <ul className="mt-1.5 space-y-1">
            {research.personalization_hooks.map((hook) => (
              <li key={hook} className="flex items-start gap-2 text-sm text-on-surface-variant">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {hook}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Relative time helper ── */

function getRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
