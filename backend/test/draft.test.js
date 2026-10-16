// Draft matchmaking: the level 3 unlock, and the ban-phase hands.
// Each player bans from 5 random heroes taken from the OPPONENT'S collection; after the bans the hands
// swap, so each player picks from 4 heroes of their own collection. The two hands never share a hero.
const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const heroList = require('../heros.json');
const { makeManager } = require('./support/battle');
const { createTestDatabase, createUser } = require('./support/db');

const enabled = heroList.filter(h => !h.disabled).map(h => h.name);
const starters = ['Assassin', 'Barbarian', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Sorcerer', 'Wizard'];

let env, database, gm, count = 0;
before(async () => { env = await createTestDatabase(); database = env.database; });
after(async () => { await env.cleanup(); });
beforeEach(() => { gm = makeManager(database); });

const setLevel = (userId, level) => new Promise((resolve, reject) =>
  database.db.run('UPDATE player_stats SET level = ? WHERE user_id = ?', [level, userId], e => (e ? reject(e) : resolve())));

async function player(heroes, level = 3) {
  const userId = await createUser(database, `drafter${++count}`, { heroes });
  await setLevel(userId, level);
  return userId;
}
const join = (socketId, userId, mode = 'draft') => gm.addPlayer(socketId, socketId, mode, 'Sorcerer', userId);

describe('Draft unlock', () => {
  test('is refused below level 3, with a message, and the player is not queued', async () => {
    const u = await player(starters, 2);
    const result = await join('a', u);
    assert.equal(result.success, false);
    assert.match(result.error, /level 3/i);
    assert.equal(gm.draftQueue.length, 0);
  });

  test('is allowed at level 3', async () => {
    const u = await player(starters, 3);
    const result = await join('a', u);
    assert.equal(result.success, true);
    assert.equal(result.waiting, true);
  });

  test('Random mode has no level requirement', async () => {
    const u = await player(starters, 1);
    assert.equal((await join('a', u, 'random')).success, true);
  });

  test('needs a logged in player', async () => {
    const result = await join('a', null);
    assert.equal(result.success, false);
  });

  test('needs at least 5 heroes, and says so', async () => {
    const u = await player(starters.slice(0, 4), 5);
    const result = await join('a', u);
    assert.equal(result.success, false);
    assert.match(result.error, /5 heroes/);
    assert.equal(gm.draftQueue.length, 0);
  });

  test('friend rooms have no level requirement', async () => {
    const host = await player(starters, 1);
    const guest = await player(starters, 1);
    const created = gm.createFriendlyGame('h', 'Host', 'room', 'Sorcerer', host);
    const joined = await gm.addPlayerToGame(created.gameId, 'g', 'Guest', 'Sorcerer', guest);
    assert.equal(joined.success, true);
    assert.equal(gm.games.get(created.gameId).phase, 'draft');
  });
});

describe('Draft hands', () => {
  async function match(heroes1, heroes2) {
    const u1 = await player(heroes1), u2 = await player(heroes2);
    await join('s1', u1);
    const result = await join('s2', u2);
    assert.equal(result.gameReady, true, 'the two players were matched');
    return gm.games.get(result.gameId);
  }
  const names = hand => hand.map(h => h.name);

  test('each player bans from 5 heroes of the opponent\'s collection, and the hands share no hero', async () => {
    const c1 = starters, c2 = [...starters.slice(0, 5), ...enabled.filter(n => !starters.includes(n)).slice(0, 5)];
    for (let i = 0; i < 15; i++) {
      gm = makeManager(database);
      const game = await match(c1, c2);
      const [p1, p2] = game.players;
      assert.equal(p1.draftCards.length, 5);
      assert.equal(p2.draftCards.length, 5);
      assert.ok(names(p1.draftCards).every(n => c2.includes(n)), "P1 bans from P2's heroes");
      assert.ok(names(p2.draftCards).every(n => c1.includes(n)), "P2 bans from P1's heroes");
      const overlap = names(p1.draftCards).filter(n => names(p2.draftCards).includes(n));
      assert.deepEqual(overlap, [], 'no hero appears in both hands');
    }
  });

  test('after the bans and the swap, each player picks from 4 heroes of their own collection', async () => {
    const c1 = starters, c2 = [...starters.slice(0, 5), ...enabled.filter(n => !starters.includes(n)).slice(0, 5)];
    const game = await match(c1, c2);
    const [p1, p2] = game.players;
    gm.banCard('s1', p1.draftCards[0].name);
    gm.banCard('s2', p2.draftCards[0].name);
    assert.equal(game.currentDraftPhase, 1);
    assert.equal(p1.draftCards.length, 4);
    assert.equal(p2.draftCards.length, 4);
    assert.ok(names(p1.draftCards).every(n => c1.includes(n)), "P1 now holds heroes from P1's own collection");
    assert.ok(names(p2.draftCards).every(n => c2.includes(n)), "P2 now holds heroes from P2's own collection");
  });

  test('works when both players own exactly the same 10 heroes', async () => {
    const game = await match(starters, starters);
    const [p1, p2] = game.players;
    assert.equal(new Set([...names(p1.draftCards), ...names(p2.draftCards)]).size, 10);
  });

  test('still finds disjoint hands when the collections overlap heavily', async () => {
    // 6 shared heroes + 4 only P2 owns: P1's ban hand must contain all four of P2's exclusive heroes
    const shared = starters.slice(0, 6);
    const exclusive = enabled.filter(n => !starters.includes(n)).slice(0, 4);
    for (let i = 0; i < 10; i++) {
      gm = makeManager(database);
      const game = await match(shared, [...shared, ...exclusive]);
      const [p1, p2] = game.players;
      assert.equal(p1.draftCards.length, 5);
      assert.equal(p2.draftCards.length, 5);
      assert.deepEqual(names(p1.draftCards).filter(n => names(p2.draftCards).includes(n)), []);
    }
  });

  test('players whose collections cannot make two full hands are not matched with each other', async () => {
    const same6 = starters.slice(0, 6); // only 6 different heroes between them: not enough for 2 x 5
    const u1 = await player(same6), u2 = await player(same6), u3 = await player(starters);
    await join('s1', u1);
    const second = await join('s2', u2);
    assert.equal(second.waiting, true, 'not matched');
    assert.equal(gm.draftQueue.length, 2);

    const third = await join('s3', u3);
    assert.equal(third.gameReady, true, 'a compatible player is matched');
    assert.equal(gm.draftQueue.length, 1, 'the other incompatible player keeps waiting');
  });

  test('a friend room refuses a guest the host cannot draft against', async () => {
    const same6 = starters.slice(0, 6);
    const host = await player(same6), guest = await player(same6);
    const created = gm.createFriendlyGame('h', 'Host', 'room2', 'Sorcerer', host);
    const joined = await gm.addPlayerToGame(created.gameId, 'g', 'Guest', 'Sorcerer', guest);
    assert.equal(joined.success, false);
    assert.match(joined.error, /10 different heroes/);
    assert.equal(gm.games.get(created.gameId).players.length, 1, 'the guest was not added');
  });
});
