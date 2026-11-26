import React, { useRef, useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import Message from "./Message";
import Mascot from "./Mascot";

export default function MessageList({
  messages = [],
  isStreaming = false,
  onRetry,
  onConfirmHandled,
  onUploadComplete,
  onUploadCancel,
  onFlashcardSaved,
  onFlashcardCancel,
  onCreateFlashcard,
  onDocumentUpdated,
  onDocumentDeleted,
  mascotState = "idle",
}) {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distFromBottom = scrollHeight - (scrollTop + clientHeight);
    isNearBottomRef.current = distFromBottom < 160;
    setShowJump(distFromBottom > 80);
  };

  const scrollToBottom = (behavior = "smooth") => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior, block: "end" });
    } else if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const isNewUserSubmission =
      messages.length > prevCountRef.current && lastMsg?.role === "user";
    const isInitialLoad = prevCountRef.current === 0 && messages.length > 0;
    prevCountRef.current = messages.length;

    if (isNewUserSubmission || isInitialLoad || isNearBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom(isNewUserSubmission || isInitialLoad ? "smooth" : "auto");
        setShowJump(false);
      });
    }
  }, [messages, isStreaming]);

  return (
    <div
      className="dv-cp-message-list"
      role="log"
      aria-live="polite"
      ref={containerRef}
      onScroll={handleScroll}
    >
      <div className="dv-cp-message-list__inner">
        {messages.map((msg, idx) => (
          <Message
            key={msg.id || idx}
            message={msg}
            onRetry={onRetry}
            onConfirmHandled={onConfirmHandled}
            onUploadComplete={onUploadComplete}
            onUploadCancel={onUploadCancel}
            onFlashcardSaved={onFlashcardSaved}
            onFlashcardCancel={onFlashcardCancel}
            onCreateFlashcard={onCreateFlashcard}
            onDocumentUpdated={onDocumentUpdated}
            onDocumentDeleted={onDocumentDeleted}
            isLatestAssistant={idx === messages.length - 1 && msg.role === "assistant"}
            mascotState={mascotState}
          />
        ))}

        {isStreaming && messages[messages.length - 1]?.role === "user" && (
          <div className="dv-cp-message dv-cp-message--assistant dv-anim-fade-in">
            <div className="dv-cp-message__avatar dv-cp-message__avatar--left">
              <Mascot state={mascotState || "thinking"} size={56} />
            </div>
            <div className="dv-cp-message__body dv-cp-message__body--typing">
              <span className="dv-cp-typing-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="dv-cp-typing-label">Vee is thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      {showJump && (
        <button
          type="button"
          className="dv-cp-jump-btn"
          onClick={() => scrollToBottom("smooth")}
          aria-label="Jump to latest message"
        >
          <ArrowDown size={14} /> Jump to latest
        </button>
      )}
    </div>
  );
}
