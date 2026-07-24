import { useEffect, useState } from "react";
import { useCampaigns, useUpdateCampaign } from "../hooks/useCampaigns";
import Button from "../components/ui/Button";
import { PageHeader, Card, Input, Field } from "../components/ui/Primitives";
import { SkeletonRows, EmptyState, ErrorState } from "../components/ui/Feedback";

export default function Settings() {
  const campaigns = useCampaigns();
  const campaign = campaigns.data?.[0];
  const updateCampaign = useUpdateCampaign();

  const [senderName, setSenderName] = useState("");
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("17:00");

  useEffect(() => {
    if (campaign) {
      setSenderName(campaign.sender_name);
      setWindowStart(campaign.sending_window_start);
      setWindowEnd(campaign.sending_window_end);
    }
  }, [campaign]);

  if (campaigns.isLoading) return <SkeletonRows rows={4} />;
  if (campaigns.error) {
    return <ErrorState error={campaigns.error} onRetry={() => campaigns.refetch()} />;
  }
  if (!campaign) {
    return (
      <EmptyState
        title="No campaign yet"
        hint="Create a campaign first — sender and sending-window settings live on it."
      />
    );
  }

  function save() {
    if (!campaign) return;
    updateCampaign.mutate({
      id: campaign.id,
      payload: {
        sender_name: senderName,
        sending_window_start: windowStart,
        sending_window_end: windowEnd,
      },
    });
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Sender identity and default sending window." />

      <Card className="max-w-lg space-y-5">
        <Field label="Sender name">
          <Input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Alex Rivera"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Window start">
            <Input
              type="time"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
            />
          </Field>
          <Field label="Window end">
            <Input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
          </Field>
        </div>

        {updateCampaign.error != null && <ErrorState error={updateCampaign.error} />}

        <div className="flex items-center gap-3">
          <Button variant="primary" loading={updateCampaign.isPending} onClick={save}>
            Save changes
          </Button>
          {updateCampaign.isSuccess && (
            <span className="text-[13px] text-ink-muted">Saved.</span>
          )}
        </div>
      </Card>
    </>
  );
}
