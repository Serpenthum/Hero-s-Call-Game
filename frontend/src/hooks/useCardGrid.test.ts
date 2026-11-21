import { describe, expect, it } from 'vitest';
import { calculateCardGrid } from './useCardGrid';

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
