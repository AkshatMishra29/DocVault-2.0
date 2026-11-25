import React, { useState } from "react";
import { AlertCircle, Check, X, Loader2 } from "lucide-react";
import Button from "../../../components/common/Button/Button";
import { API_BASE_URL } from "../../../services/api/apiClient";

export default function ConfirmCard({ confirmation, onHandled }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'approved' | 'cancelled' | 'error'
  const [errorMsg, setErrorMsg] = useState("");

  if (!confirmation) return null;
  const { runId, action, summary, fields } = confirmation;

  const handleApprove = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/copilot/runs/${runId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("docvault_token") || localStorage.getItem("token") || ""}`,
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Execution failed.");
      }
      setStatus("approved");
      if (onHandled) onHandled(runId, "approved", data.result);
    } catch (err) {
      setErrorMsg(err.message);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/copilot/runs/${runId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("docvault_token") || localStorage.getItem("token") || ""}`,
        },
      });
      setStatus("cancelled");
      if (onHandled) onHandled(runId, "cancelled");
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`dv-cp-confirm-card dv-cp-confirm-card--${status || "pending"}`}>
      <div className="dv-cp-confirm-card__header">
        <AlertCircle size={15} className="dv-cp-confirm-card__alert-icon" />
        <span className="dv-cp-confirm-card__title">Action Requires Your Confirmation</span>
      </div>

      <div className="dv-cp-confirm-card__summary">{summary}</div>

      {fields && Object.keys(fields).length > 0 && (
        <div className="dv-cp-confirm-card__fields">
          {Object.entries(fields).map(([k, v]) => (
            <div key={k} className="dv-cp-confirm-card__row">
              <span className="dv-cp-confirm-card__key">{k}:</span>
              <span className="dv-cp-confirm-card__val">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {errorMsg && <div className="dv-cp-confirm-card__error">{errorMsg}</div>}

      <div className="dv-cp-confirm-card__actions">
        {status === "approved" ? (
          <span className="dv-cp-confirm-card__done dv-cp-confirm-card__done--success">
            <Check size={14} /> Approved & Executed
          </span>
        ) : status === "cancelled" ? (
          <span className="dv-cp-confirm-card__done dv-cp-confirm-card__done--cancelled">
            <X size={14} /> Cancelled
          </span>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleApprove}
              disabled={loading}
              icon={loading ? Loader2 : Check}
            >
              {loading ? "Executing..." : "Confirm & Execute"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
