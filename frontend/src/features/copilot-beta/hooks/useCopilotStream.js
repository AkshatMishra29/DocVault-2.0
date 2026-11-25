import { useState, useRef, useCallback } from "react";
import { API_BASE_URL } from "../../../services/api/apiClient";

/**
 * useCopilotStream
 * Connects to POST /api/copilot/chat via Server-Sent Events (SSE).
 * Flushes incoming tokens via requestAnimationFrame.
 * Exposes send, stop, and clean state callbacks.
 */
export function useCopilotStream({ onEvent, onError, onDone }) {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef(null);
  const pendingTextRef = useRef("");
  const rafIdRef = useRef(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async ({ message, sessionId = "default", history = [] }) => {
      stop();
      setIsStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const token = localStorage.getItem("docvault_token") || localStorage.getItem("token") || "";
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/copilot/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify({ message, sessionId, history }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server responded with ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";

        const scheduleFlush = () => {
          if (!rafIdRef.current && pendingTextRef.current) {
            rafIdRef.current = requestAnimationFrame(() => {
              if (pendingTextRef.current && onEvent) {
                onEvent("text_delta", { text: pendingTextRef.current });
                pendingTextRef.current = "";
              }
              rafIdRef.current = null;
            });
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop(); // keep remainder

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue; // skip comments / heartbeat

            if (trimmed.startsWith("event: ")) {
              currentEvent = trimmed.slice(7).trim();
              continue;
            }

            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6);
              const eventName = currentEvent;
              currentEvent = "message";
              try {
                const parsed = JSON.parse(dataStr);
                if (eventName === "text_delta") {
                  pendingTextRef.current += parsed.text || "";
                  scheduleFlush();
                } else {
                  // If we had pending text, flush before other event
                  if (pendingTextRef.current && onEvent) {
                    onEvent("text_delta", { text: pendingTextRef.current });
                    pendingTextRef.current = "";
                  }
                  if (onEvent) onEvent(eventName, parsed);
                }
              } catch (e) {
                console.warn("[Copilot Stream Parse Error]", e);
              }
            }
          }
        }

        // Final flush
        if (pendingTextRef.current && onEvent) {
          onEvent("text_delta", { text: pendingTextRef.current });
          pendingTextRef.current = "";
        }
        if (onDone) onDone();
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("[Copilot Stream Error]", err);
          if (onError) onError(err);
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [stop, onEvent, onError, onDone]
  );

  return { send, stop, isStreaming };
}
