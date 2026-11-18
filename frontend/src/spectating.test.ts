import { describe, expect, it } from 'vitest';
import { watchedPlayerLeft } from './spectating';

const players = [{ id: 'a' }, { id: 'b' }];

describe('watchedPlayerLeft', () => {
  it('is false while the watched player is still in the game', () => {
    expect(watchedPlayerLeft(true, 'a', { players })).toBe(false);
  });

  it('is true once the watched player is gone from the game state', () => {
    expect(watchedPlayerLeft(true, 'c', { players })).toBe(true);
    expect(watchedPlayerLeft(true, 'a', { players: [{ id: 'b' }] })).toBe(true);
  });

  it('is false when not spectating or there is nothing to check', () => {
    expect(watchedPlayerLeft(false, 'c', { players })).toBe(false);
    expect(watchedPlayerLeft(true, null, { players })).toBe(false);
    expect(watchedPlayerLeft(true, 'a', null)).toBe(false);
  });
});
