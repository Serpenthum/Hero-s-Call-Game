import React, { useLayoutEffect, useState } from 'react';
import { DraftStep, TABLE_CHROME, bigCardWidth, chooseLayout, fitCards } from './draftRules';

export interface DraftLayout {
  layout: 'table' | 'focus';
  handCard: number; // hand card width, px
  perRow: number;
  bigCard: number; // big card width, px (0 in the table layout)
  slot: number; // team slot width (table) or portrait diameter (focus), px
  handPad: number; // hand side padding so exactly perRow cards fit per row
}

/** The real card face is 260 x 391; the draft rules size cards at 1.46, so heights are scaled to fit the face. */
const FACE_RATIO = 391 / 260;
const RULES_RATIO = 1.46;

/** Hand spacing per layout. Draft.css uses the same numbers. */
const HAND = {
  table: { gap: TABLE_CHROME.gap, edge: TABLE_CHROME.handPadX / 2, padY: TABLE_CHROME.handPadY },
  focus: { gap: 10, edge: 10, padY: 14 },
};

/** Big-card layout band: six portraits, VS above two bans in the centre. Draft.css uses the same numbers. */
export const FOCUS_BAND = { padX: 8, colGap: 6, slotGap: 6, centre: 86, maxPortrait: 56 };
const FOCUS_BIG_GUTTER = 20;

const MIN_CARD = 60;
const MIN_PORTRAIT = 20;

interface Measure {
  w: number;
  h: number;
  handW: number;
  handH: number;
}

export function computeDraftLayout(m: Measure | null, handCount: number): DraftLayout {
  if (!m || m.w <= 0 || m.h <= 0) {
    // Before the first measure (and under static rendering): the table layout at a 1280x720 size.
    return { layout: 'table', handCard: 232, perRow: Math.max(1, handCount), bigCard: 0, slot: 97, handPad: HAND.table.edge };
  }
  const layout = chooseLayout(m.w, m.h);
  const s = HAND[layout];
  const box = {
    width: m.handW - 2 * s.edge,
    height: ((m.handH - s.padY) * RULES_RATIO) / FACE_RATIO,
  };
  const fit = fitCards(handCount, box, s.gap);
  const handCard = Math.max(MIN_CARD, fit.width);
  const perRow = Math.max(1, fit.perRow);
  const rowWidth = perRow * handCard + s.gap * (perRow - 1);
  const handPad = Math.max(s.edge, Math.floor((m.handW - rowWidth) / 2) - 1);

  if (layout === 'table') {
    const slot = Math.max(MIN_PORTRAIT, Math.floor((TABLE_CHROME.band - 48) / RULES_RATIO));
    return { layout, handCard, perRow, bigCard: 0, slot, handPad };
  }
  const bigCard = Math.max(120, bigCardWidth(m.w, m.h));
  const right = m.w - bigCard - FOCUS_BIG_GUTTER;
  const b = FOCUS_BAND;
  const fits = Math.floor((right - 2 * b.padX - 2 * b.colGap - b.centre - 4 * b.slotGap) / 6);
  const slot = Math.max(MIN_PORTRAIT, Math.min(b.maxPortrait, fits));
  return { layout, handCard, perRow, bigCard, slot, handPad };
}

/**
 * Measures the draft table and its hand box and sizes everything on it.
 * Sizes change only when the hand size changes or the table resizes.
 */
export function useDraftLayout(
  root: React.RefObject<HTMLElement>,
  handCount: number,
  step: DraftStep,
): DraftLayout {
  const [m, setM] = useState<Measure | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const hand = el.querySelector<HTMLElement>('.draft-hand')?.getBoundingClientRect();
      const next = {
        w: Math.round(r.width),
        h: Math.round(r.height),
        handW: Math.round(hand?.width ?? 0),
        handH: Math.round(hand?.height ?? 0),
      };
      setM(prev =>
        prev && prev.w === next.w && prev.h === next.h && prev.handW === next.handW && prev.handH === next.handH
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const hand = el.querySelector('.draft-hand');
    if (hand) observer.observe(hand);
    return () => observer.disconnect();
    // The hand box moves when the step's chrome changes; re-observe then.
  }, [root, step]);

  return computeDraftLayout(m, handCount);
}
