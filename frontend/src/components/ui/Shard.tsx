import React from 'react';
import '../../styles/Shard.css';

interface ShardProps {
  className?: string;
  // Say what it stands for when no word beside it does ("140 shards"); without one the icon is decoration
  label?: string;
}

// The shard: a broken piece of blue crystal, lit from the top left as the coin is, with the same weight of dark
// outline. Sized by the surrounding font size (Shard.css); its colours are the --shard tokens.
// Drawn from the approved mockup (docs/superpowers/specs/2026-11-23-economy-core-mockup.html).
const Shard: React.FC<ShardProps> = ({ className, label }) => (
  <svg
    className={`shard-icon${className ? ` ${className}` : ''}`}
    viewBox="0 0 64 64"
    focusable="false"
    {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
  >
    <g strokeLinejoin="round">
      <path d="M39 3 L55 24 L46 58 L35 51 L24 61 L10 37 L21 14 Z" fill="var(--shard)" />
      <path d="M39 3 L21 14 L10 37 L31 30 Z" fill="var(--shard-hot)" />
      <path d="M10 37 L24 61 L35 51 L31 30 Z" fill="var(--shard-deep)" opacity="0.5" />
      <path d="M31 30 L55 24 L46 58 L35 51 Z" fill="var(--shard-deep)" />
      <path d="M39 3 L31 30 L35 51 M10 37 L31 30 L55 24" fill="none" stroke="var(--shard-hot)" strokeWidth="1.6" opacity="0.75" />
      <path d="M39 3 L55 24 L46 58 L35 51 L24 61 L10 37 L21 14 Z" fill="none" stroke="var(--card-ink)" strokeWidth="3" />
      <path d="M23.5 18 L33 11.5" fill="none" stroke="var(--card-white)" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
    </g>
  </svg>
);

export default Shard;
