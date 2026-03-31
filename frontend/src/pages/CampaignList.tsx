import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useCampaigns } from "../hooks/useCampaigns";
import Card, { CardBody } from "../components/ui/Card";
import Badge, { statusVariant } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";
import { Rocket, BarChart3, Users, Calendar, Plus } from "lucide-react";
import type { Campaign } from "../types/campaign";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CampaignList() {
  const navigate = useNavigate();
  const { data: campaigns, isLoading, isError } = useCampaigns();

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-3">
        <p className="text-[13px] text-[var(--color-danger)]">Failed to load campaigns.</p>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Campaigns</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-ink-secondary)]">
            {campaigns?.length ?? 0} campaign{campaigns?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => navigate("/campaigns/new")}
        >
          New Campaign
        </Button>
      </div>

      {/* Empty state */}
      {!campaigns || campaigns.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center py-16 text-center">
            <BarChart3 size={36} className="mb-4 text-[var(--color-ink-muted)]" />
            <p className="text-[14px] font-medium text-[var(--color-ink-primary)]">No campaigns yet</p>
            <p className="mt-1 text-[13px] text-[var(--color-ink-secondary)]">
              Create your first campaign to start sending personalized outreach.
            </p>
            <Button
              variant="primary"
              size="sm"
              className="mt-5"
              icon={<Plus size={13} />}
              onClick={() => navigate("/campaigns/new")}
            >
              New Campaign
            </Button>
          </CardBody>
        </Card>
      ) : (
        <Card>
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 border-b border-white/[0.06] px-5 py-3">
            {["Name", "Status", "Leads", "Created", "Actions"].map((col) => (
              <span
                key={col}
                className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"
              >
                {col}
              </span>
            ))}
          </div>

          {/* Table rows */}
          {campaigns.map((campaign: Campaign, i: number) => (
            <motion.div
              key={campaign.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: i * 0.03, ease: "easeOut" }}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 border-b border-white/[0.04] px-5 py-3.5 last:border-b-0"
            >
              {/* Name */}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[var(--color-ink-primary)]">
                  {campaign.name}
                </p>
                {campaign.product_name && (
                  <p className="truncate text-[11px] text-[var(--color-ink-muted)]">
                    {campaign.product_name}
                  </p>
                )}
              </div>

              {/* Status */}
              <div>
                <Badge variant={statusVariant(campaign.status)}>
                  {campaign.status}
                </Badge>
              </div>

              {/* Lead count */}
              <div className="flex items-center gap-1.5 text-[13px] text-[var(--color-ink-secondary)]">
                <Users size={12} className="shrink-0 text-[var(--color-ink-muted)]" />
                {campaign.total_leads}
              </div>

              {/* Created date */}
              <div className="flex items-center gap-1.5 text-[13px] text-[var(--color-ink-secondary)]">
                <Calendar size={12} className="shrink-0 text-[var(--color-ink-muted)]" />
                {formatDate(campaign.created_at)}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {(campaign.status === "review" || campaign.status === "generating") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Rocket size={12} />}
                    onClick={() => navigate(`/campaigns/${campaign.id}/review`)}
                  >
                    Continue Review
                  </Button>
                )}
                {(campaign.status === "active" ||
                  campaign.status === "paused" ||
                  campaign.status === "completed") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<BarChart3 size={12} />}
                    onClick={() => navigate(`/campaigns/${campaign.id}/dashboard`)}
                  >
                    View Dashboard
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </Card>
      )}
    </div>
  );
}
