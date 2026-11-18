import { describe, it, expect } from 'vitest';
import { resolveReadMode, pickTextSize, TINY_CARD_MAX_WIDTH, ruleSections } from './cardRules';

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
