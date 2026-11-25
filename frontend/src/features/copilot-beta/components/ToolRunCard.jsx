import React from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function ToolRunCard({ toolRun }) {
  if (!toolRun) return null;

  const { status, label, summary } = toolRun;

  return (
    <div className={`dv-cp-tool-run dv-cp-tool-run--${status}`}>
      <div className="dv-cp-tool-run__icon">
        {status === "running" && <Loader2 size={13} className="dv-cp-spin" />}
        {status === "done" && <CheckCircle2 size={13} />}
        {status === "failed" && <XCircle size={13} />}
      </div>
      <div className="dv-cp-tool-run__content">
        <span className="dv-cp-tool-run__label">{label || summary || "Running tool..."}</span>
      </div>
    </div>
  );
}
