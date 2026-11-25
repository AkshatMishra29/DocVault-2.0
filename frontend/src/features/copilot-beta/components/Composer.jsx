import React, { useState, useRef, useEffect } from "react";
import { Send, Square } from "lucide-react";

export default function Composer({ onSend, onStop, isStreaming, initialValue = "" }) {
  const [text, setText] = useState(initialValue);
  const textareaRef = useRef(null);

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

  return (
    <form className="dv-cp-composer" onSubmit={handleSubmit}>
      <div className="dv-cp-composer__inner">
        <textarea
          ref={textareaRef}
          className="dv-cp-composer__textarea"
          placeholder="Ask Copilot to search documents, track deadlines, or organize flashcards..."
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
