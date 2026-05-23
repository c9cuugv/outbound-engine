import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useCampaign, usePauseCampaign, useResumeCampaign } from "../hooks/useCampaigns";
import { useWebSocket } from "../hooks/useWebSocket";
import { fetchCampaignAnalytics } from "../api/analytics";
import Badge, { statusVariant } from "../components/ui/Badge";
import {
  Send,
  Eye,
  MousePointerClick,
  MessageSquare,
  Pause,
  Play,
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
  const pause = usePauseCampaign();
  const resume = useResumeCampaign();

  if (campaignLoading || analyticsLoading) return <DashboardSkeleton />;
  if (!campaign || !analytics) return null;

  const handlePauseResume = async () => {
    if (campaign.status === "active") {
      await pause.mutateAsync(campaignId!);
    } else {
      await resume.mutateAsync(campaignId!);
    }
  };

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col">
      {/* Header */}
      <div className="mb-6 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight text-on-surface">{campaign.name}</h1>
          <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-full border border-outline/10 bg-surface-container-high px-3 py-1.5">
            {connected ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </span>
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-emerald-400">Live Connection</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-error" />
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-error">Reconnecting...</span>
              </>
            )}
          </div>
          {(campaign.status === "active" || campaign.status === "paused") && (
            <button
              onClick={handlePauseResume}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 font-label-md text-label-md text-on-primary transition-all shadow-sm ${
                campaign.status === "active" ? "bg-amber-500 hover:bg-amber-600" : "bg-primary hover:bg-primary-container hover:text-on-primary-container"
              }`}
            >
              {campaign.status === "active" ? <Pause size={16} /> : <Play size={16} />}
              {campaign.status === "active" ? "Pause Campaign" : "Resume Campaign"}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-10">
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
          <div className="col-span-2 rounded-xl border border-outline/10 bg-surface-container/40 p-5 shadow-sm backdrop-blur-sm">
            <h3 className="mb-4 font-headline-sm text-headline-sm text-on-surface">Daily Activity</h3>
            <DailySendsChart data={analytics.by_day} />
          </div>

          {/* Sentiment pie */}
          <div className="rounded-xl border border-outline/10 bg-surface-container/40 p-5 shadow-sm backdrop-blur-sm">
            <h3 className="mb-4 font-headline-sm text-headline-sm text-on-surface">Reply Sentiment</h3>
            <SentimentPieChart data={analytics.reply_sentiment_breakdown} />
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Sequence performance */}
          <div className="rounded-xl border border-outline/10 bg-surface-container/40 p-5 shadow-sm backdrop-blur-sm">
            <h3 className="mb-4 font-headline-sm text-headline-sm text-on-surface">By Sequence Step</h3>
            <SequencePerformanceChart data={analytics.by_sequence_step} />
          </div>

          {/* Live activity feed */}
          <div className="col-span-2 rounded-xl border border-outline/10 bg-surface-container/40 flex flex-col shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-outline/10 p-5 shrink-0">
              <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-vibrant-blue opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
                </span>
                Live Activity
              </h3>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                {events.length} events
              </span>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {events.length === 0 ? (
                <div className="px-5 py-10 text-center text-on-surface-variant">
                  Waiting for activity...
                </div>
              ) : (
                events.map((event, i) => <EventRow key={event.id ?? i} event={event} />)
              )}
            </div>
          </div>
        </div>
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
      <div className="rounded-xl border border-outline/10 bg-surface-container/40 p-5 shadow-sm backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon size={16} className="text-primary" />
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              {label}
            </span>
          </div>
          {trend && <TrendBadge trend={trend} />}
        </div>
        <p className="font-display-lg text-display-lg font-bold tracking-tight text-on-surface">
          {displayValue}
        </p>
      </div>
    </motion.div>
  );
}

/* ── Dashboard Skeleton ── */
function DashboardSkeleton() {
  return (
    <div className="flex h-[calc(100vh-100px)] flex-col space-y-6">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-48 animate-pulse rounded-md bg-surface-container-high" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-surface-container-high" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-lg bg-surface-container-high" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-outline/10 bg-surface-container/20 p-5">
            <div className="mb-3 h-4 w-24 animate-pulse rounded bg-surface-container-highest" />
            <div className="h-12 w-20 animate-pulse rounded bg-surface-container-highest" />
          </div>
        ))}
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
    <div className="group flex items-center gap-4 border-b border-outline/5 px-5 py-4 transition-colors hover:bg-surface-container-highest/30 last:border-b-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
        <Icon size={14} className={colorClass} />
      </div>
      <div className="flex-1 font-body-md text-body-md text-on-surface">
        <span className="font-medium text-on-surface">{event.lead_name}</span>
        <span className="ml-1 text-on-surface-variant">
          {event.type === "email_sent" && "— email sent"}
          {event.type === "email_opened" && "— opened email"}
          {event.type === "link_clicked" && "— clicked link"}
          {event.type === "reply_received" && `— replied (${event.sentiment ?? "unknown"})`}
        </span>
      </div>
      <span className="shrink-0 font-label-md text-label-md text-on-surface-variant" title={event.timestamp}>
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
