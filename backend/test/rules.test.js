// Rule checks for attack limits and conditional damage.
const { test, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager, startBattle, hero, setD20, setRandom, resetDice, select } = require('./support/battle');

let gm;
beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); });
afterEach(() => resetDice());

const attack = (pid, target) => { gm.selectTarget(pid, target); return gm.basicAttack(pid, target); };

describe('attacks per turn', () => {
  test("Brawler's Iron Fists allows exactly two basic attacks", () => {
    const game = startBattle(gm, ['Brawler', 'Fighter', 'Cleric'], ['Warden', 'Fighter', 'Cleric']);
    hero(game, 1, 'Warden').currentHP = 99;
    assert.equal(attack('p0', 'Warden').success, true);
    assert.equal(attack('p0', 'Warden').success, true);
    assert.equal(attack('p0', 'Warden').success, false);
  });

  test("Berserker's Frenzy allows exactly two attacks once an enemy drops it below 10 HP", () => {
    const game = startBattle(gm, ['Fighter', 'Swordsman', 'Cleric'], ['Berserker', 'Fighter', 'Cleric']);
    hero(game, 1, 'Berserker').currentHP = 12;
    hero(game, 0, 'Fighter').currentHP = 99;
    assert.equal(attack('p0', 'Berserker').success, true);
    assert.ok(hero(game, 1, 'Berserker').currentHP < 10);
    gm.endTurn('p0');
    assert.equal(attack('p1', 'Fighter').success, true);
    assert.equal(attack('p1', 'Fighter').success, true, 'second Frenzy attack');
    assert.equal(attack('p1', 'Fighter').success, false, 'no third attack');
  });

  test('Berserker above 10 HP gets one attack', () => {
    const game = startBattle(gm, ['Berserker', 'Fighter', 'Cleric'], ['Warden', 'Fighter', 'Cleric']);
    hero(game, 1, 'Warden').currentHP = 99;
    assert.equal(attack('p0', 'Warden').success, true);
    assert.equal(attack('p0', 'Warden').success, false);
  });
});

describe("Piercer's Piercing Strike", () => {
  const strike = defender => {
    const game = startBattle(gm, ['Piercer', 'Fighter', 'Swordsman'], [defender, 'Fighter', 'Swordsman']);
    const before = hero(game, 1, defender).currentHP;
    select(gm, 'p0', defender);
    assert.equal(gm.useAbility('p0', 0, defender).success, true);
    return before - hero(game, 1, defender).currentHP;
  };
  test('adds 1D6 against more than 8 Defense', () => {
    assert.equal(strike('Dual Defender'), 3 + 4); // 1D4 -> 3, 1D6 -> 4 with fixed dice
  });
  test('deals only 1D4 against 8 Defense or less', () => {
    assert.equal(strike('Sorcerer'), 3);
  });
});

describe("Paladin's Shield of Faith", () => {
  test('taunts the attacker at the end of its turn', () => {
    const game = startBattle(gm, ['Fighter', 'Swordsman', 'Cleric'], ['Sorcerer', 'Paladin', 'Cleric']);
    assert.equal(attack('p0', 'Sorcerer').success, true);
    gm.endTurn('p0');
    assert.equal(hero(game, 0, 'Fighter').statusEffects.taunt?.target, 'Paladin');
  });
});
