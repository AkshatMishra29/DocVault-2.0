import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../services/api";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Sparkles, Send, User, FileText, RotateCcw, AlertCircle, 
  ExternalLink, ShieldCheck, Info, ClipboardCopy, Check, FileSpreadsheet
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

const FORM_TEMPLATES = [
  {
    name: "Home Loan Application",
    icon: "🏠",
    desc: "Extracts PAN, Current & Permanent Address, Bank Account details, Employer name, and Salary details."
  },
  {
    name: "Vehicle Insurance Claim",
    icon: "🚗",
    desc: "Extracts Registration (RC) Number, Engine/Chassis No, Policy Number, Insurer name, and Expiry."
  },
  {
    name: "Passport Application / Renewal",
    icon: "🛂",
    desc: "Extracts Full Legal Name, Date of Birth, Parents' Names, Old Passport Number, and Proof of Address."
  },
  {
    name: "General KYC & Bank Verification",
    icon: "💳",
    desc: "Extracts Full Legal Name, DOB, PAN Number, Aadhaar Number, and Father/Spouse details."
  }
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
  const [docTitleMap, setDocTitleMap] = useState({});
  const [vaultDocCount, setVaultDocCount] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [showFormPicker, setShowFormPicker] = useState(false);

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
            referencedDocs: res.data.referencedDocs || [],
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res?.error || "⚠️ I encountered an issue analyzing your vault documents. Please verify your connection and try again.",
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err?.message || "⚠️ Server communication error. Please try again later.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleFillForm = (templateName) => {
    const prompt = `Please extract all required details from my stored vault documents to help me fill out a "${templateName}". Compile them into a structured checklist of fields (Full Legal Name, Date of Birth, Father/Spouse Name, ID/PAN/Passport Numbers, Addresses, Policy/Account Details) with the source document cited for each item, so I can copy and paste directly into the form.`;
    setShowFormPicker(false);
    handleSend(prompt);
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
        title="Ask AI"
        subtitle="Ask anything about your policies and documents."
      />

      <div className="dv-ai-content">
        {/* Apple Zen 3D Copilot Command Hero */}
        <div className="dv-ai-hero">
          <div className="dv-ai-hero__info">
            <h2 className="dv-ai-hero__title">
              <span className="dv-ai-hero__title-accent">AI Assistant</span>
            </h2>
            <p className="dv-ai-hero__desc">
              Ask questions, get answers from your documents.
            </p>
          </div>

          <div className="dv-ai-hero__badge">
            <div className="dv-ai-hero__badge-num">25 MB</div>
            <div className="dv-ai-hero__badge-label">Max File • PDF, JPG, PNG, WEBP</div>
          </div>
        </div>

        {vaultDocCount === 0 && (
          <div className="dv-ai-empty-vault-banner">
            <div className="dv-ai-empty-vault-left">
              <FileText size={20} className="dv-ai-empty-vault-icon" />
              <div>
                <strong className="dv-ai-empty-vault-title">Your vault is empty</strong>
                <p className="dv-ai-empty-vault-desc">
                  Upload policies, warranties, or receipts so the AI Assistant can answer questions about them.
                </p>
              </div>
            </div>
            <Link to="/upload">
              <Button variant="primary" size="sm">
                Upload a Document
              </Button>
            </Link>
          </div>
        )}

        {targetDoc && (
          <div className="dv-ai-scoped-banner">
            <div className="dv-ai-scoped-left">
              <Sparkles size={16} />
              <span>Targeting document scope: <strong>{targetDoc.title}</strong></span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTargetDoc(null)}>
              Clear Scope
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
                <div className="dv-ai-chat-title-row">
                  <h4 className="dv-ai-chat-title">DocVault AI Assistant</h4>
                  <span className="dv-ai-status-pill">
                    <span className="dv-ai-status-dot" />
                    Vault Bounded
                  </span>
                </div>
                <span className="dv-ai-chat-sub">Zero hallucination • Sourced from your private knowledge graph</span>
              </div>
            </div>
            <Button
              variant="outline"
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
                        {m.referencedDocIds.slice(0, 3).map((refId, rIdx) => {
                          const docObj = (m.referencedDocs || []).find((d) => String(d.id || d._id) === String(refId));
                          const docTitle = docObj?.title || docTitleMap[refId] || `Document #${rIdx + 1}`;
                          return (
                            <Link 
                              key={rIdx} 
                              to={`/documents/${refId}`} 
                              className="dv-citation-pill"
                              target="_blank"
                              rel="noopener noreferrer"
                              title={docTitle}
                            >
                              <FileText size={11} />
                              <span style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {docTitle}
                              </span>
                              <ExternalLink size={10} />
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {m.role === "assistant" && (
                    <div className="dv-chat-copy-row">
                      <button
                        type="button"
                        onClick={() => handleCopy(m.content, idx)}
                        className={`dv-chat-copy-btn ${copiedIdx === idx ? "dv-chat-copy-btn--copied" : ""}`}
                        title="Copy answer details"
                      >
                        {copiedIdx === idx ? <Check size={12} /> : <ClipboardCopy size={12} />}
                        <span>{copiedIdx === idx ? "Copied!" : "Copy Details"}</span>
                      </button>
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
                  <div className="dv-chat-loading-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span>Reading your documents and finding the answer...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Filler Assistant Bar */}
          <div className="dv-ai-form-bar">
            <div className="dv-ai-form-bar-left">
              <FileSpreadsheet size={15} className="dv-ai-form-icon" />
              <strong className="dv-ai-form-title">
                Form Filler Assistant:
              </strong>
              <span className="dv-ai-form-desc">
                Auto-extract your personal fields for standard forms
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowFormPicker(!showFormPicker)}
              className="dv-ai-form-toggle-btn"
            >
              <span>{showFormPicker ? "Hide Form Templates" : "Select Form Template"}</span>
            </button>
          </div>

          {/* Form Picker Grid */}
          {showFormPicker && (
            <div className="dv-ai-form-grid">
              {FORM_TEMPLATES.map((tmpl, tIdx) => (
                <button
                  key={tIdx}
                  type="button"
                  onClick={() => handleFillForm(tmpl.name)}
                  className="dv-ai-form-card"
                >
                  <span className="dv-ai-form-card-title">
                    <span>{tmpl.icon}</span>
                    <span>{tmpl.name}</span>
                  </span>
                  <span className="dv-ai-form-card-desc">
                    {tmpl.desc}
                  </span>
                </button>
              ))}
            </div>
          )}

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
