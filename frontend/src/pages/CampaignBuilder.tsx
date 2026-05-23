import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings2,
  CalendarDays,
  ChevronDown,
  ArrowRight,
  ChevronLeft,
  Sparkles,
  User,
  Clock,
  Check,
  Building,
  AlertCircle,
  Loader2,
  FileText
} from "lucide-react";
import api from "../api/client";
import { useCreateCampaign, useGenerateEmails, useTemplates } from "../hooks/useCampaigns";
import { useLeads } from "../hooks/useLeads";

export default function CampaignBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [validationError, setValidationError] = useState("");
  
  // Real-time AI Generation overlay state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationCampaignId, setGenerationCampaignId] = useState<string | null>(null);

  // Form State conforming to CampaignWizardData
  const [formData, setFormData] = useState({
    name: "",
    product_name: "",
    product_description: "",
    value_prop: "",
    icp_description: "",
    sender_name: "",
    sender_email: "",
    sending_timezone: "America/New_York",
    sending_days: ["mon", "tue", "wed", "thu", "fri"],
    sending_window_start: "09:00",
    sending_window_end: "17:00",
    max_emails_per_day: 50,
  });

  // Load available lead lists
  const [lists, setLists] = useState<any[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("all");

  useEffect(() => {
    api.get("/lists")
      .then(({ data }) => setLists(data))
      .catch((err) => console.log("Failed to load lists", err));
  }, []);

  // Fetch count of already researched leads to show in Step 2
  const { data: leadsData } = useLeads({ research_status: "completed", per_page: 1 });
  const researchedCount = leadsData?.total_count ?? 0;

  // Retrieve templates for Sequence Step Preview
  const { data: templates, refetch: refetchTemplates } = useTemplates();
  const { mutateAsync: createCampaign, isPending: isCreating } = useCreateCampaign();
  const { mutateAsync: generateEmails, isPending: isGeneratingEmails } = useGenerateEmails();

  // Status Polling Effect: once campaign generation starts, poll until ready
  useEffect(() => {
    if (!isGenerating || !generationCampaignId) return;

    let intervalId: any;
    const checkStatus = async () => {
      try {
        const { data } = await api.get(`/campaigns/${generationCampaignId}`);
        if (data.status === "review" || data.status === "active") {
          setIsGenerating(false);
          navigate(`/campaigns/${generationCampaignId}/review`);
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    };

    checkStatus(); // Initial call
    intervalId = setInterval(checkStatus, 3000);

    return () => clearInterval(intervalId);
  }, [isGenerating, generationCampaignId, navigate]);

  const steps = ["Strategy", "Sender & Schedule", "Sequence Timeline", "Review & Launch"];

  const validateStep = (currentStep: number): boolean => {
    setValidationError("");
    if (currentStep === 1) {
      if (!formData.name.trim()) return fail("Campaign name is required");
      if (!formData.product_name.trim()) return fail("Product/Service name is required");
      if (!formData.product_description.trim()) return fail("Product description is required");
      if (!formData.value_prop.trim()) return fail("Key value proposition is required");
      if (!formData.icp_description.trim()) return fail("Target ICP description is required");
    }
    if (currentStep === 2) {
      if (!formData.sender_name.trim()) return fail("Sender name is required");
      if (!formData.sender_email.trim()) return fail("Sender email is required");
      if (!/\S+@\S+\.\S+/.test(formData.sender_email)) return fail("Please enter a valid email address");
      if (formData.sending_days.length === 0) return fail("Please select at least one active sending day");
    }
    return true;
  };

  const fail = (msg: string): boolean => {
    setValidationError(msg);
    return false;
  };

  const handleNext = async () => {
    if (!validateStep(step)) return;

    if (step < 4) {
      setStep(step + 1);
    } else {
      // Launch Sequence
      try {
        setValidationError("");
        
        // 1. Create the campaign
        const campaign = await createCampaign({
          ...formData,
          lead_list_ids: selectedListId !== "all" ? [selectedListId] : [],
          template_ids: []
        });

        // 2. Seed default templates in the DB if none exist in the system
        if (!templates || templates.length === 0) {
          const seeds = [
            {
              name: "Step 1: Introduction",
              sequence_position: 1,
              days_delay: 0,
              max_word_count: 120,
              tone: "professional-casual",
              generation_prompt: "Write a personalized outreach email introducing our solution based on their company signals and how it resolves their target pain point. Keep it short, focused on value, and end with a soft call-to-action asking for their thoughts.",
              system_prompt: "You are an expert sales representative writing a personalized cold outreach email. Focus on clarity, conciseness, and relevant business outcomes. Never use generic buzzwords or sound robotic."
            },
            {
              name: "Step 2: Follow-up",
              sequence_position: 2,
              days_delay: 3,
              max_word_count: 100,
              tone: "professional-casual",
              generation_prompt: "Write a brief, polite follow-up email. Reference the value prop we shared in the previous email and ask if they had a chance to look at it. Offer to send over a 2-minute video or quick guide.",
              system_prompt: "You are an expert sales representative writing a brief follow-up outreach email. Keep it under 100 words, highly professional, and very warm."
            },
            {
              name: "Step 3: Break-up",
              sequence_position: 3,
              days_delay: 7,
              max_word_count: 80,
              tone: "professional-casual",
              generation_prompt: "Write a friendly 'break-up' email. Let them know this is our last outreach, but we are always open to chat if they encounter challenges in this area. Leave them with one valuable link or resource.",
              system_prompt: "You are an expert sales representative writing a respectful final outreach email. Be friendly, lighthearted, and never pushy."
            }
          ];

          for (const seed of seeds) {
            await api.post("/templates", seed);
          }
          await refetchTemplates();
        }

        // 3. Queue the background email generator task
        await generateEmails(campaign.id);
        
        // 4. Trigger generating polling status view
        setGenerationCampaignId(campaign.id);
        setIsGenerating(true);

      } catch (err: any) {
        setValidationError(err.response?.data?.detail ?? "Failed to create campaign. Please try again.");
      }
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const toggleDay = (dayKey: string) => {
    setFormData(prev => {
      const active = prev.sending_days.includes(dayKey)
        ? prev.sending_days.filter(d => d !== dayKey)
        : [...prev.sending_days, dayKey];
      return { ...prev, sending_days: active };
    });
  };

  const daysMapping = [
    { key: "mon", label: "M" },
    { key: "tue", label: "T" },
    { key: "wed", label: "W" },
    { key: "thu", label: "T" },
    { key: "fri", label: "F" },
    { key: "sat", label: "S" },
    { key: "sun", label: "S" }
  ];

  return (
    <div className="relative mx-auto w-full max-w-5xl px-4">
      {/* Real-time Generation Loader Overlay */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--color-surface-0)]/90 backdrop-blur-md"
          >
            <div className="flex max-w-md flex-col items-center text-center">
              <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles size={40} className="animate-pulse text-primary" />
                <Loader2 size={80} className="absolute animate-spin text-primary opacity-30" />
              </div>
              <h2 className="mb-2 font-display-md text-display-md font-bold text-on-surface">AI Copywriter at Work</h2>
              <p className="font-body-md text-body-md text-on-surface-variant px-6">
                Researched lead profiles are being analyzed. Writing custom cold outreach campaigns and sequences...
              </p>
              <div className="mt-8 flex items-center gap-2 rounded-full bg-surface-container px-4 py-2 text-[12px] font-semibold text-primary">
                <Loader2 size={12} className="animate-spin" />
                <span>Polling Celery tasks & synthesizing drafts...</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="mb-8">
        <h2 className="mb-2 font-display-lg text-display-lg font-bold tracking-tight text-on-surface">Create Campaign</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          Build a hyper-personalized outreach sequence backed by autonomous AI account research.
        </p>
      </div>

      {/* Progress Wizard Header */}
      <div className="mb-10 relative">
        <div className="absolute left-0 top-1/2 z-0 h-[1px] w-full -translate-y-1/2 bg-outline/10"></div>
        <div className="relative z-10 flex w-full items-center justify-between">
          {steps.map((label, idx) => {
            const stepNum = idx + 1;
            const isActive = step === stepNum;
            const isCompleted = step > stepNum;
            return (
              <div
                key={label}
                className={`group flex cursor-pointer flex-col items-center gap-2 transition-opacity ${
                  isActive || isCompleted ? "opacity-100" : "opacity-50"
                }`}
                onClick={() => {
                  if (stepNum < step || validateStep(stepNum - 1)) {
                    setStep(stepNum);
                  }
                }}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-4 border-background font-label-md transition-colors ${
                    isActive
                      ? "bg-primary text-on-primary shadow-[0_0_15px_rgba(173,198,255,0.4)]"
                      : isCompleted
                      ? "bg-primary/80 text-on-primary"
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  {stepNum}
                </div>
                <span
                  className={`font-label-md ${
                    isActive ? "text-primary font-bold" : "text-on-surface-variant group-hover:text-on-surface"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Message */}
      {validationError && (
        <div className="mb-6 flex items-center gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-400">
          <AlertCircle size={18} className="shrink-0" />
          <p className="font-body-md text-body-md font-medium">{validationError}</p>
        </div>
      )}

      {/* Form Container (Glassmorphic Container) */}
      <div className="relative mb-8 overflow-hidden rounded-xl border border-outline/10 bg-surface-container/40 p-8 shadow-sm backdrop-blur-sm">
        <div className="relative z-10">
          
          {/* STEP 1: Campaign Copywriting Strategy */}
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface">
                  <Settings2 size={20} className="text-primary" />
                  Product Copywriting Strategy
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Provide context about your company, value propositions, and Ideal Customer Profile (ICP). This directly drives the email generation engine's personalization algorithms.
                </p>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block font-label-md text-on-surface-variant">Campaign Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Enterprise Q3 SaaS Outreach"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full rounded-lg border border-outline/20 bg-surface-container-lowest py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block font-label-md text-on-surface-variant">Product or Service Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Acme Cloud Automator"
                      value={formData.product_name}
                      onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                      className="w-full rounded-lg border border-outline/20 bg-surface-container-lowest py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block font-label-md text-on-surface-variant">Product/Service Description</label>
                  <textarea
                    rows={3}
                    placeholder="Describe what your product does, its core features, and the primary business problem it solves."
                    value={formData.product_description}
                    onChange={(e) => setFormData({ ...formData, product_description: e.target.value })}
                    className="w-full rounded-lg border border-outline/20 bg-surface-container-lowest py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block font-label-md text-on-surface-variant">Key Value Proposition</label>
                  <textarea
                    rows={3}
                    placeholder="What are the quantifiable business outcomes your target customers achieve? (e.g., Saves 15 hours/week, boosts conversions by 30%)"
                    value={formData.value_prop}
                    onChange={(e) => setFormData({ ...formData, value_prop: e.target.value })}
                    className="w-full rounded-lg border border-outline/20 bg-surface-container-lowest py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block font-label-md text-on-surface-variant">Target ICP (Ideal Customer Profile) Description</label>
                  <textarea
                    rows={3}
                    placeholder="Specify target industries, company sizes, active signals, or specific job positions (e.g., High-growth tech startups in US, 50-200 employees, hiring engineers)."
                    value={formData.icp_description}
                    onChange={(e) => setFormData({ ...formData, icp_description: e.target.value })}
                    className="w-full rounded-lg border border-outline/20 bg-surface-container-lowest py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Sender Config & Delivery Schedule */}
          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface">
                  <CalendarDays size={20} className="text-primary" />
                  Sender Configuration & Schedule
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Configure delivery bounds, timezone, daily throttling limit, and specify who the outreach appears to come from.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Sender Identity */}
                <div className="space-y-5">
                  <h4 className="flex items-center gap-1.5 font-title-md text-title-md font-bold text-on-surface">
                    <User size={16} className="text-primary" />
                    Sender Identity
                  </h4>
                  <div className="space-y-2">
                    <label className="block font-label-md text-on-surface-variant">Sender Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Jane Cooper"
                      value={formData.sender_name}
                      onChange={(e) => setFormData({ ...formData, sender_name: e.target.value })}
                      className="w-full rounded-lg border border-outline/20 bg-surface-container-lowest py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block font-label-md text-on-surface-variant">Sender Email</label>
                    <input
                      type="email"
                      placeholder="e.g., jane@mycompany.com"
                      value={formData.sender_email}
                      onChange={(e) => setFormData({ ...formData, sender_email: e.target.value })}
                      className="w-full rounded-lg border border-outline/20 bg-surface-container-lowest py-2.5 px-4 font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:border-primary focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block font-label-md text-on-surface-variant">Target Lead List (Audience Scope)</label>
                    <div className="relative">
                      <select
                        value={selectedListId}
                        onChange={(e) => setSelectedListId(e.target.value)}
                        className="w-full appearance-none rounded-lg border border-outline/20 bg-surface-container-lowest py-2.5 pl-4 pr-10 font-body-md text-body-md text-on-surface outline-none transition-all focus:border-primary"
                      >
                        <option value="all">All Researched Leads (Recommended)</option>
                        {lists.map(list => (
                          <option key={list.id} value={list.id}>
                            {list.name} ({list.member_count} member{list.member_count !== 1 ? "s" : ""})
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    </div>
                  </div>
                </div>

                {/* Delivery Bounds */}
                <div className="space-y-5">
                  <h4 className="flex items-center gap-1.5 font-title-md text-title-md font-bold text-on-surface">
                    <Clock size={16} className="text-primary" />
                    Delivery Bounds
                  </h4>
                  <div className="space-y-2">
                    <label className="block font-label-md text-on-surface-variant">Timezone</label>
                    <div className="relative">
                      <select
                        value={formData.sending_timezone}
                        onChange={(e) => setFormData({ ...formData, sending_timezone: e.target.value })}
                        className="w-full appearance-none rounded-lg border border-outline/20 bg-surface-container-lowest py-2.5 pl-4 pr-10 font-body-md text-body-md text-on-surface outline-none transition-all focus:border-primary"
                      >
                        <option value="America/New_York">Eastern Time (ET)</option>
                        <option value="America/Chicago">Central Time (CT)</option>
                        <option value="America/Denver">Mountain Time (MT)</option>
                        <option value="America/Los_Angeles">Pacific Time (PT)</option>
                        <option value="Europe/London">Greenwich Mean Time (GMT)</option>
                        <option value="Asia/Tokyo">Japan Standard Time (JST)</option>
                      </select>
                      <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block font-label-md text-on-surface-variant">Time Window Start</label>
                      <input
                        type="time"
                        value={formData.sending_window_start}
                        onChange={(e) => setFormData({ ...formData, sending_window_start: e.target.value })}
                        className="w-full rounded-lg border border-outline/20 bg-surface-container-lowest py-2 px-3 font-body-md text-body-md text-on-surface outline-none transition-all [color-scheme:dark]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block font-label-md text-on-surface-variant">Time Window End</label>
                      <input
                        type="time"
                        value={formData.sending_window_end}
                        onChange={(e) => setFormData({ ...formData, sending_window_end: e.target.value })}
                        className="w-full rounded-lg border border-outline/20 bg-surface-container-lowest py-2 px-3 font-body-md text-body-md text-on-surface outline-none transition-all [color-scheme:dark]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-label-md text-on-surface-variant flex justify-between">
                      <span>Max Emails Per Day</span>
                      <span className="font-bold text-primary">{formData.max_emails_per_day} emails</span>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={200}
                      step={5}
                      value={formData.max_emails_per_day}
                      onChange={(e) => setFormData({ ...formData, max_emails_per_day: parseInt(e.target.value) })}
                      className="w-full accent-primary bg-outline/20 rounded-lg appearance-none h-1.5 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Days Select Pillbox */}
              <div className="mt-8 rounded-lg border border-outline/10 bg-surface-container-lowest/50 p-5">
                <label className="mb-3 block font-label-md text-on-surface-variant">Active Sending Days</label>
                <div className="flex flex-wrap gap-2">
                  {daysMapping.map(({ key, label }) => {
                    const isSelected = formData.sending_days.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleDay(key)}
                        className={`flex h-11 w-11 items-center justify-center rounded-lg border font-label-md transition-all ${
                          isSelected
                            ? "border-primary/50 bg-primary/20 text-primary font-bold shadow-[0_0_10px_rgba(0,180,216,0.1)]"
                            : "border-outline/10 bg-surface-container-low text-on-surface-variant hover:bg-surface-container-highest"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Leads Badge */}
              <div className="mt-6 flex items-center gap-3 rounded-lg border border-outline/10 bg-surface-container/20 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10 text-green-400">
                  <Check size={20} />
                </div>
                <div>
                  <p className="font-label-md text-[13px] font-bold text-on-surface">
                    {researchedCount} Researched Accounts Ready
                  </p>
                  <p className="font-body-sm text-[12px] text-on-surface-variant">
                    Personalized AI copy will be drafted for all leads in the system with completed research profiles.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Sequence Timeline Steps Preview */}
          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface">
                  <Sparkles size={20} className="text-primary" />
                  Active Email Sequence Timeline
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  OutboundEngine executes multi-step email schedules. Preview our high-performing prompt templates engineered for your target value propositions.
                </p>
              </div>

              <div className="relative pl-6 border-l-2 border-outline/10 space-y-8 ml-3">
                {/* Step 1 */}
                <div className="relative">
                  <div className="absolute -left-[35px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary font-label-sm text-[11px] text-on-primary shadow">
                    1
                  </div>
                  <div className="rounded-lg border border-outline/5 bg-surface-container-lowest/70 p-5 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-outline/5 pb-2">
                      <h4 className="font-title-md text-title-md font-bold text-on-surface">Initial Cold Pitch</h4>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Day 1 (Immediate)</span>
                    </div>
                    <div className="space-y-1 text-on-surface-variant font-body-sm text-[13px]">
                      <p><span className="font-bold text-on-surface">System Objective:</span> Act as an expert B2B copywriter introducing your value. Avoid generic intros.</p>
                      <p><span className="font-bold text-on-surface">Persona customization:</span> Incorporates personalized signals scraped from their homepage, careers, and technology stack.</p>
                      <p><span className="font-bold text-on-surface">Call to Action:</span> Low-friction soft inquiry about current systems or pain-points.</p>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="relative">
                  <div className="absolute -left-[35px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/70 font-label-sm text-[11px] text-on-primary shadow">
                    2
                  </div>
                  <div className="rounded-lg border border-outline/5 bg-surface-container-lowest/70 p-5 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-outline/5 pb-2">
                      <h4 className="font-title-md text-title-md font-bold text-on-surface">Contextual Follow-up</h4>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Day 4 (+3 Days delay)</span>
                    </div>
                    <div className="space-y-1 text-on-surface-variant font-body-sm text-[13px]">
                      <p><span className="font-bold text-on-surface">System Objective:</span> Provide rapid follow-up in the same thread. Avoid being pushy.</p>
                      <p><span className="font-bold text-on-surface">Value injection:</span> Share a quick case-study, metric, or a relevant resource. Reference previous context.</p>
                      <p><span className="font-bold text-on-surface">Call to Action:</span> Propose a short call or direct calendar booking option.</p>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="relative">
                  <div className="absolute -left-[35px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/50 font-label-sm text-[11px] text-on-primary shadow">
                    3
                  </div>
                  <div className="rounded-lg border border-outline/5 bg-surface-container-lowest/70 p-5 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-outline/5 pb-2">
                      <h4 className="font-title-md text-title-md font-bold text-on-surface">Final Breakup</h4>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Day 11 (+7 Days delay)</span>
                    </div>
                    <div className="space-y-1 text-on-surface-variant font-body-sm text-[13px]">
                      <p><span className="font-bold text-on-surface">System Objective:</span> Friendly breakup email. Leave a highly favorable final impression.</p>
                      <p><span className="font-bold text-on-surface">Value injection:</span> Politely close the outreach loop but leave useful links for the future.</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Strategy Review & Launch */}
          {step === 4 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface">
                  <FileText size={20} className="text-primary" />
                  Review Campaign Configuration
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Confirm all copywriting context, sending limits, and active schedules before generating your sequences.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Left card: copywriting details */}
                <div className="rounded-xl border border-outline/5 bg-surface-container-lowest/50 p-6 space-y-4 shadow-sm">
                  <h4 className="font-title-md text-title-md font-bold text-primary flex items-center gap-1.5">
                    <Building size={16} /> Product Context
                  </h4>
                  <div className="space-y-3 font-body-sm text-[13px]">
                    <div>
                      <span className="block font-bold text-on-surface">Campaign Name</span>
                      <span className="text-on-surface-variant">{formData.name}</span>
                    </div>
                    <div>
                      <span className="block font-bold text-on-surface">Target Product</span>
                      <span className="text-on-surface-variant">{formData.product_name}</span>
                    </div>
                    <div>
                      <span className="block font-bold text-on-surface">Value Prop Outline</span>
                      <span className="text-on-surface-variant line-clamp-2">{formData.value_prop}</span>
                    </div>
                    <div>
                      <span className="block font-bold text-on-surface">Ideal ICP Target</span>
                      <span className="text-on-surface-variant line-clamp-2">{formData.icp_description}</span>
                    </div>
                  </div>
                </div>

                {/* Right card: delivery limits */}
                <div className="rounded-xl border border-outline/5 bg-surface-container-lowest/50 p-6 space-y-4 shadow-sm">
                  <h4 className="font-title-md text-title-md font-bold text-primary flex items-center gap-1.5">
                    <CalendarDays size={16} /> Delivery Configs
                  </h4>
                  <div className="space-y-3 font-body-sm text-[13px]">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="block font-bold text-on-surface">Sender Identity</span>
                        <span className="text-on-surface-variant">{formData.sender_name}</span>
                      </div>
                      <div>
                        <span className="block font-bold text-on-surface">Sender Address</span>
                        <span className="text-on-surface-variant line-clamp-1">{formData.sender_email}</span>
                      </div>
                    </div>
                    <div>
                      <span className="block font-bold text-on-surface">Sending Timezone</span>
                      <span className="text-on-surface-variant">{formData.sending_timezone}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="block font-bold text-on-surface">Daily Throttling</span>
                        <span className="text-on-surface-variant">{formData.max_emails_per_day} emails/day</span>
                      </div>
                      <div>
                        <span className="block font-bold text-on-surface">Sending Days</span>
                        <span className="text-on-surface-variant uppercase">{formData.sending_days.join(", ")}</span>
                      </div>
                    </div>
                    <div>
                      <span className="block font-bold text-on-surface">Time Window Bounds</span>
                      <span className="text-on-surface-variant">
                        {formData.sending_window_start} to {formData.sending_window_end}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ready to generate accounts confirmation */}
              <div className="mt-8 text-center bg-primary/5 rounded-xl p-8 border border-primary/10">
                <Sparkles size={36} className="mx-auto mb-3 text-primary animate-pulse" />
                <h4 className="font-title-lg text-[16px] font-bold text-on-surface">Autonomous Copywriting Engine Ready</h4>
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant max-w-lg mx-auto">
                  Clicking "Launch Campaign" will compile your value models, seed the standard multi-step templates (if required), scrape signal parameters, and trigger the AI copywriter tasks in Redis/Celery.
                </p>
              </div>
            </motion.div>
          )}

        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-outline/10 pt-5">
        <button
          onClick={handleBack}
          disabled={step === 1}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 font-label-md text-on-surface transition-colors ${
            step === 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-surface-container-high"
          }`}
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <button
          onClick={handleNext}
          disabled={isCreating || isGeneratingEmails}
          className="group flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-label-md text-on-primary shadow-sm transition-all duration-200 hover:bg-primary-container hover:text-on-primary-container hover:shadow active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating || isGeneratingEmails ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Launching...</span>
            </>
          ) : step === 4 ? (
            <>
              <Sparkles size={16} />
              <span>Launch Campaign</span>
            </>
          ) : (
            <>
              <span>Next Step</span>
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
