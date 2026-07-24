import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Send, Eye, MousePointerClick, Reply, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fetchLeadTimeline } from "../api/timeline";
import { PageHeader, Card } from "../components/ui/Primitives";
import { Badge, type Tone } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { SkeletonRows, EmptyState, ErrorState } from "../components/ui/Feedback";

/* Event kinds emitted by backend/app/api/v1/analytics.py:142 */
const EVENTS: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  email_generated: { label: "Draft generated", tone: "neutral", icon: FileText },
  email_sent: { label: "Sent", tone: "info", icon: Send },
  email_opened: { label: "Opened", tone: "success", icon: Eye },
  email_clicked: { label: "Clicked", tone: "success", icon: MousePointerClick },
  email_replied: { label: "Replied", tone: "warning", icon: Reply },
  email_bounced: { label: "Bounced", tone: "danger", icon: AlertTriangle },
};

export default function LeadTimeline() {
  const { id = "", leadId = "" } = useParams();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["lead-timeline", id, leadId],
    queryFn: () => fetchLeadTimeline(id, leadId),
    enabled: Boolean(id && leadId),
  });

  const events = data?.timeline ?? [];

  return (
    <>
      <PageHeader
        title="Lead timeline"
        subtitle="Every event for this lead in this campaign, oldest first."
        actions={
          <Link to={`/campaigns/${id}/dashboard`}>
            <Button>
              <ArrowLeft size={15} />
              Back to campaign
            </Button>
          </Link>
        }
      />

      {isLoading && <SkeletonRows rows={5} />}
      {error && <ErrorState error={error} onRetry={() => refetch()} />}

      {!isLoading && !error && events.length === 0 && (
        <EmptyState
          title="No events yet"
          hint="Once a draft is generated and sent, its full history shows up here."
        />
      )}

      {events.length > 0 && (
        <Card padded={false}>
          <ol className="divide-y divide-line">
            {events.map((e, i) => {
              const meta = EVENTS[e.type] ?? {
                label: e.type.replace(/_/g, " "),
                tone: "neutral" as Tone,
                icon: FileText,
              };
              const Icon = meta.icon;
              return (
                <li key={`${e.type}-${e.timestamp}-${i}`} className="flex gap-3.5 px-4 py-3.5">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-raised text-ink-muted">
                    <Icon size={14} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {typeof e.data?.step === "number" && (
                        <span className="text-[12px] text-ink-subtle">Step {e.data.step}</span>
                      )}
                    </div>

                    {e.data?.subject && (
                      <p className="mt-1.5 truncate text-[13px] text-ink">{e.data.subject}</p>
                    )}
                    {e.data?.preview && (
                      <p className="mt-1 text-[13px] leading-5 text-ink-muted">{e.data.preview}</p>
                    )}

                    <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-ink-subtle">
                      {typeof e.data?.open_count === "number" && e.data.open_count > 0 && (
                        <span>{e.data.open_count} open(s)</span>
                      )}
                      {typeof e.data?.click_count === "number" && e.data.click_count > 0 && (
                        <span>{e.data.click_count} click(s)</span>
                      )}
                      {e.data?.bounce_type && <span>Bounce: {e.data.bounce_type}</span>}
                    </div>
                  </div>

                  <time className="shrink-0 font-mono text-[11px] text-ink-subtle">
                    {new Date(e.timestamp).toLocaleString()}
                  </time>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </>
  );
}
