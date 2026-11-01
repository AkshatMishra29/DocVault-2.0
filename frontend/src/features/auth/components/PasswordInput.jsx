import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './PasswordInput.css';

export default function PasswordInput({
  label,
  labelRight,
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
    <div className={`dv-auth-input-group ${error ? 'dv-auth-input-group--error' : ''} ${className}`}>
      {label && (
        <div className="dv-auth-input-label-row">
          <label className="dv-auth-input-label" htmlFor={name}>
            <span>{label}</span>
            {required && <span className="dv-required-star">*</span>}
          </label>
          {labelRight && <div className="dv-auth-input-label-right">{labelRight}</div>}
        </div>
      )}

      <div className="dv-auth-input-wrapper">
        {Icon && (
          <span className="dv-auth-input-prefix-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
        )}

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
          className={`dv-auth-input-field ${Icon ? 'dv-auth-input-field--has-icon' : ''} ${isPassword ? 'dv-auth-input-field--has-toggle' : ''}`}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            className="dv-auth-input-toggle-btn"
            onClick={() => setShowPassword(!showPassword)}
            title={showPassword ? 'Hide password' : 'Show password'}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>

      {error ? (
        <span className="dv-auth-input-error-msg">{error}</span>
      ) : helperText ? (
        <span className="dv-auth-input-helper-msg">{helperText}</span>
      ) : null}
    </div>
  );
}
