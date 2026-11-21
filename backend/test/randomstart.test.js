// A random-mode battle starts straight in the 'battle' phase. The state sent with 'game-start'
// must already name the active hero, or the first player's action bar says "No active hero".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager, newPlayer } = require('./support/battle');

test('startRandomMode sends a client game state with the active hero set', async () => {
  const owned = ['Fighter', 'Cleric', 'Monk', 'Wizard', 'Ranger', 'Druid'];
  const gm = makeManager({ getUserById: async () => ({ available_heroes: owned }) });
  const game = gm.createNewGame('g-random', 'random');
  game.players = [newPlayer('p0', 'Alice'), newPlayer('p1', 'Bob')];
  game.players.forEach((p, i) => { p.userId = i + 1; }); // random battles are between logged in players
  gm.games.set('g-random', game);

  const result = await gm.startRandomMode('g-random');
  assert.equal(result.success, true);

  const state = result.gameState;
  assert.equal(state.phase, 'battle');
  assert.ok(state.activeHero, 'activeHero is set');
  const first = game.firstPlayerIndex;
  assert.equal(state.activeHero.playerIndex, first);
  assert.equal(state.currentTurn, first);
  assert.equal(state.activeHero.name, game.players[first].team[0].name);
});
