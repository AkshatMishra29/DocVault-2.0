import React, { useState, useEffect, useCallback, Component } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MessageSquare, Plus, Trash2 } from "lucide-react";
import MessageList from "./components/MessageList";
import Composer from "./components/Composer";
import EmptyState from "./components/EmptyState";
import { useCopilotStream } from "./hooks/useCopilotStream";
import { useMascotState } from "./hooks/useMascotState";
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
          <h2 className="dv-cp-empty-state__title">Beta had a problem</h2>
          <p className="dv-cp-empty-state__subtitle">
            {this.state.error ? this.state.error.message || String(this.state.error) : "An unexpected error occurred in Copilot Beta."}
          </p>
          {this.state.error?.stack && (
            <pre style={{ textAlign: "left", fontSize: "11px", background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "8px", maxWidth: "100%", overflowX: "auto" }}>
              {this.state.error.stack}
            </pre>
          )}
          <Link to="/ask-ai" className="dv-cp-back-link" style={{ fontSize: "14px", marginTop: "12px" }}>
            <ArrowLeft size={16} /> Return to Ask AI
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}

function CopilotBetaPageContent() {
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState("default");
  const [composerInput, setComposerInput] = useState("");
  const [mascotState, setMascotState] = useMascotState("idle");

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
    } else if (event === "error") {
      setMascotState("error");
    }
  }, [setMascotState]);

  const handleStreamDone = useCallback(() => {
    setMascotState("success");
    setTimeout(() => setMascotState("idle"), 1200);
  }, [setMascotState]);

  const handleStreamError = useCallback(() => {
    setMascotState("error");
  }, [setMascotState]);

  const { send, stop, isStreaming } = useCopilotStream({
    onEvent: handleStreamEvent,
    onDone: handleStreamDone,
    onError: handleStreamError,
  });

  const handleSend = (text) => {
    setMascotState("thinking");
    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    send({
      message: text,
      sessionId,
      history: messages.slice(-6),
    });
  };

  const handleClearHistory = async () => {
    if (!window.confirm("Clear Copilot beta conversation history?")) return;
    try {
      await apiRequest(`/api/copilot/history?sessionId=${sessionId}`, { method: "DELETE" });
      setMessages([]);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="dv-cp-page">
      {/* History & Navigation Sidebar */}
      <aside className="dv-cp-sidebar">
        <div className="dv-cp-sidebar__header">
          <div className="dv-cp-sidebar__title-wrap">
            <h1 className="dv-cp-sidebar__title">Copilot</h1>
            <span className="dv-cp-badge">Beta</span>
          </div>
          <button
            type="button"
            className="dv-cp-action-btn"
            onClick={() => setMessages([])}
            title="New Chat"
            aria-label="New chat"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="dv-cp-sidebar__list">
          <button
            type="button"
            className="dv-cp-starter-card"
            style={{ width: "100%", padding: "8px 10px" }}
          >
            <div className="dv-cp-starter-card__title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <MessageSquare size={14} /> Current Session
            </div>
          </button>
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
                title="Clear Chat History"
                aria-label="Clear chat history"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="dv-cp-main">
        <header className="dv-cp-header">
          <div className="dv-cp-header__left">
            <h2 className="dv-cp-header__title">DocVault Copilot</h2>
            <span className="dv-cp-badge">Autonomous Assistant</span>
          </div>
          <div className="dv-cp-header__actions">
            <Link to="/ask-ai" className="dv-cp-back-link">
              Standard Ask AI &rarr;
            </Link>
          </div>
        </header>

        {messages.length === 0 ? (
          <EmptyState onSelectStarter={(prompt) => setComposerInput(prompt)} />
        ) : (
          <MessageList
            messages={messages}
            mascotState={mascotState}
            onRetry={() => {
              const lastUser = [...messages].reverse().find((m) => m.role === "user");
              if (lastUser) handleSend(lastUser.content);
            }}
          />
        )}

        <Composer
          onSend={handleSend}
          onStop={stop}
          isStreaming={isStreaming}
          initialValue={composerInput}
        />
      </main>

      {/* Right-Side Animated AI Companion Pane */}
      <aside className="dv-cp-companion-pane">
        <div className="dv-cp-companion-card">
          <div className="dv-cp-companion-mascot">
            <Mascot state={mascotState} size={84} />
          </div>
          <div className="dv-cp-companion-status">
            <span className={`dv-cp-companion-dot dv-cp-companion-dot--${mascotState}`} />
            <span className="dv-cp-companion-label">
              {mascotState === "thinking" && "Vee is thinking..."}
              {mascotState === "working" && "Vee is analyzing your vault..."}
              {mascotState === "success" && "Vee found your answer!"}
              {mascotState === "error" && "Vee encountered a problem"}
              {mascotState === "idle" && "Vee is online & ready"}
            </span>
          </div>
          <p className="dv-cp-companion-hint">
            {mascotState === "working"
              ? "Executing tools and gathering evidence from your vault..."
              : "Autonomous Assistant connected directly to your encrypted DocVault records."}
          </p>
        </div>

        <div className="dv-cp-companion-tips">
          <h4 className="dv-cp-companion-tips-title">Quick Actions</h4>
          <button
            type="button"
            className="dv-cp-companion-chip"
            onClick={() => handleSend("List all my registered flashcard assets.")}
          >
            📋 List All Assets
          </button>
          <button
            type="button"
            className="dv-cp-companion-chip"
            onClick={() => handleSend("What deadlines are coming up in the next 30 days?")}
          >
            ⏰ Check Deadlines
          </button>
          <button
            type="button"
            className="dv-cp-companion-chip"
            onClick={() => handleSend("Search my documents for tax invoices.")}
          >
            🔍 Search Documents
          </button>
        </div>
      </aside>
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
