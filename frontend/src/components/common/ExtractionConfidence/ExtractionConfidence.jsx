import React from 'react';
import './ExtractionConfidence.css';

export default function ExtractionConfidence({ confidence = 0, showBar = true }) {
  const percentage = Math.round((confidence || 0) * 100);

  let tier = 'low';
  let label = 'Low Confidence';

  if (percentage >= 85) {
    tier = 'high';
    label = 'High Confidence';
  } else if (percentage >= 60) {
    tier = 'medium';
    label = 'Calibrated';
  }

  return (
    <div className={`dv-confidence-meter dv-confidence-meter--${tier}`} title={`Extraction confidence: ${percentage}%`}>
      {showBar && (
        <div className="dv-confidence-bar">
          <div className="dv-confidence-bar__fill" style={{ width: `${Math.min(percentage, 100)}%` }} />
        </div>
      )}
      <span className="dv-confidence-text">{percentage}%</span>
    </div>
  );
}
