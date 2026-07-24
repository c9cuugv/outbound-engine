import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Check, RefreshCw, Save } from "lucide-react";
import {
  useCampaign,
  useCampaignEmails,
  useApproveEmail,
  useApproveAllEmails,
  useUpdateEmail,
  useRegenerateEmail,
} from "../hooks/useCampaigns";
import type { GeneratedEmail } from "../types/campaign";
import Button from "../components/ui/Button";
import { EmailStatusBadge } from "../components/ui/Badge";
import { PageHeader, Card, Input, Textarea } from "../components/ui/Primitives";
import { SkeletonRows, EmptyState, ErrorState, Spinner } from "../components/ui/Feedback";

function EmailCard({ campaignId, email }: { campaignId: string; email: GeneratedEmail }) {
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);

  const approve = useApproveEmail(campaignId);
  const update = useUpdateEmail(campaignId);
  const regenerate = useRegenerateEmail(campaignId);

  const dirty = subject !== email.subject || body !== email.body;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="label-overline">Step {email.sequence_position}</span>
          <EmailStatusBadge status={email.status} />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => regenerate.mutate(email.id)}
            loading={regenerate.isPending}
            title="Ask the AI for a fresh draft"
          >
            <RefreshCw size={14} />
            Regenerate
          </Button>
          {dirty && (
            <Button
              size="sm"
              onClick={() => update.mutate({ emailId: email.id, payload: { subject, body } })}
              loading={update.isPending}
            >
              <Save size={14} />
              Save edits
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={() => approve.mutate(email.id)}
            loading={approve.isPending}
            disabled={email.status !== "draft"}
          >
            <Check size={14} />
            Approve
          </Button>
        </div>
      </div>

      <Input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        aria-label="Subject"
        className="font-medium"
      />
      <Textarea
        rows={9}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Body"
        className="font-mono text-[13px]"
      />

      {email.was_manually_edited && (
        <p className="text-[12px] text-ink-subtle">Edited from the original draft.</p>
      )}
    </Card>
  );
}

export default function EmailReviewQueue() {
  const { id = "" } = useParams();
  const campaign = useCampaign(id);
  const emails = useCampaignEmails(id, "draft");
  const approveAll = useApproveAllEmails(id);

  const groups = emails.data?.emails ?? {};
  const leadIds = Object.keys(groups);
  const total = emails.data?.total ?? 0;

  // The worker is still writing drafts — useCampaign polls while generating.
  const generating = campaign.data?.status === "generating";

  return (
    <>
      <PageHeader
        title="Review drafts"
        subtitle={campaign.data ? campaign.data.name : undefined}
        actions={
          <>
            <Link to={`/campaigns/${id}/dashboard`}>
              <Button>Dashboard</Button>
            </Link>
            {total > 0 && (
              <Button
                variant="primary"
                onClick={() => approveAll.mutate()}
                loading={approveAll.isPending}
              >
                <Check size={15} />
                Approve all ({total})
              </Button>
            )}
          </>
        }
      />

      {generating && (
        <div className="mb-4 flex items-center gap-2.5 rounded-md border border-info/25 bg-info-soft px-3 py-2.5 text-[13px] text-info">
          <Spinner className="border-info" />
          Generating drafts. This page updates as they land.
        </div>
      )}

      {emails.isLoading && <SkeletonRows rows={4} />}
      {emails.error && <ErrorState error={emails.error} onRetry={() => emails.refetch()} />}

      {!emails.isLoading && !emails.error && leadIds.length === 0 && (
        <EmptyState
          title={generating ? "No drafts yet" : "Nothing left to review"}
          hint={
            generating
              ? "The AI is still writing. Drafts appear here as each one completes."
              : "Every draft in this campaign has been approved."
          }
          action={
            !generating ? (
              <Link to={`/campaigns/${id}/dashboard`}>
                <Button variant="primary">Go to dashboard</Button>
              </Link>
            ) : undefined
          }
        />
      )}

      <div className="space-y-6">
        {leadIds.map((leadId) => {
          const leadEmails = groups[leadId] ?? [];
          return (
            <section key={leadId}>
              <h2 className="label-overline mb-2">
                Lead {leadId.slice(0, 8)} · {leadEmails.length} email(s)
              </h2>
              <div className="space-y-3">
                {leadEmails.map((email) => (
                  <EmailCard key={email.id} campaignId={id} email={email} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
