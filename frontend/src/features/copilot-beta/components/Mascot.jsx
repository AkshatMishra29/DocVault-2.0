import React from "react";
import "./mascot.css";

export default function Mascot({ state = "idle", size = 48 }) {
  // Lively expressive mouth curves and eye shapes for Vee
  const mouth = {
    idle: "M26 38Q32 42 38 38",
    thinking: "M27 39Q32 37 37 39",
    working: "M28 38H36",
    success: "M24 36Q32 47 40 36",
    error: "M26 42Q32 36 38 42",
    surprised: "M29 39A3 3 0 1 1 35 39A3 3 0 1 1 29 39",
  }[state] || "M26 38Q32 42 38 38";

  const isBlinking = state === "idle";
  const isHappy = state === "success";

  return (
    <svg className="dv-cp-mascot" data-state={state} viewBox="0 0 64 64"
         width={size} height={size} aria-hidden="true" focusable="false">
      <g className="dv-cp-mascot__body">
        {/* Shield Outer Armor */}
        <path d="M32 4L56 12V30C56 44 46 54 32 60C18 54 8 44 8 30V12Z"
              fill="var(--color-accent, #0071E3)" />
        {/* Subtle Cyber Shield Highlight */}
        <path d="M32 6L54 13.5V30C54 42.5 45 52 32 57.5"
              fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
        {/* Keyhole Beacon Emblem */}
        <circle cx="32" cy="11.5" r="3.6" fill="#fff" />
        <circle cx="32" cy="11" r="1.2" fill="var(--color-accent, #0071E3)" />
        <rect x="31.4" y="11.5" width="1.2" height="2.4" fill="var(--color-accent, #0071E3)" />
        
        {/* Face Visor Display */}
        <rect x="15" y="19" width="34" height="26" rx="11" fill="#0B111A" />
        
        {/* Expressive Glowing Eyes */}
        <g className="dv-cp-mascot__eyes">
          {isHappy ? (
            <>
              {/* Happy Arched Eyes ^ _ ^ */}
              <path d="M22 31Q25 26 28 31" stroke="#38BDF8" strokeWidth="2.8" strokeLinecap="round" fill="none" />
              <path d="M36 31Q39 26 42 31" stroke="#38BDF8" strokeWidth="2.8" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <ellipse className="dv-cp-mascot__eye dv-cp-mascot__eye--left" cx="25" cy="30" rx="3.6" ry="4.6" fill="#7DD3FC" />
              <ellipse className="dv-cp-mascot__eye dv-cp-mascot__eye--right" cx="39" cy="30" rx="3.6" ry="4.6" fill="#7DD3FC" />
              {/* Eye Catchlights / Sparkles */}
              <circle cx="26.2" cy="28.8" r="1.1" fill="#FFFFFF" />
              <circle cx="40.2" cy="28.8" r="1.1" fill="#FFFFFF" />
            </>
          )}
        </g>
        
        {/* Expressive Mouth */}
        <path d={mouth} stroke="#7DD3FC" strokeWidth="2.2" fill={state === "surprised" ? "#7DD3FC" : "none"} strokeLinecap="round" />
      </g>
    </svg>
  );
}
