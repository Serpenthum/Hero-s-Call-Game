// The open book: the spread's two pages, the rings between them, and the arrows that turn the page.
//
// The page turn. Each half of the book is a slot holding the page lying there. For a turn the slot also holds one
// face of the turning leaf, on top: the page being turned away (front) in one slot, and the page it lands as
// (back) in the other, both hinged on the spine. Pages are keyed by spread, so a page's elements are made once,
// before the leaf moves, and stay put when it lands: landing only drops the leaf classes and the pages left behind.
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { BinderPage } from './BinderPage';
import { NextIcon, PrevIcon } from './BinderIcons';
import { cardMotionOff } from '../../cards/cardMotion';
import { heroImage } from '../draft/DraftPortrait';
import useBinderTurn, { TURN_MS } from './useBinderTurn';
import { spreadCount, spreadPages, turnLayout, type BinderHero, type Collection } from './binderRules';

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
const SIDES = [0, 1] as const;
const SIDE_NAME = ['left', 'right'] as const;

// A page in a slot: lying flat, or a face of the turning leaf.
interface Sheet { spread: number; role: 'flat' | 'front' | 'back' }

export const BinderBook: React.FC<BinderBookProps> = ({
  list, collection, spread, onSpreadChange, spotlight, onOpen, viewKey, fadeKey,
}) => {
  const spreads = spreadCount(list.length);

  // A spread's two pages, worked out once per list so a page's props stay the same from one render to the next.
  const pagesOf = useMemo(() => {
    const cache = new Map<number, ReturnType<typeof spreadPages>>();
    return (s: number) => {
      let pages = cache.get(s);
      if (!pages) cache.set(s, pages = spreadPages(list, s));
      return pages;
    };
  }, [list]);
  const artFor = useCallback(
    (s: number) => pagesOf(s).flat().flatMap(hero => (hero ? [heroImage(hero.name)] : [])),
    [pagesOf],
  );

  const { turn, request, land } = useBinderTurn({ spread, spreads, viewKey, onSpreadChange, artFor });

  const sheets = (side: 0 | 1): Sheet[] => {
    if (!turn) return [{ spread, role: 'flat' }];
    const layout = turnLayout(turn.from, turn.to, turn.dir);
    const under = side === 0 ? layout.underLeft : layout.underRight;
    const leaf: Sheet = layout.leafFront.side === side
      ? { spread: layout.leafFront.spread, role: 'front' }
      : { spread: layout.leafBack.spread, role: 'back' };
    return [{ spread: under.spread, role: 'flat' }, leaf];
  };

  const spreadRef = useRef<HTMLDivElement>(null);

  // The leaf has landed when the front face's animation ends.
  useEffect(() => {
    const el = spreadRef.current;
    if (!el) return;
    const onEnd = (e: Event) => {
      if ((e.target as Element).classList?.contains('binder-leaf--front')) land();
    };
    el.addEventListener('animationend', onEnd);
    return () => el.removeEventListener('animationend', onEnd);
  }, [land]);

  // A filter or sort change fades the new pages in. Opacity only: no card moves or re-animates.
  const fadedKey = useRef(fadeKey);
  useEffect(() => {
    if (fadedKey.current === fadeKey) return;
    fadedKey.current = fadeKey;
    if (cardMotionOff()) return;
    spreadRef.current?.querySelectorAll('.binder-page').forEach(page => {
      page.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
    });
  }, [fadeKey]);

  const bookClass = `binder-book${turn ? ' binder-book--leafed' : ''}${turn?.phase === 'moving' ? ' binder-book--turning' : ''}`;

  return (
    <div className={bookClass} data-view-key={viewKey} style={{ '--turn-ms': `${TURN_MS}ms` } as React.CSSProperties}>
      <div className="binder-spread" ref={spreadRef}>
        {SIDES.map(side => {
          const inSlot = sheets(side);
          return (
            <div key={side} className={`binder-slot binder-slot--${SIDE_NAME[side]}`}>
              {inSlot.map(sheet => (
                <div
                  key={sheet.spread}
                  className={`binder-side binder-side--${SIDE_NAME[side]}${sheet.role === 'flat' ? '' : ` binder-leaf binder-leaf--${sheet.role}`}`}
                >
                  <BinderPage heroes={pagesOf(sheet.spread)[side]} collection={collection} spotlight={spotlight} onOpen={onOpen} />
                  {sheet.role !== 'flat' && <div className="binder-shade" />}
                </div>
              ))}
              {/* The shadow the leaf throws on the page lying in this slot */}
              {turn && <div className={`binder-cast binder-cast--${inSlot[1].role === 'front' ? 'lift' : 'fall'}`} />}
            </div>
          );
        })}
        <div className="binder-rings" aria-hidden="true"><span /><span /><span /></div>
      </div>
      {list.length === 0 && <p className="binder-empty">No heroes match</p>}
      {spreads > 1 && (
        <>
          <button type="button" className="binder-arrow binder-arrow--prev" aria-label="Previous page" title="Previous page"
            onClick={() => request(-1)}><PrevIcon /></button>
          <button type="button" className="binder-arrow binder-arrow--next" aria-label="Next page" title="Next page"
            onClick={() => request(1)}><NextIcon /></button>
        </>
      )}
    </div>
  );
};
