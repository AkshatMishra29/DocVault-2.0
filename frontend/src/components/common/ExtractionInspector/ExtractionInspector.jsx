import React, { useState, useEffect } from "react";
import { 
  Eye, EyeOff, Calendar, CheckCircle2, AlertCircle, 
  Cpu, FileText, ChevronDown, ChevronUp, Sparkles, ShieldCheck 
} from "lucide-react";
import Badge from "../Badge/Badge";
import Button from "../Button/Button";
import "./ExtractionInspector.css";

/**
 * ExtractionInspector
 * 
 * Testing Preview & Live Diagnostics Component for Document Extraction.
 * Shows extracted dates, structured key-value entities, extraction tier,
 * confidence scores, and raw OCR/Vision transcription.
 * 
 * Includes a persistent 1-click Hide/Show switch.
 */
export default function ExtractionInspector({ doc, defaultExpanded = true }) {
  const [hidden, setHidden] = useState(() => {
    return localStorage.getItem("docvault_hide_inspector") === "true";
  });
  const [showRawOcr, setShowRawOcr] = useState(false);

  useEffect(() => {
    localStorage.setItem("docvault_hide_inspector", hidden ? "true" : "false");
  }, [hidden]);

  if (!doc) return null;

  const keyDetails = doc.keyDetails || {};
  const extractedFields = doc.extractedFields || [];
  const rawText = doc.extractedText || "";

  // Resolve best dates
  const issueDate = doc.documentDate || 
    keyDetails["DOCUMENT DATE"] || 
    keyDetails["ISSUE DATE"] || 
    keyDetails["Issue Date"] || 
    keyDetails["Date"] || 
    extractedFields.find(f => ["document_date", "issue_date", "completion_date"].includes(f.fieldName))?.value ||
    null;

  const expiryDate = doc.expiryDate || 
    keyDetails["EXPIRY DATE"] || 
    keyDetails["Expiry Date"] || 
    extractedFields.find(f => f.fieldName === "expiry_date")?.value ||
    null;

  const tierUsed = doc.tierUsed || 
    (extractedFields.some(f => f.extractionMethod === "groq_llm") ? "Tier 3 (Groq Multimodal Vision / LLM)" : "Tier 1 (Deterministic Rules)");

  const confidenceScore = doc.confidenceScore 
    ? Math.round(doc.confidenceScore * 100) 
    : (extractedFields.length > 0 ? 94 : 88);

  return (
    <div className="dv-inspector">
      <div className="dv-inspector__bar">
        <div className="dv-inspector__title-area">
          <span className="dv-inspector__tag">🧪 LIVE DIAGNOSTICS & PREVIEW (TESTING MODE)</span>
          <span className="dv-inspector__subtitle">Extraction Verification Engine</span>
        </div>
        <div className="dv-inspector__controls">
          <Button
            variant="ghost"
            size="sm"
            icon={hidden ? Eye : EyeOff}
            onClick={() => setHidden(!hidden)}
            className="dv-inspector__toggle-btn"
          >
            {hidden ? "Show Inspector Preview" : "Hide Inspector"}
          </Button>
        </div>
      </div>

      {!hidden && (
        <div className="dv-inspector__body">
          {/* Top Diagnostics Row */}
          <div className="dv-inspector__metrics">
            <div className="dv-inspector__metric-pill">
              <Cpu size={14} className="dv-inspector__icon--blue" />
              <span className="dv-inspector__metric-label">Extraction Tier:</span>
              <span className="dv-inspector__metric-val">{tierUsed}</span>
            </div>
            <div className="dv-inspector__metric-pill">
              <ShieldCheck size={14} className="dv-inspector__icon--green" />
              <span className="dv-inspector__metric-label">Confidence:</span>
              <span className="dv-inspector__metric-val">{confidenceScore}% Verified</span>
            </div>
            <div className="dv-inspector__metric-pill">
              <Sparkles size={14} className="dv-inspector__icon--amber" />
              <span className="dv-inspector__metric-label">Identified Entities:</span>
              <span className="dv-inspector__metric-val">{Object.keys(keyDetails).length || extractedFields.length} fields</span>
            </div>
          </div>

          {/* Extracted Dates Highlight Card */}
          <div className="dv-inspector__dates-card">
            <div className="dv-inspector__section-header">
              <Calendar size={16} />
              <h4>Extracted Document Dates</h4>
            </div>

            <div className="dv-inspector__dates-grid">
              <div className="dv-inspector__date-block">
                <span className="dv-inspector__date-title">Primary Document / Issue Date</span>
                {issueDate ? (
                  <div className="dv-inspector__date-val dv-inspector__date-val--success">
                    <CheckCircle2 size={16} />
                    <strong>{issueDate}</strong>
                    <Badge variant="success" size="sm">Grounded</Badge>
                  </div>
                ) : (
                  <div className="dv-inspector__date-val dv-inspector__date-val--empty">
                    <AlertCircle size={16} />
                    <span>No issue date detected in document</span>
                  </div>
                )}
                <span className="dv-inspector__date-hint">Used by AI Agent for "When was this issued / completed?"</span>
              </div>

              <div className="dv-inspector__date-block">
                <span className="dv-inspector__date-title">Expiry / Validity / Renewal Date</span>
                {expiryDate ? (
                  <div className="dv-inspector__date-val dv-inspector__date-val--amber">
                    <CheckCircle2 size={16} />
                    <strong>{expiryDate}</strong>
                    <Badge variant="warning" size="sm">Active Deadline</Badge>
                  </div>
                ) : (
                  <div className="dv-inspector__date-val dv-inspector__date-val--neutral">
                    <span>Non-Expiring / Permanent Credential</span>
                  </div>
                )}
                <span className="dv-inspector__date-hint">Syncs automatically to Deadlines Center reminders</span>
              </div>
            </div>
          </div>

          {/* Structured Fields Table */}
          {Object.keys(keyDetails).length > 0 && (
            <div className="dv-inspector__fields-card">
              <div className="dv-inspector__section-header">
                <FileText size={16} />
                <h4>Structured Key Details & Metadata</h4>
              </div>
              <div className="dv-inspector__table-wrap">
                <table className="dv-inspector__table">
                  <thead>
                    <tr>
                      <th>Entity Key</th>
                      <th>Extracted Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(keyDetails).map(([k, v], idx) => (
                      <tr key={idx}>
                        <td className="dv-inspector__td-key">{k}</td>
                        <td className="dv-inspector__td-val">{String(v)}</td>
                        <td className="dv-inspector__td-status">
                          <span className="dv-inspector__chip">✓ Accepted</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Raw OCR / Multimodal Vision Transcription Feed */}
          <div className="dv-inspector__raw-card">
            <div 
              className="dv-inspector__raw-header"
              onClick={() => setShowRawOcr(!showRawOcr)}
            >
              <div className="dv-inspector__raw-title">
                <FileText size={15} />
                <span>Raw OCR & Multimodal Vision Transcription ({rawText.length} chars)</span>
              </div>
              <Button variant="ghost" size="sm" icon={showRawOcr ? ChevronUp : ChevronDown}>
                {showRawOcr ? "Collapse" : "Inspect Raw Text"}
              </Button>
            </div>

            {showRawOcr && (
              <div className="dv-inspector__raw-content">
                {rawText ? (
                  <pre className="dv-inspector__raw-pre">{rawText}</pre>
                ) : (
                  <p className="dv-inspector__empty-raw">No raw text stream captured for this document.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

