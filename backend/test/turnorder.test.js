// Only the player who won the initiative roll gets to choose who goes first.
const { test, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager, newPlayer } = require('./support/battle');

let gm, game;
beforeEach(() => {
  gm = makeManager();
  game = gm.createNewGame('g-turn', 'random');
  const players = [newPlayer('p0', 'Alice'), newPlayer('p1', 'Bob')];
  players.forEach((p, i) => {
    p.team = ['Fighter', 'Cleric', 'Monk'].map(n => gm.resetHeroToOriginalState(gm.allHeroes.find(h => h.name === n)));
    gm.playerGameMap.set(p.id, 'g-turn');
  });
  game.players = players;
  game.phase = 'initiative';
  gm.games.set('g-turn', game);
});

describe('chooseTurnOrder', () => {
  test('the initiative winner can choose', () => {
    game.players[0].initiativeRoll = 17;
    game.players[1].initiativeRoll = 4;
    const result = gm.chooseTurnOrder('p0', false);
    assert.equal(result.success, true);
    assert.equal(game.firstPlayerIndex, 1, 'the winner chose to go second');
  });

  test('the loser cannot choose, and the battle does not start', () => {
    game.players[0].initiativeRoll = 17;
    game.players[1].initiativeRoll = 4;
    const result = gm.chooseTurnOrder('p1', true);
    assert.equal(result.success, false);
    assert.equal(game.phase, 'initiative');
  });

  test('nobody can choose before initiative has been rolled', () => {
    assert.equal(gm.chooseTurnOrder('p0', true).success, false);
    assert.equal(game.phase, 'initiative');
  });

  test('the choice cannot be made twice', () => {
    game.players[0].initiativeRoll = 17;
    game.players[1].initiativeRoll = 4;
    assert.equal(gm.chooseTurnOrder('p0', true).success, true);
    assert.equal(gm.chooseTurnOrder('p0', false).success, false);
    assert.equal(game.firstPlayerIndex, 0);
  });
});
