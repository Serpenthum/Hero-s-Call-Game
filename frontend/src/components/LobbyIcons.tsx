import React from 'react';

// Gold tile icons for the lobby; drawn as SVG so they stay sharp at any size.
const GOLD_LIGHT = '#ffe680';
const GOLD = '#ffc61a';
const GOLD_DARK = '#c98a00';
const OUTLINE = '#4a3000';

export const ShopIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="shopBag" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={GOLD_LIGHT} />
        <stop offset="0.55" stopColor={GOLD} />
        <stop offset="1" stopColor={GOLD_DARK} />
      </linearGradient>
    </defs>
    <g stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M22 13 C26 8 38 8 42 13 L40 19 L24 19 Z" fill={GOLD} />
      <path d="M24 19 L40 19 L45 27 C52 34 55 43 52 50 C49 58 40 60 32 60 C24 60 15 58 12 50 C9 43 12 34 19 27 Z" fill="url(#shopBag)" />
      <path d="M19 27 L45 27" fill="none" />
      <path d="M21 25 C28 29 36 29 43 25" fill="none" stroke={GOLD_DARK} strokeWidth="3" />
      <circle cx="32" cy="43" r="9" fill={GOLD_LIGHT} />
      <circle cx="32" cy="43" r="5.5" fill="none" stroke={GOLD_DARK} />
      <path d="M32 39.5 L33.2 42 L36 42.3 L33.9 44.2 L34.5 47 L32 45.6 L29.5 47 L30.1 44.2 L28 42.3 L30.8 42 Z" fill={GOLD_DARK} stroke="none" />
    </g>
  </svg>
);

export const BinderIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="binderCover" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={GOLD_LIGHT} />
        <stop offset="0.55" stopColor={GOLD} />
        <stop offset="1" stopColor={GOLD_DARK} />
      </linearGradient>
    </defs>
    <g stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <rect x="47" y="10" width="8" height="46" rx="2" fill="#fff3c4" />
      <path d="M50 16 L52 16 M50 22 L52 22 M50 28 L52 28 M50 34 L52 34 M50 40 L52 40 M50 46 L52 46" fill="none" strokeWidth="1.2" />
      <rect x="9" y="6" width="43" height="52" rx="4" fill="url(#binderCover)" />
      <rect x="9" y="6" width="9" height="52" rx="3" fill={GOLD_DARK} />
      <path d="M13.5 14 L13.5 18 M13.5 28 L13.5 32 M13.5 42 L13.5 46" fill="none" stroke={GOLD_LIGHT} strokeWidth="2.5" />
      <rect x="23" y="13" width="23" height="31" rx="2.5" fill="#2a1d00" />
      <path d="M34.5 20 L41 28.5 L34.5 37 L28 28.5 Z" fill={GOLD_LIGHT} stroke={GOLD_DARK} />
      <rect x="25" y="48" width="19" height="5" rx="2" fill={GOLD_LIGHT} />
    </g>
  </svg>
);
