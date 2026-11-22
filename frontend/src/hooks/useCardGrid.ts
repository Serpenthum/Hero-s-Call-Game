import { CSSProperties, useLayoutEffect, useState } from 'react';

const CARD_WIDTH = 260;
const CARD_HEIGHT = 391;
const GAP = 18;
const FRAME_SPACE = 12;
const PREFERRED_CARD_WIDTH = 210;
const MINIMUM_CARD_HEIGHT = 280;

type CardGridStyle = CSSProperties & {
  '--grid-columns': number;
  '--grid-rows': number;
  '--grid-card-width': string;
  '--grid-card-height': string;
  '--grid-row-height': string;
  '--grid-card-scale': number;
};

// minCardWidth: when set, columns are counted at the card's height-limited width rather than the preferred
// width, and the cards may shrink to minCardWidth to fit another column (a short, wide area).
export function calculateCardGrid(width: number, height: number, rowExtra = 0, maxRows = Infinity, fixedColumns?: number, gap = GAP, frameSpace = FRAME_SPACE, minCardWidth?: number) {
  const availableWidth = Math.max(1, width - frameSpace);
  const availableHeight = Math.max(1, height - frameSpace);
  const rows = Math.min(maxRows, Math.max(1, Math.floor((availableHeight + gap) / (MINIMUM_CARD_HEIGHT + rowExtra + gap))));
  let columns = fixedColumns ?? Math.max(1, Math.floor((availableWidth + gap) / (PREFERRED_CARD_WIDTH + gap)));
  if (fixedColumns === undefined && minCardWidth !== undefined) {
    const heightScale = Math.min(1.2, (availableHeight - gap * (rows - 1) - rowExtra * rows) / (rows * CARD_HEIGHT));
    // Floored at the minimum: a near-zero (or negative) measured height must not produce a huge column count
    const heightLimitedWidth = Math.max(minCardWidth, CARD_WIDTH * heightScale);
    columns = Math.max(1,
      Math.floor((availableWidth + gap) / (heightLimitedWidth + gap)),
      Math.floor((availableWidth + gap) / (minCardWidth + gap)));
  }
  const scale = Math.min(
    1.2,
    (availableWidth - gap * (columns - 1)) / (columns * CARD_WIDTH),
    (availableHeight - gap * (rows - 1) - rowExtra * rows) / (rows * CARD_HEIGHT)
  );

  return { columns, rows, scale: Math.max(0.1, Math.floor(scale * 1000) / 1000) };
}

export function calculatePackGrid(width: number, height: number, count: number) {
  let best = { columns: 1, rows: Math.max(1, count), scale: 0 };
  for (let rows = 1; rows <= Math.max(1, count); rows++) {
    const columns = Math.ceil(Math.max(1, count) / rows);
    // Leave room for the largest bounce in the reveal animation.
    const scale = Math.min(
      1.25,
      (width - FRAME_SPACE - GAP * (columns - 1)) / (columns * CARD_WIDTH * 1.15),
      (height - FRAME_SPACE - GAP * (rows - 1)) / (rows * CARD_HEIGHT * 1.15)
    );
    if (scale > best.scale) best = { columns, rows, scale };
  }
  return { ...best, scale: Math.max(0.1, Math.floor(best.scale * 1000) / 1000) };
}

// The shop's sale and "See what's inside" grids: up to maxRows rows, a row only when its cards stay at least
// minCardWidth wide. Of the row counts that fit, the one showing the most cards wins; on a tie, the bigger cards.
export function calculateShopGrid(width: number, height: number, count: number, minCardWidth = 222, maxRows = 3, gap = GAP) {
  const cardCount = Math.max(1, count);
  let best = { columns: 1, rows: 1, cardWidth: -Infinity, shown: 0 };
  for (let rowLimit = 1; rowLimit <= maxRows; rowLimit++) {
    // The width the height allows, capped at a scale of 1.2
    const heightLimitedWidth = Math.min(CARD_WIDTH * 1.2, ((height - gap * (rowLimit - 1)) / rowLimit) * CARD_WIDTH / CARD_HEIGHT);
    if (rowLimit > 1 && heightLimitedWidth < minCardWidth) continue;
    let columns = Math.max(1,
      Math.floor((width + gap) / (heightLimitedWidth + gap)),
      Math.floor((width + gap) / (minCardWidth + gap)));
    columns = Math.min(columns, Math.ceil(cardCount / rowLimit));
    const rows = Math.min(rowLimit, Math.ceil(cardCount / columns));
    const cardWidth = Math.min(heightLimitedWidth, (width - gap * (columns - 1)) / columns);
    const shown = Math.min(cardCount, columns * rows);
    if (shown > best.shown || (shown === best.shown && cardWidth > best.cardWidth)) best = { columns, rows, cardWidth, shown };
  }
  return { columns: best.columns, rows: best.rows, scale: Math.max(0.1, Math.floor(best.cardWidth / CARD_WIDTH * 1000) / 1000) };
}

export default function useCardGrid({ packCount, shopCount, rowExtra = 0, singleRowOnPhone = false, fixedColumns, gap = GAP, frameSpace = FRAME_SPACE, shortScreenMinCardWidth }: {
  packCount?: number;
  // Lay the cards out for the shop (see calculateShopGrid) instead of the normal grid
  shopCount?: number;
  rowExtra?: number;
  singleRowOnPhone?: boolean;
  fixedColumns?: number;
  gap?: number;
  frameSpace?: number;
  // On a short screen (a sideways phone), fill the width with cards no narrower than this; see calculateCardGrid
  shortScreenMinCardWidth?: number;
} = {}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState(() => calculateCardGrid(260, 391));

  useLayoutEffect(() => {
    if (!element) return;
    const phoneScreen = window.matchMedia('(max-width: 600px), (max-width: 1000px) and (max-height: 600px)');
    const shortScreen = window.matchMedia('(max-height: 500px)');
    let size = { width: 0, height: 0 };
    const updateLayout = () => {
      const { width, height } = size;
      if (width <= 0 || height <= 0) return;
      const maxRows = fixedColumns !== undefined || (singleRowOnPhone && phoneScreen.matches) ? 1 : Infinity;
      const next = packCount !== undefined ? calculatePackGrid(width, height, packCount) :
        shopCount !== undefined ? calculateShopGrid(width, height, shopCount, undefined, undefined, gap) :
        calculateCardGrid(width, height, rowExtra, maxRows, fixedColumns, gap, frameSpace, shortScreen.matches ? shortScreenMinCardWidth : undefined);
      setLayout(previous => previous.columns === next.columns &&
        previous.rows === next.rows && previous.scale === next.scale ? previous : next);
    };
    const observer = new ResizeObserver(([entry]) => {
      size = entry.contentRect;
      updateLayout();
    });
    observer.observe(element);
    phoneScreen.addEventListener('change', updateLayout);
    shortScreen.addEventListener('change', updateLayout);
    return () => {
      observer.disconnect();
      phoneScreen.removeEventListener('change', updateLayout);
      shortScreen.removeEventListener('change', updateLayout);
    };
  }, [element, packCount, shopCount, rowExtra, singleRowOnPhone, fixedColumns, gap, frameSpace, shortScreenMinCardWidth]);

  const style: CardGridStyle = {
    '--grid-columns': layout.columns,
    '--grid-rows': layout.rows,
    '--grid-card-width': `${CARD_WIDTH * layout.scale}px`,
    '--grid-card-height': `${CARD_HEIGHT * layout.scale}px`,
    '--grid-row-height': `${CARD_HEIGHT * layout.scale + rowExtra}px`,
    '--grid-card-scale': layout.scale
  };

  return { ref: setElement, style, pageSize: layout.columns * layout.rows };
}
