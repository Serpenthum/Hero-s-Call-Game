// The economy rules in one place: XP needed per level, coins for a level up, coins and XP for a battle,
// the daily quest, the Survival run prize and the tutorial payout. Nothing here changes a hero or a battle.
const LEVEL_UP_COINS = 20;
const TUTORIAL_REWARD_COINS = 80;
const QUEST_COINS = 5;
// Survival run prize, by wins in the run (1 to 7).
const SURVIVAL_PRIZE = { 1: 2, 2: 4, 3: 7, 4: 10, 5: 15, 6: 20, 7: 27 };

// level x 25 up to level 20, then 500 for every level after; levels have no cap.
function xpForNextLevel(level) {
  return Math.min(level, 20) * 25;
}

// Adds XP, carrying the leftover across as many levels as it covers.
function applyXP({ level, xp }, gain) {
  let lvl = level;
  let total = xp + gain;
  let levelsGained = 0;
  while (total >= xpForNextLevel(lvl)) {
    total -= xpForNextLevel(lvl);
    lvl += 1;
    levelsGained += 1;
  }
  return { level: lvl, xp: total, levelsGained, coinsGained: levelsGained * LEVEL_UP_COINS };
}

// Ending: 'win' | 'win_by_surrender' | 'loss' | 'quit_early' | 'tie'.
// reason: 'victory' | 'surrender' | 'disconnect' | 'tie'.
// Leaving (surrender or disconnect) before any of your own heroes is down is quitting early.
function endingFor({ reason, isWinner, ownHeroesDown }) {
  if (reason === 'tie') return 'tie';
  const left = reason === 'surrender' || reason === 'disconnect';
  if (isWinner) return left ? 'win_by_surrender' : 'win';
  return left && ownHeroesDown === 0 ? 'quit_early' : 'loss';
}

// mode: 'random' | 'draft'. A full win pays a base plus 1 per hero alive; a win by surrender is flat.
function battleCoins(mode, ending, heroesAlive) {
  const draft = mode === 'draft';
  switch (ending) {
    case 'win': return (draft ? 3 : 2) + heroesAlive;
    case 'win_by_surrender': return draft ? 4 : 3;
    case 'loss': return 2;
    case 'tie': return 2;
    default: return 0; // quit_early
  }
}

function battleXP(ending) {
  switch (ending) {
    case 'win':
    case 'win_by_surrender':
    case 'tie':
      return 10;
    case 'loss': return 5;
    default: return 0; // quit_early
  }
}

module.exports = {
  LEVEL_UP_COINS, TUTORIAL_REWARD_COINS, QUEST_COINS, SURVIVAL_PRIZE,
  xpForNextLevel, applyXP, endingFor, battleCoins, battleXP,
};
