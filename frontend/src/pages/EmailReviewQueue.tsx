import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useCampaign,
  useCampaignEmails,
  useApproveEmail,
  useUpdateEmail,
  useRegenerateEmail,
  useApproveAllEmails,
  useLaunchCampaign,
} from "../hooks/useCampaigns";
import Badge, { statusVariant } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card, { CardHeader, CardBody } from "../components/ui/Card";
import { FullPageSpinner } from "../components/ui/Spinner";
import ResearchPanel from "../components/leads/ResearchPanel";
import {
  Check,
  CheckCheck,
  Pencil,
  RefreshCw,
  Rocket,
  ChevronDown,
  ChevronRight,
  FileText,
  X,
  Eye,
} from "lucide-react";
import type { GeneratedEmail } from "../types/campaign";

export default function EmailReviewQueue() {
  const { id: campaignId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [researchLeadId, setResearchLeadId] = useState<string | null>(null);

  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId!);
  const { data: emails, isLoading: emailsLoading } = useCampaignEmails(campaignId!);

  const approveEmail = useApproveEmail(campaignId!);
  const updateEmail = useUpdateEmail(campaignId!);
  const regenerateEmail = useRegenerateEmail(campaignId!);
  const approveAll = useApproveAllEmails(campaignId!);
  const launchCampaign = useLaunchCampaign();

  if (campaignLoading || emailsLoading) return <FullPageSpinner label="Loading review queue..." />;
  if (!campaign || !emails) return null;

  // Backend returns { emails: { [lead_id]: GeneratedEmail[] }, total: number }
  // "grouped" is the lead-keyed dict directly; flatten to a list for stats
  const grouped: Record<string, GeneratedEmail[]> = (emails as any).emails ?? {};
  const allEmails: GeneratedEmail[] = Object.values(grouped).flat();
  const draftCount = allEmails.filter((e) => e.status === "draft").length;
  const approvedCount = allEmails.filter((e) => e.status === "approved").length;
  const failedCount = allEmails.filter((e) => e.status === "failed").length;

  const handleLaunch = async () => {
    await launchCampaign.mutateAsync(campaignId!);
    navigate(`/campaigns/${campaignId}/dashboard`);
  };

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">Review Emails</h1>
            <p className="mt-1 text-[13px] text-[var(--color-ink-secondary)]">
              {campaign.name}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCheck size={14} />}
              loading={approveAll.isPending}
              onClick={() => approveAll.mutate()}
              disabled={draftCount === 0}
            >
              Approve All ({draftCount})
            </Button>
            {approvedCount > 0 && (
              <Button
                variant="primary"
                size="sm"
                icon={<Rocket size={14} />}
                loading={launchCampaign.isPending}
                onClick={handleLaunch}
              >
                Launch Campaign
              </Button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="mb-6 flex gap-4">
          <StatCard label="Drafts" count={draftCount} variant="yellow" />
          <StatCard label="Approved" count={approvedCount} variant="green" />
          <StatCard label="Failed" count={failedCount} variant="red" />
        </div>

        {/* Email groups */}
        <div className="space-y-4">
          {Object.entries(grouped).map(([leadId, leadEmails]) => (
            <LeadEmailGroup
              key={leadId}
              leadId={leadId}
              emails={leadEmails}
              campaignId={campaignId!}
              onApprove={(emailId) => approveEmail.mutate(emailId)}
              onRegenerate={(emailId) => regenerateEmail.mutate(emailId)}
              onUpdate={(emailId, payload) => updateEmail.mutate({ emailId, payload })}
              onShowResearch={(id) => setResearchLeadId(id)}
            />
          ))}
        </div>
      </div>

      {/* Research side panel */}
      {researchLeadId && (
        <div className="w-[360px] shrink-0">
          <Card className="sticky top-8">
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-[var(--color-ink-tertiary)]" />
                <span className="text-[13px] font-semibold">Research Data</span>
              </div>
              <button
                onClick={() => setResearchLeadId(null)}
                className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink-primary)]"
              >
                <X size={14} />
              </button>
            </CardHeader>
            <CardBody>
              <ResearchPanel leadId={researchLeadId} researchStatus="completed" />
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ── Stats Card ── */
function StatCard({ label, count, variant }: { label: string; count: number; variant: "yellow" | "green" | "red" }) {
  const colors = {
    yellow: "border-amber-500/20 bg-amber-500/5 text-amber-400",
    green: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
    red: "border-red-500/20 bg-red-500/5 text-red-400",
  };
  return (
    <div className={`flex-1 rounded-xl border px-4 py-3 ${colors[variant]}`}>
      <p className="font-mono text-[20px] font-bold">{count}</p>
      <p className="text-[11px] uppercase tracking-wider opacity-70">{label}</p>
    </div>
  );
}

/* ── Lead Email Group ── */
function LeadEmailGroup({
  leadId,
  emails,
  campaignId: _campaignId,
  onApprove,
  onRegenerate,
  onUpdate,
  onShowResearch,
}: {
  leadId: string;
  emails: GeneratedEmail[];
  campaignId: string;
  onApprove: (id: string) => void;
  onRegenerate: (id: string) => void;
  onUpdate: (id: string, payload: { subject?: string; body?: string }) => void;
  onShowResearch: (leadId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="text-[13px] font-semibold">Lead: {leadId.slice(0, 8)}...</span>
          <span className="text-[12px] text-[var(--color-ink-muted)]">
            {emails.length} email{emails.length > 1 ? "s" : ""}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<FileText size={12} />}
          onClick={(e) => { e.stopPropagation(); onShowResearch(leadId); }}
        >
          Research
        </Button>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.04]">
          {emails
            .sort((a, b) => a.sequence_position - b.sequence_position)
            .map((email) => (
              <EmailCard
                key={email.id}
                email={email}
                onApprove={() => onApprove(email.id)}
                onRegenerate={() => onRegenerate(email.id)}
                onUpdate={(payload) => onUpdate(email.id, payload)}
              />
            ))}
        </div>
      )}
    </Card>
  );
}

/* ── Individual Email Card ── */
function EmailCard({
  email,
  onApprove,
  onRegenerate,
  onUpdate,
}: {
  email: GeneratedEmail;
  onApprove: () => void;
  onRegenerate: () => void;
  onUpdate: (payload: { subject?: string; body?: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState(email.subject);
  const [editBody, setEditBody] = useState(email.body);

  const handleSave = () => {
    onUpdate({ subject: editSubject, body: editBody });
    setEditing(false);
  };

  return (
    <div className="border-b border-white/[0.04] px-5 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">
            Step {email.sequence_position}
          </span>
          <Badge variant={statusVariant(email.status)}>{email.status}</Badge>
        </div>
        <div className="flex gap-1.5">
          {email.status === "draft" && (
            <>
              <Button variant="ghost" size="sm" icon={<Check size={12} />} onClick={onApprove}>
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil size={12} />}
                onClick={() => setEditing(!editing)}
              >
                Edit
              </Button>
              <Button variant="ghost" size="sm" icon={<RefreshCw size={12} />} onClick={onRegenerate}>
                Regenerate
              </Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <input
            value={editSubject}
            onChange={(e) => setEditSubject(e.target.value)}
            className="w-full rounded-lg border border-white/[0.1] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-ink-primary)] outline-none focus:border-[var(--color-accent)]/40"
          />
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={6}
            className="w-full resize-none rounded-lg border border-white/[0.1] bg-[var(--color-surface-2)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--color-ink-primary)] outline-none focus:border-[var(--color-accent)]/40"
          />
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleSave}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-2 text-[13px] font-medium text-[var(--color-ink-primary)]">
            {email.subject}
          </p>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-ink-secondary)]">
            {email.body}
          </p>
        </>
      )}
    </div>
  );
}

