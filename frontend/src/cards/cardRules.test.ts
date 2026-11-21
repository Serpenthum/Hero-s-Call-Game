import { describe, it, expect } from 'vitest';
import { resolveReadMode, pickTextSize, TINY_CARD_MAX_WIDTH, ruleSections, textSizeRange, textFitStages } from './cardRules';

describe('resolveReadMode', () => {
  it('defaults to tap', () => {
    expect(resolveReadMode({})).toBe('tap');
  });
  it('uses press when the card is selectable', () => {
    expect(resolveReadMode({ isSelectable: true })).toBe('press');
  });
  it('lets an explicit readable win', () => {
    expect(resolveReadMode({ readable: 'none', isSelectable: true })).toBe('none');
    expect(resolveReadMode({ readable: 'tap', isSelectable: true })).toBe('tap');
  });
});

describe('TINY_CARD_MAX_WIDTH', () => {
  it('is 129px', () => {
    expect(TINY_CARD_MAX_WIDTH).toBe(129);
  });
});

describe('pickTextSize', () => {
  it('returns the max when everything fits', () => {
    expect(pickTextSize(() => true)).toBe(1.06);
  });
  it('returns the min when nothing fits', () => {
    expect(pickTextSize(() => false)).toBe(0.8);
  });
  it('returns the largest size that fits', () => {
    expect(pickTextSize(s => s <= 0.9)).toBeCloseTo(0.9, 5);
  });
  it('never tries a size outside the range', () => {
    const tried: number[] = [];
    const result = pickTextSize(s => {
      tried.push(s);
      return false;
    });
    expect(result).toBe(0.8);
    for (const s of tried) {
      expect(s).toBeLessThanOrEqual(1.06);
      expect(s).toBeGreaterThanOrEqual(0.8);
    }
    expect(tried.length).toBe(14);
  });
});

describe('ruleSections', () => {
  it('lists abilities first, then specials', () => {
    const sections = ruleSections({
      name: 'Warlock',
      Special: [{ name: 'Pact', description: 'Special text' }],
      Ability: [{ name: 'Hex', description: 'Ability text' }],
    });
    expect(sections).toEqual([
      { label: 'Ability', name: 'Hex', description: 'Ability text' },
      { label: 'Special', name: 'Pact', description: 'Special text' },
    ]);
  });
  it("names Bomber's special Explosion", () => {
    const sections = ruleSections({ name: 'Bomber', Ability: [], Special: [{ name: 'Self Destruct', description: 'Boom' }] });
    expect(sections[0].name).toBe('Explosion');
  });
  it('accepts a single special object and no abilities', () => {
    expect(ruleSections({ name: 'X', Special: { name: 'S', description: 'd' } })).toEqual([
      { label: 'Special', name: 'S', description: 'd' },
    ]);
  });
});

describe('textSizeRange', () => {
  it('keeps today\'s range when no floor is asked for (battle, binder, shop, reader)', () => {
    expect(textSizeRange({ cardFontPx: 11.75, maxEm: 1.08 })).toEqual({ minEm: 0.8, maxEm: 1.08 });
    expect(textSizeRange({ cardFontPx: 5, maxEm: 1.08 })).toEqual({ minEm: 0.8, maxEm: 1.08 });
  });

  it('raises the smallest size so rules text stays at or above the floor', () => {
    // 235px card: 11.75px base, so 12px needs 1.03em (12.10px), not 1.02 (11.99px)
    const r = textSizeRange({ cardFontPx: 11.75, maxEm: 1.08, minTextPx: 12 });
    expect(r).toEqual({ minEm: 1.03, maxEm: 1.08 });
    expect(r.minEm * 11.75).toBeGreaterThanOrEqual(12);
    // 228px card (five across at 1280x720): 11.4px base
    const t = textSizeRange({ cardFontPx: 11.4, maxEm: 1.08, minTextPx: 12 });
    expect(t.minEm * 11.4).toBeGreaterThanOrEqual(12);
    expect(t.minEm).toBe(1.06);
  });

  it('leaves the usual minimum when the floor is already met by it', () => {
    expect(textSizeRange({ cardFontPx: 20, maxEm: 1.08, minTextPx: 12 })).toEqual({ minEm: 0.8, maxEm: 1.08 });
  });

  it('lifts the largest size too when even it is under the floor', () => {
    expect(textSizeRange({ cardFontPx: 10, maxEm: 1.08, minTextPx: 12 })).toEqual({ minEm: 1.2, maxEm: 1.2 });
  });

  it('works with pickTextSize: nothing fits, so the floor size is used and the panel grows', () => {
    const r = textSizeRange({ cardFontPx: 11.75, maxEm: 1.08, minTextPx: 12 });
    expect(pickTextSize(() => false, r.maxEm, r.minEm)).toBe(1.03);
    expect(pickTextSize(s => s <= 0.9, r.maxEm, r.minEm)).toBe(1.03);
  });
});

describe('textFitStages', () => {
  it('cards without a floor fit in one stage, as today (battle, binder, shop, reader)', () => {
    expect(textFitStages()).toEqual([null]);
    expect(textFitStages(0)).toEqual([null]);
  });
  it('a floored card tries tighter spacing, then smaller gems, to keep its name clear of the stat rail', () => {
    expect(textFitStages(12)).toEqual([null, 'tight', 'rail']);
  });
});
