import { describe, expect, it } from 'vitest';
import { CRAFT_PRICE, craftState } from './craftRules';

describe('craftState', () => {
  it('a hero costs 100 shards', () => {
    expect(CRAFT_PRICE).toBe(100);
  });

  it('100 shards and not owned: can craft, nothing short', () => {
    expect(craftState(100, false)).toEqual({ canCraft: true, shortfall: 0 });
  });

  it('60 shards and not owned: cannot craft, 40 short', () => {
    expect(craftState(60, false)).toEqual({ canCraft: false, shortfall: 40 });
  });

  it('an owned hero is never crafted, however many shards', () => {
    expect(craftState(500, true)).toEqual({ canCraft: false, shortfall: 0 });
  });
});
