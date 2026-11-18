import { describe, expect, it } from 'vitest';
import { heroCurrentHP, isHeroAlive } from './heroHealth';

describe('heroCurrentHP', () => {
  it('uses currentHP when it is set, even when it is 0', () => {
    expect(heroCurrentHP({ currentHP: 0, HP: 12 })).toBe(0);
    expect(heroCurrentHP({ currentHP: 5, HP: 12 })).toBe(5);
  });

  it('falls back to HP (number or text) before the battle sets currentHP', () => {
    expect(heroCurrentHP({ HP: 12 })).toBe(12);
    expect(heroCurrentHP({ HP: '14' })).toBe(14);
  });
});

describe('isHeroAlive', () => {
  it('is false for a hero at 0 HP, so a dead target disables the actions aimed at it', () => {
    expect(isHeroAlive({ currentHP: 0, HP: 12 })).toBe(false);
    expect(isHeroAlive({ currentHP: -3, HP: 12 })).toBe(false);
  });

  it('is true for a living hero and false for no hero', () => {
    expect(isHeroAlive({ currentHP: 1, HP: 12 })).toBe(true);
    expect(isHeroAlive(undefined)).toBe(false);
  });
});
