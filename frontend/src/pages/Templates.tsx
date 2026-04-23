import { useState } from "react";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { useTemplateList, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from "../hooks/useTemplates";
import type { EmailTemplate } from "../types/campaign";
import Button from "../components/ui/Button";
import Input, { Textarea } from "../components/ui/Input";
import Card, { CardBody } from "../components/ui/Card";
import { FullPageSpinner } from "../components/ui/Spinner";

const TONE_OPTIONS = ["professional", "friendly", "direct", "curious"] as const;

const BLANK: Omit<EmailTemplate, "id" | "created_at" | "updated_at"> = {
  name: "",
  tone: "professional",
  sequence_position: 1,
  days_delay: 0,
  max_word_count: 150,
  system_prompt: "",
  generation_prompt: "",
};

type FormState = typeof BLANK;

interface TemplateModalProps {
  initial: FormState;
  title: string;
  saving: boolean;
  onSave: (data: FormState) => void;
  onClose: () => void;
}

function TemplateModal({ initial, title, saving, onSave, onClose }: TemplateModalProps) {
  const [form, setForm] = useState<FormState>(initial);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[560px] rounded-xl border border-white/[0.08] bg-[var(--color-surface-1)] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.7)] max-h-[90vh] overflow-y-auto">
        <h2 className="mb-5 text-[15px] font-semibold text-[var(--color-ink-primary)]">{title}</h2>

        <div className="flex flex-col gap-4">
          <Input
            label="Template name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Cold intro email"
          />

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Sequence position"
              type="number"
              min={1}
              value={form.sequence_position}
              onChange={(e) => set("sequence_position", Number(e.target.value))}
            />
            <Input
              label="Days delay"
              type="number"
              min={0}
              value={form.days_delay}
              onChange={(e) => set("days_delay", Number(e.target.value))}
            />
            <Input
              label="Max word count"
              type="number"
              min={10}
              value={form.max_word_count}
              onChange={(e) => set("max_word_count", Number(e.target.value))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[var(--color-ink-secondary)]">Tone</label>
            <select
              value={form.tone}
              onChange={(e) => set("tone", e.target.value)}
              className="h-9 w-full rounded border border-white/[0.08] bg-[var(--color-surface-2)] px-3 text-[13px] text-[var(--color-ink-primary)] outline-none transition-all focus:border-[var(--color-accent)] focus:shadow-[0_0_0_1px_var(--color-accent)] hover:border-white/[0.14]"
            >
              {TONE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <Textarea
            label="Generation prompt"
            rows={4}
            value={form.generation_prompt}
            onChange={(e) => set("generation_prompt", e.target.value)}
            placeholder="Describe what this email should accomplish..."
          />

          <Textarea
            label="System prompt (optional)"
            rows={3}
            value={form.system_prompt}
            onChange={(e) => set("system_prompt", e.target.value)}
            placeholder="Optional AI system instructions..."
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => onSave(form)} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : "Save template"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Templates() {
  const { data: templates, isLoading } = useTemplateList();
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const deleteMutation = useDeleteTemplate();

  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; template: EmailTemplate }
    | null
  >(null);

  const sorted = [...(templates ?? [])].sort(
    (a, b) => a.sequence_position - b.sequence_position
  );

  const handleSave = (data: FormState) => {
    if (modal?.mode === "create") {
      createMutation.mutate(data, { onSuccess: () => setModal(null) });
    } else if (modal?.mode === "edit") {
      updateMutation.mutate(
        { id: modal.template.id, payload: data },
        { onSuccess: () => setModal(null) }
      );
    }
  };

  if (isLoading) return <FullPageSpinner />;

  const saving =
    createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--color-ink-primary)]">
            Templates
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
            Manage your outreach email sequence templates
          </p>
        </div>
        <Button onClick={() => setModal({ mode: "create" })}>
          <Plus size={15} className="mr-1.5" />
          New Template
        </Button>
      </div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-[var(--color-surface-1)] py-20">
          <FileText size={36} className="mb-3 text-[var(--color-ink-muted)]" />
          <p className="mb-1 text-[14px] font-medium text-[var(--color-ink-secondary)]">
            No templates yet
          </p>
          <p className="mb-5 text-[13px] text-[var(--color-ink-muted)]">
            Create your first email sequence template to get started.
          </p>
          <Button onClick={() => setModal({ mode: "create" })}>
            <Plus size={15} className="mr-1.5" />
            New Template
          </Button>
        </div>
      )}

      {/* Template list */}
      <div className="flex flex-col gap-3">
        {sorted.map((t) => (
          <Card key={t.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Sequence badge */}
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/[0.15] text-[11px] font-bold text-[var(--color-accent)]">
                    {t.sequence_position}
                  </span>

                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[var(--color-ink-primary)]">
                      {t.name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
                      Day +{t.days_delay} &middot; {t.tone} &middot; max {t.max_word_count} words
                    </p>
                    {t.generation_prompt && (
                      <p className="mt-2 line-clamp-2 text-[12px] text-[var(--color-ink-secondary)]">
                        {t.generation_prompt}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModal({ mode: "edit", template: t })}
                  >
                    <Pencil size={13} className="mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 size={13} className="mr-1 text-red-400" />
                    <span className="text-red-400">Delete</span>
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Modal */}
      {modal && (
        <TemplateModal
          title={modal.mode === "create" ? "New Template" : "Edit Template"}
          initial={
            modal.mode === "edit"
              ? {
                  name: modal.template.name,
                  tone: modal.template.tone,
                  sequence_position: modal.template.sequence_position,
                  days_delay: modal.template.days_delay,
                  max_word_count: modal.template.max_word_count,
                  system_prompt: modal.template.system_prompt,
                  generation_prompt: modal.template.generation_prompt,
                }
              : { ...BLANK }
          }
          saving={saving}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
