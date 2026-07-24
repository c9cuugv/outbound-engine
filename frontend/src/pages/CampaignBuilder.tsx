import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useCreateCampaign, useTemplates, useGenerateEmails } from "../hooks/useCampaigns";
import { fetchLists } from "../api/lists";
import type { CampaignWizardData } from "../types/campaign";
import Button from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import {
  PageHeader,
  Card,
  Input,
  Textarea,
  Select,
  Field,
} from "../components/ui/Primitives";
import { Spinner, ErrorState } from "../components/ui/Feedback";

const STEPS = ["Product", "Audience", "Sequence", "Review"] as const;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const INITIAL: CampaignWizardData = {
  name: "",
  product_name: "",
  product_description: "",
  icp_description: "",
  value_prop: "",
  lead_list_ids: [],
  template_ids: [],
  sending_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  sending_days: ["mon", "tue", "wed", "thu", "fri"],
  sending_window_start: "09:00",
  sending_window_end: "17:00",
  max_emails_per_day: 50,
  sender_email: "",
  sender_name: "",
};

function summarise(form: CampaignWizardData): { label: string; value: string }[] {
  return [
    { label: "Campaign", value: form.name },
    { label: "Product", value: form.product_name },
    { label: "Value prop", value: form.value_prop },
    { label: "Sender", value: `${form.sender_name} <${form.sender_email}>` },
    {
      label: "Schedule",
      value: `${form.sending_days.join(", ")} · ${form.sending_window_start}–${form.sending_window_end} ${form.sending_timezone}`,
    },
    { label: "Daily cap", value: `${form.max_emails_per_day} emails` },
    { label: "Sequence", value: `${form.template_ids.length} step(s)` },
    {
      label: "Lead lists",
      value: form.lead_list_ids.length
        ? `${form.lead_list_ids.length} selected`
        : "All researched leads",
    },
  ];
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-7 flex items-center gap-2">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-colors ${
                done
                  ? "bg-success text-on-accent"
                  : active
                    ? "bg-accent text-on-accent"
                    : "border border-line bg-surface text-ink-subtle"
              }`}
            >
              {done ? <Check size={13} strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={`text-[13px] ${active ? "font-medium text-ink" : "text-ink-subtle"}`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}

export default function CampaignBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CampaignWizardData>(INITIAL);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<unknown>(null);

  const templates = useTemplates();
  const lists = useQuery({ queryKey: ["lists"], queryFn: fetchLists });
  const createCampaign = useCreateCampaign();
  const generateEmails = useGenerateEmails();

  const set = <K extends keyof CampaignWizardData>(key: K, value: CampaignWizardData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggle = (key: "lead_list_ids" | "template_ids" | "sending_days", value: string) =>
    setForm((f) => {
      const list = f[key] as string[];
      return {
        ...f,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });

  // Each step gates on what the backend actually requires downstream.
  const canAdvance = [
    form.name.trim() && form.product_name.trim() && form.value_prop.trim(),
    form.sender_name.trim() && form.sender_email.trim() && form.sending_days.length > 0,
    form.template_ids.length > 0,
    true,
  ][step];

  async function launch() {
    setLaunching(true);
    setLaunchError(null);
    try {
      const campaign = await createCampaign.mutateAsync(form);
      // Generation runs on a Celery worker; the review queue polls for drafts.
      await generateEmails.mutateAsync(campaign.id);
      navigate(`/campaigns/${campaign.id}/review`);
    } catch (err) {
      setLaunchError(err);
      setLaunching(false);
    }
  }

  return (
    <>
      <PageHeader title="New campaign" subtitle="Four steps to a personalized sequence." />
      <Stepper current={step} />

      <Card className="space-y-5">
        {step === 0 && (
          <>
            <Field label="Campaign name">
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Q3 outbound — devtools"
              />
            </Field>
            <Field label="Product name">
              <Input
                value={form.product_name}
                onChange={(e) => set("product_name", e.target.value)}
                placeholder="OutboundEngine"
              />
            </Field>
            <Field
              label="Value proposition"
              hint="The single sentence the AI leans on in every email."
            >
              <Textarea
                rows={2}
                value={form.value_prop}
                onChange={(e) => set("value_prop", e.target.value)}
                placeholder="We automate outbound research and drafting, saving 10 hours a week."
              />
            </Field>
            <Field label="Product description" hint="Optional. Adds detail for the AI.">
              <Textarea
                rows={3}
                value={form.product_description}
                onChange={(e) => set("product_description", e.target.value)}
              />
            </Field>
            <Field label="Ideal customer profile" hint="Optional. Who this is aimed at.">
              <Textarea
                rows={3}
                value={form.icp_description}
                onChange={(e) => set("icp_description", e.target.value)}
                placeholder="Seed-to-Series-B B2B SaaS, 10–100 staff, technical founders."
              />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sender name">
                <Input
                  value={form.sender_name}
                  onChange={(e) => set("sender_name", e.target.value)}
                  placeholder="Alex Rivera"
                />
              </Field>
              <Field label="Sender email">
                <Input
                  type="email"
                  value={form.sender_email}
                  onChange={(e) => set("sender_email", e.target.value)}
                  placeholder="alex@company.com"
                />
              </Field>
            </div>

            <Field label="Sending days">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => {
                  const on = form.sending_days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggle("sending_days", d)}
                      aria-pressed={on}
                      className={`h-8 w-12 rounded-md border text-[13px] uppercase transition-colors ${
                        on
                          ? "border-accent bg-accent-soft font-medium text-accent"
                          : "border-line bg-canvas text-ink-subtle hover:border-line-strong"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Window start">
                <Input
                  type="time"
                  value={form.sending_window_start}
                  onChange={(e) => set("sending_window_start", e.target.value)}
                />
              </Field>
              <Field label="Window end">
                <Input
                  type="time"
                  value={form.sending_window_end}
                  onChange={(e) => set("sending_window_end", e.target.value)}
                />
              </Field>
              <Field label="Max emails / day">
                <Input
                  type="number"
                  min={1}
                  value={form.max_emails_per_day}
                  onChange={(e) => set("max_emails_per_day", Number(e.target.value))}
                />
              </Field>
            </div>

            <Field label="Timezone">
              <Select
                value={form.sending_timezone}
                onChange={(e) => set("sending_timezone", e.target.value)}
              >
                {[form.sending_timezone, "UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Kolkata"]
                  .filter((tz, i, a) => a.indexOf(tz) === i)
                  .map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Lead lists" hint="Leave empty to use every researched lead.">
              {lists.isLoading && <Spinner />}
              {lists.data?.length === 0 && (
                <p className="text-[13px] text-ink-subtle">
                  No lists yet — the campaign will use all researched leads.
                </p>
              )}
              <div className="space-y-1.5">
                {lists.data?.map((l) => (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-canvas px-3 py-2 hover:border-line-strong"
                  >
                    <input
                      type="checkbox"
                      checked={form.lead_list_ids.includes(l.id)}
                      onChange={() => toggle("lead_list_ids", l.id)}
                      className="accent-accent"
                    />
                    <span className="flex-1 text-[13px] text-ink">{l.name}</span>
                    <Badge>{l.member_count} leads</Badge>
                  </label>
                ))}
              </div>
            </Field>
          </>
        )}

        {step === 2 && (
          <Field
            label="Sequence steps"
            hint="Each template becomes one email in the sequence, sent in order."
          >
            {templates.isLoading && <Spinner />}
            {templates.error && <ErrorState error={templates.error} onRetry={() => templates.refetch()} />}
            <div className="space-y-1.5">
              {templates.data
                ?.slice()
                .sort((a, b) => a.sequence_position - b.sequence_position)
                .map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-canvas px-3 py-2.5 hover:border-line-strong"
                  >
                    <input
                      type="checkbox"
                      checked={form.template_ids.includes(t.id)}
                      onChange={() => toggle("template_ids", t.id)}
                      className="mt-0.5 accent-accent"
                    />
                    <span className="flex-1">
                      <span className="block text-[13px] font-medium text-ink">{t.name}</span>
                      <span className="mt-0.5 block text-[12px] text-ink-subtle">
                        Step {t.sequence_position} · sent {t.days_delay}d after previous · {t.tone}
                      </span>
                    </span>
                  </label>
                ))}
            </div>
          </Field>
        )}

        {step === 3 && (
          <dl className="divide-y divide-line text-[13px]">
            {summarise(form).map((row) => (
              <div key={row.label} className="flex gap-4 py-2.5">
                <dt className="w-32 shrink-0 text-ink-subtle">{row.label}</dt>
                <dd className="text-ink">{row.value || "—"}</dd>
              </div>
            ))}
          </dl>
        )}

        {launchError != null && <ErrorState error={launchError} />}
      </Card>

      <div className="mt-5 flex items-center justify-between">
        <Button
          onClick={() => (step === 0 ? navigate("/campaigns") : setStep((s) => s - 1))}
          disabled={launching}
        >
          <ArrowLeft size={15} />
          {step === 0 ? "Cancel" : "Back"}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button variant="primary" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
            Continue
            <ArrowRight size={15} />
          </Button>
        ) : (
          <Button variant="primary" loading={launching} onClick={launch}>
            Create and generate drafts
          </Button>
        )}
      </div>
    </>
  );
}
