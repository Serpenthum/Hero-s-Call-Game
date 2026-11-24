import { describe, it, expect } from 'vitest';
import * as shopRules from './shopRules';
import { shopErrorText, packOwnedCount, PACK_PRICE } from './shopRules';
import { isHoloCard, type PackCard, type PackCardKind } from '../packs/packTypes';
import type { Hero } from '../../types';

describe('shop prices', () => {
  it('PACK_PRICE is 20', () => {
    expect(PACK_PRICE).toBe(20);
  });
  it('no longer has a hero price or a sale clock', () => {
    expect('HERO_PRICE' in shopRules).toBe(false);
    expect('saleTimeLeft' in shopRules).toBe(false);
  });
});

describe('shopErrorText', () => {
  it('keeps the known server texts', () => {
    for (const t of ['Not enough to buy this.', 'Hero already owned', 'Hero not available'])
      expect(shopErrorText(t)).toBe(t);
  });
  it('replaces any other server text, including the old rotation message', () => {
    expect(shopErrorText('That hero is no longer in the shop. The rotation has changed.')).toBe('Purchase failed. Please try again.');
    expect(shopErrorText('SQLITE_BUSY: database is locked')).toBe('Purchase failed. Please try again.');
    expect(shopErrorText(undefined)).toBe('Purchase failed. Please try again.');
  });
});

describe('packOwnedCount', () => {
  it('counts owned pack heroes', () => {
    expect(packOwnedCount([{ name: 'A' }, { name: 'B' }, { name: 'C' }], ['B', 'Fighter'])).toEqual({ owned: 1, total: 3 });
  });
});

describe('isHoloCard', () => {
  const hero = { name: 'Ninja' } as Hero;
  const card = (kind: PackCardKind, holo?: boolean): PackCard =>
    (holo === undefined ? { name: 'Ninja', kind, hero } : { name: 'Ninja', kind, hero, holo });

  it('a server card with holo false is not drawn holographic even if the hero is owned holo', () => {
    // A plain repeat of a hero the player owns holographic: the server says holo false
    expect(isHoloCard(card('repeat', false))).toBe(false);
    // The server's flag is the answer whenever it sent one
    expect(isHoloCard(card('holo', false))).toBe(false);
    expect(isHoloCard(card('repeat', true))).toBe(true);
  });

  it("a reply without holo flags falls back to today's rule", () => {
    expect(isHoloCard(card('holo'))).toBe(true);
    expect(isHoloCard(card('holo_upgrade'))).toBe(true);
    expect(isHoloCard(card('repeat'))).toBe(false);
    expect(isHoloCard(card('new'))).toBe(false);
  });
});
