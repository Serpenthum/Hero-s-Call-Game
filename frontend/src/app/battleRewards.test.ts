import { describe, it, expect } from 'vitest';
import { rewardsFromXPUpdate } from './battleRewards';

describe('rewardsFromXPUpdate', () => {
  const before = { xp: 10, level: 3, victoryPoints: 57 };

  it('an xp-update with no coin update for this battle shows no coin gain', () => {
    // A friend-room battle: XP only, and no coin update follows
    expect(rewardsFromXPUpdate({ xpGained: 15, newXP: 25, newLevel: 3, leveledUp: false }, before)).toEqual({
      oldXP: 10, newXP: 25, xpGained: 15, oldLevel: 3, newLevel: 3,
      oldVictoryPoints: 57, newVictoryPoints: 57, victoryPointsGained: 0,
      leveledUp: false,
    });
  });

  it('counts the level-up coins the xp-update carries', () => {
    expect(rewardsFromXPUpdate({ xpGained: 70, newXP: 5, newLevel: 4, leveledUp: true, vpGained: 3 }, before)).toMatchObject({
      oldVictoryPoints: 57, newVictoryPoints: 60, victoryPointsGained: 3, leveledUp: true,
    });
  });
});
