// Defense from Dual Defender's Defend combined with team-wide auras.
const { test, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager, startBattle, hero, setD20, setRandom, resetDice } = require('./support/battle');

let gm;
beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); });
afterEach(() => resetDice());

describe("Dual Defender's Defend with Reaper's Aura of Dread", () => {
  test('the ally to the right takes the aura once, not twice', () => {
    const game = startBattle(gm, ['Ninja', 'Dual Defender', 'Berserker'], ['Cleric', 'Angel', 'Reaper']);
    gm.applyPassiveEffects(game);
    assert.equal(hero(game, 0, 'Ninja').modifiedDefense, 6);
    assert.equal(hero(game, 0, 'Dual Defender').modifiedDefense, 9);
    assert.equal(hero(game, 0, 'Berserker').modifiedDefense, 9);
  });

  test('stays correct when passives are recalculated again', () => {
    const game = startBattle(gm, ['Ninja', 'Dual Defender', 'Berserker'], ['Cleric', 'Angel', 'Reaper']);
    gm.applyPassiveEffects(game);
    gm.applyPassiveEffects(game);
    gm.applyPassiveEffects(game);
    assert.equal(hero(game, 0, 'Berserker').modifiedDefense, 9);
  });

  test('without Reaper the ally simply copies Dual Defender', () => {
    const game = startBattle(gm, ['Ninja', 'Dual Defender', 'Berserker'], ['Cleric', 'Angel', 'Fighter']);
    gm.applyPassiveEffects(game);
    assert.equal(hero(game, 0, 'Berserker').modifiedDefense, 10);
  });
});

describe("Warlock's Dark Pact on the attack display", () => {
  test('a hero with no basic attack keeps showing just the dash', () => {
    const game = startBattle(gm, ['Assassin', 'Warlock', 'Fighter'], ['Cleric', 'Angel', 'Reaper']);
    gm.applyPassiveEffects(game);
    assert.equal(hero(game, 0, 'Assassin').modifiedBasicAttack, '—');
    assert.match(hero(game, 0, 'Fighter').modifiedBasicAttack, /\+1$/);
  });
});
