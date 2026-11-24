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
  test('a perfect 7-win Survival run pays 27', async () => {
    setRun(6, 1);
    const state = await gm.updateSurvivalWin(SOCK, team);
    assert.equal(state.runEnded, true);
    const s = await standing();
    // 80 XP = two level-ups (25 + 50) which pay 20 coins each, on top of the 27-coin run prize
    assert.deepEqual({ vp: s.vp, level: s.level, xp: s.xp, best: s.best }, { vp: 27 + 40, level: 3, xp: 5, best: 7 });
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
    assert.deepEqual(await standing(), { vp: 4, xp: 10, level: 1, best: 2 });
    // The next run starts fresh, so a loss in it is not paid again
    await gm.updateSurvivalLoss(SOCK, team);
    assert.deepEqual(await standing(), { vp: 4, xp: 10, level: 1, best: 2 });
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
    assert.deepEqual(await standing(), { vp: 7, xp: 17, level: 1, best: 3 });
    await gm.resetSurvivalState(SOCK);
    assert.deepEqual(await standing(), { vp: 7, xp: 17, level: 1, best: 3 });
  });

  test('the settlement is reported on the returned state for the client message', async () => {
    setRun(1, 2);
    const state = await gm.updateSurvivalLoss(SOCK, team);
    assert.equal(state.settlement.xpGained, 5);
    assert.equal(state.settlement.vpAwarded, 2);
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
    assert.equal((await standing()).vp, 5, '2 + 1 per surviving hero, once');
  });
});

describe('Battle coins', () => {
  let rivalId;
  async function finishedGame(mode = 'random') {
    rivalId = await createUser(database, `rival${++userCount}`);
    gm.setUserSession('p1', rivalId);
    gm.setUserSession('p0', userId);
    return startBattle(gm, ['Fighter', 'Cleric', 'Monk'], ['Wizard', 'Silencer', 'Warden'], { mode });
  }
  const coinsOf = async id => (await database.getUserById(id)).victory_points;

  test('a gauntlet-mode win pays what it paid before', async () => {
    const game = await finishedGame('gauntlet');
    game.players[1].team.forEach(h => { h.currentHP = 0; });
    gm.checkWinCondition(game);
    await sleep(300);
    assert.equal(await coinsOf(userId), 5);
    assert.equal(await coinsOf(rivalId), 0);
  });

  const winOnBoard = async (game, aliveForWinner = 3) => {
    game.players[0].team.slice(aliveForWinner).forEach(h => { h.currentHP = 0; });
    game.players[1].team.forEach(h => { h.currentHP = 0; });
    gm.checkWinCondition(game);
    return gm.getPayout(game.id).coins;
  };

  test('random win with 3 alive pays the winner 5 and the loser 2', async () => {
    await winOnBoard(await finishedGame('random'));
    assert.equal(await coinsOf(userId), 5);
    assert.equal(await coinsOf(rivalId), 2);
  });

  test('random win with 1 alive pays 3', async () => {
    await winOnBoard(await finishedGame('random'), 1);
    assert.equal(await coinsOf(userId), 3);
  });

  test('draft win with 3 alive pays 6, loss 2', async () => {
    await winOnBoard(await finishedGame('draft'));
    assert.equal(await coinsOf(userId), 6);
    assert.equal(await coinsOf(rivalId), 2);
  });

  test('random surrender after the loser lost a hero: winner 3, loser 2', async () => {
    const game = await finishedGame('random');
    game.players[1].team[0].currentHP = 0;
    assert.equal(gm.surrenderGame('p1').success, true);
    await gm.getPayout(game.id).coins;
    assert.equal(await coinsOf(userId), 3);
    assert.equal(await coinsOf(rivalId), 2);
  });

  test('draft surrender: winner 4', async () => {
    const game = await finishedGame('draft');
    gm.surrenderGame('p1');
    await gm.getPayout(game.id).coins;
    assert.equal(await coinsOf(userId), 4);
  });

  test('surrender with no hero down: winner 3, quitter 0', async () => {
    const game = await finishedGame('random');
    gm.surrenderGame('p1');
    await gm.getPayout(game.id).coins;
    assert.equal(await coinsOf(userId), 3);
    assert.equal(await coinsOf(rivalId), 0);
  });

  test('disconnect forfeit with no hero down: winner 3, quitter 0', async () => {
    const game = await finishedGame('random');
    game.players[1].connected = false;
    await gm.finishDisconnectedGame(game, 'p1');
    await gm.getPayout(game.id).coins;
    assert.equal(await coinsOf(userId), 3);
    assert.equal(await coinsOf(rivalId), 0);
  });

  test('a tie pays 2 each, once', async () => {
    const game = await finishedGame('random');
    game.players.forEach(p => p.team.forEach(h => { h.currentHP = 0; }));
    for (let i = 0; i < 3; i++) gm.checkWinCondition(game);
    await gm.getPayout(game.id).coins;
    await sleep(100);
    assert.equal(await coinsOf(userId), 2);
    assert.equal(await coinsOf(rivalId), 2);
  });

  test('a friend room pays no coins', async () => {
    const game = await finishedGame('draft');
    game.roomName = 'r';
    await winOnBoard(game);
    assert.equal(await coinsOf(userId), 0);
    assert.equal(await coinsOf(rivalId), 0);
  });

  test("getPayout lists each player's ending", async () => {
    const game = await finishedGame('random');
    gm.surrenderGame('p1');
    const payout = gm.getPayout(game.id);
    assert.deepEqual(payout.endings, { p0: 'win_by_surrender', p1: 'quit_early' });
    assert.deepEqual(await payout.coins, { p0: { coins: 3, total: 3 }, p1: { coins: 0, total: 0 } });
    assert.equal(gm.getPayout('no-such-game'), null);
  });
});
