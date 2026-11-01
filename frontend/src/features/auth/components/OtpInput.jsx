import React, { useRef, useEffect } from 'react';
import './OtpInput.css';

export default function OtpInput({ value = '', onChange, disabled = false, hasError = false }) {
  const inputRefs = useRef([]);

  // Ensure digits array has 6 items
  const digits = Array(6).fill('').map((_, idx) => value[idx] || '');

  useEffect(() => {
    // Focus first empty input on mount
    const firstEmpty = digits.findIndex((d) => !d);
    const targetIdx = firstEmpty === -1 ? 0 : firstEmpty;
    inputRefs.current[targetIdx]?.focus();
  }, []);

  const handleChange = (e, idx) => {
    const char = e.target.value.slice(-1);
    if (!/^[0-9]$/.test(char) && char !== '') return;

    const newDigits = [...digits];
    newDigits[idx] = char;
    const combined = newDigits.join('');
    onChange(combined);

    if (char && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace') {
      if (!digits[idx] && idx > 0) {
        inputRefs.current[idx - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text/plain').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const focusIndex = Math.min(pasted.length, 5);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  return (
    <div className={`dv-otp-container ${hasError ? 'dv-otp-container--error' : ''}`}>
      <div className="dv-otp-inputs" onPaste={handlePaste}>
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => (inputRefs.current[idx] = el)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(e, idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            disabled={disabled}
            className={`dv-otp-box ${digit ? 'dv-otp-box--filled' : ''}`}
            aria-label={`Digit ${idx + 1} of verification code`}
            autoComplete="one-time-code"
          />
        ))}
      </div>
    </div>
  );
}
