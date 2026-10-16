import React from 'react';

// Lobby tile icons: a market stall and a leather tome. Colours come from the table palette
// through the lobby-icon-* classes in Lobby.css, so they follow the tokens.

export const ShopIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
    <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="1.6">
      {/* posts and counter */}
      <path className="li-wood" d="M12 26 V56 M52 26 V56" fill="none" strokeWidth="3" />
      <rect className="li-wood-fill" x="10" y="42" width="44" height="14" rx="1.5" />
      <path className="li-line" d="M10 48 H54" fill="none" />
      {/* wares on the counter */}
      <path className="li-brass-fill" d="M20 42 q0-8 6-8 t6 8 z" />
      <circle className="li-brass-fill" cx="40" cy="38" r="4.5" />
      <circle className="li-brass-fill" cx="46" cy="40.5" r="3.5" />
      {/* striped awning with scalloped edge */}
      <path className="li-ember-fill" d="M8 12 H20 V26 a4 4 0 0 1 -8 0 a4 4 0 0 1 -4 -4 z" />
      <path className="li-bone-fill" d="M20 12 H32 V26 a4 4 0 0 1 -8 0 a4 4 0 0 1 -4 0 z" />
      <path className="li-ember-fill" d="M32 12 H44 V26 a4 4 0 0 1 -8 0 a4 4 0 0 1 -4 0 z" />
      <path className="li-bone-fill" d="M44 12 H56 V22 a4 4 0 0 1 -4 4 a4 4 0 0 1 -8 0 z" />
      <path className="li-brass-fill" d="M6 8 H58 L56 12 H8 z" />
    </g>
  </svg>
);

export const BinderIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
    <g strokeLinejoin="round" strokeLinecap="round" strokeWidth="1.6">
      {/* page block */}
      <path className="li-bone-fill" d="M14 10 H51 a2 2 0 0 1 2 2 V52 a2 2 0 0 1 -2 2 H14 z" />
      <path className="li-line" d="M17 54 V58 H50 M17 12 H50" fill="none" strokeWidth="1" />
      {/* leather cover with spine */}
      <path className="li-leather-fill" d="M10 6 H46 a3 3 0 0 1 3 3 V49 a3 3 0 0 1 -3 3 H10 a3 3 0 0 1 -3 -3 V9 a3 3 0 0 1 3 -3 z" />
      <path className="li-spine" d="M7 9 a3 3 0 0 1 3 -3 H17 V52 H10 a3 3 0 0 1 -3 -3 z" />
      <path className="li-brass" d="M17 6 V52 M10 14 H17 M10 24 H17 M10 34 H17 M10 44 H17" fill="none" />
      {/* corner caps */}
      <path className="li-brass-fill" d="M49 6 V15 M49 6 H40 L49 15 z" />
      <path className="li-brass-fill" d="M49 52 V43 L40 52 z" />
      {/* diamond emblem and clasp */}
      <path className="li-brass-fill" d="M31 18 L38 28 L31 38 L24 28 z" />
      <path className="li-line" d="M31 22 L34 28 L31 34 L28 28 z" fill="none" strokeWidth="1" />
      <rect className="li-brass-fill" x="45" y="25" width="8" height="7" rx="1.5" />
    </g>
  </svg>
);
