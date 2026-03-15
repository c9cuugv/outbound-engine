import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useCampaign } from "../hooks/useCampaigns";
import { useWebSocket } from "../hooks/useWebSocket";
import { fetchCampaignAnalytics } from "../api/analytics";
import { pauseCampaign, resumeCampaign } from "../api/campaigns";
import Badge, { statusVariant } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card, { CardHeader, CardBody } from "../components/ui/Card";
import { FullPageSpinner } from "../components/ui/Spinner";
import {
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  Pause,
  Play,
  Wifi,
  WifiOff,
  Mail,
  Link,
  MessageCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { CampaignAnalytics, LiveEvent } from "../types/analytics";

const SENTIMENT_COLORS: Record<string, string> = {
  interested: "#06d6a0",
  not_interested: "#ef4444",
  out_of_office: "#f59e0b",
  question: "#3b82f6",
  unsubscribe: "#8b5cf6",
};

const EVENT_ICONS: Record<string, typeof Mail> = {
  email_sent: Send,
  email_opened: Eye,
  link_clicked: Link,
  reply_received: MessageCircle,
};

const EVENT_COLORS: Record<string, string> = {
  email_sent: "text-blue-400",
  email_opened: "text-emerald-400",
  link_clicked: "text-purple-400",
  reply_received: "text-[var(--color-accent)]",
};

export default function CampaignDashboard() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId!);
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["campaign-analytics", campaignId],
    queryFn: () => fetchCampaignAnalytics(campaignId!),
    refetchInterval: 30_000,
  });
  const { events, connected } = useWebSocket(campaignId!);

  if (campaignLoading || analyticsLoading) return <DashboardSkeleton />;
  if (!campaign || !analytics) return null;

  const handlePauseResume = async () => {
    if (campaign.status === "active") {
      await pauseCampaign(campaignId!);
    } else {
      await resumeCampaign(campaignId!);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-[22px] font-bold tracking-tight">{campaign.name}</h1>
          <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {connected ? (
              <Wifi size={12} className="text-emerald-400" />
            ) : (
              <WifiOff size={12} className="text-red-400" />
            )}
            <span className="text-[11px] text-[var(--color-ink-muted)]">
              {connected ? "Live" : "Reconnecting..."}
            </span>
          </div>
          {(campaign.status === "active" || campaign.status === "paused") && (
            <Button
              variant="secondary"
              size="sm"
              icon={campaign.status === "active" ? <Pause size={14} /> : <Play size={14} />}
              onClick={handlePauseResume}
            >
              {campaign.status === "active" ? "Pause" : "Resume"}
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <MetricCard icon={Send} label="Sent" value={analytics.overview.emails_sent} format="number" trend="up" />
        <MetricCard icon={Eye} label="Open Rate" value={analytics.overview.open_rate} format="percent" trend="up" />
        <MetricCard icon={MousePointerClick} label="Click Rate" value={analytics.overview.click_rate} format="percent" trend="neutral" />
        <MetricCard icon={MessageSquare} label="Reply Rate" value={analytics.overview.reply_rate} format="percent" trend="up" />
      </div>

      {/* Charts row */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {/* Daily sends + rate overlay */}
        <Card className="col-span-2">
          <CardHeader>
            <span className="text-[13px] font-semibold">Daily Activity</span>
          </CardHeader>
          <CardBody>
            <DailySendsChart data={analytics.by_day} />
          </CardBody>
        </Card>

        {/* Sentiment pie */}
        <Card>
          <CardHeader>
            <span className="text-[13px] font-semibold">Reply Sentiment</span>
          </CardHeader>
          <CardBody>
            <SentimentPieChart data={analytics.reply_sentiment_breakdown} />
          </CardBody>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Sequence performance */}
        <Card>
          <CardHeader>
            <span className="text-[13px] font-semibold">By Sequence Step</span>
          </CardHeader>
          <CardBody>
            <SequencePerformanceChart data={analytics.by_sequence_step} />
          </CardBody>
        </Card>

        {/* Live activity feed */}
        <Card className="col-span-2">
          <CardHeader className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">Live Activity</span>
            <span className="text-[11px] text-[var(--color-ink-muted)]">
              {events.length} events
            </span>
          </CardHeader>
          <div className="max-h-[320px] overflow-y-auto">
            {events.length === 0 ? (
              <div className="px-5 py-10 text-center text-[13px] text-[var(--color-ink-muted)]">
                Waiting for activity...
              </div>
            ) : (
              events.map((event, i) => <EventRow key={event.id ?? i} event={event} />)
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Animated counter hook ── */
function useCountUp(target: number, duration = 1200) {
  const [current, setCurrent] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(eased * target);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return current;
}

/* ── Trend indicator ── */
function TrendBadge({ trend }: { trend: "up" | "down" | "neutral" }) {
  if (trend === "up") return <span className="text-[10px] font-semibold text-[var(--color-accent)]">↑</span>;
  if (trend === "down") return <span className="text-[10px] font-semibold text-[var(--color-danger)]">↓</span>;
  return <span className="text-[10px] font-semibold text-[var(--color-ink-muted)]">→</span>;
}

/* ── Metric Card ── */
function MetricCard({
  icon: Icon,
  label,
  value,
  format,
  trend,
}: {
  icon: typeof Send;
  label: string;
  value: number;
  format: "number" | "percent";
  trend?: "up" | "down" | "neutral";
}) {
  const animated = useCountUp(format === "percent" ? value * 100 : value);
  const displayValue =
    format === "percent"
      ? `${animated.toFixed(1)}%`
      : Math.round(animated).toLocaleString();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="card-hover"
    >
      <Card className="px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-[var(--color-ink-tertiary)]" />
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">
              {label}
            </span>
          </div>
          {trend && <TrendBadge trend={trend} />}
        </div>
        <p className="font-mono text-[24px] font-bold tracking-tight text-[var(--color-ink-primary)]">
          {displayValue}
        </p>
      </Card>
    </motion.div>
  );
}

/* ── Dashboard Skeleton ── */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="skeleton h-6 w-48 rounded-md" />
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
        <div className="skeleton h-8 w-24 rounded-lg" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-[var(--color-surface-1)] px-5 py-4">
            <div className="skeleton mb-2 h-3.5 w-20 rounded" />
            <div className="skeleton h-8 w-24 rounded-md" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 rounded-xl border border-white/[0.06] bg-[var(--color-surface-1)] p-5">
          <div className="skeleton mb-4 h-4 w-28 rounded" />
          <div className="skeleton h-[200px] w-full rounded-lg" />
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-[var(--color-surface-1)] p-5">
          <div className="skeleton mb-4 h-4 w-24 rounded" />
          <div className="skeleton h-[200px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/* ── Daily Sends Chart ── */
function DailySendsChart({ data }: { data: CampaignAnalytics["by_day"] }) {
  if (data.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-[13px] text-[var(--color-ink-muted)]">No data yet</div>;
  }

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    sent: d.sent,
    openRate: d.sent > 0 ? (d.opened / d.sent) * 100 : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#566a8a" }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#566a8a" }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#566a8a" }} axisLine={false} tickLine={false} unit="%" />
        <Tooltip
          contentStyle={{ background: "#131b2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }}
          labelStyle={{ color: "#8899b4" }}
        />
        <Bar yAxisId="left" dataKey="sent" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.7} />
        <Line yAxisId="right" dataKey="openRate" stroke="#06d6a0" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ── Sequence Performance Chart ── */
function SequencePerformanceChart({ data }: { data: CampaignAnalytics["by_sequence_step"] }) {
  if (data.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-[13px] text-[var(--color-ink-muted)]">No data yet</div>;
  }

  const chartData = data.map((s) => ({
    step: `Email ${s.step}`,
    sent: s.sent,
    opened: s.opened,
    replied: s.replied,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="step" tick={{ fontSize: 11, fill: "#566a8a" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#566a8a" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "#131b2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }}
        />
        <Bar dataKey="sent" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        <Bar dataKey="opened" fill="#06d6a0" radius={[3, 3, 0, 0]} />
        <Bar dataKey="replied" fill="#f59e0b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Sentiment Pie Chart ── */
function SentimentPieChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-[13px] text-[var(--color-ink-muted)]">No replies yet</div>;
  }

  const chartData = entries.map(([name, value]) => ({ name, value }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name] ?? "#6b7280"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#131b2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: SENTIMENT_COLORS[key] ?? "#6b7280" }} />
            <span className="text-[11px] capitalize text-[var(--color-ink-secondary)]">
              {key.replace("_", " ")} ({val})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Live Event Row ── */
function EventRow({ event }: { event: LiveEvent }) {
  const Icon = EVENT_ICONS[event.type] ?? Mail;
  const colorClass = EVENT_COLORS[event.type] ?? "text-[var(--color-ink-muted)]";
  const timeAgo = getRelativeTime(event.timestamp);

  return (
    <div className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-2.5 last:border-b-0">
      <Icon size={14} className={colorClass} />
      <div className="flex-1 text-[12px]">
        <span className="font-medium text-[var(--color-ink-primary)]">{event.lead_name}</span>
        <span className="ml-1 text-[var(--color-ink-secondary)]">
          {event.type === "email_sent" && "— email sent"}
          {event.type === "email_opened" && "— opened email"}
          {event.type === "link_clicked" && "— clicked link"}
          {event.type === "reply_received" && `— replied (${event.sentiment ?? "unknown"})`}
        </span>
      </div>
      <span className="shrink-0 text-[11px] text-[var(--color-ink-muted)]" title={event.timestamp}>
        {timeAgo}
      </span>
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
  return `${Math.floor(hours / 24)}d ago`;
}
