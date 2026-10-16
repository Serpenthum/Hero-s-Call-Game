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
  dice: 'M5 5h14v14H5zM9 9v.01M15 9v.01M12 12v.01M9 15v.01M15 15v.01',
  swords: 'M5 19L19 5M14 5h5v5M19 19L5 5M10 5H5v5',
  flame: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 0-6 1-8.5z',
  tower: 'M5 20V6h3v2h2V6h4v2h2V6h3v14zM10 20v-4h4v4',
  logout: 'M10 5H5v14h5M14 8l4 4-4 4M18 12H9',
  unlock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 5.6-1.5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  user: 'M5 20a7 7 0 0 1 14 0M8.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
  flag: 'M6 21V4M6 5h11l-2 4 2 4H6',
  rotate: 'M7 4h6a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 13 20H7a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 7 4zM9.5 17.5h1M17 8a4 4 0 0 1 3 4M20 8.5V12h-3.5',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4.5l3 2',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L20 20',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  chat: 'M4 5h16v11H9l-5 4z',
  userPlus: 'M4 20a6 6 0 0 1 12 0M7 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M19 8v6M16 11h6',
  userMinus: 'M4 20a6 6 0 0 1 12 0M7 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M16 11h6',
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
