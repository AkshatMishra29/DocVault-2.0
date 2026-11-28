import React, { useState, useEffect, useCallback, useMemo, useRef, Component } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  MessageSquare,
  Plus,
  Trash2,
  UploadCloud,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import MessageList from "./components/MessageList";
import Composer from "./components/Composer";
import EmptyState from "./components/EmptyState";
import { useCopilotStream } from "./hooks/useCopilotStream";
import { useMascotState } from "./hooks/useMascotState";
import Mascot from "./components/Mascot";
import { apiRequest } from "../../services/api/apiClient";
import "./copilotBeta.css";

/**
 * Isolated Error Boundary for Copilot Beta
 */
class CopilotErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[Copilot ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="dv-cp-empty-state" style={{ padding: "60px 20px" }}>
          <h2 className="dv-cp-empty-state__title">Something went wrong</h2>
          <p className="dv-cp-empty-state__subtitle">
            We couldn&apos;t complete your request. Please try again.
          </p>
          <Link to="/ask-ai" className="dv-cp-back-link" style={{ fontSize: "14px", marginTop: "12px" }}>
            <ArrowLeft size={16} /> Return to Ask DocVault
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}

function CopilotBetaPageContent() {
  const [messages, setMessages] = useState([]);
  // Always open with a fresh session so each visit starts a new chat.
  // Past sessions remain accessible via the History sidebar.
  const [sessionId, setSessionId] = useState(() => `chat_${Date.now()}`);
  const [sessions, setSessions] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 900 : true
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem("dv_cp_sidebar_width"));
    return saved >= 200 && saved <= 440 ? saved : 268;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);
  const triggerUploadRef = useRef(null);
  const [composerInput, setComposerInput] = useState("");
  const [mascotState, setMascotState] = useMascotState("idle");
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Smooth ChatGPT-style drag-to-resize for the Copilot history sidebar
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (!sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const nextWidth = e.clientX - rect.left;
      if (nextWidth < 135) {
        setIsSidebarOpen(false);
        setIsResizing(false);
        return;
      }
      const clamped = Math.max(200, Math.min(440, Math.round(nextWidth)));
      setSidebarWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    localStorage.setItem("dv_cp_sidebar_width", String(sidebarWidth));
  }, [sidebarWidth]);

  const loadSessions = useCallback(async () => {
    try {
      const res = await apiRequest("/api/copilot/sessions");
      if (res.ok && Array.isArray(res.sessions)) {
        setSessions(res.sessions);
      }
    } catch (err) {
      console.warn("[Copilot Sessions Load]", err);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Visual viewport height handler for mobile keyboards
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        document.documentElement.style.setProperty(
          "--vvh",
          `${window.visualViewport.height}px`
        );
      }
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
      handleResize();
    }
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleResize);
      }
    };
  }, []);

  // Load existing Copilot history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await apiRequest(`/api/copilot/history?sessionId=${sessionId}`);
        if (res.ok && res.messages) {
          setMessages(res.messages);
        }
      } catch (err) {
        console.warn("[Copilot History Load]", err);
      }
    }
    loadHistory();
  }, [sessionId]);

  const handleStreamEvent = useCallback((event, data) => {
    if (event === "text_delta") {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            { ...last, content: (last.content || "") + (data.text || "") },
          ];
        }
        return [
          ...prev,
          { role: "assistant", content: data.text || "", toolRuns: [], sources: [] },
        ];
      });
    } else if (event === "tool_started") {
      setMascotState("working");
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          const runs = last.toolRuns || [];
          return [
            ...prev.slice(0, -1),
            { ...last, toolRuns: [...runs, { id: data.id, label: data.label, status: "running" }] },
          ];
        }
        return [
          ...prev,
          { role: "assistant", content: "", toolRuns: [{ id: data.id, label: data.label, status: "running" }] },
        ];
      });
    } else if (event === "tool_result") {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          const runs = (last.toolRuns || []).map((r) =>
            r.id === data.id ? { ...r, status: data.ok ? "done" : "failed", summary: data.summary } : r
          );
          return [...prev.slice(0, -1), { ...last, toolRuns: runs }];
        }
        return prev;
      });
    } else if (event === "sources") {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, sources: data.sources || [] }];
        }
        return prev;
      });
    } else if (event === "confirmation_required") {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          const confs = last.confirmations || [];
          return [...prev.slice(0, -1), { ...last, confirmations: [...confs, data] }];
        }
        return prev;
      });
    } else if (event === "flashcard_draft") {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, flashcardDraft: data }];
        }
        return [
          ...prev,
          {
            id: `fc_${Date.now()}`,
            role: "assistant",
            content: "Here is your interactive Flashcard! Fill in or adjust any details and click **Save Flashcard to Vault**:",
            flashcardDraft: data,
          },
        ];
      });
    } else if (event === "error") {
      setMascotState("error");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ ${data?.message || "An error occurred while processing your request."}`,
          isError: true,
        },
      ]);
    }
  }, [setMascotState]);

  const handleStreamDone = useCallback(() => {
    setMascotState((prev) => (prev === "error" ? "error" : "success"));
    loadSessions();
    setTimeout(() => setMascotState("idle"), 1200);
  }, [loadSessions, setMascotState]);

  const handleStreamError = useCallback((err) => {
    setMascotState("error");
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `⚠️ ${err?.message || "Connection error. Please verify the local server is running and your vault is unlocked."}`,
        isError: true,
      },
    ]);
  }, [setMascotState]);

  const { send, stop, isStreaming } = useCopilotStream({
    onEvent: handleStreamEvent,
    onDone: handleStreamDone,
    onError: handleStreamError,
  });

  const handleSend = useCallback((text) => {
    setMascotState("thinking");
    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    send({
      message: text,
      sessionId,
      history: messages.slice(-6),
    });
  }, [messages, send, sessionId, setMascotState]);

  const handleFileSelect = useCallback((file) => {
    if (!file) return;
    setMascotState("working");
    const msgId = `upload_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: msgId,
        role: "assistant",
        content: `I've prepared **${file.name}** for your vault. Please confirm your storage & AI processing preferences below:`,
        uploadFile: file,
      },
    ]);
    setTimeout(() => setMascotState("idle"), 1000);
  }, [setMascotState]);

  const handleUploadCancel = useCallback((msgId) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    setMascotState("idle");
  }, [setMascotState]);

  const handleUploadComplete = useCallback(
    (msgId, doc, opts) => {
      setMascotState("success");
      const docId = doc?._id || doc?.id;
      const docSource = docId
        ? [
            {
              documentId: docId,
              title: doc.title || "Uploaded Document",
              category: doc.category || "Document",
              page: 1,
              pageNumber: 1,
            },
          ]
        : [];

      setMessages((prev) => [
        ...prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                sources: docSource,
              }
            : m
        ),
      ]);

      if (opts?.privacyMode === "PROCESSABLE" && opts?.autoFlashcard && docId) {
        // Trigger Copilot to inspect the uploaded document and open a pre-filled Flashcard Builder
        handleSend(
          `I just uploaded "${doc.title}" (Document ID: ${docId}). Please inspect its details and call propose_flashcard_form to open a pre-filled interactive flashcard for it, and summarize any key details or missing fields.`
        );
      } else if (opts?.privacyMode === "STORAGE_ONLY") {
        setMessages((prev) => [
          ...prev,
          {
            id: `stored_${Date.now()}`,
            role: "assistant",
            content: `**${doc.title}** has been securely encrypted and stored in your Cloud Vault with **Zero AI Processing**. You can preview, edit, or delete it anytime from the card above.`,
          },
        ]);
      }
      setTimeout(() => setMascotState("idle"), 1500);
    },
    [handleSend, setMascotState]
  );

  const handleNewFlashcard = useCallback(() => {
    setMascotState("success");
    setMessages((prev) => [
      ...prev,
      {
        id: `fc_msg_${Date.now()}`,
        role: "assistant",
        content: "Here is a blank interactive **Asset Flashcard**. Fill in your details, pick a card color, and click **Save Flashcard to Vault**:",
        flashcardDraft: {
          id: `fc_${Date.now()}`,
          name: "",
          category: "Electronics",
          cardColor: "blue",
          customFields: [
            { label: "Purchase Date", value: "", type: "date" },
            { label: "Warranty Expiry", value: "", type: "date" },
          ],
        },
      },
    ]);
    setTimeout(() => setMascotState("idle"), 1000);
  }, [setMascotState]);

  const handleCreateFlashcardFromDoc = useCallback(
    (sourceDoc) => {
      if (!sourceDoc?.documentId) return;
      handleSend(
        `Please inspect my document "${sourceDoc.title}" (Document ID: ${sourceDoc.documentId}) and call propose_flashcard_form to open a pre-filled interactive flashcard linked to it.`
      );
    },
    [handleSend]
  );

  const handleFlashcardSaved = useCallback(
    (msgId, asset) => {
      setMascotState("success");
      setTimeout(() => setMascotState("idle"), 1400);
    },
    [setMascotState]
  );

  const handleFlashcardCancel = useCallback((msgId) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    setMascotState("idle");
  }, [setMascotState]);

  const handleDocumentUpdated = useCallback((docId, updatedDoc) => {
    setMascotState("success");
    setMessages((prev) => [
      ...prev,
      {
        id: `upd_${Date.now()}`,
        role: "assistant",
        content: `Updated document **${updatedDoc?.title || docId}** (${updatedDoc?.category || "Document"}).`,
      },
    ]);
    setTimeout(() => setMascotState("idle"), 1200);
  }, [setMascotState]);

  const handleDocumentDeleted = useCallback((docId, docTitle) => {
    setMascotState("success");
    setMessages((prev) => [
      ...prev,
      {
        id: `del_${Date.now()}`,
        role: "assistant",
        content: `Permanently deleted **${docTitle || docId}** and its linked reminders from your vault.`,
      },
    ]);
    setTimeout(() => setMascotState("idle"), 1200);
  }, [setMascotState]);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingFile(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const droppedFile = e.dataTransfer?.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const filteredSessions = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => (s.title || "").toLowerCase().includes(q));
  }, [sessions, historySearch]);

  const handleNewChat = () => {
    const nextId = `chat_${Date.now()}`;
    setSessionId(nextId);
    setMessages([]);
    if (window.innerWidth <= 800) setIsSidebarOpen(false);
  };

  const handleSelectSession = (id) => {
    setSessionId(id);
    if (window.innerWidth <= 800) setIsSidebarOpen(false);
  };

  const handleDeleteSession = async (targetId, e) => {
    e.stopPropagation();
    try {
      await apiRequest(`/api/copilot/history?sessionId=${encodeURIComponent(targetId)}`, {
        method: "DELETE",
      });
      setSessions((prev) => prev.filter((s) => s.sessionId !== targetId));
      if (targetId === sessionId) {
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm("Clear this conversation history?")) return;
    try {
      await apiRequest(`/api/copilot/history?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      setMessages([]);
      loadSessions();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className={`dv-cp-page ${isSidebarOpen ? "dv-cp-page--sidebar-open" : "dv-cp-page--sidebar-closed"}`}>
      {isSidebarOpen && (
        <div
          className="dv-cp-sidebar-backdrop"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slideable & Resizable History Sidebar */}
      <aside
        ref={sidebarRef}
        style={
          isSidebarOpen && typeof window !== "undefined" && window.innerWidth > 800
            ? { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }
            : undefined
        }
        className={`dv-cp-sidebar ${isSidebarOpen ? "dv-cp-sidebar--open" : "dv-cp-sidebar--closed"} ${isResizing ? "dv-cp-sidebar--resizing" : ""}`}
      >
        <div className="dv-cp-sidebar__header">
          <div className="dv-cp-sidebar__title-wrap">
            <h1 className="dv-cp-sidebar__title">History</h1>
            <span className="dv-cp-badge">{sessions.length}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className="dv-cp-action-btn"
              onClick={handleNewChat}
              title="New Chat"
              aria-label="New chat"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="dv-cp-action-btn"
              onClick={() => setIsSidebarOpen(false)}
              title="Collapse History Panel"
              aria-label="Collapse history panel"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>

        <div className="dv-cp-sidebar__search">
          <Search size={13} className="dv-cp-sidebar__search-icon" />
          <input
            type="text"
            className="dv-cp-sidebar__search-input"
            placeholder="Search conversations..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
          />
        </div>

        <div className="dv-cp-sidebar__list">
          {filteredSessions.length === 0 ? (
            <div className="dv-cp-sidebar__empty">
              {historySearch ? "No matching chats" : "No past conversations yet"}
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isActive = s.sessionId === sessionId;
              return (
                <div
                  key={s.sessionId}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectSession(s.sessionId)}
                  onKeyDown={(e) => e.key === "Enter" && handleSelectSession(s.sessionId)}
                  className={`dv-cp-session-item ${isActive ? "dv-cp-session-item--active" : ""}`}
                >
                  <MessageSquare size={14} className="dv-cp-session-item__icon" />
                  <div className="dv-cp-session-item__meta">
                    <span className="dv-cp-session-item__title">{s.title}</span>
                    <span className="dv-cp-session-item__count">{s.messageCount} msgs</span>
                  </div>
                  <button
                    type="button"
                    className="dv-cp-session-item__del"
                    onClick={(e) => handleDeleteSession(s.sessionId, e)}
                    title="Delete chat"
                    aria-label="Delete chat"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="dv-cp-sidebar__footer">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link to="/ask-ai" className="dv-cp-back-link">
              <ArrowLeft size={14} /> Back to Ask AI
            </Link>
            {messages.length > 0 && (
              <button
                type="button"
                className="dv-cp-action-btn"
                onClick={handleClearHistory}
                title="Clear Current Chat"
                aria-label="Clear current chat"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Drag-to-resize handle */}
        <div
          className={`dv-cp-resize-handle ${isResizing ? "dv-cp-resize-handle--active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          onDoubleClick={() => setSidebarWidth(268)}
          title="Drag to resize • Double-click to reset"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize history sidebar"
        />
      </aside>

      {/* Main Chat Area */}
      <main
        className={`dv-cp-main ${isDraggingFile ? "dv-cp-main--dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingFile && (
          <div className="dv-cp-drop-overlay dv-anim-fade-in">
            <div className="dv-cp-drop-overlay__box">
              <UploadCloud size={36} className="dv-cp-drop-overlay__icon" />
              <h3>Drop Document Here</h3>
              <p>Release to upload & configure storage/AI options right inside Copilot</p>
            </div>
          </div>
        )}

        <header className="dv-cp-header">
          <div className="dv-cp-header__left">
            <button
              type="button"
              className="dv-cp-sidebar-toggle"
              onClick={() => setIsSidebarOpen((v) => !v)}
              title={isSidebarOpen ? "Hide History Panel" : "Show History Panel"}
              aria-label="Toggle history panel"
            >
              {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <Mascot state={mascotState} size={46} />
            <div className="dv-cp-header__brand">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 className="dv-cp-header__title">DocVault Copilot</h2>
                <span className="dv-cp-badge">Beta</span>
              </div>
              <div className="dv-cp-header__status">
                <span className={`dv-cp-companion-dot dv-cp-companion-dot--${mascotState}`} />
                <span>
                  {mascotState === "thinking" && "Thinking..."}
                  {mascotState === "working" && "Analyzing your vault..."}
                  {mascotState === "success" && "Ready"}
                  {mascotState === "error" && "Encountered an issue"}
                  {mascotState === "idle" && "Online & connected to your vault"}
                </span>
              </div>
            </div>
          </div>
          <div className="dv-cp-header__actions">
            <button
              type="button"
              className="dv-cp-new-chat-pill"
              onClick={handleNewChat}
              title="Start New Chat"
            >
              <Plus size={14} />
              <span>New Chat</span>
            </button>
            <Link to="/ask-ai" className="dv-cp-back-link">
              Standard Ask AI &rarr;
            </Link>
          </div>
        </header>

        {messages.length === 0 ? (
          <EmptyState
            onSelectStarter={(prompt) => handleSend(prompt)}
            onTriggerUpload={() => triggerUploadRef.current?.()}
            onTriggerFlashcard={handleNewFlashcard}
          />
        ) : (
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            mascotState={mascotState}
            onUploadComplete={handleUploadComplete}
            onUploadCancel={handleUploadCancel}
            onFlashcardSaved={handleFlashcardSaved}
            onFlashcardCancel={handleFlashcardCancel}
            onCreateFlashcard={handleCreateFlashcardFromDoc}
            onDocumentUpdated={handleDocumentUpdated}
            onDocumentDeleted={handleDocumentDeleted}
            onRetry={() => {
              const lastUser = [...messages].reverse().find((m) => m.role === "user");
              if (lastUser) handleSend(lastUser.content);
            }}
          />
        )}

        <Composer
          onSend={handleSend}
          onStop={stop}
          onFileSelect={handleFileSelect}
          onNewFlashcard={handleNewFlashcard}
          triggerUploadRef={triggerUploadRef}
          isStreaming={isStreaming}
          initialValue={composerInput}
        />
      </main>
    </div>
  );
}

export default function CopilotBetaPage() {
  return (
    <CopilotErrorBoundary>
      <CopilotBetaPageContent />
    </CopilotErrorBoundary>
  );
}
