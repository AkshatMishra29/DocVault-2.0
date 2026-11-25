import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Square,
  Paperclip,
  Layers,
  Clock,
  Search,
  GraduationCap,
  Share2,
} from "lucide-react";

const QUICK_CHIPS = [
  { label: "Upload Doc", action: "upload", icon: Paperclip },
  { label: "New Flashcard", action: "flashcard", icon: Layers },
  { label: "Deadlines", prompt: "What deadlines are coming up in the next 30 days?", icon: Clock },
  { label: "List Assets", prompt: "List all my registered flashcard assets.", icon: Search },
  { label: "Study Deck", prompt: "Create a 5-card study deck from my latest document.", icon: GraduationCap },
  { label: "Shares", prompt: "Show my active document shares and access history.", icon: Share2 },
];

export default function Composer({
  onSend,
  onStop,
  onFileSelect,
  onNewFlashcard,
  isStreaming,
  initialValue = "",
  triggerUploadRef,
}) {
  const [text, setText] = useState(initialValue);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (triggerUploadRef) {
      triggerUploadRef.current = () => fileInputRef.current?.click();
    }
  }, [triggerUploadRef]);

  useEffect(() => {
    if (initialValue) {
      setText(initialValue);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, [initialValue]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (isStreaming) {
      onStop();
      return;
    }
    const clean = text.trim();
    if (!clean) return;
    onSend(clean);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onFileSelect) {
      onFileSelect(file);
    }
    e.target.value = "";
  };

  const handleChipClick = (chip) => {
    if (isStreaming) return;
    if (chip.action === "upload") {
      fileInputRef.current?.click();
    } else if (chip.action === "flashcard" && onNewFlashcard) {
      onNewFlashcard();
    } else if (chip.prompt && onSend) {
      onSend(chip.prompt);
    }
  };

  return (
    <form className="dv-cp-composer" onSubmit={handleSubmit}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Quick Action Bar */}
      <div className="dv-cp-quickbar">
        {QUICK_CHIPS.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.label}
              type="button"
              className="dv-cp-quickbar__chip"
              onClick={() => handleChipClick(chip)}
              disabled={isStreaming}
            >
              <Icon size={12} />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      <div className="dv-cp-composer__inner">
        <div className="dv-cp-composer__left-tools">
          <button
            type="button"
            className="dv-cp-composer__tool-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            title="Upload document into chat"
            aria-label="Upload document"
          >
            <Paperclip size={16} />
          </button>

          {onNewFlashcard && (
            <button
              type="button"
              className="dv-cp-composer__tool-btn"
              onClick={onNewFlashcard}
              disabled={isStreaming}
              title="Create interactive Flashcard"
              aria-label="Create Flashcard"
            >
              <Layers size={16} />
            </button>
          )}
        </div>

        <textarea
          ref={textareaRef}
          className="dv-cp-composer__textarea"
          placeholder="Ask Copilot, drop a file to upload, or create a flashcard..."
          rows={1}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
        />

        <div className="dv-cp-composer__actions">
          {isStreaming ? (
            <button
              type="button"
              className="dv-cp-composer__btn dv-cp-composer__btn--stop"
              onClick={onStop}
              aria-label="Stop generating response"
              title="Stop (Esc)"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              type="submit"
              className="dv-cp-composer__btn dv-cp-composer__btn--send"
              disabled={!text.trim()}
              aria-label="Send message"
              title="Send (Enter)"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
