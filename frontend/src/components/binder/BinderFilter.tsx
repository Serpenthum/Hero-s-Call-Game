// The filter button and the panel it opens: name search, the six filters and the five sorts.
import React, { useEffect, useId, useRef, useState } from 'react';
import {
  FILTER_LABELS, SORT_LABELS, buttonLabel, isFiltered,
  type BinderFilter as Filter, type BinderSort, type BinderView,
} from './binderRules';
import { FILTER_ICONS, FunnelIcon } from './BinderIcons';

interface BinderFilterProps {
  view: BinderView;
  onChange: (v: BinderView) => void;
  signedIn: boolean;
}

const FILTERS = Object.keys(FILTER_LABELS) as Filter[];
const SORTS = Object.keys(SORT_LABELS) as BinderSort[];
// Filters that need the player's own collection
const SIGNED_IN_ONLY: Filter[] = ['favourites', 'holo'];

export const BinderFilter: React.FC<BinderFilterProps> = ({ view, onChange, signedIn }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  // Escape or a tap anywhere outside the button and panel closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  // With a mouse, typing can start at once; on a touch screen that would pop the keyboard up over the panel.
  useEffect(() => {
    if (open && window.matchMedia?.('(hover: hover)').matches) searchRef.current?.focus();
  }, [open]);

  const filters = signedIn ? FILTERS : FILTERS.filter(f => !SIGNED_IN_ONLY.includes(f));

  return (
    <div className="binder-filter" ref={rootRef}>
      <button
        type="button"
        className="binder-filter-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Filter, sort and search"
        title="Filter, sort and search"
        onClick={() => setOpen(o => !o)}
      >
        <FunnelIcon />
        <span className="binder-filter-label">{buttonLabel(view)}</span>
        {isFiltered(view) && <span className="binder-filter-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="binder-panel" id={panelId}>
          <div className="binder-panel-row">
            <input
              ref={searchRef}
              type="search"
              className="binder-search"
              placeholder="Search by hero name"
              aria-label="Search by name"
              autoComplete="off"
              value={view.query}
              onChange={e => onChange({ ...view, query: e.target.value })}
            />
            <button type="button" className="binder-panel-done" onClick={() => setOpen(false)}>Done</button>
          </div>
          <p className="binder-panel-head">Show</p>
          <div className="binder-panel-opts">
            {filters.map(f => (
              <button
                key={f}
                type="button"
                className="binder-panel-opt"
                aria-pressed={view.filter === f}
                onClick={() => onChange({ ...view, filter: f })}
              >
                {FILTER_ICONS[f]}{FILTER_LABELS[f]}
              </button>
            ))}
          </div>
          <p className="binder-panel-head">Sort by</p>
          <div className="binder-panel-opts">
            {SORTS.map(s => (
              <button
                key={s}
                type="button"
                className="binder-panel-opt"
                aria-pressed={view.sort === s}
                onClick={() => onChange({ ...view, sort: s })}
              >
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
