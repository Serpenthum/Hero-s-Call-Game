import { describe, it, expect } from 'vitest';
import { xpForLevel, fromAbsoluteXP } from './useQuestReveal';

describe('quest reveal XP levels', () => {
  it('fromAbsoluteXP goes past level 20', () => {
    // Levels 1-19 need 25 * (1 + ... + 19) = 4750, then levels 20 and 21 need 500 each
    expect(fromAbsoluteXP(5750)).toEqual({ level: 22, xp: 0 });
    expect(fromAbsoluteXP(5749)).toEqual({ level: 21, xp: 499 });
  });

  it('xpForLevel(20) and (30) are 500', () => {
    expect(xpForLevel(1)).toBe(25);
    expect(xpForLevel(19)).toBe(475);
    expect(xpForLevel(20)).toBe(500);
    expect(xpForLevel(30)).toBe(500);
  });
});
