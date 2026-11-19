import { describe, it, expect } from 'vitest';
import {
  timeUntilUtcMidnight,
  utcDayKey,
  searchElapsed,
  formatRecord,
  nextFeaturedHero,
  collectionSummary,
  markLobbyArrival,
  consumeLobbyArrival,
  matchFoundPlayers,
  heroImageUrl,
} from './lobbyRules';

describe('utcDayKey', () => {
  it('changes at UTC midnight, not local midnight', () => {
    expect(utcDayKey(new Date('2026-11-18T23:59:59Z'))).toBe('2026-11-18');
    expect(utcDayKey(new Date('2026-11-19T00:00:00Z'))).toBe('2026-11-19');
    expect(utcDayKey(new Date('2026-11-18T23:30:00-05:00'))).toBe('2026-11-19');
  });
});

describe('timeUntilUtcMidnight', () => {
  it('shows hours and minutes', () => {
    expect(timeUntilUtcMidnight(new Date('2026-11-18T18:48:00Z'))).toBe('New in 5h 12m');
  });
  it('shows only minutes under one hour', () => {
    expect(timeUntilUtcMidnight(new Date('2026-11-18T23:48:00Z'))).toBe('New in 12m');
  });
  it('never shows 0m', () => {
    expect(timeUntilUtcMidnight(new Date('2026-11-18T23:59:40Z'))).toBe('New in 1m');
  });
});

describe('searchElapsed', () => {
  it('is 0:00 before a search starts', () => {
    expect(searchElapsed(null, 5000)).toBe('0:00');
  });
  it('formats m:ss', () => {
    expect(searchElapsed(1000, 13000)).toBe('0:12');
    expect(searchElapsed(0, 65000)).toBe('1:05');
    expect(searchElapsed(0, 720000)).toBe('12:00');
  });
});

describe('formatRecord', () => {
  it('pluralises wins and losses', () => {
    expect(formatRecord({ total_wins: 24, total_losses: 11 })).toBe('24 wins · 11 losses');
  });
  it('uses singular for one', () => {
    expect(formatRecord({ total_wins: 1, total_losses: 1 })).toBe('1 win · 1 loss');
  });
  it('treats missing counts as zero', () => {
    expect(formatRecord({})).toBe('0 wins · 0 losses');
  });
  it('is null without stats', () => {
    expect(formatRecord(null)).toBeNull();
  });
});

describe('nextFeaturedHero', () => {
  const A = { name: 'A' };
  const B = { name: 'B' };
  const C = { name: 'C', disabled: true };

  it('picks a favourite on every fourth turn', () => {
    expect(nextFeaturedHero([A, B, C], ['B'], 3, null, () => 0)).toBe(B);
  });
  it('picks an enabled hero on a favourite turn with no favourites', () => {
    expect([A, B]).toContain(nextFeaturedHero([A, B, C], [], 3, null, () => 0));
  });
  it('never returns a disabled hero', () => {
    let previous: string | null = null;
    for (let turn = 0; turn < 50; turn++) {
      const hero: { name: string; disabled?: boolean } | null = nextFeaturedHero([A, B, C], ['C'], turn, previous, Math.random);
      expect(hero).not.toBe(C);
      previous = hero?.name ?? null;
    }
  });
  it('avoids the previous hero when another exists', () => {
    expect(nextFeaturedHero([A, B], [], 0, 'A', () => 0)).toBe(B);
  });
  it('repeats the only enabled hero', () => {
    expect(nextFeaturedHero([A, C], [], 0, 'A', () => 0)).toBe(A);
  });
  it('is null when every hero is disabled', () => {
    expect(nextFeaturedHero([C, { name: 'D', disabled: true }], [], 0, null, () => 0)).toBeNull();
  });
});

describe('collectionSummary', () => {
  const heroes = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D', disabled: true }];

  it('counts enabled heroes only and leaves holo null', () => {
    expect(collectionSummary(heroes, ['A', 'B', 'D'], ['A'])).toEqual({
      owned: 2,
      total: 3,
      favorites: 1,
      holo: null,
    });
  });
  it('counts holo heroes when given', () => {
    expect(collectionSummary(heroes, ['A', 'B', 'D'], ['A'], ['A']).holo).toBe(1);
  });
});

describe('lobby arrival flag', () => {
  it('is consumed once after each mark', () => {
    expect(consumeLobbyArrival()).toBe(false);
    markLobbyArrival();
    expect(consumeLobbyArrival()).toBe(true);
    expect(consumeLobbyArrival()).toBe(false);
  });
});

describe('matchFoundPlayers', () => {
  const players = [
    { id: 'p1', name: 'Ava', profile_icon: 'knight' },
    { id: 'p2', name: 'Ben' },
  ];

  it('returns me and them, with a missing icon as null', () => {
    expect(matchFoundPlayers(players, 'p1')).toEqual({
      me: { name: 'Ava', icon: 'knight' },
      them: { name: 'Ben', icon: null },
    });
  });
  it('is null with only one player', () => {
    expect(matchFoundPlayers([players[0]], 'p1')).toBeNull();
  });
  it('is null without my id', () => {
    expect(matchFoundPlayers(players, null)).toBeNull();
  });
});

describe('heroImageUrl', () => {
  it('lowercases and strips non-alphanumerics', () => {
    expect(heroImageUrl('/base', "Dragon's Kin 2")).toBe('/base/hero-images/dragonskin2.webp');
  });
});
