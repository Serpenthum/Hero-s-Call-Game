import { describe, expect, it } from 'vitest';
import { calculateCardGrid, calculateShopGrid } from './useCardGrid';

const cardWidth = (scale: number) => 260 * scale;

describe('calculateCardGrid', () => {
  it('counts columns at the preferred width when no minimum card width is given', () => {
    // A short, wide area: the cards are limited by height, yet only one column is used
    expect(calculateCardGrid(420, 290).columns).toBe(1);
    expect(calculateCardGrid(600, 320).columns).toBe(2);
  });

  it('fills a short, wide area with more columns, no narrower than the minimum', () => {
    const narrow = calculateCardGrid(420, 290, 0, Infinity, undefined, undefined, undefined, 130);
    expect(narrow.columns).toBeGreaterThanOrEqual(2);
    expect(cardWidth(narrow.scale)).toBeGreaterThanOrEqual(130);

    const wide = calculateCardGrid(600, 320, 0, Infinity, undefined, undefined, undefined, 130);
    expect(wide.columns).toBeGreaterThanOrEqual(3);
    expect(cardWidth(wide.scale)).toBeGreaterThanOrEqual(130);
  });

  it('never counts more columns than the minimum card width allows, even for a near-zero height', () => {
    // 600 wide, minimum 130: at most floor((588 + 18) / (130 + 18)) = 4 columns
    for (const height of [1, 5, 13, 20, 60]) {
      expect(calculateCardGrid(600, height, 0, Infinity, undefined, undefined, undefined, 130).columns).toBeLessThanOrEqual(4);
    }
  });

  it('leaves fixed columns alone', () => {
    expect(calculateCardGrid(600, 320, 0, 1, 4, undefined, undefined, 130).columns).toBe(4);
  });
});

describe('calculateShopGrid', () => {
  it('fits two cards of at least 222px on a 640x360 phone table', () => {
    const g = calculateShopGrid(470, 348, 6);
    expect([g.columns, g.rows]).toEqual([2, 1]);
    expect(260 * g.scale).toBeGreaterThanOrEqual(222);
  });
  it('fits the 844x390 phone table at two cards of about 246px', () => {
    const g = calculateShopGrid(560, 378, 6);
    expect([g.columns, g.rows]).toEqual([2, 1]);
    expect(260 * g.scale).toBeGreaterThanOrEqual(240);
  });
  it('lays the six sale heroes 3 over 3 on a desktop table', () => {
    expect(calculateShopGrid(1500, 1000, 6)).toMatchObject({ columns: 3, rows: 2 });
  });
  it('uses two rows for the inside window on a desktop table', () => {
    expect(calculateShopGrid(1500, 1000, 30).rows).toBe(2);
  });
  it('shows one big card when one is left', () => {
    expect(calculateShopGrid(1500, 1000, 1)).toMatchObject({ columns: 1, rows: 1 });
  });
  it('never makes a second row whose cards would be under 222px', () => {
    expect(calculateShopGrid(1500, 600, 6).rows).toBe(1);
  });
  it('uses three rows for the inside window on a tall desktop table', () => {
    const g = calculateShopGrid(1600, 1100, 30);
    expect(g.rows).toBe(3);
    expect(260 * g.scale).toBeGreaterThanOrEqual(222);
  });
  it('keeps the six sale heroes 3 over 3 even when three rows would fit', () => {
    expect(calculateShopGrid(1600, 1100, 6)).toMatchObject({ columns: 3, rows: 2 });
  });
});
