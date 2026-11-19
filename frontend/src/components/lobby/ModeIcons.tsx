import React from 'react';

// Mode card icons, drawn in the card's accent colour (currentColor). Copied from the step 2 lobby mockup.

interface ModeIconProps {
  className?: string;
}

const Stroke: React.FC<ModeIconProps & { width: number; children: React.ReactNode }> = ({ className, width, children }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width="100%"
    height="100%"
    fill="none"
    stroke="currentColor"
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const DiceIcon: React.FC<ModeIconProps> = ({ className }) => (
  <Stroke className={className} width={1.8}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
    <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
    <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
  </Stroke>
);

export const SwordsIcon: React.FC<ModeIconProps> = ({ className }) => (
  <Stroke className={className} width={1.9}>
    <g className="swords-l"><path d="M4 3l13 13M13.5 18.5l5-5M17 17l3.5 3.5" /></g>
    <g className="swords-r"><path d="M20 3L7 16M10.5 18.5l-5-5M7 17l-3.5 3.5" /></g>
  </Stroke>
);

export const FlameIcon: React.FC<ModeIconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true">
    <path d="M12 2c1 4 5 5.5 5 10.5a5 5 0 0 1-10 0c0-1.8.7-3 1.7-4 .3 1.5 1 2.3 2 2.7C10.2 8 10.5 5 12 2z" />
    <path className="flame-core" d="M12 22a3 3 0 0 1-3-3c0-1.8 1.5-2.5 3-5 1.5 2.5 3 3.2 3 5a3 3 0 0 1-3 3z" />
  </svg>
);

export const TowerIcon: React.FC<ModeIconProps> = ({ className }) => (
  <Stroke className={className} width={1.8}>
    <path d="M5 21V8l-1.5-1V3h3v2h2.5V3h6v2h2.5V3h3v4L19 8v13z" />
    <path d="M10 21v-5a2 2 0 0 1 4 0v5" />
  </Stroke>
);
