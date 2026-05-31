import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useCampaigns } from "../hooks/useCampaigns";
import Badge, { statusVariant } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";
import { Rocket, BarChart3, Users, Calendar } from "lucide-react";
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="mb-2 font-display-lg text-display-lg font-bold tracking-tight text-on-surface">Campaigns</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
            {campaigns?.length ?? 0} campaign{campaigns?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div>
          <button
            onClick={() => navigate('/campaigns/new')}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary shadow-sm transition-all duration-200 hover:bg-primary-container hover:text-on-primary-container hover:shadow active:scale-[0.98]"
          >
            Create Campaign
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!campaigns || campaigns.length === 0 ? (
        <div className="rounded-xl border border-outline/10 bg-surface-container/40 py-20 text-center shadow-sm backdrop-blur-sm">
          <BarChart3 size={40} className="mx-auto mb-4 text-on-surface-variant opacity-60" />
          <p className="font-body-lg text-body-lg font-medium text-on-surface">No campaigns yet</p>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Create a campaign to get started.
          </p>
          <button
            onClick={() => navigate('/campaigns/new')}
            className="mx-auto mt-5 flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary shadow-sm transition-all duration-200 hover:bg-primary-container hover:text-on-primary-container"
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline/10 bg-surface-container/40 shadow-sm backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline/10 bg-surface-container-low/50">
                  {["Name", "Status", "Leads", "Created", "Actions"].map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-4 py-3 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign: Campaign, i: number) => (
                  <motion.tr
                    key={campaign.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: i * 0.03, ease: "easeOut" }}
                    className="border-b border-outline/5 transition-colors hover:bg-surface-container-high/50"
                  >
                    {/* Name */}
                    <td className="px-4 py-3">
                      <p className="font-body-md text-body-md font-medium text-on-surface">
                        {campaign.name}
                      </p>
                      {campaign.product_name && (
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          {campaign.product_name}
                        </p>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(campaign.status)}>
                        {campaign.status}
                      </Badge>
                    </td>

                    {/* Lead count */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                        <Users size={16} />
                        {campaign.total_leads}
                      </div>
                    </td>

                    {/* Created date */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                        <Calendar size={16} />
                        {formatDate(campaign.created_at)}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(campaign.status === "review" || campaign.status === "generating") && (
                          <button
                            onClick={() => navigate(`/campaigns/${campaign.id}/review`)}
                            className="flex items-center gap-1.5 rounded bg-surface-container-high px-3 py-1.5 font-label-sm text-on-surface transition-colors hover:bg-surface-container-highest"
                          >
                            <Rocket size={14} />
                            Continue Review
                          </button>
                        )}
                        {(campaign.status === "active" ||
                          campaign.status === "paused" ||
                          campaign.status === "completed") && (
                          <button
                            onClick={() => navigate(`/campaigns/${campaign.id}/dashboard`)}
                            className="flex items-center gap-1.5 rounded bg-surface-container-high px-3 py-1.5 font-label-sm text-on-surface transition-colors hover:bg-surface-container-highest"
                          >
                            <BarChart3 size={14} />
                            Dashboard
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
