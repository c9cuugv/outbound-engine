import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Copy, Check } from "lucide-react";
import { quickDraft, type QuickDraftRequest } from "../api/quickDraft";
import Button from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { PageHeader, Card, Input, Textarea, Field } from "../components/ui/Primitives";
import { ErrorState } from "../components/ui/Feedback";

const EMPTY: QuickDraftRequest = {
  website_url: "",
  product_name: "",
  value_proposition: "",
  prospect_name: "",
  prospect_email: "",
};

export default function QuickDraft() {
  const [form, setForm] = useState<QuickDraftRequest>(EMPTY);
  const [copied, setCopied] = useState(false);

  const draft = useMutation({ mutationFn: quickDraft });

  const set = <K extends keyof QuickDraftRequest>(key: K, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const ready =
    form.website_url.trim() && form.product_name.trim() && form.value_proposition.trim();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setCopied(false);
    draft.mutate(form);
  }

  async function copy() {
    if (!draft.data) return;
    await navigator.clipboard.writeText(`Subject: ${draft.data.subject}\n\n${draft.data.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const signals = draft.data?.scraped_signals ?? {};
  const signalKeys = Object.keys(signals);

  return (
    <>
      <PageHeader
        title="Quick draft"
        subtitle="Scrape one website and write a single personalized email — no campaign needed."
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr] lg:items-start">
        <Card>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Website" hint="The prospect's company site.">
              <Input
                value={form.website_url}
                onChange={(e) => set("website_url", e.target.value)}
                placeholder="example.com"
                required
              />
            </Field>

            <Field label="Your product">
              <Input
                value={form.product_name}
                onChange={(e) => set("product_name", e.target.value)}
                placeholder="OutboundEngine"
                required
              />
            </Field>

            <Field label="Value proposition">
              <Textarea
                rows={3}
                value={form.value_proposition}
                onChange={(e) => set("value_proposition", e.target.value)}
                placeholder="We automate outreach and save 10 hours a week."
                required
              />
            </Field>

            <Field label="Prospect name" hint="Optional.">
              <Input
                value={form.prospect_name}
                onChange={(e) => set("prospect_name", e.target.value)}
                placeholder="Harrison"
              />
            </Field>

            <Field label="Prospect email" hint="Optional.">
              <Input
                type="email"
                value={form.prospect_email}
                onChange={(e) => set("prospect_email", e.target.value)}
                placeholder="harrison@example.com"
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={!ready}
              loading={draft.isPending}
            >
              <Sparkles size={15} />
              {draft.isPending ? "Scraping and writing…" : "Draft email"}
            </Button>

            {draft.isPending && (
              <p className="text-center text-[12px] text-ink-subtle">
                Scraping the site then generating. This can take up to a minute.
              </p>
            )}
          </form>
        </Card>

        <div className="space-y-4">
          {draft.error && <ErrorState error={draft.error} onRetry={() => draft.mutate(form)} />}

          {!draft.data && !draft.error && !draft.isPending && (
            <Card className="flex min-h-[280px] items-center justify-center border-dashed">
              <p className="max-w-xs text-center text-[13px] text-ink-subtle">
                Fill in the form and the generated subject line and body will appear here.
              </p>
            </Card>
          )}

          {draft.data && (
            <>
              <Card className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="label-overline mb-1">Subject</p>
                    <p className="text-[15px] font-medium text-ink">{draft.data.subject}</p>
                  </div>
                  <Button size="sm" onClick={copy}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>

                <div>
                  <p className="label-overline mb-1.5">Body</p>
                  <pre className="whitespace-pre-wrap break-words rounded-md border border-line bg-canvas p-3.5 font-mono text-[13px] leading-6 text-ink-muted">
                    {draft.data.body}
                  </pre>
                </div>
              </Card>

              {signalKeys.length > 0 && (
                <Card>
                  <p className="label-overline mb-2.5">Signals scraped from {draft.data.website_url}</p>
                  <dl className="space-y-2">
                    {signalKeys.map((k) => (
                      <div key={k} className="flex gap-3">
                        <dt className="shrink-0">
                          <Badge>{k.replace(/_/g, " ")}</Badge>
                        </dt>
                        <dd className="text-[13px] leading-5 text-ink-muted">{signals[k]}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
