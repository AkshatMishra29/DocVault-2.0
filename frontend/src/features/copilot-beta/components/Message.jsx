import React, { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, RotateCw } from "lucide-react";
import Mascot from "./Mascot";
import ToolRunCard from "./ToolRunCard";
import ConfirmCard from "./ConfirmCard";
import SourceChips from "./SourceChips";

const Message = memo(function Message({
  message,
  onRetry,
  onConfirmHandled,
  isLatestAssistant = false,
  mascotState = "idle",
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`dv-cp-message dv-cp-message--${message.role}`}>
      {!isUser && (
        <div className="dv-cp-message__avatar">
          {isLatestAssistant ? (
            <Mascot state={mascotState} size={28} />
          ) : (
            <Mascot state="idle" size={28} />
          )}
        </div>
      )}

      <div className="dv-cp-message__body">
        {/* Active/Past Tool Runs */}
        {message.toolRuns && message.toolRuns.length > 0 && (
          <div className="dv-cp-message__tools">
            {message.toolRuns.map((tr) => (
              <ToolRunCard key={tr.id} toolRun={tr} />
            ))}
          </div>
        )}

        {/* Action Confirmations */}
        {message.confirmations && message.confirmations.length > 0 && (
          <div className="dv-cp-message__confirmations">
            {message.confirmations.map((conf) => (
              <ConfirmCard
                key={conf.runId}
                confirmation={conf}
                onHandled={onConfirmHandled}
              />
            ))}
          </div>
        )}

        {/* Text Markdown Output */}
        {message.content && (
          <div className="dv-cp-message__text">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ node, ...props }) => (
                  <div className="dv-cp-table-wrap">
                    <table {...props} />
                  </div>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <SourceChips sources={message.sources} />
        )}

        {/* Action Toolbar */}
        {!isUser && message.content && (
          <div className="dv-cp-message__actions">
            <button
              type="button"
              className="dv-cp-action-btn"
              onClick={handleCopy}
              aria-label="Copy response"
              title="Copy"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            {onRetry && isLatestAssistant && (
              <button
                type="button"
                className="dv-cp-action-btn"
                onClick={onRetry}
                aria-label="Retry response"
                title="Retry"
              >
                <RotateCw size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default Message;
