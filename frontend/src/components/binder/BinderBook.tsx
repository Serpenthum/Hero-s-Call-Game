// The open book: the spread's two pages, the rings between them, and the arrows that turn the page.
// The turn is instant for now; the animated leaf goes in here, inside turn().
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { BinderPage } from './BinderPage';
import { NextIcon, PrevIcon } from './BinderIcons';
import { cardMotionOff } from '../../cards/cardMotion';
import { spreadCount, spreadPages, turnTarget, type BinderHero, type Collection, type TurnDir } from './binderRules';

interface BinderBookProps {
  list: BinderHero[];
  collection: Collection;
  spread: number;
  onSpreadChange: (s: number) => void;
  spotlight: string | null;
  onOpen: (name: string) => void;
  viewKey: string; // changes when the filter, sort or search changes
  fadeKey: string; // changes when the filter or sort changes: the pages fade in. Typing in search doesn't fade.
}

const FADE_MS = 140;

export const BinderBook: React.FC<BinderBookProps> = ({
  list, collection, spread, onSpreadChange, spotlight, onOpen, viewKey, fadeKey,
}) => {
  const spreads = spreadCount(list.length);
  const [left, right] = useMemo(() => spreadPages(list, spread), [list, spread]);

  // A filter or sort change fades the new pages in. Opacity only: no card moves or re-animates.
  const spreadRef = useRef<HTMLDivElement>(null);
  const fadedKey = useRef(fadeKey);
  useEffect(() => {
    if (fadedKey.current === fadeKey) return;
    fadedKey.current = fadeKey;
    if (cardMotionOff()) return;
    spreadRef.current?.querySelectorAll('.binder-page').forEach(page => {
      page.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
    });
  }, [fadeKey]);

  const turn = useCallback((dir: TurnDir) => {
    onSpreadChange(turnTarget(spread, dir, spreads));
  }, [onSpreadChange, spread, spreads]);

  return (
    <div className="binder-book" data-view-key={viewKey}>
      <div className="binder-spread" ref={spreadRef}>
        <div className="binder-side binder-side--left">
          <BinderPage heroes={left} collection={collection} spotlight={spotlight} onOpen={onOpen} />
        </div>
        <div className="binder-side binder-side--right">
          <BinderPage heroes={right} collection={collection} spotlight={spotlight} onOpen={onOpen} />
        </div>
        <div className="binder-rings" aria-hidden="true"><span /><span /><span /></div>
      </div>
      {list.length === 0 && <p className="binder-empty">No heroes match</p>}
      {spreads > 1 && (
        <>
          <button type="button" className="binder-arrow binder-arrow--prev" aria-label="Previous page" title="Previous page"
            onClick={() => turn(-1)}><PrevIcon /></button>
          <button type="button" className="binder-arrow binder-arrow--next" aria-label="Next page" title="Next page"
            onClick={() => turn(1)}><NextIcon /></button>
        </>
      )}
    </div>
  );
};
