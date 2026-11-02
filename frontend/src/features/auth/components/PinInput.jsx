import React from 'react';
import './PinInput.css';

export default function PinInput({ length = 4, value = '', hasError = false, isMasked = true }) {
  const safeLength = Number.isInteger(Number(length)) && Number(length) > 0 ? Number(length) : 4;
  const safeValue = typeof value === 'string' ? value : '';
  const slots = Array(safeLength).fill(0);

  return (
    <div className={`dv-pin-display ${hasError ? 'dv-pin-display--error' : ''}`}>
      {slots.map((_, idx) => {
        const isFilled = idx < safeValue.length;
        const isCurrent = idx === safeValue.length;

        return (
          <div
            key={idx}
            className={`dv-pin-slot ${isFilled ? 'dv-pin-slot--filled' : ''} ${isCurrent ? 'dv-pin-slot--current' : ''}`}
          >
            {isFilled ? (
              isMasked ? (
                <span className="dv-pin-dot" />
              ) : (
                <span className="dv-pin-digit">{safeValue[idx]}</span>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

