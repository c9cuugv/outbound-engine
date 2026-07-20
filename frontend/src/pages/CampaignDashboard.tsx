import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Play, Pause, Radio } from "lucide-react";
import {
  useCampaign,
  useLaunchCampaign,
  usePauseCampaign,
  useResumeCampaign,
} from "../hooks/useCampaigns";
import { fetchCampaignAnalytics } from "../api/analytics";
import { chartTheme } from "../lib/chartTheme";
import { useWebSocket } from "../hooks/useWebSocket";
import Button from "../components/ui/Button";
import { CampaignStatusBadge, Badge, type Tone } from "../components/ui/Badge";
import { PageHeader, Card, Stat, Table, Th, Td, Tr } from "../components/ui/Primitives";
import { SkeletonRows, EmptyState, ErrorState } from "../components/ui/Feedback";

const EVENT_TONE: Record<string, Tone> = {
  email_sent: "info",
  email_opened: "success",
  link_clicked: "success",
  reply_received: "warning",
};

const pct = (n: number) => `${Math.round((n ?? 0) * 100)}%`;

export default function CampaignDashboard() {
  const { id = "" } = useParams();
  const campaign = useCampaign(id);
  const analytics = useQuery({
    queryKey: ["analytics", id],
    queryFn: () => fetchCampaignAnalytics(id),
    refetchInterval: 15_000,
  });
  const { events, connected } = useWebSocket(id);

  const launch = useLaunchCampaign();
  const pause = usePauseCampaign();
  const resume = useResumeCampaign();

  const status = campaign.data?.status;
  const overview = analytics.data?.overview;

  return (
    <>
      <PageHeader
        title={campaign.data?.name ?? "Campaign"}
        subtitle={campaign.data?.product_name ?? undefined}
        actions={
          <>
            <Link to={`/campaigns/${id}/review`}>
              <Button>Review drafts</Button>
            </Link>
            {status === "review" && (
              <Button variant="primary" loading={launch.isPending} onClick={() => launch.mutate(id)}>
                <Play size={15} />
                Launch
              </Button>
            )}
            {status === "active" && (
              <Button loading={pause.isPending} onClick={() => pause.mutate(id)}>
                <Pause size={15} />
                Pause
              </Button>
            )}
            {status === "paused" && (
              <Button variant="primary" loading={resume.isPending} onClick={() => resume.mutate(id)}>
                <Play size={15} />
                Resume
              </Button>
            )}
          </>
        }
      />

      {campaign.data && (
        <div className="mb-5">
          <CampaignStatusBadge status={campaign.data.status} />
        </div>
      )}

      {analytics.isLoading && <SkeletonRows rows={3} />}
      {analytics.error && <ErrorState error={analytics.error} onRetry={() => analytics.refetch()} />}

      {overview && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Leads" value={overview.total_leads} />
            <Stat label="Emails sent" value={overview.emails_sent} />
            <Stat label="Open rate" value={pct(overview.open_rate)} />
            <Stat label="Click rate" value={pct(overview.click_rate)} />
            <Stat label="Reply rate" value={pct(overview.reply_rate)} />
            <Stat label="Bounce rate" value={pct(overview.bounce_rate)} />
          </div>

          {analytics.data && analytics.data.by_day.length > 0 && (
            <Card className="mt-5">
              <p className="label-overline mb-4">Activity by day</p>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.data.by_day}>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis dataKey="date" stroke={chartTheme.axis} fontSize={11} tickLine={false} />
                    <YAxis stroke={chartTheme.axis} fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: chartTheme.surface,
                        border: `1px solid ${chartTheme.grid}`,
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line type="monotone" dataKey="sent" stroke={chartTheme.sent} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="opened" stroke={chartTheme.opened} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="replied" stroke={chartTheme.replied} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {analytics.data && analytics.data.by_sequence_step.length > 0 && (
            <div className="mt-5">
              <p className="label-overline mb-2">By sequence step</p>
              <Table
                head={
                  <>
                    <Th>Step</Th>
                    <Th className="text-right">Sent</Th>
                    <Th className="text-right">Opened</Th>
                    <Th className="text-right">Clicked</Th>
                    <Th className="text-right">Replied</Th>
                  </>
                }
              >
                {analytics.data.by_sequence_step.map((s) => (
                  <Tr key={s.step}>
                    <Td className="text-ink">Step {s.step}</Td>
                    <Td className="text-right tabular-nums text-ink-muted">{s.sent}</Td>
                    <Td className="text-right tabular-nums text-ink-muted">{s.opened}</Td>
                    <Td className="text-right tabular-nums text-ink-muted">{s.clicked}</Td>
                    <Td className="text-right tabular-nums text-ink-muted">{s.replied}</Td>
                  </Tr>
                ))}
              </Table>
            </div>
          )}
        </>
      )}

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2">
          <p className="label-overline">Live feed</p>
          <span
            className={`inline-flex items-center gap-1 text-[11px] ${
              connected ? "text-success" : "text-ink-subtle"
            }`}
          >
            <Radio size={11} />
            {connected ? "Connected" : "Reconnecting"}
          </span>
        </div>

        {events.length === 0 ? (
          <EmptyState
            title="No live activity yet"
            hint="Opens, clicks, and replies appear here in real time once the campaign is sending."
          />
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-line">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Badge tone={EVENT_TONE[e.type] ?? "neutral"}>{e.type.replace(/_/g, " ")}</Badge>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {e.lead_name}
                    {e.subject && <span className="text-ink-subtle"> · {e.subject}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-subtle">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
