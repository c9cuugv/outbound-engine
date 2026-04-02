import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { Zap, Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCampaignChat } from "../../hooks/useCampaignChat";

interface Props {
  onComplete: (campaignId: string) => void;
}

type Stage = "intro" | "chatting" | "creating";

export default function CampaignChatSetup({ onComplete }: Props) {
  const [stage, setStage] = useState<Stage>("intro");
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, isStreaming, campaignId, error, sendMessage } = useCampaignChat();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // When campaign is created, transition to done
  useEffect(() => {
    if (campaignId) {
      setStage("creating");
      const t = setTimeout(() => onComplete(campaignId), 1500);
      return () => clearTimeout(t);
    }
  }, [campaignId, onComplete]);

  // Focus input and fire first AI message when chat starts
  useEffect(() => {
    if (stage === "chatting") {
      setTimeout(() => inputRef.current?.focus(), 300);
      sendMessage("__init__");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (stage === "intro") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-accent)]">
          <Zap size={26} className="text-[var(--color-surface-0)]" strokeWidth={2.5} />
        </div>
        <h2 className="mb-2 text-[18px] font-bold tracking-tight">AI Campaign Setup</h2>
        <p className="mb-8 max-w-sm text-[13px] text-[var(--color-ink-secondary)]">
          I'll ask you 4 short questions, then automatically write your campaign copy,
          audience targeting, and email sequence. Takes about 2 minutes.
        </p>
        <button
          onClick={() => setStage("chatting")}
          className="flex h-10 items-center gap-2 rounded-lg bg-[var(--color-accent)] px-6 text-[13px] font-semibold text-[var(--color-surface-0)] transition-all hover:opacity-90 active:scale-[0.97]"
        >
          Let's go <span>→</span>
        </button>
      </motion.div>
    );
  }

  if (stage === "creating") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <Loader2 size={32} className="mb-4 animate-spin text-[var(--color-accent)]" />
        <p className="text-[14px] font-medium">Creating your campaign...</p>
        <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
          Generating email sequence in the background
        </p>
      </motion.div>
    );
  }

  // Filter out the hidden __init__ trigger message
  const visibleMessages = messages.filter((m) => m.content !== "__init__");

  return (
    <div className="flex flex-col" style={{ height: "420px" }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
        <AnimatePresence initial={false}>
          {visibleMessages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {msg.role === "assistant" && (
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]">
                  <Zap size={13} className="text-[var(--color-surface-0)]" strokeWidth={2.5} />
                </div>
              )}
              <div
                className={`max-w-[78%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === "assistant"
                    ? "bg-[var(--color-surface-3)] text-[var(--color-ink-primary)]"
                    : "bg-[var(--color-accent)] text-[var(--color-surface-0)]"
                }`}
              >
                {msg.content}
                {msg.role === "assistant" && isStreaming && i === visibleMessages.length - 1 && (
                  <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-current opacity-70" />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {error && (
          <p className="text-center text-[12px] text-red-400">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2 border-t border-white/[0.06] pt-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          placeholder={isStreaming ? "..." : "Type your answer..."}
          className="h-9 flex-1 rounded-lg border border-white/[0.08] bg-[var(--color-surface-2)] px-3 text-[13px] text-[var(--color-ink-primary)] placeholder-[var(--color-ink-muted)] outline-none transition-all focus:border-[var(--color-accent)]/50 disabled:opacity-50"
        />
        <button
          onClick={() => void handleSend()}
          disabled={isStreaming || !input.trim()}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)] text-[var(--color-surface-0)] transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
