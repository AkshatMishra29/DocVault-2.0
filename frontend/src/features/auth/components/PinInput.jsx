import React from 'react';
import './PinInput.css';

export default function PinInput({ length = 4, value = '', hasError = false, isMasked = true }) {
  const slots = Array(length).fill(0);

  return (
    <div className={`dv-pin-display ${hasError ? 'dv-pin-display--error' : ''}`}>
      {slots.map((_, idx) => {
        const isFilled = idx < value.length;
        const isCurrent = idx === value.length;

        return (
          <div
            key={idx}
            className={`dv-pin-slot ${isFilled ? 'dv-pin-slot--filled' : ''} ${isCurrent ? 'dv-pin-slot--current' : ''}`}
          >
            {isFilled ? (
              isMasked ? (
                <span className="dv-pin-dot" />
              ) : (
                <span className="dv-pin-digit">{value[idx]}</span>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
