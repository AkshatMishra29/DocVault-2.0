import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import './PinStrengthIndicator.css';

export default function PinStrengthIndicator({ advice }) {
  if (!advice) return null;

  const isVulnerable = Boolean(advice.isVulnerable);
  const riskLevel = advice.riskLevel || {};
  const riskColor = riskLevel.color || (isVulnerable ? '#DC2626' : '#10B981');
  const riskLabel = riskLevel.label || (isVulnerable ? 'Vulnerable Pattern' : 'Resilient PIN');
  const feedback = Array.isArray(advice.feedback) ? advice.feedback : [];

  return (
    <div className={`dv-pin-advice dv-pin-advice--${isVulnerable ? 'vulnerable' : 'secure'}`}>
      <div className="dv-pin-advice__header">
        {isVulnerable ? (
          <AlertTriangle size={13} color={riskColor} />
        ) : (
          <CheckCircle2 size={13} color="#10B981" />
        )}
        <span className="dv-pin-advice__title" style={{ color: riskColor }}>
          {riskLabel}
        </span>
      </div>
      {feedback.length > 0 && (
        <span className="dv-pin-advice__msg">{feedback[0]}</span>
      )}
    </div>
  );
}
