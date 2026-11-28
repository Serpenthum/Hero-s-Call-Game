// The economy rules: XP per level, level-up coins, battle coins and XP, quest, Survival and tutorial amounts.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  LEVEL_UP_COINS, TUTORIAL_REWARD_COINS, QUEST_COINS, SURVIVAL_PRIZE,
  xpForNextLevel, applyXP, endingFor, battleCoins, battleXP,
} = require('../economy');

describe('amounts', () => {
  test('fixed amounts match the spec', () => {
    assert.equal(LEVEL_UP_COINS, 20);
    assert.equal(TUTORIAL_REWARD_COINS, 80);
    assert.equal(QUEST_COINS, 5);
    assert.deepEqual(SURVIVAL_PRIZE, { 1: 2, 2: 4, 3: 7, 4: 10, 5: 15, 6: 20, 7: 27 });
  });
});

describe('xpForNextLevel', () => {
  test('level x 25 up to level 20, then 500 for every level', () => {
    assert.equal(xpForNextLevel(1), 25);
    assert.equal(xpForNextLevel(19), 475);
    assert.equal(xpForNextLevel(20), 500);
    assert.equal(xpForNextLevel(57), 500);
  });
});

describe('applyXP', () => {
  test('carries XP over across several levels and pays coins for each', () => {
    assert.deepEqual(applyXP({ level: 1, xp: 0 }, 75), { level: 3, xp: 0, levelsGained: 2, coinsGained: 40 });
  });
  test('levels past 20 with no cap', () => {
    assert.deepEqual(applyXP({ level: 20, xp: 475 }, 25), { level: 21, xp: 0, levelsGained: 1, coinsGained: 20 });
  });
  test('XP short of the next level only adds XP', () => {
    assert.deepEqual(applyXP({ level: 20, xp: 475 }, 10), { level: 20, xp: 485, levelsGained: 0, coinsGained: 0 });
  });
});

describe('battleCoins', () => {
  test('random win pays 2 + 1 per hero alive', () => {
    assert.deepEqual([1, 2, 3].map(n => battleCoins('random', 'win', n)), [3, 4, 5]);
  });
  test('draft win pays 3 + 1 per hero alive', () => {
    assert.deepEqual([1, 2, 3].map(n => battleCoins('draft', 'win', n)), [4, 5, 6]);
  });
  test('win by surrender pays a flat 3 (random) or 4 (draft)', () => {
    assert.equal(battleCoins('random', 'win_by_surrender', 1), 3);
    assert.equal(battleCoins('random', 'win_by_surrender', 3), 3);
    assert.equal(battleCoins('draft', 'win_by_surrender', 1), 4);
    assert.equal(battleCoins('draft', 'win_by_surrender', 3), 4);
  });
  test('loss and tie pay 2, quitting early pays 0', () => {
    for (const mode of ['random', 'draft']) {
      assert.equal(battleCoins(mode, 'loss', 0), 2);
      assert.equal(battleCoins(mode, 'tie', 0), 2);
      assert.equal(battleCoins(mode, 'quit_early', 0), 0);
    }
  });
});

describe('endingFor', () => {
  test('a victory is a win or a loss', () => {
    assert.equal(endingFor({ reason: 'victory', isWinner: true, ownHeroesDown: 2 }), 'win');
    assert.equal(endingFor({ reason: 'victory', isWinner: false, ownHeroesDown: 3 }), 'loss');
  });
  test('a tie is a tie', () => {
    assert.equal(endingFor({ reason: 'tie', isWinner: false, ownHeroesDown: 3 }), 'tie');
  });
  test('surrendering with no hero down is quitting early, with one down is a loss', () => {
    assert.equal(endingFor({ reason: 'surrender', isWinner: false, ownHeroesDown: 0 }), 'quit_early');
    assert.equal(endingFor({ reason: 'surrender', isWinner: false, ownHeroesDown: 1 }), 'loss');
  });
  test('leaving with no hero down is quitting early', () => {
    assert.equal(endingFor({ reason: 'disconnect', isWinner: false, ownHeroesDown: 0 }), 'quit_early');
  });
  test('winning by surrender or disconnect is a win by surrender', () => {
    assert.equal(endingFor({ reason: 'disconnect', isWinner: true, ownHeroesDown: 0 }), 'win_by_surrender');
    assert.equal(endingFor({ reason: 'surrender', isWinner: true, ownHeroesDown: 2 }), 'win_by_surrender');
  });
});

describe('battleXP', () => {
  test('wins and ties give 10, a loss 5, quitting early 0', () => {
    assert.deepEqual(
      ['win', 'win_by_surrender', 'loss', 'quit_early', 'tie'].map(battleXP),
      [10, 10, 5, 0, 10],
    );
  });
});
