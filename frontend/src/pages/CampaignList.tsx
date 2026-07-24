import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useCampaigns } from "../hooks/useCampaigns";
import Button from "../components/ui/Button";
import { CampaignStatusBadge } from "../components/ui/Badge";
import { PageHeader, Table, Th, Td, Tr } from "../components/ui/Primitives";
import { SkeletonRows, EmptyState, ErrorState } from "../components/ui/Feedback";

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

export default function CampaignList() {
  const navigate = useNavigate();
  const { data: campaigns, isLoading, error, refetch } = useCampaigns();

  /* A campaign that is still generating drafts has nothing to review yet, so
     route it to its dashboard rather than an empty review queue. */
  const destination = (id: string, status: string) =>
    status === "review" ? `/campaigns/${id}/review` : `/campaigns/${id}/dashboard`;

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle={campaigns ? `${campaigns.length} total` : undefined}
        actions={
          <Link to="/campaigns/new">
            <Button variant="primary">
              <Plus size={15} />
              New campaign
            </Button>
          </Link>
        }
      />

      {isLoading && <SkeletonRows rows={5} />}
      {error && <ErrorState error={error} onRetry={() => refetch()} />}

      {!isLoading && !error && campaigns?.length === 0 && (
        <EmptyState
          title="No campaigns yet"
          hint="A campaign turns your researched leads into a personalized email sequence."
          action={
            <Link to="/campaigns/new">
              <Button variant="primary">
                <Plus size={15} />
                New campaign
              </Button>
            </Link>
          }
        />
      )}

      {!isLoading && !error && campaigns && campaigns.length > 0 && (
        <Table
          head={
            <>
              <Th>Campaign</Th>
              <Th>Status</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Sent</Th>
              <Th className="text-right">Open</Th>
              <Th className="text-right">Reply</Th>
            </>
          }
        >
          {campaigns.map((c) => (
            <Tr key={c.id} onClick={() => navigate(destination(c.id, c.status))}>
              <Td>
                <span className="font-medium text-ink">{c.name}</span>
                {c.product_name && (
                  <span className="mt-0.5 block text-[12px] text-ink-subtle">{c.product_name}</span>
                )}
              </Td>
              <Td>
                <CampaignStatusBadge status={c.status} />
              </Td>
              <Td className="text-right tabular-nums text-ink-muted">{c.total_leads}</Td>
              <Td className="text-right tabular-nums text-ink-muted">{c.emails_sent}</Td>
              <Td className="text-right tabular-nums text-ink-muted">
                {pct(c.emails_opened, c.emails_sent)}
              </Td>
              <Td className="text-right tabular-nums text-ink-muted">
                {pct(c.emails_replied, c.emails_sent)}
              </Td>
            </Tr>
          ))}
        </Table>
      )}
    </>
  );
}
