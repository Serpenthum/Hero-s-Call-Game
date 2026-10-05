import React, { useId } from 'react';

interface CoinProps {
  className?: string;
}

// The game's currency icon; always shown next to an amount, never with a label.
const Coin: React.FC<CoinProps> = ({ className }) => {
  const id = useId().replace(/:/g, '');
  const face = `coinFace${id}`;
  const rim = `coinRim${id}`;
  return (
    <svg className={`coin-icon${className ? ` ${className}` : ''}`} viewBox="0 0 64 64" role="img" aria-label="Coins">
      <defs>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="0.5" stopColor="#ffc61a" />
          <stop offset="1" stopColor="#b87800" />
        </linearGradient>
        <radialGradient id={face} cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#fff0a0" />
          <stop offset="0.6" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#e0a000" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill={`url(#${rim})`} stroke="#4a3000" strokeWidth="3" />
      <circle cx="32" cy="32" r="22" fill={`url(#${face})`} stroke="#b87800" strokeWidth="2" />
      <circle cx="32" cy="32" r="25.5" fill="none" stroke="#fff6c4" strokeWidth="1" strokeDasharray="2 3.2" opacity="0.8" />
      <path
        d="M32 17 L36.2 26.4 L46.5 27.6 L38.8 34.5 L41 44.6 L32 39.4 L23 44.6 L25.2 34.5 L17.5 27.6 L27.8 26.4 Z"
        fill="#c98a00"
        stroke="#7a4f00"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 22 A21 21 0 0 1 28 11" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
};

export default Coin;
