import { useRef, useState } from "react";
import { Upload, Search, Sparkles } from "lucide-react";
import { useLeads, useImportCSV, useResearchAll } from "../hooks/useLeads";
import type { Lead } from "../types/lead";
import Button from "../components/ui/Button";
import { LeadStatusBadge, ResearchStatusBadge } from "../components/ui/Badge";
import {
  PageHeader,
  Input,
  Select,
  Table,
  Th,
  Td,
  Tr,
} from "../components/ui/Primitives";
import { SkeletonRows, EmptyState, ErrorState } from "../components/ui/Feedback";
import ResearchPanel from "../components/leads/ResearchPanel";

const PER_PAGE = 25;

export default function LeadTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, refetch } = useLeads({
    page,
    per_page: PER_PAGE,
    search: search || undefined,
    status: status || undefined,
  });

  const importCsv = useImportCSV();
  const researchAll = useResearchAll();

  const leads = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={data ? `${data.total_count} total` : undefined}
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importCsv.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              onClick={() => researchAll.mutate()}
              loading={researchAll.isPending}
              title="Queue research for every pending lead"
            >
              <Sparkles size={15} />
              Research all
            </Button>
            <Button
              variant="primary"
              onClick={() => fileRef.current?.click()}
              loading={importCsv.isPending}
            >
              <Upload size={15} />
              Import CSV
            </Button>
          </>
        }
      />

      {importCsv.isSuccess && importCsv.data && (
        <p className="mb-4 rounded-md border border-success/25 bg-success-soft px-3 py-2 text-[13px] text-success">
          Imported {importCsv.data.imported}. Skipped {importCsv.data.skipped_duplicate} duplicate,{" "}
          {importCsv.data.skipped_invalid} invalid.
        </p>
      )}
      {importCsv.isError && (
        <p className="mb-4 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          Import failed. Check the file is a CSV with an email column.
        </p>
      )}
      {researchAll.isSuccess && researchAll.data && (
        <p className="mb-4 rounded-md border border-info/25 bg-info-soft px-3 py-2 text-[13px] text-info">
          Queued research for {researchAll.data.queued_count} lead(s).
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, or company"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-[180px]"
        >
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="researched">Researched</option>
          <option value="in_sequence">In sequence</option>
          <option value="completed">Completed</option>
          <option value="bounced">Bounced</option>
          <option value="unsubscribed">Unsubscribed</option>
        </Select>
      </div>

      {isLoading && <SkeletonRows rows={8} />}
      {error && <ErrorState error={error} onRetry={() => refetch()} />}

      {!isLoading && !error && leads.length === 0 && (
        <EmptyState
          title={search || status ? "No leads match those filters" : "No leads yet"}
          hint={
            search || status
              ? "Try clearing the search or status filter."
              : "Import a CSV to get started. It needs at minimum an email column."
          }
          action={
            !search && !status ? (
              <Button variant="primary" onClick={() => fileRef.current?.click()}>
                <Upload size={15} />
                Import CSV
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !error && leads.length > 0 && (
        <>
          <Table
            head={
              <>
                <Th>Name</Th>
                <Th>Company</Th>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th>Research</Th>
              </>
            }
          >
            {leads.map((lead) => (
              <Tr key={lead.id} onClick={() => setSelected(lead)}>
                <Td>
                  <span className="font-medium text-ink">
                    {lead.first_name} {lead.last_name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[12px] text-ink-subtle">
                    {lead.email}
                  </span>
                </Td>
                <Td className="text-ink-muted">{lead.company_name || "—"}</Td>
                <Td className="text-ink-muted">{lead.title || "—"}</Td>
                <Td>
                  <LeadStatusBadge status={lead.status} />
                </Td>
                <Td>
                  <ResearchStatusBadge status={lead.research_status} />
                </Td>
              </Tr>
            ))}
          </Table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-[13px] text-ink-muted">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {selected && <ResearchPanel lead={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
