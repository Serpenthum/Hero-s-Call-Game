// Endless levels: no cap at 20, 20 coins for every level, 5 coins for a finished daily quest.
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, createUser } = require('./support/db');
const { QuestService } = require('../quests');

let env, database, userCount = 0;

before(async () => { env = await createTestDatabase(); database = env.database; });
after(async () => { await env.cleanup(); });

const setStats = (userId, level, xp) => new Promise((resolve, reject) => database.db.run(
  'UPDATE player_stats SET level = ?, xp = ? WHERE user_id = ?',
  [level, xp, userId], err => (err ? reject(err) : resolve())));

const newPlayer = async (level = 1, xp = 0) => {
  const userId = await createUser(database, `leveler${++userCount}`);
  await setStats(userId, level, xp);
  return userId;
};

const standing = async userId => {
  const user = await database.getUserById(userId);
  const stats = await database.getPlayerStats(userId);
  return { level: stats.level, xp: stats.xp, coins: user.victory_points };
};

describe('endless levels', () => {
  test('level 20 with 475 XP plus 25 reaches level 21 with 0 XP and 20 coins', async () => {
    const userId = await newPlayer(20, 475);
    const result = await database.updatePlayerXP(userId, 25);
    assert.equal(result.level, 21);
    assert.equal(result.xp, 0);
    assert.equal(result.leveledUp, true);
    assert.equal(result.levelsGained, 1);
    assert.equal(result.vpGained, 20);
    assert.deepEqual(await standing(userId), { level: 21, xp: 0, coins: 20 });
  });

  test('level 20 with 475 XP logs in unchanged', async () => {
    const userId = await newPlayer(20, 475);
    const result = await database.checkAndLevelUpPlayer(userId);
    assert.equal(result.leveledUp, false);
    assert.equal(result.xp, 475);
    assert.deepEqual(await standing(userId), { level: 20, xp: 475, coins: 0 });
  });

  test('level 25 with 1000 XP levels to 27 on login and gets 40 coins', async () => {
    const userId = await newPlayer(25, 1000);
    const result = await database.checkAndLevelUpPlayer(userId);
    assert.equal(result.leveledUp, true);
    assert.equal(result.oldLevel, 25);
    assert.equal(result.levelsGained, 2);
    assert.equal(result.vpGained, 40);
    assert.deepEqual(await standing(userId), { level: 27, xp: 0, coins: 40 });
  });

  test('every level pays 20 coins', async () => {
    const userId = await newPlayer(1, 0);
    const result = await database.updatePlayerXP(userId, 75); // 25 + 50: two levels
    assert.equal(result.levelsGained, 2);
    assert.equal(result.vpGained, 40);
    assert.deepEqual(await standing(userId), { level: 3, xp: 0, coins: 40 });
  });

  test('getXPRequiredForLevel(20) is 500', () => {
    assert.equal(database.getXPRequiredForLevel(20), 500);
    assert.equal(database.getXPRequiredForLevel(30), 500);
    assert.equal(database.getXPRequiredForLevel(3), 75);
  });
});

describe('daily quest coins', () => {
  test('a finished quest pays 5 coins and 15 XP', async () => {
    const userId = await newPlayer(1, 0);
    const quests = new QuestService(database);
    const result = await quests.recordWin(userId, { mode: 'random', teamNames: ['Ninja'], wentSecond: false });
    assert.equal(result.completed.length, 1);
    assert.equal(result.vpGained, 5);
    assert.equal(result.xpGained, 15);
    assert.deepEqual(await standing(userId), { level: 1, xp: 15, coins: 5 });
  });
});
