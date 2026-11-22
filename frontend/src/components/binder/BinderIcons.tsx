// The binder's small line icons. They take the text colour of whatever holds them.
import React from 'react';
import type { BinderFilter } from './binderRules';

const Stroke: React.FC<{ width?: number; children: React.ReactNode }> = ({ width = 2.2, children }) => (
  <svg className="binder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const Fill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg className="binder-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{children}</svg>
);

export const FunnelIcon = () => <Stroke><path d="M3.5 5h17l-6.5 8v6.5l-4-2V13z" /></Stroke>;
export const PrevIcon = () => <Stroke width={2.8}><path d="M15 4.5L7.5 12l7.5 7.5" /></Stroke>;
export const NextIcon = () => <Stroke width={2.8}><path d="M9 4.5l7.5 7.5L9 19.5" /></Stroke>;
export const StarIcon = () => (
  <Fill><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z" /></Fill>
);

export const FILTER_ICONS: Record<BinderFilter, React.ReactElement> = {
  all: (
    <Fill>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" /><rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </Fill>
  ),
  owned: <Stroke width={3.2}><path d="M4.5 12.5l5 5L19.5 7" /></Stroke>,
  favourites: <StarIcon />,
  holo: (
    <Fill>
      <path d="M10 2.5l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /><path d="M18.5 13.5l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z" />
    </Fill>
  ),
  'not-owned': <Fill><path fillRule="evenodd" d="M6 10V7a6 6 0 0 1 12 0v3h1.5v11h-15V10zm3 0h6V7a3 3 0 0 0-6 0z" /></Fill>,
  disabled: <Stroke width={2.6}><circle cx="12" cy="12" r="8.5" /><path d="M6 18L18 6" /></Stroke>,
};
