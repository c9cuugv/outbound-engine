import { useLeadResearch } from "../../hooks/useLeads";
import Badge, { statusVariant } from "../ui/Badge";
import Spinner from "../ui/Spinner";
import { AlertTriangle, Cpu, Target, Lightbulb, Building2 } from "lucide-react";
import type { ResearchData } from "../../types/lead";

interface ResearchPanelProps {
  leadId: string;
  researchStatus: string;
}

function confidenceColor(score: number): string {
  if (score > 0.8) return "text-emerald-400";
  if (score >= 0.6) return "text-amber-400";
  return "text-red-400";
}

function confidenceBg(score: number): string {
  if (score > 0.8) return "bg-emerald-500/20";
  if (score >= 0.6) return "bg-amber-500/20";
  return "bg-red-500/20";
}

function ResearchContent({ data }: { data: ResearchData }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Company Summary */}
      <div className="col-span-2">
        <p className="text-[13px] leading-relaxed text-[var(--color-ink-secondary)]">
          {data.company_summary}
        </p>
      </div>

      {/* Industry + Size */}
      <div className="flex items-center gap-3">
        <Building2 size={14} className="text-[var(--color-ink-tertiary)]" />
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">Industry</p>
          <p className="text-[13px] text-[var(--color-ink-primary)]">{data.industry}</p>
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">Size</p>
        <p className="text-[13px] text-[var(--color-ink-primary)]">{data.company_size_estimate} employees</p>
      </div>

      {/* Tech Stack */}
      {data.tech_stack_signals.length > 0 && (
        <div className="col-span-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Cpu size={12} className="text-[var(--color-ink-tertiary)]" />
            <p className="text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">Tech Stack</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.tech_stack_signals.map((tech) => (
              <span
                key={tech}
                className="rounded-md bg-[var(--color-info-dim)] px-2 py-0.5 text-[11px] font-medium text-blue-400"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pain Points */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <Target size={12} className="text-[var(--color-ink-tertiary)]" />
          <p className="text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">Pain Points</p>
        </div>
        <ol className="ml-4 list-decimal space-y-1">
          {data.potential_pain_points.map((point, i) => (
            <li key={i} className="text-[12px] text-[var(--color-ink-secondary)]">{point}</li>
          ))}
        </ol>
      </div>

      {/* Personalization Hooks */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <Lightbulb size={12} className="text-[var(--color-ink-tertiary)]" />
          <p className="text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">Hooks</p>
        </div>
        <ul className="ml-4 list-disc space-y-1">
          {data.personalization_hooks.map((hook, i) => (
            <li key={i} className="text-[12px] text-[var(--color-ink-secondary)]">{hook}</li>
          ))}
        </ul>
      </div>

      {/* Confidence */}
      <div className="col-span-2 flex items-center gap-3">
        <div className={`rounded-lg px-3 py-1.5 ${confidenceBg(data.confidence_score)}`}>
          <span className={`font-mono text-[14px] font-semibold ${confidenceColor(data.confidence_score)}`}>
            {Math.round(data.confidence_score * 100)}%
          </span>
        </div>
        <span className="text-[12px] text-[var(--color-ink-muted)]">confidence</span>
      </div>
    </div>
  );
}

export default function ResearchPanel({ leadId, researchStatus }: ResearchPanelProps) {
  const { data, isLoading, error } = useLeadResearch(
    researchStatus === "completed" || researchStatus === "needs_review" ? leadId : null,
  );

  if (researchStatus === "pending") {
    return (
      <div className="py-4 text-center text-[13px] text-[var(--color-ink-muted)]">
        Research not started yet.
      </div>
    );
  }

  if (researchStatus === "in_progress") {
    return (
      <div className="flex justify-center py-6">
        <Spinner label="Researching..." />
      </div>
    );
  }

  if (researchStatus === "failed") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-[var(--color-danger-dim)] px-4 py-3">
        <AlertTriangle size={14} className="text-red-400" />
        <span className="text-[13px] text-red-400">Research failed. Website may be unreachable.</span>
      </div>
    );
  }

  if (isLoading) return <Spinner label="Loading research..." />;
  if (error || !data) return null;

  return (
    <div>
      {researchStatus === "needs_review" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-[var(--color-warning-dim)] px-4 py-3">
          <AlertTriangle size={14} className="text-amber-400" />
          <span className="text-[13px] text-amber-400">
            Low confidence — review this research before using it for outreach.
          </span>
        </div>
      )}
      <ResearchContent data={data} />
    </div>
  );
}
