// State the site's hero badges read (badges and wording redesign, spec 2026-11-22).
const { test, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager, startBattle, hero, setD20, setRandom, resetDice } = require('./support/battle');

let gm;
beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); });
afterEach(resetDice);

const attack = (pid, t) => { gm.selectTarget(pid, t); return gm.basicAttack(pid, t); };

describe('pendingTaunts in the game state', () => {
  test('game state lists a queued Shield of Faith taunt', () => {
    const game = startBattle(gm, ['Fighter', 'Swordsman', 'Cleric'], ['Sorcerer', 'Paladin', 'Cleric']);
    const fighter = hero(game, 0, 'Fighter');
    const paladin = hero(game, 1, 'Paladin');
    assert.deepEqual(gm.getFullGameState(game).pendingTaunts, [], 'empty before any taunt');

    // Damaging Sorcerer (next to Paladin) queues the taunt
    assert.equal(attack('p0', 'Sorcerer').success, true);
    assert.deepEqual(gm.getFullGameState(game).pendingTaunts, [
      { targetId: fighter.id, targetPlayerIndex: 0, tauntTarget: 'Paladin', appliedById: paladin.id }
    ]);

    gm.endTurn('p0');
    assert.deepEqual(gm.getFullGameState(game).pendingTaunts, []);
  });
});
