import { useState, useCallback, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLeads, useImportCSV, useResearchAll } from "../hooks/useLeads";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";
import ResearchPanel from "../components/leads/ResearchPanel";
import {
  Upload,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
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
    <div className="mx-auto w-full max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h2 className="mb-2 font-display-lg text-display-lg font-bold tracking-tight text-on-surface">Leads</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          Manage your outreach pipeline. Import contacts, verify emails, and initiate sequences.
        </p>
      </div>

      {/* Actions & Filters Bar */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-center">
        <div className="flex w-full flex-wrap items-center gap-3 xl:w-auto">
          {/* Search */}
          <div className="relative w-full shrink-0 sm:w-[320px]">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search by name, email, or company..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-lg border border-outline/20 bg-surface-container-high py-2.5 pl-10 pr-4 font-body-md text-body-md text-on-surface transition-all placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {/* Status Filter */}
          <div className="relative w-full shrink-0 sm:w-[160px]">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full cursor-pointer appearance-none rounded-lg border border-outline/20 bg-surface-container-high py-2.5 pl-4 pr-10 font-body-md text-body-md text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              <option value="new">New</option>
              <option value="researched">Researched</option>
              <option value="in_sequence">In Sequence</option>
              <option value="completed">Completed</option>
              <option value="bounced">Bounced</option>
            </select>
            <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          </div>
          {/* Research Filter */}
          <div className="relative w-full shrink-0 sm:w-[160px]">
            <select
              value={researchFilter}
              onChange={(e) => { setResearchFilter(e.target.value); setPage(1); }}
              className="w-full cursor-pointer appearance-none rounded-lg border border-outline/20 bg-surface-container-high py-2.5 pl-4 pr-10 font-body-md text-body-md text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Research</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="needs_review">Needs Review</option>
            </select>
            <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          </div>
        </div>
        {/* Action Buttons */}
        <div className="mt-4 flex w-full shrink-0 items-center justify-end gap-3 xl:mt-0 xl:w-auto">
          <div className="text-sm text-on-surface-variant mr-2">{totalCount} total leads</div>
          <button
            onClick={() => researchAll.mutate()}
            disabled={researchAll.isPending}
            className="flex items-center gap-2 rounded-lg border border-outline/20 bg-surface-container-high px-5 py-2.5 font-label-md text-label-md text-on-surface transition-all duration-200 hover:bg-surface-container-highest active:scale-[0.98] disabled:opacity-50"
          >
            {researchAll.isPending ? <Spinner size={16} /> : <Search size={16} />}
            Research All
          </button>
          <button
            className="flex items-center gap-2 rounded-lg border border-outline/20 bg-surface-container-high px-5 py-2.5 font-label-md text-label-md text-on-surface transition-all duration-200 hover:bg-surface-container-highest active:scale-[0.98]"
          >
            <Upload size={16} className="rotate-180" />
            Export
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary shadow-sm transition-all duration-200 hover:bg-primary-container hover:text-on-primary-container hover:shadow active:scale-[0.98]"
          >
            <Upload size={16} />
            Upload CSV
          </button>
        </div>
      </div>

      {/* Table */}
      {leads.length === 0 ? (
        <div className="rounded-xl border border-outline/10 bg-surface-container/40 py-20 text-center shadow-sm backdrop-blur-sm">
          <Users size={40} className="mx-auto mb-4 text-on-surface-variant opacity-60" />
          <p className="font-body-lg text-body-lg font-medium text-on-surface">No leads yet</p>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Upload a CSV to get started.
          </p>
          <button
            onClick={() => setShowImportModal(true)}
            className="mx-auto mt-5 flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary shadow-sm transition-all duration-200 hover:bg-primary-container hover:text-on-primary-container"
          >
            <Upload size={16} />
            Upload CSV
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline/10 bg-surface-container/40 shadow-sm backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline/10 bg-surface-container-low/50">
                  <th className="w-[48px] p-4">
                    <div className="flex items-center justify-center">
                      <input type="checkbox" className="h-4 w-4 cursor-pointer rounded border-outline/30 bg-surface-container-high text-primary focus:ring-primary focus:ring-offset-surface-container" />
                    </div>
                  </th>
                  {SORTABLE_COLUMNS.map((col) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="group cursor-pointer select-none whitespace-nowrap px-4 py-3 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant hover:text-on-surface"
                    >
                      <div className="flex items-center gap-1">
                        {COLUMN_LABELS[col]}
                        {sort === col ? (
                          order === "asc" ? (
                            <ChevronUp size={14} className="text-primary" />
                          ) : (
                            <ChevronDown size={14} className="text-primary" />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="w-[60px] px-4 py-3"></th>
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
          <div className="flex items-center justify-between border-t border-outline/10 bg-surface-container-low/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-body-sm text-body-sm text-on-surface-variant">Rows per page:</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="cursor-pointer rounded border border-outline/20 bg-surface-container-high px-2 py-1 font-body-sm text-body-sm text-on-surface outline-none focus:border-primary"
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-30"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
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
        className="group border-b border-outline/5 transition-colors hover:bg-surface-container-high/50"
      >
        <td className="w-[48px] p-4">
          <div className="flex items-center justify-center">
            <input type="checkbox" className="h-4 w-4 cursor-pointer rounded border-outline/30 bg-surface-container-high text-primary focus:ring-primary focus:ring-offset-surface-container" />
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
              <span className="font-label-md text-label-md font-bold uppercase">{lead.first_name[0]}{lead.last_name[0]}</span>
            </div>
            <div>
              <p className="font-body-md text-body-md font-medium text-on-surface">{lead.first_name} {lead.last_name}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">
          {lead.email}
        </td>
        <td className="px-4 py-3">
          <p className="font-body-md text-body-md text-on-surface">{lead.company_name ?? "—"}</p>
        </td>
        <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">
          {lead.title ?? "—"}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: STATUS_DOTS[lead.status] ?? "#3d506e" }}
            />
            <span className="font-label-sm text-label-sm capitalize text-on-surface-variant">
              {lead.status.replace("_", " ")}
            </span>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: RESEARCH_DOTS[lead.research_status] ?? "#3d506e" }}
            />
            <span className="font-label-sm text-label-sm capitalize text-on-surface-variant">
              {lead.research_status.replace("_", " ")}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">
          {new Date(lead.created_at).toLocaleDateString()}
        </td>
        <td className="w-[60px] px-4 py-3 text-right">
          <button onClick={onToggle} className="rounded p-1 text-on-surface-variant opacity-0 transition-all hover:bg-surface-container-highest hover:text-on-surface group-hover:opacity-100">
             <ChevronDown size={18} className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </button>
        </td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <motion.tr
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <td colSpan={9} className="border-b border-outline/10 bg-surface-container-low px-6 py-5 shadow-inner">
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
