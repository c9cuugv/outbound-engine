import { useQuery } from "@tanstack/react-query";
import { fetchCampaigns } from "../api/campaigns";
import Card, { CardBody, CardHeader } from "../components/ui/Card";
import Badge, { statusVariant } from "../components/ui/Badge";
import { FullPageSpinner } from "../components/ui/Spinner";
import { pct } from "../utils/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { Campaign } from "../types/campaign";

export default function Analytics() {
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: fetchCampaigns,
  });

  if (isLoading) return <FullPageSpinner label="Loading analytics..." />;

  const chartData = (campaigns ?? []).map((c: Campaign) => ({
    name: c.name.length > 18 ? c.name.slice(0, 18) + "…" : c.name,
    openRate: c.emails_sent > 0 ? parseFloat(((c.emails_opened / c.emails_sent) * 100).toFixed(1)) : 0,
    replyRate: c.emails_sent > 0 ? parseFloat(((c.emails_replied / c.emails_sent) * 100).toFixed(1)) : 0,
  }));

  const tooltipStyle = {
    contentStyle: {
      background: "#1a2235",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8,
      fontSize: 12,
      color: "#e8edf5",
    },
    cursor: { fill: "rgba(255,255,255,0.03)" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-[var(--color-ink-primary)]">Analytics</h1>
        <p className="text-[13px] text-[var(--color-ink-secondary)]">Cross-campaign performance</p>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <span className="text-[14px] font-semibold text-[var(--color-ink-primary)]">Open & Reply Rate by Campaign</span>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barGap={4} barCategoryGap="30%">
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#566a8a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#566a8a" }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <Tooltip {...tooltipStyle} />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "#8fa3bf", paddingTop: 12 }}
              />
              <Bar dataKey="openRate"  name="Open Rate"  fill="#06d6a0" radius={[4, 4, 0, 0]} opacity={0.85} />
              <Bar dataKey="replyRate" name="Reply Rate" fill="#00b4d8" radius={[4, 4, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Comparison table */}
      <Card>
        <CardHeader>
          <span className="text-[14px] font-semibold text-[var(--color-ink-primary)]">Campaign Comparison</span>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {["Campaign", "Status", "Sent", "Opened", "Clicked", "Replied", "Bounced", "Open %", "Reply %"].map((h) => (
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
                {(campaigns ?? []).map((c: Campaign) => (
                  <tr
                    key={c.id}
                    className="border-b border-white/[0.03] transition-colors hover:bg-[var(--color-surface-3)]"
                  >
                    <td className="px-4 py-3 text-[13px] font-medium text-[var(--color-ink-primary)]">{c.name}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(c.status)}>{c.status}</Badge></td>
                    <td className="px-4 py-3 text-[13px] text-[var(--color-ink-secondary)]">{c.emails_sent}</td>
                    <td className="px-4 py-3 text-[13px] text-[var(--color-ink-secondary)]">{c.emails_opened}</td>
                    <td className="px-4 py-3 text-[13px] text-[var(--color-ink-secondary)]">{c.emails_clicked}</td>
                    <td className="px-4 py-3 text-[13px] text-[var(--color-ink-secondary)]">{c.emails_replied}</td>
                    <td className="px-4 py-3 text-[13px] text-[var(--color-ink-secondary)]">{c.emails_bounced}</td>
                    <td className="px-4 py-3 text-[13px] text-emerald-400">{pct(c.emails_opened, c.emails_sent)}</td>
                    <td className="px-4 py-3 text-[13px] text-[var(--color-accent)]">{pct(c.emails_replied, c.emails_sent)}</td>
                  </tr>
                ))}
                {(campaigns?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-[13px] text-[var(--color-ink-muted)]">
                      No campaign data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
