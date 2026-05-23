import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useCampaign,
  useCampaignEmails,
  useApproveEmail,
  useUpdateEmail,
  useApproveAllEmails,
  useLaunchCampaign,
  useRegenerateEmail,
} from "../hooks/useCampaigns";
import Badge, { statusVariant } from "../components/ui/Badge";
import Spinner from "../components/ui/Spinner";
import Button from "../components/ui/Button";
import { FullPageSpinner } from "../components/ui/Spinner";
import ResearchPanel from "../components/leads/ResearchPanel";
import {
  CheckCheck,
  Rocket,
  Filter,
  Clock,
  CheckCircle2,
  Trash2,
  Sparkles,
  Send,
  Eye
} from "lucide-react";
import type { GeneratedEmail } from "../types/campaign";

export default function EmailReviewQueue() {
  const { id: campaignId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId!);
  const { data: emails, isLoading: emailsLoading } = useCampaignEmails(campaignId!);

  const approveEmail = useApproveEmail(campaignId!);
  const updateEmail = useUpdateEmail(campaignId!);
  const approveAll = useApproveAllEmails(campaignId!);
  const launchCampaign = useLaunchCampaign();
  const regenerateEmail = useRegenerateEmail(campaignId!);

  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [showResearch, setShowResearch] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  if (campaignLoading || emailsLoading) return <FullPageSpinner label="Loading review queue..." />;
  if (!campaign || !emails) return null;

  const grouped = emails.emails ?? {};
  const allEmails: { leadId: string; email: GeneratedEmail }[] = Object.entries(grouped).flatMap(([leadId, leadEmails]) => 
    leadEmails.map((email) => ({ leadId, email }))
  );
  
  const draftCount = allEmails.filter(({ email }) => email.status === "draft").length;
  const approvedCount = allEmails.filter(({ email }) => email.status === "approved").length;

  const handleLaunch = async () => {
    await launchCampaign.mutateAsync(campaignId!);
    navigate(`/campaigns/${campaignId}/dashboard`);
  };

  const selectedItem = allEmails.find((item) => item.email.id === selectedEmailId) || allEmails[0];

  const handleSelect = (id: string, subject: string, body: string) => {
    setSelectedEmailId(id);
    setEditSubject(subject);
    setEditBody(body);
    setShowResearch(false);
  };

  const handleSave = () => {
    if (selectedItem) {
      updateEmail.mutate({ emailId: selectedItem.email.id, payload: { subject: editSubject, body: editBody } });
    }
  };

  const handleApprove = () => {
    if (selectedItem) {
      handleSave();
      approveEmail.mutate(selectedItem.email.id);
    }
  };

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col">
      {/* Workspace Header */}
      <div className="mb-6 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-3 font-headline-lg text-headline-lg font-bold tracking-tight text-on-surface">
            Email Review Queue
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 font-label-sm text-label-sm text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
              {draftCount} Pending
            </span>
          </h2>
          <p className="mt-1 max-w-2xl font-body-md text-body-md text-on-surface-variant">
            Review and approve AI-generated outreach emails before sending.
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

      {/* Two Column Layout */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row">
        {/* Left Column: Queue List */}
        <div className="flex flex-shrink-0 flex-col overflow-hidden rounded-xl border border-outline/10 bg-[var(--color-surface-2)] lg:w-[40%] lg:max-w-md">
          {/* List Header/Filters */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-outline/10 bg-surface/50 p-4 backdrop-blur">
            <div className="flex gap-2">
              <button className="rounded-full border border-outline/10 bg-surface-container-high px-3 py-1 text-xs font-medium text-on-surface">
                All ({allEmails.length})
              </button>
            </div>
            <button className="text-on-surface-variant hover:text-on-surface">
              <Filter size={16} />
            </button>
          </div>

          {/* Scrollable List */}
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {allEmails.map(({ leadId, email }) => {
              const isSelected = selectedItem?.email.id === email.id;
              return (
                <div
                  key={email.id}
                  onClick={() => handleSelect(email.id, email.subject, email.body)}
                  className={`group relative cursor-pointer rounded-lg border p-4 transition-all ${
                    isSelected
                      ? "border-primary bg-surface-bright shadow-[0_0_15px_rgba(59,130,246,0.15)] ai-indicator"
                      : "border-outline/5 bg-surface hover:bg-surface-container-high"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-sm font-bold transition-colors ${isSelected ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' : 'bg-surface-container-highest text-on-surface-variant group-hover:text-on-surface'}`}>
                        {leadId.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-label-md text-label-md font-semibold text-on-surface">
                          Lead: {leadId.slice(0, 8)}...
                        </h3>
                        <p className="text-[11px] text-on-surface-variant">Step {email.sequence_position}</p>
                      </div>
                    </div>
                    <Badge variant={statusVariant(email.status)}>{email.status}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 font-body-md text-body-md text-sm text-on-surface-variant">
                    {email.subject}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[10px] text-outline-variant">
                    <Clock size={12} /> Generated
                  </div>
                </div>
              );
            })}
            {allEmails.length === 0 && (
               <div className="p-8 text-center text-on-surface-variant">No emails found.</div>
            )}
          </div>
        </div>

        {/* Right Column: Editor View */}
        {selectedItem ? (
          <div className="relative flex flex-col overflow-hidden rounded-xl border border-outline/10 bg-[var(--color-surface-2)] shadow-2xl lg:w-[60%]">
            <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-primary/5 blur-3xl"></div>
            
            {showResearch ? (
              <div className="z-10 flex flex-1 flex-col overflow-hidden bg-surface-container/30 backdrop-blur-xl">
                 <div className="flex items-center justify-between border-b border-outline/10 bg-surface/50 p-6 backdrop-blur flex-shrink-0">
                    <h3 className="font-headline-sm text-on-surface text-headline-sm">Research Data for {selectedItem.leadId.slice(0, 8)}...</h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowResearch(false)}>Back to Editor</Button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-6">
                    <ResearchPanel leadId={selectedItem.leadId} researchStatus="completed" />
                 </div>
              </div>
            ) : (
              <>
                {/* Editor Header Info */}
                <div className="z-10 flex-shrink-0 border-b border-outline/10 bg-surface/50 p-6 backdrop-blur">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-label-md text-label-md text-on-surface-variant">Drafting Outreach</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => setShowResearch(true)}>View Research</Button>
                      <div className="flex items-center gap-1 rounded border border-outline/10 bg-surface-container-highest px-2 py-1 text-xs text-on-surface">
                        <CheckCircle2 size={12} className="text-emerald-400" /> Auto-saved
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="w-16 flex-shrink-0 font-medium uppercase tracking-wider text-outline text-xs">To:</span>
                      <div className="flex flex-1 items-center gap-2 rounded-md border border-outline/10 bg-[#050505] px-3 py-1.5 text-on-surface">
                        <span className="font-medium">Lead {selectedItem.leadId.slice(0, 8)}...</span>
                      </div>
                    </div>
                    <div className="group flex items-center gap-3 text-sm">
                      <span className="w-16 flex-shrink-0 font-medium uppercase tracking-wider text-outline text-xs">Subject:</span>
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={editSubject || selectedItem.email.subject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          onBlur={handleSave}
                          className="w-full rounded-md border border-outline/10 bg-[#050505] px-3 py-2 font-medium text-on-surface transition-all outline-none focus:border-primary focus:ring-1 focus:ring-primary/50"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rich Text Editor Area */}
                <div className="z-10 flex-1 overflow-y-auto bg-surface-container/30 p-6 backdrop-blur-xl">
                  {/* AI Context Bubble */}
                  <div className="mb-4 flex items-start gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 text-sm">
                    <Sparkles size={16} className="flex-shrink-0 text-indigo-400" />
                    <p className="leading-relaxed text-on-surface-variant">
                      <strong className="font-medium text-indigo-300">AI Generation Context:</strong> Derived from research insights. Tailored to the lead's profile.
                    </p>
                  </div>

                  <textarea
                    value={editBody || selectedItem.email.body}
                    onChange={(e) => setEditBody(e.target.value)}
                    onBlur={handleSave}
                    className="h-full min-h-[300px] w-full resize-none border-none bg-transparent font-body-lg text-body-lg leading-relaxed text-on-surface outline-none"
                  />
                </div>

                {/* Action Footer */}
                <div className="z-10 flex flex-shrink-0 items-center justify-between border-t border-outline/10 bg-[#121212] p-4">
                  <button className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error">
                    <Trash2 size={16} /> Discard
                  </button>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        if (selectedItem) {
                           regenerateEmail.mutate(selectedItem.email.id);
                        }
                      }}
                      disabled={regenerateEmail.isPending}
                      className="flex items-center gap-2 rounded-md border border-outline/15 bg-[#050505] px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high ai-indicator disabled:opacity-50"
                    >
                      {regenerateEmail.isPending ? <Spinner size={16} /> : <Sparkles size={16} className="text-primary" />}
                      Regenerate
                    </button>
                    {selectedItem.email.status === "draft" && (
                      <button onClick={handleApprove} className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-white shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                        <Send size={16} /> Approve
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center lg:w-[60%] border border-outline/10 rounded-xl bg-[var(--color-surface-2)]">
            <p className="text-on-surface-variant">Select an email to review</p>
          </div>
        )}
      </div>
    </div>
  );
}
