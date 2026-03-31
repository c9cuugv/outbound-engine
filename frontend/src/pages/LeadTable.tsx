import { useState, useCallback, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLeads, useImportCSV, useResearchAll } from "../hooks/useLeads";
import Badge, { statusVariant } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import ResearchPanel from "../components/leads/ResearchPanel";
import {
  Upload,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Users,
  X,
  ArrowUpDown,
} from "lucide-react";
import type { Lead } from "../types/lead";

/* ── Status dot colors ── */
const STATUS_DOTS: Record<string, string> = {
  new: "#3b82f6",
  researched: "#06d6a0",
  in_sequence: "#f59e0b",
  completed: "#8b5cf6",
  bounced: "#ef4444",
};

const RESEARCH_DOTS: Record<string, string> = {
  pending: "#3d506e",
  in_progress: "#f59e0b",
  completed: "#06d6a0",
  failed: "#ef4444",
  needs_review: "#f59e0b",
};

const PER_PAGE_OPTIONS = [25, 50, 100];
const SORTABLE_COLUMNS = ["first_name", "email", "company_name", "title", "status", "research_status", "created_at"] as const;
type SortColumn = (typeof SORTABLE_COLUMNS)[number];

const COLUMN_LABELS: Record<SortColumn, string> = {
  first_name: "Name",
  email: "Email",
  company_name: "Company",
  title: "Title",
  status: "Status",
  research_status: "Research",
  created_at: "Created",
};

export default function LeadTable() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [sort, setSort] = useState<SortColumn>("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [researchFilter, setResearchFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { data, isLoading, error } = useLeads({
    page,
    per_page: perPage,
    sort,
    order,
    status: statusFilter || undefined,
    research_status: researchFilter || undefined,
    search: debouncedSearch || undefined,
  });

  const importCSV = useImportCSV();
  const researchAll = useResearchAll();

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  const handleSort = useCallback(
    (col: SortColumn) => {
      if (sort === col) {
        setOrder((o) => (o === "asc" ? "desc" : "asc"));
      } else {
        setSort(col);
        setOrder("asc");
      }
    },
    [sort],
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      await importCSV.mutateAsync(file);
      setShowImportModal(false);
    },
    [importCSV],
  );

  if (isLoading) return <LeadTableSkeleton />;
  if (error) {
    return (
      <div className="py-20 text-center text-[var(--color-ink-secondary)]">
        Failed to load leads. Check your connection and try again.
      </div>
    );
  }

  const leads = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;
  const totalCount = data?.total_count ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Leads</h1>
          <p className="mt-1 text-[13px] text-[var(--color-ink-secondary)]">
            {totalCount} total leads
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<FlaskConical size={14} />}
            loading={researchAll.isPending}
            onClick={() => researchAll.mutate()}
          >
            Research All
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Upload size={14} />}
            onClick={() => setShowImportModal(true)}
          >
            Upload CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]" />
          <input
            type="text"
            placeholder="Search by name, email, or company..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-9 w-full rounded border border-white/[0.08] bg-[var(--color-surface-2)] pl-9 pr-3 text-[13px] text-[var(--color-ink-primary)] placeholder-[var(--color-ink-muted)] outline-none focus:border-[var(--color-accent)]/40"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 rounded border border-white/[0.08] bg-[var(--color-surface-2)] px-3 text-[13px] text-[var(--color-ink-secondary)] outline-none"
        >
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="researched">Researched</option>
          <option value="in_sequence">In Sequence</option>
          <option value="completed">Completed</option>
          <option value="bounced">Bounced</option>
        </select>
        <select
          value={researchFilter}
          onChange={(e) => { setResearchFilter(e.target.value); setPage(1); }}
          className="h-9 rounded border border-white/[0.08] bg-[var(--color-surface-2)] px-3 text-[13px] text-[var(--color-ink-secondary)] outline-none"
        >
          <option value="">All Research</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="needs_review">Needs Review</option>
        </select>
      </div>

      {/* Table */}
      {leads.length === 0 ? (
        <Card className="py-20 text-center">
          <Users size={40} className="mx-auto mb-4 text-[var(--color-ink-muted)]" />
          <p className="text-[15px] font-medium text-[var(--color-ink-secondary)]">No leads yet</p>
          <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
            Upload a CSV to get started.
          </p>
          <Button
            variant="primary"
            size="md"
            icon={<Upload size={14} />}
            onClick={() => setShowImportModal(true)}
            className="mx-auto mt-5"
          >
            Upload CSV
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {SORTABLE_COLUMNS.map((col) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="cursor-pointer px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] hover:text-[var(--color-ink-secondary)] select-none"
                    >
                      <div className="flex items-center gap-1">
                        {COLUMN_LABELS[col]}
                        {sort === col ? (
                          order === "asc" ? (
                            <ChevronUp size={11} className="text-[var(--color-accent)]" />
                          ) : (
                            <ChevronDown size={11} className="text-[var(--color-accent)]" />
                          )
                        ) : (
                          <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-40" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead: Lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    expanded={expandedRow === lead.id}
                    onToggle={() => setExpandedRow(expandedRow === lead.id ? null : lead.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--color-ink-muted)]">Rows:</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="rounded border border-white/[0.08] bg-[var(--color-surface-2)] px-2 py-1 text-[12px] text-[var(--color-ink-secondary)] outline-none"
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="mr-3 text-[12px] text-[var(--color-ink-muted)]">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded p-1.5 text-[var(--color-ink-secondary)] hover:bg-white/[0.04] disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded p-1.5 text-[var(--color-ink-secondary)] hover:bg-white/[0.04] disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <CSVImportModal
          onClose={() => setShowImportModal(false)}
          onUpload={handleFileUpload}
          isLoading={importCSV.isPending}
          result={importCSV.data}
        />
      )}
    </div>
  );
}

/* ── Lead Row with expandable research ── */
const LeadRow = memo(function LeadRow({
  lead,
  expanded,
  onToggle,
}: {
  lead: Lead;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="table-row-hover relative cursor-pointer border-b border-white/[0.04] hover:bg-[var(--color-surface-hover)]/40"
      >
        <td className="px-4 py-3 text-[13px] font-medium">
          {lead.first_name} {lead.last_name}
        </td>
        <td className="px-4 py-3 font-mono text-[12px] text-[var(--color-ink-secondary)]">
          {lead.email}
        </td>
        <td className="px-4 py-3 text-[13px] text-[var(--color-ink-secondary)]">
          {lead.company_name ?? "—"}
        </td>
        <td className="px-4 py-3 text-[13px] text-[var(--color-ink-secondary)]">
          {lead.title ?? "—"}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <div
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: STATUS_DOTS[lead.status] ?? "#3d506e" }}
            />
            <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <div
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: RESEARCH_DOTS[lead.research_status] ?? "#3d506e" }}
            />
            <Badge variant={statusVariant(lead.research_status)}>
              {lead.research_status.replace("_", " ")}
            </Badge>
          </div>
        </td>
        <td className="px-4 py-3 text-[12px] text-[var(--color-ink-muted)]">
          {new Date(lead.created_at).toLocaleDateString()}
        </td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <td colSpan={7} className="border-b border-white/[0.06] bg-[var(--color-surface-2)] px-6 py-5">
              <ResearchPanel
                leadId={lead.id}
                researchStatus={lead.research_status}
              />
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
});

/* ── Table skeleton ── */
function LeadTableSkeleton() {
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-6 w-20 rounded-md" />
          <div className="skeleton h-3.5 w-28 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-8 w-28 rounded-lg" />
          <div className="skeleton h-8 w-28 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="skeleton h-9 flex-1 rounded-lg" />
        <div className="skeleton h-9 w-36 rounded-lg" />
        <div className="skeleton h-9 w-36 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[var(--color-surface-1)]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <div className="flex gap-6">
            {[80, 140, 100, 90, 72, 88, 64].map((w, i) => (
              <div key={i} className="skeleton h-3 rounded" style={{ width: w }} />
            ))}
          </div>
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-6 border-b border-white/[0.03] px-4 py-3.5"
            style={{ opacity: 1 - i * 0.08 }}
          >
            <div className="skeleton h-3.5 w-28 rounded" />
            <div className="skeleton h-3 w-44 rounded" />
            <div className="skeleton h-3.5 w-24 rounded" />
            <div className="skeleton h-3.5 w-20 rounded" />
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="skeleton h-5 w-20 rounded-full" />
            <div className="skeleton h-3 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── CSV Import Modal ── */
function CSVImportModal({
  onClose,
  onUpload,
  isLoading,
  result,
}: {
  onClose: () => void;
  onUpload: (file: File) => void;
  isLoading: boolean;
  result?: { imported: number; skipped_duplicate: number; skipped_invalid: number } | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-white/[0.08] bg-[var(--color-surface-1)] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">Upload CSV</h2>
          <button onClick={onClose} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink-primary)]">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--color-accent-dim)] px-4 py-3">
              <p className="text-[14px] font-semibold text-[var(--color-accent)]">
                {result.imported} leads imported
              </p>
            </div>
            {result.skipped_duplicate > 0 && (
              <p className="text-[13px] text-[var(--color-ink-secondary)]">
                {result.skipped_duplicate} duplicates skipped
              </p>
            )}
            {result.skipped_invalid > 0 && (
              <p className="text-[13px] text-amber-400">
                {result.skipped_invalid} invalid rows skipped
              </p>
            )}
            <Button variant="primary" onClick={onClose} className="mt-4 w-full">
              Done
            </Button>
          </div>
        ) : (
          <div>
            <p className="mb-4 text-[13px] text-[var(--color-ink-secondary)]">
              Upload a CSV with columns: first_name, last_name, email, company_name, company_domain, title
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
              }}
              className="hidden"
            />
            <Button
              variant="primary"
              loading={isLoading}
              onClick={() => fileRef.current?.click()}
              icon={<Upload size={14} />}
              className="w-full"
            >
              Select CSV File
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
