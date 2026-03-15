import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useCreateCampaign, useGenerateEmails, useTemplates } from "../hooks/useCampaigns";
import Button from "../components/ui/Button";
import Card, { CardBody } from "../components/ui/Card";
import Spinner from "../components/ui/Spinner";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Package,
  Users,
  Mail,
  Clock,
  Sparkles,
  Loader2,
} from "lucide-react";
import type { CampaignWizardData, EmailTemplate } from "../types/campaign";

const STEPS = [
  { id: 1, label: "Product Info", icon: Package },
  { id: 2, label: "Select Leads", icon: Users },
  { id: 3, label: "Sequence", icon: Mail },
  { id: 4, label: "Sending", icon: Clock },
] as const;

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const INITIAL_DATA: CampaignWizardData = {
  name: "",
  product_name: "",
  product_description: "",
  icp_description: "",
  value_prop: "",
  lead_list_ids: [],
  template_ids: [],
  sending_timezone: "America/Phoenix",
  sending_days: ["mon", "tue", "wed", "thu", "fri"],
  sending_window_start: "09:00",
  sending_window_end: "17:00",
  max_emails_per_day: 30,
  sender_email: "",
  sender_name: "",
};

export default function CampaignWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [prevStep, setPrevStep] = useState(1);
  const [data, setData] = useState<CampaignWizardData>(INITIAL_DATA);
  const [generating, setGenerating] = useState(false);

  const createCampaign = useCreateCampaign();
  const generateEmails = useGenerateEmails();
  const { data: templates } = useTemplates();

  const update = useCallback(
    <K extends keyof CampaignWizardData>(key: K, value: CampaignWizardData[K]) => {
      setData((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const canAdvance = (): boolean => {
    switch (step) {
      case 1:
        return !!(data.name && data.product_name && data.product_description.length >= 50 && data.icp_description && data.value_prop);
      case 2:
        return data.lead_list_ids.length > 0;
      case 3:
        return data.template_ids.length > 0;
      case 4:
        return !!(data.sender_email && data.sender_name && data.sending_days.length > 0);
      default:
        return false;
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const campaign = await createCampaign.mutateAsync(data);
      await generateEmails.mutateAsync(campaign.id);
      // Poll until generation is done, then redirect
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/v1/campaigns/${campaign.id}`);
          const c = await res.json();
          if (c.status === "review") {
            clearInterval(poll);
            navigate(`/campaigns/${campaign.id}/review`);
          }
        } catch {
          // keep polling
        }
      }, 5000);
    } catch {
      setGenerating(false);
    }
  };

  if (generating) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center">
        <div className="relative mb-6">
          <div className="h-20 w-20 rounded-full border-2 border-[var(--color-accent-dim)]" />
          <Loader2
            size={48}
            className="absolute inset-0 m-auto animate-spin text-[var(--color-accent)]"
          />
        </div>
        <h2 className="mb-2 text-[18px] font-semibold">Generating Emails</h2>
        <p className="max-w-sm text-center text-[13px] text-[var(--color-ink-secondary)]">
          AI is researching your leads and crafting personalized emails.
          This usually takes 1-2 minutes.
        </p>
        <Spinner className="mt-6" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <h1 className="mb-1 text-[22px] font-bold tracking-tight">New Campaign</h1>
      <p className="mb-8 text-[13px] text-[var(--color-ink-secondary)]">
        Set up your outreach campaign in 4 steps.
      </p>

      {/* Animated progress bar */}
      <div className="mb-6 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-hover)]"
          initial={false}
          animate={{ width: `${(step / 4) * 100}%` }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        />
      </div>

      {/* Step Indicator */}
      <div className="mb-8 flex items-center gap-1">
        {STEPS.map(({ id, label, icon: Icon }) => (
          <div key={id} className="flex flex-1 items-center">
            <div
              className={`flex items-center gap-2 rounded px-3 py-2 transition-colors ${
                step === id
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                  : step > id
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-ink-muted)]"
              }`}
            >
              {step > id ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)]"
                >
                  <Check size={12} className="text-[var(--color-surface-0)]" />
                </motion.div>
              ) : (
                <Icon size={14} />
              )}
              <span className="text-[12px] font-medium">{label}</span>
            </div>
            {id < 4 && (
              <div className="relative mx-1 h-px flex-1 bg-white/[0.06]">
                {step > id && (
                  <motion.div
                    className="absolute inset-0 bg-[var(--color-accent)]/40"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    style={{ transformOrigin: "left" }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Step Content — slide transition */}
      <Card>
        <CardBody className="overflow-hidden py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: step > prevStep ? 24 : -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: step > prevStep ? -24 : 24 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {step === 1 && <ProductInfoStep data={data} update={update} />}
              {step === 2 && <SelectLeadsStep data={data} update={update} />}
              {step === 3 && <SequenceConfigStep data={data} update={update} templates={templates ?? []} />}
              {step === 4 && <SendingSettingsStep data={data} update={update} />}
            </motion.div>
          </AnimatePresence>
        </CardBody>
      </Card>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => { setPrevStep(step); setStep((s) => s - 1); }}
          disabled={step === 1}
          icon={<ArrowLeft size={14} />}
        >
          Back
        </Button>

        {step < 4 ? (
          <Button
            variant="primary"
            onClick={() => { setPrevStep(step); setStep((s) => s + 1); }}
            disabled={!canAdvance()}
            icon={<ArrowRight size={14} />}
          >
            Continue
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={!canAdvance()}
            loading={createCampaign.isPending}
            icon={<Sparkles size={14} />}
          >
            Generate Emails
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Step 1: Product Info ── */
function ProductInfoStep({
  data,
  update,
}: {
  data: CampaignWizardData;
  update: <K extends keyof CampaignWizardData>(key: K, val: CampaignWizardData[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <InputField label="Campaign Name" value={data.name} onChange={(v) => update("name", v)} placeholder="Q1 SaaS Outreach" />
      <InputField label="Product Name" value={data.product_name} onChange={(v) => update("product_name", v)} placeholder="OutboundEngine" />
      <TextareaField
        label="Product Description"
        value={data.product_description}
        onChange={(v) => update("product_description", v)}
        placeholder="We help startups automate their cold outreach with AI-powered personalization..."
        hint={`${data.product_description.length}/500 characters (min 50)`}
      />
      <TextareaField
        label="Ideal Customer Profile (ICP)"
        value={data.icp_description}
        onChange={(v) => update("icp_description", v)}
        placeholder="Series A SaaS founders with 20-50 employees doing outbound sales..."
      />
      <TextareaField
        label="Value Proposition"
        value={data.value_prop}
        onChange={(v) => update("value_prop", v)}
        placeholder="3x reply rates with hyper-personalized outreach at scale..."
      />
    </div>
  );
}

/* ── Step 2: Select Leads ── */
function SelectLeadsStep({
  data,
  update,
}: {
  data: CampaignWizardData;
  update: <K extends keyof CampaignWizardData>(key: K, val: CampaignWizardData[K]) => void;
}) {
  return (
    <div>
      <p className="mb-4 text-[13px] text-[var(--color-ink-secondary)]">
        Select lead lists to include in this campaign.
      </p>
      {/* Placeholder for lead list selection — requires Dev A's list API */}
      <div className="rounded-lg border border-dashed border-white/[0.12] px-6 py-10 text-center">
        <Users size={32} className="mx-auto mb-3 text-[var(--color-ink-muted)]" />
        <p className="text-[13px] text-[var(--color-ink-secondary)]">
          Lead list picker will connect to your imported leads.
        </p>
        <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
          {data.lead_list_ids.length} lists selected
        </p>
        {/* Temporary: allow proceeding for dev by adding a dummy ID */}
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => update("lead_list_ids", ["all"])}
        >
          Use All Leads
        </Button>
      </div>
    </div>
  );
}

/* ── Step 3: Sequence Config ── */
function SequenceConfigStep({
  data,
  update,
  templates,
}: {
  data: CampaignWizardData;
  update: <K extends keyof CampaignWizardData>(key: K, val: CampaignWizardData[K]) => void;
  templates: EmailTemplate[];
}) {
  const sorted = [...templates].sort((a, b) => a.sequence_position - b.sequence_position);

  const toggleTemplate = (id: string) => {
    const ids = data.template_ids.includes(id)
      ? data.template_ids.filter((t) => t !== id)
      : [...data.template_ids, id];
    update("template_ids", ids);
  };

  return (
    <div>
      <p className="mb-5 text-[13px] text-[var(--color-ink-secondary)]">
        Select email templates for your sequence. Emails will be sent in order.
      </p>
      <div className="flex items-center gap-3">
        {sorted.map((template, i) => (
          <div key={template.id} className="flex items-center gap-3">
            <button
              onClick={() => toggleTemplate(template.id)}
              className={`flex w-44 flex-col rounded-xl border-2 p-4 text-left transition-all ${
                data.template_ids.includes(template.id)
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)]"
                  : "border-white/[0.08] bg-[var(--color-surface-2)] hover:border-white/[0.15]"
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <Mail size={14} className={data.template_ids.includes(template.id) ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)]"} />
                <span className="text-[12px] font-semibold text-[var(--color-ink-primary)]">
                  Email {template.sequence_position}
                </span>
              </div>
              <p className="text-[12px] text-[var(--color-ink-secondary)]">{template.name}</p>
              <p className="mt-1 font-mono text-[11px] text-[var(--color-ink-muted)]">
                Day +{template.days_delay}
              </p>
            </button>
            {i < sorted.length - 1 && (
              <ArrowRight size={14} className="text-[var(--color-ink-muted)]" />
            )}
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="w-full rounded-lg border border-dashed border-white/[0.12] px-6 py-8 text-center">
            <p className="text-[13px] text-[var(--color-ink-muted)]">
              No templates found. Seed templates will appear after running the setup script.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Step 4: Sending Settings ── */
function SendingSettingsStep({
  data,
  update,
}: {
  data: CampaignWizardData;
  update: <K extends keyof CampaignWizardData>(key: K, val: CampaignWizardData[K]) => void;
}) {
  const toggleDay = (day: string) => {
    const days = data.sending_days.includes(day)
      ? data.sending_days.filter((d) => d !== day)
      : [...data.sending_days, day];
    update("sending_days", days);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <InputField label="Sender Name" value={data.sender_name} onChange={(v) => update("sender_name", v)} placeholder="Alex from OutboundEngine" />
        <InputField label="Sender Email" value={data.sender_email} onChange={(v) => update("sender_email", v)} placeholder="alex@outboundengine.com" type="email" />
      </div>

      <div>
        <label className="mb-2 block text-[12px] font-medium text-[var(--color-ink-secondary)]">Sending Days</label>
        <div className="flex gap-2">
          {DAYS.map((day) => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={`rounded px-3 py-2 text-[12px] font-medium capitalize transition-colors ${
                data.sending_days.includes(day)
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                  : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink-secondary)]"
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <InputField label="Window Start" value={data.sending_window_start} onChange={(v) => update("sending_window_start", v)} type="time" />
        <InputField label="Window End" value={data.sending_window_end} onChange={(v) => update("sending_window_end", v)} type="time" />
        <InputField label="Max Emails/Day" value={String(data.max_emails_per_day)} onChange={(v) => update("max_emails_per_day", Number(v))} type="number" />
      </div>

      <InputField
        label="Timezone"
        value={data.sending_timezone}
        onChange={(v) => update("sending_timezone", v)}
        placeholder="America/Phoenix"
      />
    </div>
  );
}

/* ── Form primitives ── */
function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-ink-secondary)]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded border border-white/[0.08] bg-[var(--color-surface-2)] px-3 text-[13px] text-[var(--color-ink-primary)] placeholder-[var(--color-ink-muted)] outline-none transition-all focus:border-[var(--color-accent)]/50 focus:shadow-[0_0_0_2px_rgba(0,180,216,0.15)]"
      />
      {hint && <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">{hint}</p>}
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-ink-secondary)]">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded border border-white/[0.08] bg-[var(--color-surface-2)] px-3 py-2.5 text-[13px] text-[var(--color-ink-primary)] placeholder-[var(--color-ink-muted)] outline-none transition-all focus:border-[var(--color-accent)]/50 focus:shadow-[0_0_0_2px_rgba(0,180,216,0.15)]"
      />
      {hint && <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">{hint}</p>}
    </div>
  );
}
