import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Save } from "lucide-react";
import { quickDraft, QuickDraftRequest, QuickDraftResponse } from "../api/quickDraft";
import api from "../api/client";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";

export default function QuickDraft() {
  const [form, setForm] = useState<QuickDraftRequest>({
    website_url: "",
    product_name: "",
    value_proposition: "",
    prospect_name: "",
    prospect_email: "",
  });

  const [draft, setDraft] = useState<QuickDraftResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const { mutate: generateDraft, isPending } = useMutation({
    mutationFn: quickDraft,
    onSuccess: (data) => {
      setDraft(data);
      setErrorMsg("");
      setSaved(false);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail || "An unexpected error occurred while generating the draft.");
      setDraft(null);
    },
  });

  const { mutate: saveLead, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      // 1. Create Lead
      const { data: lead } = await api.post("/leads", {
        first_name: form.prospect_name.split(" ")[0] || "Unknown",
        last_name: form.prospect_name.split(" ").slice(1).join(" ") || "Unknown",
        email: form.prospect_email,
        company_domain: draft.website_url,
      });
      // 2. Add enrichment
      await api.patch(`/leads/${lead.id}`, {
        enrichment: {
          quick_draft: {
            subject: draft.subject,
            body: draft.body,
          }
        }
      });
    },
    onSuccess: () => {
      setSaved(true);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail || "Failed to save lead.");
    }
  });

  const handleCopy = () => {
    if (!draft) return;
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-5xl pb-10">
      <div className="mb-8">
        <h2 className="mb-2 font-display-lg text-display-lg font-bold tracking-tight text-on-surface">Quick Draft</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          Scrape a website and generate a personalized email instantly.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-outline/10 bg-surface-container-low p-6">
            <h3 className="mb-4 font-headline-sm text-headline-sm font-semibold text-on-surface">Input Parameters</h3>
            <div className="space-y-4" data-testid="quick-draft-form">
              <div>
                <label className="mb-1.5 block font-label-sm text-label-sm font-medium text-on-surface-variant">Website URL</label>
                <input
                  type="text"
                  placeholder="e.g. stripe.com"
                  className="w-full rounded-lg border border-outline/20 bg-surface-container-high px-4 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.website_url}
                  onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block font-label-sm text-label-sm font-medium text-on-surface-variant">Product Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-outline/20 bg-surface-container-high px-4 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.product_name}
                  onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block font-label-sm text-label-sm font-medium text-on-surface-variant">Value Proposition</label>
                <input
                  type="text"
                  placeholder="one sentence"
                  className="w-full rounded-lg border border-outline/20 bg-surface-container-high px-4 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.value_proposition}
                  onChange={(e) => setForm({ ...form, value_proposition: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block font-label-sm text-label-sm font-medium text-on-surface-variant">Prospect Name</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-outline/20 bg-surface-container-high px-4 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.prospect_name}
                  onChange={(e) => setForm({ ...form, prospect_name: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block font-label-sm text-label-sm font-medium text-on-surface-variant">Prospect Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-outline/20 bg-surface-container-high px-4 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  value={form.prospect_email}
                  onChange={(e) => setForm({ ...form, prospect_email: e.target.value })}
                />
              </div>
              
              <Button 
                onClick={() => generateDraft(form)} 
                disabled={isPending || !form.website_url || !form.product_name || !form.prospect_name}
                className="w-full"
                data-testid="scrape-btn"
              >
                {isPending ? <Spinner size={16} /> : null}
                <span className={isPending ? "ml-2" : ""}>Scrape & Draft</span>
              </Button>
            </div>
            
            {errorMsg && (
              <div className="mt-4 rounded-lg bg-red-500/10 p-4 border border-red-500/20" data-testid="error-alert">
                <p className="text-[13px] text-red-400">{errorMsg}</p>
              </div>
            )}
            
            {isPending && (
              <div className="mt-4 text-center">
                <p className="text-[13px] text-on-surface-variant">Scraping website and drafting email...</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          {draft && !isPending && (
            <>
              <div className="rounded-xl border border-outline/10 bg-surface-container-low p-6" data-testid="scraped-signals">
                <h3 className="mb-4 font-headline-sm text-headline-sm font-semibold text-on-surface">SCRAPED SIGNALS</h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {Object.entries(draft.scraped_signals).map(([path, text]) => (
                    <div key={path} className="rounded bg-surface-container p-3 text-[13px]">
                      <span className="font-semibold text-primary">{path}:</span> <span className="text-on-surface-variant">{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-outline/10 bg-surface-container-low p-6" data-testid="draft-section">
                <h3 className="mb-4 font-headline-sm text-headline-sm font-semibold text-on-surface">DRAFT EMAIL</h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block font-label-sm text-label-sm font-medium text-on-surface-variant">Subject</label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-outline/20 bg-surface-container-high px-4 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      value={draft.subject}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block font-label-sm text-label-sm font-medium text-on-surface-variant">Body</label>
                    <textarea
                      rows={8}
                      className="w-full rounded-lg border border-outline/20 bg-surface-container-high px-4 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      value={draft.body}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    />
                  </div>
                  
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button 
                      variant="primary" 
                      onClick={() => saveLead()}
                      disabled={isSaving || saved}
                      data-testid="save-btn"
                    >
                      {isSaving ? <Spinner size={16} /> : <Save size={16} />}
                      <span className="ml-2">{saved ? "Saved!" : "Save as Lead + Draft"}</span>
                    </Button>
                    <Button 
                      variant="secondary" 
                      onClick={handleCopy}
                      data-testid="copy-btn"
                    >
                      <Copy size={16} />
                      <span className="ml-2">{copied ? "Copied!" : "Copy to Clipboard"}</span>
                    </Button>
                  </div>
                  {saved && <p className="text-[13px] text-emerald-400 mt-2">Lead saved and draft stored</p>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
