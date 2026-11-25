import React, { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, RotateCw } from "lucide-react";
import Mascot from "./Mascot";
import ToolRunCard from "./ToolRunCard";
import ConfirmCard from "./ConfirmCard";
import SourceChips from "./SourceChips";
import UploadIntakeCard from "./UploadIntakeCard";
import FlashcardWidget from "./FlashcardWidget";

const Message = memo(function Message({
  message,
  onRetry,
  onConfirmHandled,
  onUploadComplete,
  onUploadCancel,
  onFlashcardSaved,
  onFlashcardCancel,
  onCreateFlashcard,
  onDocumentUpdated,
  onDocumentDeleted,
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
        <div className="dv-cp-message__avatar dv-cp-message__avatar--left">
          <Mascot state={isLatestAssistant ? mascotState : "idle"} size={56} />
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

        {/* Interactive In-Chat Upload Intake Card */}
        {message.uploadFile && (
          <UploadIntakeCard
            file={message.uploadFile}
            onCancel={() => onUploadCancel && onUploadCancel(message.id)}
            onUploadComplete={(doc, opts) =>
              onUploadComplete && onUploadComplete(message.id, doc, opts)
            }
          />
        )}

        {/* Interactive Fillable Flashcard Builder */}
        {message.flashcardDraft && (
          <FlashcardWidget
            draft={message.flashcardDraft}
            onSaved={(asset) =>
              onFlashcardSaved && onFlashcardSaved(message.id, asset)
            }
            onCancel={() => onFlashcardCancel && onFlashcardCancel(message.id)}
          />
        )}

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <SourceChips
            sources={message.sources}
            onCreateFlashcard={onCreateFlashcard}
            onDocumentUpdated={onDocumentUpdated}
            onDocumentDeleted={onDocumentDeleted}
          />
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
