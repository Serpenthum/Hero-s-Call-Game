import { playSound } from './effects';

// A battle or login reward: coins coming in play the coin, a level up plays its fanfare.
// Called once per server message (never from a render or a state updater), so each plays once.
export function playRewardSounds(r: { coinsGained?: number; leveledUp?: boolean }): void {
  if ((r.coinsGained ?? 0) > 0) playSound('coin');
  if (r.leveledUp) playSound('levelup');
}
