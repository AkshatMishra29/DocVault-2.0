import React from 'react';
import { Delete, RotateCcw } from 'lucide-react';
import './PinKeypad.css';

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'backspace']
];

export default function PinKeypad({ onDigit, onBackspace, onClear, disabled = false }) {
  return (
    <div className="dv-pin-keypad" role="group" aria-label="PIN Numeric Keypad">
      {KEYS.flat().map((key) => {
        if (key === 'clear') {
          return (
            <button
              key="clear"
              type="button"
              className="dv-keypad-btn dv-keypad-btn--action"
              onClick={onClear}
              disabled={disabled}
              title="Clear PIN"
              aria-label="Clear PIN"
            >
              <span className="dv-keypad-action-text">Clear</span>
            </button>
          );
        }

        if (key === 'backspace') {
          return (
            <button
              key="backspace"
              type="button"
              className="dv-keypad-btn dv-keypad-btn--action"
              onClick={onBackspace}
              disabled={disabled}
              title="Delete digit"
              aria-label="Delete last digit"
            >
              <Delete size={20} />
            </button>
          );
        }

        return (
          <button
            key={key}
            type="button"
            className="dv-keypad-btn dv-keypad-btn--digit"
            onClick={() => onDigit(key)}
            disabled={disabled}
            aria-label={`Digit ${key}`}
          >
            <span>{key}</span>
          </button>
        );
      })}
    </div>
  );
}

