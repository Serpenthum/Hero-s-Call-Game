import { CSSProperties, useLayoutEffect, useState } from 'react';

const CARD_WIDTH = 260;
const CARD_HEIGHT = 391;
const GAP = 18;
const FRAME_SPACE = 12;
const PREFERRED_CARD_WIDTH = 210;
const MINIMUM_CARD_HEIGHT = 280;

type CardGridStyle = CSSProperties & {
  '--grid-columns': number;
  '--grid-card-width': string;
  '--grid-card-height': string;
  '--grid-row-height': string;
  '--grid-card-scale': number;
};

export function calculateCardGrid(width: number, height: number, rowExtra = 0, maxRows = Infinity, fixedColumns?: number, gap = GAP, frameSpace = FRAME_SPACE) {
  const availableWidth = Math.max(1, width - frameSpace);
  const availableHeight = Math.max(1, height - frameSpace);
  const columns = fixedColumns ?? Math.max(1, Math.floor((availableWidth + gap) / (PREFERRED_CARD_WIDTH + gap)));
  const rows = Math.min(maxRows, Math.max(1, Math.floor((availableHeight + gap) / (MINIMUM_CARD_HEIGHT + rowExtra + gap))));
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

export default function useCardGrid({ packCount, rowExtra = 0, singleRowOnPhone = false, fixedColumns, gap = GAP, frameSpace = FRAME_SPACE }: {
  packCount?: number;
  rowExtra?: number;
  singleRowOnPhone?: boolean;
  fixedColumns?: number;
  gap?: number;
  frameSpace?: number;
} = {}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState(() => calculateCardGrid(260, 391));

  useLayoutEffect(() => {
    if (!element) return;
    const phoneScreen = window.matchMedia('(max-width: 600px), (max-width: 1000px) and (max-height: 600px)');
    let size = { width: 0, height: 0 };
    const updateLayout = () => {
      const { width, height } = size;
      if (width <= 0 || height <= 0) return;
      const maxRows = fixedColumns !== undefined || (singleRowOnPhone && phoneScreen.matches) ? 1 : Infinity;
      const next = packCount === undefined ? calculateCardGrid(width, height, rowExtra, maxRows, fixedColumns, gap, frameSpace) :
        calculatePackGrid(width, height, packCount);
      setLayout(previous => previous.columns === next.columns &&
        previous.rows === next.rows && previous.scale === next.scale ? previous : next);
    };
    const observer = new ResizeObserver(([entry]) => {
      size = entry.contentRect;
      updateLayout();
    });
    observer.observe(element);
    phoneScreen.addEventListener('change', updateLayout);
    return () => {
      observer.disconnect();
      phoneScreen.removeEventListener('change', updateLayout);
    };
  }, [element, packCount, rowExtra, singleRowOnPhone, fixedColumns, gap, frameSpace]);

  const style: CardGridStyle = {
    '--grid-columns': layout.columns,
    '--grid-card-width': `${CARD_WIDTH * layout.scale}px`,
    '--grid-card-height': `${CARD_HEIGHT * layout.scale}px`,
    '--grid-row-height': `${CARD_HEIGHT * layout.scale + rowExtra}px`,
    '--grid-card-scale': layout.scale
  };

  return { ref: setElement, style, pageSize: layout.columns * layout.rows };
}
