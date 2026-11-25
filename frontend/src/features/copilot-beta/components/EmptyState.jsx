import React, { memo } from "react";
import {
  Search,
  Clock,
  Layers,
  GitCompare,
  UploadCloud,
  GraduationCap,
  Share2,
  ShieldCheck,
} from "lucide-react";
import Mascot from "./Mascot";

const STARTERS = [
  {
    type: "upload",
    icon: UploadCloud,
    title: "Upload & Analyze",
    desc: "Add a PDF or photo & auto-fill flashcards",
  },
  {
    type: "flashcard",
    icon: Layers,
    title: "New Flashcard",
    desc: "Build an asset card with warranty & dates",
  },
  {
    type: "prompt",
    icon: Search,
    title: "Search Vault",
    desc: "Find bills, invoices, policies, or IDs",
    prompt: "Search my documents for recent bills and invoices",
  },
  {
    type: "prompt",
    icon: Clock,
    title: "Deadlines & Renewals",
    desc: "Track expiring bills and warranties",
    prompt: "What renewals and deadlines are coming up in the next 30 days?",
  },
  {
    type: "prompt",
    icon: GitCompare,
    title: "Compare Documents",
    desc: "Compare terms, costs, and key dates",
    prompt: "Compare my two latest documents and highlight differences",
  },
  {
    type: "prompt",
    icon: GraduationCap,
    title: "Study Deck & Quiz",
    desc: "Generate study flashcards from a document",
    prompt: "Create a 5-card study deck from my latest document",
  },
  {
    type: "prompt",
    icon: Share2,
    title: "Share & Family",
    desc: "Create expiring view/download share links",
    prompt: "Show my active document shares and family connections",
  },
  {
    type: "prompt",
    icon: ShieldCheck,
    title: "Vault Activity",
    desc: "Inspect recent access and audit logs",
    prompt: "Show my recent document access and sharing history",
  },
];

const EmptyState = memo(function EmptyState({
  onSelectStarter,
  onTriggerUpload,
  onTriggerFlashcard,
}) {
  const handleAction = (s) => {
    if (s.type === "upload" && onTriggerUpload) {
      onTriggerUpload();
    } else if (s.type === "flashcard" && onTriggerFlashcard) {
      onTriggerFlashcard();
    } else if (s.prompt && onSelectStarter) {
      onSelectStarter(s.prompt);
    }
  };

  return (
    <div className="dv-cp-empty-state dv-anim-fade-in">
      <div className="dv-cp-empty-state__mascot-wrap">
        <div className="dv-cp-ambient-glow" aria-hidden="true" />
        <Mascot state="idle" size={144} />
      </div>

      <h2 className="dv-cp-empty-state__title">What would you like to do?</h2>
      <p className="dv-cp-empty-state__subtitle">
        Upload documents, build interactive flashcards, track deadlines, or manage sharing from one place.
      </p>

      <div className="dv-cp-starters-grid">
        {STARTERS.map((s, idx) => {
          const Icon = s.icon;
          return (
            <button
              key={idx}
              type="button"
              style={{ "--idx": idx }}
              className="dv-cp-starter-card dv-cp-starter-card--stagger"
              onClick={() => handleAction(s)}
            >
              <div className="dv-cp-starter-card__head">
                <span className="dv-cp-starter-card__icon">
                  <Icon size={15} />
                </span>
                <span className="dv-cp-starter-card__title">{s.title}</span>
              </div>
              <div className="dv-cp-starter-card__desc">{s.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default EmptyState;
