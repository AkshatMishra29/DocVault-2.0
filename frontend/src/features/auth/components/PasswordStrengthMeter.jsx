import React from 'react';
import './PasswordStrengthMeter.css';

export default function PasswordStrengthMeter({ advice }) {
  if (!advice) return null;

  const { score, level, recommendations } = advice;

  return (
    <div className="dv-pwd-meter" aria-live="polite">
      <div className="dv-pwd-meter__header">
        <span className="dv-pwd-meter__label">Password Strength:</span>
        <span className="dv-pwd-meter__status" style={{ color: level.color }}>
          {level.label}
        </span>
      </div>

      <div className="dv-pwd-meter__bars">
        {[0, 1, 2, 3].map((step) => {
          const isFilled = score >= step;
          return (
            <div
              key={step}
              className={`dv-pwd-bar ${isFilled ? 'dv-pwd-bar--filled' : ''}`}
              style={{ backgroundColor: isFilled ? level.color : undefined }}
            />
          );
        })}
      </div>

      {recommendations && recommendations.length > 0 && score < 3 && (
        <span className="dv-pwd-meter__hint">{recommendations[0]}</span>
      )}
    </div>
  );
}

