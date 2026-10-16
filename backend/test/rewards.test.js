// XP / Victory Point payouts. Uses a real temporary SQLite database.
const { test, before, after, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager, startBattle, hero, setD20, setRandom, resetDice } = require('./support/battle');
const { createTestDatabase, createUser } = require('./support/db');

let env, database, gm, userId, userCount = 0;
const SOCK = 'sock-a';
const sleep = ms => new Promise(r => setTimeout(r, ms));

before(async () => { env = await createTestDatabase(); database = env.database; });
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  gm = makeManager(database);
  userId = await createUser(database, `player${++userCount}`);
  gm.setUserSession(SOCK, userId);
});
afterEach(() => resetDice());

const standing = async () => {
  const user = await database.getUserById(userId);
  const stats = await database.getPlayerStats(userId);
  return { vp: user.victory_points, xp: stats.xp, level: stats.level, best: stats.highest_survival_run };
};
const setRun = (wins, losses) => gm.survivalStates.set(SOCK, { wins, losses, usedHeroes: [], isActive: true });
const team = [{ name: 'Fighter' }, { name: 'Cleric' }, { name: 'Monk' }];

describe('Survival run payouts', () => {
  test('a perfect 7-win run pays the top VP tier and its XP', async () => {
    setRun(6, 1);
    const state = await gm.updateSurvivalWin(SOCK, team);
    assert.equal(state.runEnded, true);
    const s = await standing();
    // 80 XP = two level-ups (25 + 50) which pay 12 VP each, on top of the 16 VP run reward
    assert.deepEqual({ vp: s.vp, level: s.level, xp: s.xp, best: s.best }, { vp: 16 + 24, level: 3, xp: 5, best: 7 });
  });

  test('a loss in the middle of a run pays nothing', async () => {
    setRun(3, 0);
    const state = await gm.updateSurvivalLoss(SOCK, team);
    assert.equal(state.runEnded, false);
    assert.equal(state.losses, 1);
    assert.deepEqual(await standing(), { vp: 0, xp: 0, level: 1, best: 0 });
  });

  test('the loss that ends the run pays the XP and VP for the wins, once', async () => {
    setRun(2, 2);
    const state = await gm.updateSurvivalLoss(SOCK, team);
    assert.equal(state.runEnded, true);
    assert.deepEqual(await standing(), { vp: 2, xp: 10, level: 1, best: 2 });
    // The next run starts fresh, so a loss in it is not paid again
    await gm.updateSurvivalLoss(SOCK, team);
    assert.deepEqual(await standing(), { vp: 2, xp: 10, level: 1, best: 2 });
  });

  test('a run that ends with no wins pays nothing', async () => {
    setRun(0, 2);
    const state = await gm.updateSurvivalLoss(SOCK, team);
    assert.equal(state.runEnded, true);
    assert.deepEqual(await standing(), { vp: 0, xp: 0, level: 1, best: 0 });
  });

  test('abandoning a run pays for its wins once', async () => {
    setRun(3, 1);
    await gm.resetSurvivalState(SOCK);
    assert.deepEqual(await standing(), { vp: 4, xp: 17, level: 1, best: 3 });
    await gm.resetSurvivalState(SOCK);
    assert.deepEqual(await standing(), { vp: 4, xp: 17, level: 1, best: 3 });
  });

  test('the settlement is reported on the returned state for the client message', async () => {
    setRun(1, 2);
    const state = await gm.updateSurvivalLoss(SOCK, team);
    assert.equal(state.settlement.xpGained, 5);
    assert.equal(state.settlement.vpAwarded, 1);
  });
});

describe('Gauntlet payouts', () => {
  const playBattle = async won => {
    const run = gm.gauntletRuns.get(SOCK);
    run.battle_team_indices = [0, 1, 2];
    const used = run.roster.slice(0, 3).map(r => ({ name: r.hero_id, currentHP: r.max_hp }));
    return gm.processGauntletPostBattle(SOCK, won, used);
  };

  test('abandoning before winning a battle pays nothing', async () => {
    await gm.initializeGauntletRun(SOCK, 'Alice');
    const result = await gm.abandonGauntletRun(SOCK);
    assert.equal(result.rewards.xp, 0);
    assert.equal(result.rewards.victoryPoints, 0);
    assert.deepEqual(await standing(), { vp: 0, xp: 0, level: 1, best: 0 });
  });

  test('skipping a trial does not count as a win', async () => {
    await gm.initializeGauntletRun(SOCK, 'Alice');
    const skip = await gm.performGauntletShopAction(SOCK, 'skip_trial', {});
    assert.equal(skip.success, true);
    const result = await gm.abandonGauntletRun(SOCK);
    assert.equal(result.rewards.xp, 0);
    assert.equal(result.rewards.victoryPoints, 0);
  });

  test('pays the reward for battles actually won, with XP applied exactly once', async () => {
    await gm.initializeGauntletRun(SOCK, 'Alice');
    await playBattle(true);
    await playBattle(true);
    await playBattle(true);
    const result = await gm.abandonGauntletRun(SOCK);
    assert.equal(result.rewards.xp, 15);
    assert.equal(result.rewards.victoryPoints, 2);
    assert.deepEqual(await standing(), { vp: 2, xp: 15, level: 1, best: 0 });
  });

  test('a lost battle does not count', async () => {
    await gm.initializeGauntletRun(SOCK, 'Alice');
    await playBattle(true);
    await playBattle(false);
    const result = await gm.abandonGauntletRun(SOCK);
    assert.equal(result.rewards.xp, 5);
  });

  test('the run-end payout is returned with level information so the server need not pay again', async () => {
    await gm.initializeGauntletRun(SOCK, 'Alice');
    await playBattle(true);
    const payout = await gm.calculateAndAwardGauntletRewards(SOCK, 1);
    assert.equal(payout.xp, 5);
    assert.ok(payout.xpUpdate, 'carries the XP update (level, leveledUp) for the client message');
    assert.equal((await standing()).xp, 5);
  });
});

describe('Match victory points are paid once', () => {
  async function finishedGame(mode = 'random') {
    const second = await createUser(database, `rival${++userCount}`);
    gm.setUserSession('p1', second);
    gm.setUserSession('p0', userId);
    const game = startBattle(gm, ['Fighter', 'Cleric', 'Monk'], ['Wizard', 'Silencer', 'Warden'], { mode });
    return game;
  }

  test('repeated win checks do not pay again', async () => {
    const game = await finishedGame();
    game.players[1].team.forEach(h => { h.currentHP = 0; });
    for (let i = 0; i < 4; i++) gm.checkWinCondition(game);
    await sleep(300);
    assert.equal((await standing()).vp, 3, 'one VP per surviving hero, once');
  });

  test('a tie pays each player once', async () => {
    const game = await finishedGame();
    game.players.forEach(p => p.team.forEach(h => { h.currentHP = 0; }));
    for (let i = 0; i < 3; i++) gm.checkWinCondition(game);
    await sleep(300);
    assert.equal((await standing()).vp, 1);
  });
});
