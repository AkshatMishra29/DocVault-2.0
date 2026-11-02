import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../services/api";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Sparkles, Send, User, FileText, RotateCcw, AlertCircle, 
  ExternalLink, ShieldCheck, Info
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import DocumentTypeIcon from "../../components/common/DocumentTypeIcon/DocumentTypeIcon";

import "./AskAiPage.css";

const SUGGESTED_PROMPTS = [
  "When does my motor policy expire?",
  "What is my zero-dep insurance deductible?",
  "What is covered under my health policy?",
  "Which appliances still have active warranties?",
  "Find the important details in my latest invoice."
];

export default function AskAiPage() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello! I am your **DocVault AI Copilot**. Ask me any question regarding your stored policies, warranties, or IDs. All my answers are grounded strictly in your personal vault documents.",
      referencedDocIds: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [targetDoc, setTargetDoc] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const linkedDocId = searchParams.get("docId");
  const queryParam = searchParams.get("q");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (linkedDocId) {
      apiRequest(`/api/documents/${linkedDocId}`)
        .then((res) => {
          if (res.success && res.data) setTargetDoc(res.data);
        })
        .catch((err) => console.warn(err));
    }
  }, [linkedDocId]);

  useEffect(() => {
    if (queryParam) {
      handleSend(queryParam);
      // Clean query parameter after trigger
      const next = new URLSearchParams(searchParams);
      next.delete("q");
      setSearchParams(next, { replace: true });
    }
  }, [queryParam]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (questionText) => {
    const textToSend = questionText || input;
    if (!textToSend.trim() || loading) return;

    const userMessage = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await apiRequest("/api/ai/query", {
        method: "POST",
        body: JSON.stringify({
          question: textToSend,
          docId: targetDoc ? targetDoc._id : undefined,
        }),
      });

      if (res.success && res.data) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.data.answer,
            referencedDocIds: res.data.referencedDocIds || [],
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "⚠️ I encountered an issue analyzing your vault documents. Please verify your connection and try again.",
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Server communication error. Please try again later.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        role: "assistant",
        content: "Conversation history cleared. How may I assist you with your vault documents?",
        referencedDocIds: [],
      },
    ]);
  };

  return (
    <div className="dv-ai-page">
      <AppHeader
        title="Ask AI Copilot"
        subtitle="Ask questions and get answers grounded strictly in your personal vault documents."
      />

      <div className="dv-ai-content">
        {targetDoc && (
          <div className="dv-ai-scoped-banner">
            <Sparkles size={16} color="#015A47" />
            <span>Targeting document: <strong>{targetDoc.title}</strong></span>
            <Button variant="ghost" size="sm" onClick={() => setTargetDoc(null)}>
              Clear
            </Button>
          </div>
        )}

        {/* Chat Scroll Container */}
        <Card padding="none" className="dv-ai-chat-window">
          <div className="dv-ai-chat-header">
            <div className="dv-ai-chat-brand">
              <div className="dv-ai-chat-icon">
                <Sparkles size={18} />
              </div>
              <div>
                <h4 className="dv-ai-chat-title">DocVault AI Assistant</h4>
                <span className="dv-ai-chat-sub">Answers strictly grounded in your private vault</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              onClick={handleClear}
              title="Reset Conversation"
            >
              Reset Chat
            </Button>
          </div>

          <div className="dv-ai-chat-history">
            {messages.map((m, idx) => (
              <div key={idx} className={`dv-chat-msg dv-chat-msg--${m.role}`}>
                <div className="dv-chat-msg__avatar">
                  {m.role === "assistant" ? <Sparkles size={16} /> : <User size={16} />}
                </div>
                <div className="dv-chat-msg__bubble">
                  <div className="dv-markdown-wrapper">
                    <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
                  </div>

                  {/* Reference Citation Links */}
                  {m.referencedDocIds && m.referencedDocIds.length > 0 && (
                    <div className="dv-chat-citations">
                      <span className="dv-citations-label">Sources:</span>
                      <div className="dv-citations-list">
                        {m.referencedDocIds.slice(0, 3).map((refId, rIdx) => (
                          <Link 
                            key={rIdx} 
                            to={`/documents/${refId}`} 
                            className="dv-citation-pill"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FileText size={11} />
                            <span>Referenced Document #{rIdx + 1}</span>
                            <ExternalLink size={10} />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="dv-chat-msg dv-chat-msg--assistant">
                <div className="dv-chat-msg__avatar">
                  <Sparkles size={16} />
                </div>
                <div className="dv-chat-msg__bubble dv-chat-loading-bubble">
                  <div className="dv-btn__spinner" />
                  <span>Reviewing vault documents and generating answer...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Prompts Bar */}
          <div className="dv-ai-prompts-bar">
            <span className="dv-ai-prompts-label">Suggestions:</span>
            <div className="dv-ai-prompts-chips">
              {SUGGESTED_PROMPTS.map((prompt, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  className="dv-prompt-chip"
                  onClick={() => handleSend(prompt)}
                  disabled={loading}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Composer */}
          <div className="dv-ai-composer">
            <input
              type="text"
              className="dv-ai-composer__input"
              placeholder="Ask anything about your policies, warranties, or certificates..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={loading}
            />
            <Button
              variant="primary"
              size="md"
              icon={Send}
              loading={loading}
              disabled={!input.trim()}
              onClick={() => handleSend()}
            >
              Ask
            </Button>
          </div>

          {/* Trust Disclaimer */}
          <div className="dv-ai-footer-disclaimer">
            <Info size={13} />
            <span>AI responses are grounded in your stored documents. Please cross-verify critical figures against original contracts.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
