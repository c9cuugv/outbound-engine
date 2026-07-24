import { X } from "lucide-react";
import { useLeadResearch } from "../../hooks/useLeads";
import type { Lead } from "../../types/lead";
import { SkeletonRows, ErrorState, EmptyState } from "../ui/Feedback";
import { Badge } from "../ui/Badge";

function Chips({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="label-overline mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Badge key={it}>{it}</Badge>
        ))}
      </div>
    </div>
  );
}

export default function ResearchPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useLeadResearch(lead.id);

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-line bg-surface shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-ink">
            {lead.first_name} {lead.last_name}
          </p>
          <p className="truncate font-mono text-[12px] text-ink-muted">{lead.email}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close research panel"
          className="rounded-md p-1 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {isLoading && <SkeletonRows rows={5} />}
        {error && <ErrorState error={error} onRetry={() => refetch()} />}

        {!isLoading && !error && !data && (
          <EmptyState
            title="No research yet"
            hint="Run research on this lead to pull company signals and personalization hooks."
          />
        )}

        {data && (
          <>
            <div>
              <p className="label-overline mb-2">Company summary</p>
              <p className="text-[13px] leading-6 text-ink-muted">{data.company_summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="label-overline mb-1">Industry</p>
                <p className="text-[13px] text-ink">{data.industry || "—"}</p>
              </div>
              <div>
                <p className="label-overline mb-1">Size estimate</p>
                <p className="text-[13px] text-ink">{data.company_size_estimate || "—"}</p>
              </div>
            </div>

            <Chips label="Tech stack signals" items={data.tech_stack_signals} />
            <Chips label="Potential pain points" items={data.potential_pain_points} />

            {data.personalization_hooks?.length > 0 && (
              <div>
                <p className="label-overline mb-2">Personalization hooks</p>
                <ul className="space-y-2">
                  {data.personalization_hooks.map((h) => (
                    <li
                      key={h}
                      className="rounded-md border border-line bg-canvas px-3 py-2 text-[13px] leading-5 text-ink-muted"
                    >
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="label-overline mb-1">Confidence</p>
              <p className="text-[13px] text-ink">
                {Math.round((data.confidence_score ?? 0) * 100)}%
              </p>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
