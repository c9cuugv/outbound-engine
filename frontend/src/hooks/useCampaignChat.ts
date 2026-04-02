import { useState, useCallback, useRef } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseCampaignChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  campaignId: string | null;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
}

export function useCampaignChat(): UseCampaignChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    const userMessage: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setIsStreaming(true);
    setError(null);

    abortRef.current = new AbortController();

    try {
      const token = sessionStorage.getItem("access_token");
      const resp = await fetch("/api/v1/campaigns/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: nextMessages }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw) as
              | { type: "token"; content: string }
              | { type: "done"; campaign_id: string }
              | { type: "error"; content: string };

            if (event.type === "token") {
              assistantText += event.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantText,
                };
                return updated;
              });
            } else if (event.type === "done") {
              setCampaignId(event.campaign_id);
            } else if (event.type === "error") {
              setError(event.content);
            }
          } catch {
            // skip malformed event
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [messages]);

  return { messages, isStreaming, campaignId, error, sendMessage };
}
