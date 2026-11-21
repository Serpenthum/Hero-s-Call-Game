import { describe, expect, it } from 'vitest';
import { watchedPlayerLeft, spectatorReactionToLeaver } from './spectating';

describe('spectatorReactionToLeaver', () => {
  it('leaves when the watched player is the one who left', () => {
    expect(spectatorReactionToLeaver(true, 'a', 'a')).toBe('leave');
  });

  it('keeps watching (with a notice) when the other player left', () => {
    expect(spectatorReactionToLeaver(true, 'b', 'a')).toBe('notify');
  });

  it('ignores the event when not spectating', () => {
    expect(spectatorReactionToLeaver(false, 'a', 'a')).toBe('ignore');
  });

  it('leaves when it cannot tell who left', () => {
    expect(spectatorReactionToLeaver(true, 'a', undefined)).toBe('leave');
  });
});

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
