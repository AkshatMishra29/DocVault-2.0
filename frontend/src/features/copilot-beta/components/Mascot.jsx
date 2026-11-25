import React, { memo } from "react";
import "./mascot.css";

const Mascot = memo(function Mascot({ state = "idle", size = 56 }) {
  const mouth = {
    idle: "M26 38.5Q32 43 38 38.5",
    thinking: "M27 39.5Q32 37.5 37 39.5",
    working: "M27 39H37",
    success: "M23.5 36.5Q32 48 40.5 36.5",
    error: "M26 42.5Q32 36.5 38 42.5",
    surprised: "M29 39A3 3 0 1 1 35 39A3 3 0 1 1 29 39",
  }[state] || "M26 38.5Q32 43 38 38.5";

  const leftBrow = {
    idle: "M21 24Q25 22.5 29 24",
    thinking: "M21 22.5Q25 20.5 29 22.5",
    working: "M21 23.5L29 25",
    success: "M21 23Q25 20.5 29 23",
    error: "M21 25L29 23",
  }[state] || "M21 24Q25 22.5 29 24";

  const rightBrow = {
    idle: "M35 24Q39 22.5 43 24",
    thinking: "M35 24.5Q39 23.5 43 24.5",
    working: "M35 25L43 23.5",
    success: "M35 23Q39 20.5 43 23",
    error: "M35 23L43 25",
  }[state] || "M35 24Q39 22.5 43 24";

  const isHappy = state === "success";
  const isError = state === "error";
  const isActive = state === "thinking" || state === "working";
  const eyeColor = isError ? "#FCA5A5" : "#7DD3FC";

  return (
    <svg
      className="dv-cp-mascot"
      data-state={state}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="dvVeeShieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#356AE6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>

      {/* Expressive Ambient Aura Ring */}
      <circle
        className="dv-cp-mascot__aura"
        cx="32"
        cy="32"
        r="29"
        fill="none"
        stroke={isError ? "rgba(239,68,68,0.35)" : "rgba(56,189,248,0.28)"}
        strokeWidth="1.5"
        strokeDasharray="6 4"
      />

      <g className="dv-cp-mascot__body">
        {/* Shield Outer Armor */}
        <path
          d="M32 4L56 12V30C56 44 46 54 32 60C18 54 8 44 8 30V12Z"
          fill="url(#dvVeeShieldGrad)"
        />
        {/* Inner Cyber Bevel */}
        <path
          d="M32 6L54 13.5V30C54 42.5 45 52 32 57.5"
          fill="none"
          stroke="rgba(255,255,255,0.26)"
          strokeWidth="1.4"
        />

        {/* Top Beacon Emblem */}
        <circle className="dv-cp-mascot__beacon" cx="32" cy="11.5" r="3.6" fill="#FFFFFF" />
        <circle cx="32" cy="11" r="1.2" fill="#2563EB" />
        <rect x="31.4" y="11.5" width="1.2" height="2.4" fill="#2563EB" />

        {/* Face Visor Display */}
        <rect x="14.5" y="18.5" width="35" height="27" rx="11.5" fill="#0B111A" stroke="rgba(125,211,252,0.25)" strokeWidth="1" />

        {/* Working/Thinking Visor Scan Line */}
        {isActive && (
          <line
            className="dv-cp-mascot__scan"
            x1="17"
            y1="23"
            x2="47"
            y2="23"
            stroke="rgba(56,189,248,0.45)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}

        {/* Expressive Eyebrows */}
        <path d={leftBrow} stroke={eyeColor} strokeWidth="1.7" strokeLinecap="round" fill="none" opacity="0.85" />
        <path d={rightBrow} stroke={eyeColor} strokeWidth="1.7" strokeLinecap="round" fill="none" opacity="0.85" />

        {/* Expressive Glowing Eyes */}
        <g className="dv-cp-mascot__eyes">
          {isHappy ? (
            <>
              <path d="M21.5 31.5Q25 25.5 28.5 31.5" stroke="#38BDF8" strokeWidth="2.8" strokeLinecap="round" fill="none" />
              <path d="M35.5 31.5Q39 25.5 42.5 31.5" stroke="#38BDF8" strokeWidth="2.8" strokeLinecap="round" fill="none" />
              {/* Rosy Happy Cheeks */}
              <ellipse cx="21" cy="35" rx="2.5" ry="1.3" fill="rgba(244,114,182,0.55)" />
              <ellipse cx="43" cy="35" rx="2.5" ry="1.3" fill="rgba(244,114,182,0.55)" />
            </>
          ) : (
            <>
              <ellipse className="dv-cp-mascot__eye" cx="25" cy="30.5" rx="3.7" ry="4.7" fill={eyeColor} />
              <ellipse className="dv-cp-mascot__eye" cx="39" cy="30.5" rx="3.7" ry="4.7" fill={eyeColor} />
              <circle cx="26.3" cy="29" r="1.2" fill="#FFFFFF" />
              <circle cx="40.3" cy="29" r="1.2" fill="#FFFFFF" />
            </>
          )}
        </g>

        {/* Expressive Mouth */}
        <path
          d={mouth}
          stroke={eyeColor}
          strokeWidth="2.3"
          fill={state === "surprised" ? eyeColor : "none"}
          strokeLinecap="round"
        />

        {/* Success Sparkles */}
        {isHappy && (
          <g className="dv-cp-mascot__sparkles" fill="#FDE047">
            <circle cx="10" cy="14" r="1.8" />
            <circle cx="54" cy="15" r="2" />
            <circle cx="52" cy="46" r="1.5" />
          </g>
        )}
      </g>
    </svg>
  );
});

export default Mascot;
