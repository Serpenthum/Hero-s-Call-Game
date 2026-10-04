import React from 'react';

interface TutorialSkullProps {
  talking: boolean;
  size?: number;
}

// Chattering skull drawn in SVG; the jaw group is animated by CSS while `talking`.
const TutorialSkull: React.FC<TutorialSkullProps> = ({ talking, size = 84 }) => (
  <svg
    className={`tutorial-skull${talking ? ' talking' : ''}`}
    viewBox="0 0 120 130"
    width={size}
    height={(size * 130) / 120}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="skull-bone" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#fbf6e6" />
        <stop offset="100%" stopColor="#cfc6a8" />
      </radialGradient>
      <radialGradient id="skull-eye-fill" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#d6ffc8" />
        <stop offset="55%" stopColor="#7cff6b" />
        <stop offset="100%" stopColor="rgba(124,255,107,0)" />
      </radialGradient>
    </defs>

    {/* Mouth cavity behind the teeth, visible when the jaw drops */}
    <rect x="32" y="92" width="56" height="26" rx="5" fill="#140c1c" />

    <path
      d="M60 4 C30 4 10 24 10 54 C10 70 18 82 30 88 L30 98 L90 98 L90 88 C102 82 110 70 110 54 C110 24 90 4 60 4 Z"
      fill="url(#skull-bone)"
      stroke="#9c9276"
      strokeWidth="2"
    />

    <ellipse cx="40" cy="54" rx="14" ry="16" fill="#140c1c" />
    <ellipse cx="80" cy="54" rx="14" ry="16" fill="#140c1c" />
    <circle className="skull-eye-glow" cx="40" cy="56" r="8" fill="url(#skull-eye-fill)" />
    <circle className="skull-eye-glow" cx="80" cy="56" r="8" fill="url(#skull-eye-fill)" />

    <path d="M60 68 L52 83 L68 83 Z" fill="#140c1c" />

    {/* Upper teeth */}
    <rect x="32" y="90" width="56" height="10" rx="2" fill="#f1ead4" stroke="#9c9276" strokeWidth="1.5" />
    <g stroke="#9c9276" strokeWidth="1.2">
      <line x1="41" y1="90" x2="41" y2="100" />
      <line x1="50" y1="90" x2="50" y2="100" />
      <line x1="60" y1="90" x2="60" y2="100" />
      <line x1="70" y1="90" x2="70" y2="100" />
      <line x1="79" y1="90" x2="79" y2="100" />
    </g>

    {/* Lower jaw (animated) */}
    <g className="skull-jaw">
      <path d="M34 100 L86 100 L84 114 Q60 124 36 114 Z" fill="url(#skull-bone)" stroke="#9c9276" strokeWidth="2" />
      <rect x="36" y="100" width="48" height="8" rx="2" fill="#f1ead4" stroke="#9c9276" strokeWidth="1.2" />
      <g stroke="#9c9276" strokeWidth="1.1">
        <line x1="45" y1="100" x2="45" y2="108" />
        <line x1="54" y1="100" x2="54" y2="108" />
        <line x1="63" y1="100" x2="63" y2="108" />
        <line x1="72" y1="100" x2="72" y2="108" />
      </g>
    </g>
  </svg>
);

export default TutorialSkull;
