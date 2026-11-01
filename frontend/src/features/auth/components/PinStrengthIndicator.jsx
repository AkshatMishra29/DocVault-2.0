import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import './PinStrengthIndicator.css';

export default function PinStrengthIndicator({ advice }) {
  if (!advice) return null;

  const { isVulnerable, riskLevel, feedback } = advice;

  return (
    <div className={`dv-pin-advice dv-pin-advice--${isVulnerable ? 'vulnerable' : 'secure'}`}>
      <div className="dv-pin-advice__header">
        {isVulnerable ? (
          <AlertTriangle size={13} color={riskLevel.color} />
        ) : (
          <CheckCircle2 size={13} color="#10B981" />
        )}
        <span className="dv-pin-advice__title" style={{ color: riskLevel.color }}>
          {riskLevel.label}
        </span>
      </div>
      {feedback && feedback.length > 0 && (
        <span className="dv-pin-advice__msg">{feedback[0]}</span>
      )}
    </div>
  );
}
