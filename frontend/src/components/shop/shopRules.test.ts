import { describe, it, expect } from 'vitest';
import { shopErrorText, saleTimeLeft, packOwnedCount } from './shopRules';

describe('shopErrorText', () => {
  it('keeps the known server texts', () => {
    for (const t of ['Not enough to buy this.', 'Hero already owned', 'Hero not available',
      'That hero is no longer in the shop. The rotation has changed.'])
      expect(shopErrorText(t)).toBe(t);
  });
  it('replaces any other server text', () => {
    expect(shopErrorText('SQLITE_BUSY: database is locked')).toBe('Purchase failed. Please try again.');
    expect(shopErrorText(undefined)).toBe('Purchase failed. Please try again.');
  });
});

describe('saleTimeLeft', () => {
  it('counts down to the next quarter hour', () => {
    const t = saleTimeLeft(new Date(2026, 10, 21, 10, 7, 30));
    expect(t.label).toBe('7m 30s');
    expect(t.fraction).toBeCloseTo(0.5);          // share of the 15 minutes still left
    expect(t.seed).toBe(Math.floor(new Date(2026, 10, 21, 10, 7, 30).getTime() / 900000));
  });
  it('rolls over the hour', () => {
    expect(saleTimeLeft(new Date(2026, 10, 21, 10, 59, 59)).label).toBe('0m 1s');
  });
});

describe('packOwnedCount', () => {
  it('counts owned pack heroes', () => {
    expect(packOwnedCount([{ name: 'A' }, { name: 'B' }, { name: 'C' }], ['B', 'Fighter'])).toEqual({ owned: 1, total: 3 });
  });
});
