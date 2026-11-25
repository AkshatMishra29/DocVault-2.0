import React from "react";
import Mascot from "./Mascot";

const STARTERS = [
  {
    title: "Search Documents",
    desc: "Find policy numbers, invoices, or identity records",
    prompt: "Search my documents for recent tax invoices and insurance policies",
  },
  {
    title: "Upcoming Deadlines",
    desc: "Check expirations and renewal reminders",
    prompt: "What renewals and deadlines are coming up in the next 30 days?",
  },
  {
    title: "Asset Overview",
    desc: "List vehicle, electronics, and property cards",
    prompt: "Show all my registered asset flashcards with their warranty details",
  },
  {
    title: "Document Comparison",
    desc: "Compare terms, costs, and key dates",
    prompt: "Can you help me compare two of my latest bills or policies?",
  },
];

export default function EmptyState({ onSelectStarter }) {
  return (
    <div className="dv-cp-empty-state">
      <div className="dv-cp-empty-state__mascot-wrap">
        <Mascot state="idle" size={88} />
      </div>

      <h2 className="dv-cp-empty-state__title">What would you like to do?</h2>
      <p className="dv-cp-empty-state__subtitle">
        DocVault Copilot can search your vault, review renewal deadlines, or inspect flashcards.
      </p>

      <div className="dv-cp-starters-grid">
        {STARTERS.map((s, idx) => (
          <button
            key={idx}
            type="button"
            className="dv-cp-starter-card"
            onClick={() => onSelectStarter(s.prompt)}
          >
            <div className="dv-cp-starter-card__title">{s.title}</div>
            <div className="dv-cp-starter-card__desc">{s.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
