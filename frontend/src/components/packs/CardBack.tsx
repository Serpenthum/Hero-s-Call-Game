import React from 'react';

// The back of a card: dark leather, a brass inset border and the shield crest (drawn in PackOpening.css).
const CardBack: React.FC = () => (
  <div className="pack-opening__back" aria-hidden="true">
    <svg className="pack-opening__crest" viewBox="0 0 100 100" fill="currentColor">
      <path d="M50 4l40 14v30c0 24-17 40-40 48C27 88 10 72 10 48V18z" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M50 14l31 11v23c0 19-13 31-31 38-18-7-31-19-31-38V25z" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <path d="M50 22l3.5 34h-7zM38 56h24v5H38zM47.5 61h5v14h-5zM46 75h8v4h-8z" />
    </svg>
  </div>
);

export default CardBack;
