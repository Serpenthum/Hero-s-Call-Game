import React from 'react';

// 24x24 stroke icons. Add a path here before using a new name anywhere.
const PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  warning: 'M12 4l9 16H3zM12 10v4.5M12 17.5v.01',
  key: 'M4.5 15a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M10.5 12.5L19 4M16 7l3 3M14 9l2 2',
  back: 'M14 6l-6 6 6 6',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  info: 'M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0M12 11v5M12 8v.01',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
  // Provide when the icon carries meaning on its own; omitted icons are decorative
  title?: string;
  className?: string;
}

const Icon: React.FC<IconProps> = ({ name, size = 18, title, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <path d={PATHS[name]} />
  </svg>
);

export default Icon;
