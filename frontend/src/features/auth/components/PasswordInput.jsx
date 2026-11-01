import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './PasswordInput.css';

export default function PasswordInput({
  label,
  icon: Icon,
  type = 'text',
  name,
  value,
  onChange,
  placeholder,
  required = false,
  autoComplete,
  error,
  helperText,
  maxLength,
  disabled = false,
  className = '',
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className={`dv-input-group ${error ? 'dv-input-group--error' : ''} ${className}`}>
      {label && (
        <label className="dv-input-label" htmlFor={name}>
          {label} {required && <span className="dv-required-star">*</span>}
        </label>
      )}

      <div className="dv-input-wrapper">
        {Icon && <Icon size={16} className="dv-input-prefix-icon" />}

        <input
          id={name}
          name={name}
          type={effectiveType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          maxLength={maxLength}
          disabled={disabled}
          className={`dv-input-field ${Icon ? 'dv-input-field--has-icon' : ''} ${isPassword ? 'dv-input-field--has-toggle' : ''}`}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            className="dv-password-toggle-btn"
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? 'Hide password' : 'Show password'}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>

      {error ? (
        <span className="dv-input-error-msg">{error}</span>
      ) : helperText ? (
        <span className="dv-input-helper-msg">{helperText}</span>
      ) : null}
    </div>
  );
}
