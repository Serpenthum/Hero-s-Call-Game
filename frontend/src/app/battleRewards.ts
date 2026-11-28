// What the battle rewards screen shows once a battle's XP arrives.

export interface BattleRewards {
  oldXP: number;
  newXP: number;
  xpGained: number;
  oldLevel: number;
  newLevel: number;
  oldVictoryPoints: number;
  newVictoryPoints: number;
  victoryPointsGained: number;
  leveledUp: boolean;
}

interface XPUpdate { xpGained?: number; newXP: number; newLevel: number; leveledUp?: boolean; vpGained?: number }

/**
 * The rewards from an 'xp-update' alone. Coins start from the current balance and count only the
 * level-up coins the update carries; a 'victory-points-update' for the same battle, when one follows,
 * replaces them. Nothing is carried over from an earlier battle's rewards.
 */
export function rewardsFromXPUpdate(
  data: XPUpdate,
  before: { xp: number; level: number; victoryPoints: number },
): BattleRewards {
  const coins = data.vpGained || 0;
  return {
    oldXP: before.xp,
    newXP: data.newXP,
    xpGained: data.xpGained || 0,
    oldLevel: before.level,
    newLevel: data.newLevel,
    oldVictoryPoints: before.victoryPoints,
    newVictoryPoints: before.victoryPoints + coins,
    victoryPointsGained: coins,
    leveledUp: data.leveledUp || false,
  };
}
