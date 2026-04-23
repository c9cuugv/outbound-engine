import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Users, BarChart3, Eye, MessageSquare } from "lucide-react";
import { fetchCampaigns } from "../api/campaigns";
import { fetchLeads } from "../api/leads";
import Card, { CardBody, CardHeader } from "../components/ui/Card";
import Badge, { statusVariant } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { pct, relativeTime } from "../utils/format";
import type { Campaign } from "../types/campaign";

export default function DashboardHome() {
  const navigate = useNavigate();

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  });

  const { data: leadsPage } = useQuery({
    queryKey: ["leads", "count"],
    queryFn: () => fetchLeads({ page: 1, per_page: 1 }),
  });

  const totalLeads = leadsPage?.total_count ?? 0;
  const activeCampaigns = campaigns?.filter((c) => c.status === "active").length ?? 0;
  const totalSent = campaigns?.reduce((s, c) => s + c.emails_sent, 0) ?? 0;
  const totalOpened = campaigns?.reduce((s, c) => s + c.emails_opened, 0) ?? 0;
  const totalReplied = campaigns?.reduce((s, c) => s + c.emails_replied, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-ink-primary)]">Dashboard</h1>
          <p className="text-[13px] text-[var(--color-ink-secondary)]">Overview of your outreach</p>
        </div>
        <Button variant="primary" onClick={() => navigate("/campaigns/new")}>
          <Plus size={14} className="mr-1.5" />
          New Campaign
        </Button>
      </div>

      {/* KPI cards row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          icon={<Users size={16} />}
          label="Total Contacts"
          value={totalLeads.toLocaleString()}
          color="text-blue-400"
        />
        <KpiCard
          icon={<BarChart3 size={16} />}
          label="Active Campaigns"
          value={String(activeCampaigns)}
          color="text-[var(--color-accent)]"
        />
        <KpiCard
          icon={<Eye size={16} />}
          label="Avg Open Rate"
          value={pct(totalOpened, totalSent)}
          color="text-emerald-400"
        />
        <KpiCard
          icon={<MessageSquare size={16} />}
          label="Avg Reply Rate"
          value={pct(totalReplied, totalSent)}
          color="text-purple-400"
        />
      </div>

      {/* Recent campaigns table */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-[var(--color-ink-primary)]">
            Recent Campaigns
          </span>
          <Button variant="ghost" size="sm" onClick={() => navigate("/campaigns")}>
            View all
          </Button>
        </CardHeader>
        <CardBody className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {["Name", "Status", "Sent", "Open Rate", "Reply Rate", "Created"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(campaigns ?? []).slice(0, 5).map((c: Campaign) => (
                <tr
                  key={c.id}
                  onClick={() =>
                    navigate(
                      c.status === "draft" ||
                      c.status === "generating" ||
                      c.status === "review"
                        ? `/campaigns/${c.id}/review`
                        : `/campaigns/${c.id}/dashboard`,
                    )
                  }
                  className="cursor-pointer border-b border-white/[0.03] transition-colors hover:bg-[var(--color-surface-3)]"
                  style={{ borderLeft: "2px solid transparent" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderLeftColor = "rgba(0,180,216,0.4)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderLeftColor = "transparent")
                  }
                >
                  <td className="px-4 py-3 text-[13px] font-medium text-[var(--color-ink-primary)]">
                    {c.name}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--color-ink-secondary)]">
                    {c.emails_sent.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-emerald-400">
                    {pct(c.emails_opened, c.emails_sent)}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[var(--color-accent)]">
                    {pct(c.emails_replied, c.emails_sent)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[var(--color-ink-muted)]">
                    {relativeTime(c.created_at)}
                  </td>
                </tr>
              ))}
              {(campaigns?.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-[13px] text-[var(--color-ink-muted)]"
                  >
                    No campaigns yet —{" "}
                    <button
                      onClick={() => navigate("/campaigns/new")}
                      className="text-[var(--color-accent)] hover:underline"
                    >
                      create your first
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card className="px-5 py-4">
      <div
        className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] ${color}`}
      >
        {icon}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p className="mt-1 text-[28px] font-semibold leading-none text-[var(--color-ink-primary)]">
        {value}
      </p>
    </Card>
  );
}
