import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { apiRequest, API_BASE_URL } from "../../services/api";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Sparkles, Send, User, FileText, RotateCcw, AlertCircle, 
  ExternalLink, ShieldCheck, Info, Check, Copy, FileSpreadsheet,
  Plus, MessageSquare, Trash2, Edit3, ChevronLeft, ChevronRight,
  PanelLeftClose, PanelLeftOpen, Search, Clock, Eye, Download, X,
  FileCheck, Shield, ChevronDown, Layers
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Modal from "../../components/common/Modal/Modal";
import "./AskAiPage.css";

const SUGGESTED_PROMPTS = [
  "When does my motor policy expire?",
  "What is my zero-dep insurance deductible?",
  "What is covered under my health policy?",
  "Which appliances still have active warranties?",
  "Find the critical details in my latest invoice."
];

const FORM_TEMPLATES = [
  {
    name: "Home Loan Application",
    icon: "🏠",
    desc: "Extracts PAN, Current & Permanent Address, Bank Account details, Employer name, and Salary."
  },
  {
    name: "Vehicle Insurance Claim",
    icon: "🚗",
    desc: "Extracts Registration (RC) Number, Engine/Chassis No, Policy Number, Insurer name, and Expiry."
  },
  {
    name: "Passport Application / Renewal",
    icon: "🛂",
    desc: "Extracts Full Legal Name, DOB, Parents' Names, Old Passport Number, and Proof of Address."
  },
  {
    name: "General KYC & Bank Verification",
    icon: "💳",
    desc: "Extracts Full Legal Name, DOB, PAN Number, Aadhaar Number, and Father/Spouse details."
  }
];

const INITIAL_MESSAGE = {
  role: "assistant",
  content: "Hello! I am your **DocVault AI Copilot**. Ask me any question regarding your stored policies, warranties, or IDs. All my answers are grounded strictly in your personal vault documents.",
  sources: [],
  referencedDocIds: [],
};

// Date grouping helper for ChatGPT-like sidebar
function groupConversationsByDate(convs) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7Days = startOfToday - 86400000 * 7;

  const groups = {
    today: [],
    yesterday: [],
    last7Days: [],
    older: [],
  };

  for (const c of convs) {
    const time = new Date(c.lastMessageAt || c.updatedAt || c.createdAt).getTime();
    if (time >= startOfToday) {
      groups.today.push(c);
    } else if (time >= startOfYesterday) {
      groups.yesterday.push(c);
    } else if (time >= startOf7Days) {
      groups.last7Days.push(c);
    } else {
      groups.older.push(c);
    }
  }

  return groups;
}

// Markdown Code Block with copy
function ChatCodeBlock({ inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const codeText = String(children).replace(/\n$/, "");

  if (inline) {
    return <code className="dv-chat-inline-code" {...props}>{children}</code>;
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dv-chat-code-block">
      <div className="dv-chat-code-header">
        <span className="dv-chat-code-lang">{match ? match[1] : "text"}</span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="dv-chat-code-copy-btn"
          title="Copy snippet"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="dv-chat-code-pre">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

// Markdown Responsive Table
function ChatTable({ children }) {
  return (
    <div className="dv-chat-table-wrapper">
      <table className="dv-chat-table">{children}</table>
    </div>
  );
}

// Resilient Error Boundary for in-chat document viewer modal
class DocViewerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.warn("[DocViewerErrorBoundary] Preview renderer caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="dv-viewer-modal-state dv-viewer-modal-state--error">
          <AlertCircle size={28} color="#EF4444" />
          <span>Inline preview could not be displayed by this browser.</span>
          {this.props.streamUrl && (
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <a href={this.props.streamUrl} target="_blank" rel="noopener noreferrer" className="dv-viewer-modal-btn">
                <ExternalLink size={14} />
                <span>Open in New Tab</span>
              </a>
              <a href={this.props.streamUrl} download={this.props.title || "document"} className="dv-viewer-modal-btn">
                <Download size={14} />
                <span>Download</span>
              </a>
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AskAiPage() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [targetDoc, setTargetDoc] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [showFormPicker, setShowFormPicker] = useState(false);

  // Conversation history state
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [convSearch, setConvSearch] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [editingConvId, setEditingConvId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");

  // In-Chat Quick Document Viewer Modal
  const [viewerDoc, setViewerDoc] = useState(null);
  const [viewerBlobUrl, setViewerBlobUrl] = useState(null);
  const [viewerStreamUrl, setViewerStreamUrl] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const linkedDocId = searchParams.get("docId");
  const queryParam = searchParams.get("q");
  const urlConvId = searchParams.get("conversationId");

  const messagesEndRef = useRef(null);
  const chatScrollContainerRef = useRef(null);
  const isAutoScrollPausedRef = useRef(false);
  const textareaRef = useRef(null);

  // Fetch conversations on mount
  const loadConversations = useCallback(async () => {
    try {
      const res = await apiRequest("/api/ai/conversations");
      if (res.success && Array.isArray(res.data)) {
        setConversations(res.data);
      }
    } catch (err) {
      console.warn("[AskAI] Failed to load conversations:", err);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load target document if docId present in URL
  useEffect(() => {
    if (linkedDocId) {
      apiRequest(`/api/documents/${linkedDocId}`)
        .then((res) => {
          if (res.success && res.data) setTargetDoc(res.data);
        })
        .catch((err) => console.warn(err));
    }
  }, [linkedDocId]);

  // Handle URL conversationId
  useEffect(() => {
    if (urlConvId && urlConvId !== activeConvId) {
      selectConversation(urlConvId);
    }
  }, [urlConvId]);

  // Handle URL query trigger
  useEffect(() => {
    if (queryParam) {
      handleSend(queryParam);
      const next = new URLSearchParams(searchParams);
      next.delete("q");
      setSearchParams(next, { replace: true });
    }
  }, [queryParam]);

  // Scroll to bottom when new messages arrive (unless paused by user scrolling up)
  useEffect(() => {
    if (!isAutoScrollPausedRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  // Handle scroll listener to detect if user scrolled up
  const handleChatScroll = () => {
    const el = chatScrollContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    isAutoScrollPausedRef.current = !isAtBottom;
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${Math.max(nextHeight, 46)}px`;
  }, [input]);

  // Select and load a conversation from persistent history
  const selectConversation = async (convId) => {
    if (!convId) return;
    setActiveConvId(convId);
    setIsMobileDrawerOpen(false);

    // Update query params cleanly
    const next = new URLSearchParams(searchParams);
    next.set("conversationId", convId);
    setSearchParams(next, { replace: true });

    try {
      const res = await apiRequest(`/api/ai/conversations/${convId}`);
      if (res.success && res.data) {
        const history = (res.data.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
          sources: m.sources || [],
          referencedDocIds: m.referencedDocIds || [],
          confidence: m.confidence || "high",
        }));
        setMessages(history.length > 0 ? history : [INITIAL_MESSAGE]);
        isAutoScrollPausedRef.current = false;
      }
    } catch (err) {
      console.warn("[AskAI] Failed to load conversation messages:", err);
    }
  };

  // Start a clean new conversation
  const handleNewChat = () => {
    setActiveConvId(null);
    setMessages([INITIAL_MESSAGE]);
    setInput("");
    isAutoScrollPausedRef.current = false;
    const next = new URLSearchParams(searchParams);
    next.delete("conversationId");
    setSearchParams(next, { replace: true });
    setIsMobileDrawerOpen(false);
  };

  // Rename a conversation
  const handleRenameSubmit = async (convId, e) => {
    if (e) e.preventDefault();
    if (!editingTitle.trim()) {
      setEditingConvId(null);
      return;
    }
    try {
      const res = await apiRequest(`/api/ai/conversations/${convId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editingTitle.trim() }),
      });
      if (res.success && res.data) {
        setConversations((prev) =>
          prev.map((c) => (c._id === convId ? { ...c, title: res.data.title } : c))
        );
      }
    } catch (err) {
      console.warn("[AskAI] Failed to rename conversation:", err);
    } finally {
      setEditingConvId(null);
      setEditingTitle("");
    }
  };

  // Delete a conversation
  const handleDeleteConversation = async (convId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm("Delete this conversation history permanently?")) return;

    try {
      const res = await apiRequest(`/api/ai/conversations/${convId}`, {
        method: "DELETE",
      });
      if (res.success) {
        setConversations((prev) => prev.filter((c) => c._id !== convId));
        if (activeConvId === convId) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.warn("[AskAI] Failed to delete conversation:", err);
    }
  };

  // Core send message handler
  const handleSend = async (questionText) => {
    const textToSend = questionText || input;
    if (!textToSend.trim() || loading) return;

    isAutoScrollPausedRef.current = false;
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
          conversationId: activeConvId || undefined,
        }),
      });

      if (res.success && res.data) {
        // If this query generated a new conversationId
        if (res.data.conversationId && (!activeConvId || activeConvId !== res.data.conversationId)) {
          setActiveConvId(res.data.conversationId);
          const next = new URLSearchParams(searchParams);
          next.set("conversationId", res.data.conversationId);
          setSearchParams(next, { replace: true });
          loadConversations();
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.data.answer,
            sources: res.data.sources || [],
            referencedDocIds: res.data.referencedDocIds || [],
            referencedDocs: res.data.referencedDocs || [],
            referencedAssets: res.data.referencedAssets || [],
            confidence: res.data.confidence || "high",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res?.error || "⚠️ I encountered an issue analyzing your vault documents. Please verify your connection and try again.",
            isError: true,
            sources: [],
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err?.message || "⚠️ Server communication error. Please try again later.",
          isError: true,
          sources: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // One-click answer copy
  const handleCopy = (text, idx) => {
    if (!navigator.clipboard) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    }).catch(() => {});
  };

  const handleFillForm = (templateName) => {
    const prompt = `Please extract all required details from my stored vault documents to help me fill out a "${templateName}". Compile them into a structured checklist of fields (Full Legal Name, Date of Birth, Father/Spouse Name, ID/PAN/Passport Numbers, Addresses, Policy/Account Details) with the source document cited for each item, so I can copy and paste directly into the form.`;
    setShowFormPicker(false);
    handleSend(prompt);
  };

  // Open Quick Document Viewer in chat with direct stream URL & fallback
  const handleOpenDocViewer = (source) => {
    if (!source) return;
    const docId = source.documentId || source.assetId || source.id || source._id;
    if (!docId) return;

    const token = localStorage.getItem("token") || localStorage.getItem("docvault_token") || "";
    const streamUrl = `${API_BASE_URL}/api/documents/${docId}/download?token=${encodeURIComponent(token)}`;

    setViewerDoc({
      ...source,
      documentId: docId,
      title: String(source.title || "Document Preview"),
      documentType: String(source.documentType || source.format || "PDF"),
      category: source.category || "Document",
      previewRoute: source.previewRoute || `/documents/${docId}`,
    });
    setViewerStreamUrl(streamUrl);
    setViewerLoading(false);
    setViewerError(null);
  };

  const handleCloseDocViewer = () => {
    if (viewerBlobUrl) {
      try {
        URL.revokeObjectURL(viewerBlobUrl);
      } catch (_e) {}
    }
    setViewerDoc(null);
    setViewerStreamUrl(null);
    setViewerBlobUrl(null);
    setViewerError(null);
    setViewerLoading(false);
  };

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!convSearch.trim()) return conversations;
    const q = convSearch.toLowerCase().trim();
    return conversations.filter((c) => (c.title || "").toLowerCase().includes(q));
  }, [conversations, convSearch]);

  const grouped = useMemo(() => {
    return groupConversationsByDate(filteredConversations);
  }, [filteredConversations]);

  // Markdown components mapping
  const markdownComponents = useMemo(() => ({
    code: ChatCodeBlock,
    table: ChatTable,
    a: ({ node, ...props }) => (
      <a target="_blank" rel="noopener noreferrer" className="dv-chat-link" {...props} />
    ),
  }), []);

  return (
    <div className="dv-ai-page">
      {/* App Header */}
      <AppHeader
        title="Ask AI Copilot"
        subtitle="Conversational answers grounded in your encrypted DocVault documents."
      />

      {/* Main ChatGPT-Style Chat Shell */}
      <div className={`dv-ai-shell ${isSidebarOpen ? "dv-ai-shell--sidebar-open" : "dv-ai-shell--sidebar-closed"}`}>
        
        {/* =========================================================================
            DESKTOP & TABLET CONVERSATION SIDEBAR
            ========================================================================= */}
        <aside className="dv-ai-sidebar">
          {/* Top Actions: New Chat & Toggle */}
          <div className="dv-ai-sidebar__top">
            <button
              type="button"
              className="dv-ai-new-chat-btn"
              onClick={handleNewChat}
              title="Start a new conversation"
            >
              <Plus size={16} />
              <span>New Chat</span>
            </button>
            <button
              type="button"
              className="dv-ai-sidebar-toggle-btn"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          {/* Search Conversations */}
          {conversations.length > 5 && (
            <div className="dv-ai-sidebar__search">
              <Search size={13} className="dv-ai-sidebar__search-icon" />
              <input
                type="text"
                placeholder="Search chats..."
                value={convSearch}
                onChange={(e) => setConvSearch(e.target.value)}
                className="dv-ai-sidebar__search-input"
              />
            </div>
          )}

          {/* History List */}
          <div className="dv-ai-sidebar__history">
            {conversations.length === 0 ? (
              <div className="dv-ai-sidebar__empty">
                <Clock size={16} />
                <span>No saved conversations yet.</span>
              </div>
            ) : (
              <>
                {grouped.today.length > 0 && (
                  <div className="dv-ai-conv-group">
                    <span className="dv-ai-conv-group-title">Today</span>
                    {grouped.today.map((conv) => renderConvItem(conv))}
                  </div>
                )}

                {grouped.yesterday.length > 0 && (
                  <div className="dv-ai-conv-group">
                    <span className="dv-ai-conv-group-title">Yesterday</span>
                    {grouped.yesterday.map((conv) => renderConvItem(conv))}
                  </div>
                )}

                {grouped.last7Days.length > 0 && (
                  <div className="dv-ai-conv-group">
                    <span className="dv-ai-conv-group-title">Previous 7 Days</span>
                    {grouped.last7Days.map((conv) => renderConvItem(conv))}
                  </div>
                )}

                {grouped.older.length > 0 && (
                  <div className="dv-ai-conv-group">
                    <span className="dv-ai-conv-group-title">Older</span>
                    {grouped.older.map((conv) => renderConvItem(conv))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sidebar Footer Badge */}
          <div className="dv-ai-sidebar__footer">
            <ShieldCheck size={14} className="dv-ai-footer-shield" />
            <div className="dv-ai-footer-text">
              <strong>Vault Isolated</strong>
              <span>Zero external AI training</span>
            </div>
          </div>
        </aside>



        {/* =========================================================================
            MOBILE SLIDE-OUT DRAWER
            ========================================================================= */}
        {isMobileDrawerOpen && (
          <div className="dv-ai-drawer-backdrop" onClick={() => setIsMobileDrawerOpen(false)}>
            <div className="dv-ai-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="dv-ai-drawer__header">
                <div className="dv-ai-drawer__title">
                  <Clock size={16} />
                  <span>Chat History</span>
                </div>
                <button
                  type="button"
                  className="dv-ai-drawer__close"
                  onClick={() => setIsMobileDrawerOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <button
                type="button"
                className="dv-ai-new-chat-btn dv-ai-new-chat-btn--drawer"
                onClick={handleNewChat}
              >
                <Plus size={16} />
                <span>New Chat</span>
              </button>

              <div className="dv-ai-sidebar__history">
                {conversations.length === 0 ? (
                  <div className="dv-ai-sidebar__empty">
                    <span>No conversations saved yet.</span>
                  </div>
                ) : (
                  <>
                    {grouped.today.length > 0 && (
                      <div className="dv-ai-conv-group">
                        <span className="dv-ai-conv-group-title">Today</span>
                        {grouped.today.map((conv) => renderConvItem(conv))}
                      </div>
                    )}
                    {grouped.yesterday.length > 0 && (
                      <div className="dv-ai-conv-group">
                        <span className="dv-ai-conv-group-title">Yesterday</span>
                        {grouped.yesterday.map((conv) => renderConvItem(conv))}
                      </div>
                    )}
                    {grouped.last7Days.length > 0 && (
                      <div className="dv-ai-conv-group">
                        <span className="dv-ai-conv-group-title">Previous 7 Days</span>
                        {grouped.last7Days.map((conv) => renderConvItem(conv))}
                      </div>
                    )}
                    {grouped.older.length > 0 && (
                      <div className="dv-ai-conv-group">
                        <span className="dv-ai-conv-group-title">Older</span>
                        {grouped.older.map((conv) => renderConvItem(conv))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MAIN CHAT WORKSPACE
            ========================================================================= */}
        <main className="dv-ai-main-chat">
          {/* Top Chat Bar: Mobile Drawer Trigger, Active Scope, Reset */}
          <div className="dv-ai-chat-header">
            <div className="dv-ai-chat-header__left">
              {/* Desktop Collapsed Sidebar Restore Button */}
              {!isSidebarOpen && (
                <button
                  type="button"
                  className="dv-ai-sidebar-restore-btn"
                  onClick={() => setIsSidebarOpen(true)}
                  title="Expand chat history"
                >
                  <PanelLeftOpen size={16} />
                </button>
              )}

              {/* Mobile Drawer Button */}
              <button
                type="button"
                className="dv-ai-mobile-menu-btn"
                onClick={() => setIsMobileDrawerOpen(true)}
                title="Open Chat History"
              >
                <MessageSquare size={17} />
                <span>History</span>
              </button>

              <div className="dv-ai-chat-brand">
                <div className="dv-ai-chat-icon">
                  <Sparkles size={16} />
                </div>
                <div>
                  <div className="dv-ai-chat-title-row">
                    <h3 className="dv-ai-chat-title">
                      {activeConvId
                        ? conversations.find((c) => c._id === activeConvId)?.title || "AI Conversation"
                        : "DocVault AI Copilot"}
                    </h3>
                    <span className="dv-ai-status-pill">
                      <span className="dv-ai-status-dot" />
                      Grounded
                    </span>
                  </div>
                  <span className="dv-ai-chat-sub">Zero hallucination • Sourced strictly from your documents</span>
                </div>
              </div>
            </div>

            <div className="dv-ai-chat-header__right">
              {targetDoc && (
                <div className="dv-ai-scope-pill" title={`Targeting: ${targetDoc.title}`}>
                  <span>Scope: <strong>{targetDoc.title}</strong></span>
                  <button type="button" onClick={() => setTargetDoc(null)}>
                    <X size={12} />
                  </button>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                icon={RotateCcw}
                onClick={handleNewChat}
                title="Start a fresh conversation"
              >
                New Chat
              </Button>
            </div>
          </div>

          {/* Scrollable Message History Area */}
          <div
            className="dv-ai-chat-history"
            ref={chatScrollContainerRef}
            onScroll={handleChatScroll}
          >
            {messages.map((m, idx) => {
              const isAssistant = m.role === "assistant";
              return (
                <div key={idx} className={`dv-chat-msg dv-chat-msg--${m.role}`}>
                  <div className="dv-chat-msg__avatar">
                    {isAssistant ? <Sparkles size={16} /> : <User size={16} />}
                  </div>

                  <div className="dv-chat-msg__bubble">
                    {/* Rendered Markdown Body */}
                    <div className="dv-markdown-wrapper">
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {m.content}
                      </Markdown>
                    </div>

                    {/* Source Document Citations / Deep Links */}
                    {isAssistant && m.sources && m.sources.length > 0 && (
                      <div className="dv-chat-sources-block">
                        <div className="dv-sources-header">
                          <FileCheck size={13} className="dv-sources-icon" />
                          <span className="dv-sources-title">Verified Sources & Flashcards</span>
                        </div>
                        <div className="dv-sources-grid">
                          {m.sources.map((source, sIdx) => {
                            const isAsset = source.type === "asset" || source.documentType === "flashcard";
                            const docId = source.documentId || source.assetId || source.id || source._id;
                            const targetRoute = isAsset ? (source.previewRoute || `/assets/${docId}`) : (source.previewRoute || `/documents/${docId}`);

                            return (
                              <div key={sIdx} className={`dv-source-card ${isAsset ? "dv-source-card--asset" : ""}`}>
                                <div className="dv-source-card__left">
                                  <div className="dv-source-card__icon">
                                    {isAsset ? <Layers size={15} style={{ color: "var(--color-primary)" }} /> : <FileText size={15} />}
                                  </div>
                                  <div className="dv-source-card__meta">
                                    <span className="dv-source-card__title" title={source.title}>
                                      {source.title}
                                    </span>
                                    <span className="dv-source-card__sub">
                                      {source.category} {source.pageNumber ? `• Page ${source.pageNumber}` : ""}
                                    </span>
                                  </div>
                                </div>

                                <div className="dv-source-card__actions">
                                  {!isAsset && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenDocViewer({ ...source, documentId: docId })}
                                      className="dv-source-btn dv-source-btn--preview"
                                      title="Quick Preview inside Chat"
                                    >
                                      <Eye size={12} />
                                      <span>Preview</span>
                                    </button>
                                  )}
                                  <Link
                                    to={targetRoute}
                                    target={isAsset ? "_self" : "_blank"}
                                    rel="noopener noreferrer"
                                    className="dv-source-btn dv-source-btn--open"
                                    title={isAsset ? "View Asset Flashcard" : "Open full document record"}
                                  >
                                    <ExternalLink size={12} />
                                    {isAsset && <span style={{ marginLeft: 4 }}>Open Card</span>}
                                  </Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Claude-style Message Action Row */}
                    {isAssistant && (
                      <div className="dv-chat-action-row">
                        <button
                          type="button"
                          onClick={() => handleCopy(m.content, idx)}
                          className={`dv-chat-action-btn ${copiedIdx === idx ? "dv-chat-action-btn--copied" : ""}`}
                          title="Copy answer details"
                        >
                          {copiedIdx === idx ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedIdx === idx ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Smooth Generating Indicator */}
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
                  <span>Analyzing encrypted vault documents...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Template Picker Bar */}
          <div className="dv-ai-form-bar">
            <div className="dv-ai-form-bar-left">
              <FileSpreadsheet size={14} className="dv-ai-form-icon" />
              <strong className="dv-ai-form-title">Form Filler:</strong>
              <span className="dv-ai-form-desc">Auto-extract your personal fields for applications</span>
            </div>
            <button
              type="button"
              onClick={() => setShowFormPicker(!showFormPicker)}
              className="dv-ai-form-toggle-btn"
            >
              <span>{showFormPicker ? "Hide Templates" : "Select Template"}</span>
              <ChevronDown size={12} style={{ transform: showFormPicker ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
          </div>

          {/* Form Template Drawer */}
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
                  <span className="dv-ai-form-card-desc">{tmpl.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* Suggested Prompts Pills (Only when empty or 1 message) */}
          {messages.length <= 1 && (
            <div className="dv-ai-prompts-bar">
              <span className="dv-ai-prompts-label">Suggested:</span>
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
          )}

          {/* Fixed Bottom Chat Composer */}
          <div className="dv-ai-composer-wrapper">
            <div className="dv-ai-composer">
              <textarea
                ref={textareaRef}
                rows={1}
                className="dv-ai-composer__textarea"
                placeholder="Ask anything about your policies, warranties, or certificates..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={loading}
              />
              <button
                type="button"
                className="dv-ai-send-btn"
                disabled={!input.trim() || loading}
                onClick={() => handleSend()}
                title="Send message (Enter)"
              >
                <Send size={16} />
              </button>
            </div>

            <div className="dv-ai-footer-disclaimer">
              <Info size={12} />
              <span>Answers are grounded in your stored documents. Please cross-verify critical numbers against original contracts.</span>
            </div>
          </div>
        </main>
      </div>

      {/* =========================================================================
          IN-CHAT QUICK DOCUMENT VIEWER MODAL
          ========================================================================= */}
      <Modal
        isOpen={Boolean(viewerDoc)}
        onClose={handleCloseDocViewer}
        title={viewerDoc ? String(viewerDoc.title || "Document Preview") : "Document Preview"}
        maxWidth="920px"
        className="dv-viewer-modal-dialog"
      >
        <DocViewerErrorBoundary streamUrl={viewerStreamUrl} title={viewerDoc?.title}>
          <div className="dv-viewer-modal-content">
            <div className="dv-viewer-modal-bar">
              <div className="dv-viewer-modal-badges">
                <Badge variant="outline" size="sm">{viewerDoc?.category || "Document"}</Badge>
                {viewerDoc?.pageNumber && <Badge variant="neutral" size="sm">Page {viewerDoc.pageNumber}</Badge>}
              </div>
              <div className="dv-viewer-modal-actions">
                {viewerStreamUrl && (
                  <>
                    <a
                      href={viewerStreamUrl}
                      download={viewerDoc?.title || "document"}
                      className="dv-viewer-modal-btn"
                    >
                      <Download size={14} />
                      <span>Download</span>
                    </a>
                    <a
                      href={viewerStreamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dv-viewer-modal-btn"
                    >
                      <ExternalLink size={14} />
                      <span>Open in Tab</span>
                    </a>
                  </>
                )}
                {viewerDoc && (
                  <Link
                    to={viewerDoc.previewRoute || `/documents/${viewerDoc.documentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dv-viewer-modal-btn"
                  >
                    <Eye size={14} />
                    <span>Full Record</span>
                  </Link>
                )}
              </div>
            </div>

            <div className="dv-viewer-modal-frame-container">
              {viewerLoading && (
                <div className="dv-viewer-modal-state">
                  <div className="dv-viewer-spinner" />
                  <span>Loading secure document stream...</span>
                </div>
              )}

              {viewerError && (
                <div className="dv-viewer-modal-state dv-viewer-modal-state--error">
                  <AlertCircle size={24} color="#EF4444" />
                  <span>{viewerError}</span>
                  {viewerStreamUrl && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <a href={viewerStreamUrl} target="_blank" rel="noopener noreferrer" className="dv-viewer-modal-btn">
                        <ExternalLink size={14} />
                        <span>Open in New Tab</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {!viewerLoading && !viewerError && viewerStreamUrl && (
                <>
                  {(viewerDoc?.documentType || "").toLowerCase().includes("pdf") ? (
                    <object
                      data={viewerStreamUrl}
                      type="application/pdf"
                      className="dv-viewer-modal-iframe"
                      aria-label={viewerDoc?.title || "Document PDF"}
                    >
                      <div className="dv-viewer-modal-state">
                        <FileText size={36} color="#64748B" />
                        <span>Embedded preview not available on this browser.</span>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <a href={viewerStreamUrl} target="_blank" rel="noopener noreferrer" className="dv-viewer-modal-btn">
                            <ExternalLink size={14} />
                            <span>Open in New Tab</span>
                          </a>
                          <a href={viewerStreamUrl} download={viewerDoc?.title || "document.pdf"} className="dv-viewer-modal-btn">
                            <Download size={14} />
                            <span>Download</span>
                          </a>
                        </div>
                      </div>
                    </object>
                  ) : (
                    <div className="dv-viewer-modal-img-wrap">
                      <img
                        src={viewerStreamUrl}
                        alt={viewerDoc?.title || "Document Image"}
                        className="dv-viewer-modal-image"
                        onError={() => setViewerError("Unable to display document image. Please download or view full record.")}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </DocViewerErrorBoundary>
      </Modal>
    </div>
  );

  // Helper renderer for a single conversation list item
  function renderConvItem(conv) {
    const isActive = activeConvId === conv._id;
    const isEditing = editingConvId === conv._id;

    if (isEditing) {
      return (
        <form
          key={conv._id}
          onSubmit={(e) => handleRenameSubmit(conv._id, e)}
          className="dv-ai-conv-edit-form"
        >
          <input
            type="text"
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            autoFocus
            className="dv-ai-conv-edit-input"
            onBlur={() => handleRenameSubmit(conv._id)}
          />
        </form>
      );
    }

    return (
      <div
        key={conv._id}
        onClick={() => selectConversation(conv._id)}
        className={`dv-ai-conv-item ${isActive ? "dv-ai-conv-item--active" : ""}`}
      >
        <MessageSquare size={14} className="dv-ai-conv-item-icon" />
        <span className="dv-ai-conv-item-title" title={conv.title}>
          {conv.title || "Untitled Chat"}
        </span>

        <div className="dv-ai-conv-item-actions">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditingConvId(conv._id);
              setEditingTitle(conv.title || "");
            }}
            className="dv-ai-conv-action-btn"
            title="Rename"
          >
            <Edit3 size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => handleDeleteConversation(conv._id, e)}
            className="dv-ai-conv-action-btn dv-ai-conv-action-btn--delete"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
  }
}
