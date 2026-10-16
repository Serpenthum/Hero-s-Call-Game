// Every way a hero can lose HP should go through the same reactions
// (damage negation, Vanish, Poison Aura, Health Link, death processing).
const { test, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  makeManager, startBattle, hero, setD20, setRandom, resetDice, select
} = require('./support/battle');

let gm;
beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); });
afterEach(() => resetDice());

const damageValues = results => [...new Set(
  results.filter(r => typeof r.damage === 'number' && r.damage > 0 && r.type !== 'attack_roll').map(r => r.damage)
)];

describe('Beast Tamer command', () => {
  function setup(enemies) {
    const game = startBattle(gm, ['Beast Tamer', 'Fighter', 'Cleric'], enemies);
    hero(game, 0, 'Beast Tamer').statusEffects.beast_active = true;
    return game;
  }
  const command = target => {
    select(gm, 'p0', target);
    return gm.useAbility('p0', 0, target);
  };

  test("respects Wizard's Arcane Shield", () => {
    const game = setup(['Wizard', 'Silencer', 'Warden']);
    command('Wizard');
    assert.equal(hero(game, 1, 'Wizard').currentHP, 15);
    assert.equal(hero(game, 1, 'Wizard').statusEffects.arcaneShieldUsed, true);
  });

  test('a kill triggers death processing (Angel resurrects the victim)', () => {
    const game = setup(['Angel', 'Fighter', 'Cleric']);
    hero(game, 1, 'Fighter').currentHP = 1;
    command('Fighter');
    assert.equal(hero(game, 1, 'Fighter').currentHP, 9);
    assert.equal(hero(game, 1, 'Angel').statusEffects.resurrectUsed, true);
  });

  test('triggers Vanish on the target', () => {
    const game = setup(['Ninja', 'Silencer', 'Warden']);
    command('Ninja');
    assert.equal(hero(game, 1, 'Ninja').statusEffects.untargetable, true);
  });

  test("triggers Shroomguard's Poison Aura", () => {
    const game = setup(['Shroomguard', 'Silencer', 'Warden']);
    command('Shroomguard');
    assert.equal(hero(game, 0, 'Fighter').statusEffects.poison, 1);
  });

  test('is stopped by Protective Gear (Engineer sacrifices a turret)', () => {
    const game = setup(['Engineer', 'Silencer', 'Warden']);
    hero(game, 1, 'Engineer').statusEffects.turret_count = 1;
    command('Engineer');
    assert.equal(hero(game, 1, 'Engineer').currentHP, 15);
    assert.equal(hero(game, 1, 'Engineer').statusEffects.turret_count, 0);
  });

  test('rolls with modified accuracy (auras like Bless apply)', () => {
    const game = setup(['Silencer', 'Warden', 'Cleric']);
    setD20(1);
    hero(game, 0, 'Beast Tamer').modifiedAccuracy = '+10';
    command('Silencer');
    assert.ok(hero(game, 1, 'Silencer').currentHP < 18, 'a 1 + 10 should beat Silencer AC 7');
  });

  test('the damage that is logged is the damage that is applied', () => {
    const game = setup(['Silencer', 'Warden', 'Cleric']);
    let n = 0;
    setRandom(() => (++n * 0.43) % 1); // never repeats, so separate 2D8 rolls differ (11, 9, 7, ...)
    const result = command('Silencer');
    const lost = 18 - hero(game, 1, 'Silencer').currentHP;
    assert.ok(lost > 0);
    assert.deepEqual(damageValues(result.results), [lost]);
  });
});

describe('Shaman Elemental Strike', () => {
  function setup(enemies) {
    const game = startBattle(gm, ['Shaman', 'Fighter', 'Cleric'], enemies);
    hero(game, 0, 'Shaman').statusEffects.totem_count = 2;
    return game;
  }
  const strike = target => {
    select(gm, 'p0', target);
    return gm.useAbility('p0', 0, target);
  };

  test("respects Wizard's Arcane Shield", () => {
    const game = setup(['Wizard', 'Silencer', 'Warden']);
    strike('Wizard');
    assert.equal(hero(game, 1, 'Wizard').currentHP, 15);
    assert.equal(hero(game, 1, 'Wizard').statusEffects.arcaneShieldUsed, true);
  });

  test('reflects damage through Health Link', () => {
    const game = startBattle(gm, ['Shaman', 'Fighter', 'Cleric'], ['Angel', 'Silencer', 'Warden'], { firstPlayer: 1 });
    select(gm, 'p1', 'Shaman');
    gm.useAbility('p1', 0, 'Shaman'); // Angel links the Shaman
    assert.ok(hero(game, 0, 'Shaman').statusEffects.health_link, 'precondition: linked');
    const before = hero(game, 0, 'Shaman').currentHP;
    gm.endTurn('p1');
    select(gm, 'p0', 'Angel');
    gm.useAbility('p0', 0, 'Angel');
    assert.ok(hero(game, 0, 'Shaman').currentHP < before, 'Shaman takes the damage it dealt to Angel');
  });

  test('a kill triggers Angel resurrection', () => {
    const game = setup(['Angel', 'Fighter', 'Cleric']);
    hero(game, 1, 'Fighter').currentHP = 1;
    strike('Fighter');
    assert.equal(hero(game, 1, 'Fighter').currentHP, 9);
  });

  test('rolls with modified accuracy', () => {
    const game = setup(['Silencer', 'Warden', 'Cleric']);
    setD20(1);
    hero(game, 0, 'Shaman').modifiedAccuracy = '+10';
    strike('Silencer');
    assert.ok(hero(game, 1, 'Silencer').currentHP < 18);
  });
});

describe('Monk Deflect covers every rolled attack', () => {
  test('Beast Tamer command can be deflected', () => {
    const game = startBattle(gm, ['Beast Tamer', 'Fighter', 'Cleric'], ['Wizard', 'Monk', 'Warden']);
    hero(game, 0, 'Beast Tamer').statusEffects.beast_active = true;
    setD20(5); // 5 + 2 = 7: hits Wizard (AC 5) but is below Monk's Defense 9
    select(gm, 'p0', 'Wizard');
    gm.useAbility('p0', 0, 'Wizard');
    assert.equal(hero(game, 1, 'Wizard').currentHP, 15);
    assert.equal(game.players[1].monkDeflectUsed, true);
  });
});

describe('unchanged behaviour that must keep working', () => {
  test('poison ticks are not stopped by Arcane Shield', () => {
    const game = startBattle(gm, ['Fighter', 'Cleric', 'Monk'], ['Wizard', 'Silencer', 'Warden']);
    gm.endTurn('p0');
    hero(game, 1, 'Wizard').statusEffects.poison = 7;
    gm.endTurn('p1');
    assert.equal(hero(game, 1, 'Wizard').currentHP, 8);
  });

  test('basic attack still triggers Arcane Shield', () => {
    const game = startBattle(gm, ['Wizard', 'Fighter', 'Cleric'], ['Wizard', 'Silencer', 'Warden']);
    setRandom(0.99); // 2D4 = 8
    select(gm, 'p0', 'Wizard');
    gm.basicAttack('p0', 'Wizard');
    assert.equal(hero(game, 1, 'Wizard').currentHP, 15);
  });
});

describe('gm.dealDamage contract', () => {
  function duel() {
    const game = startBattle(gm, ['Fighter', 'Cleric', 'Monk'], ['Wizard', 'Ninja', 'Angel']);
    return { game, attacker: hero(game, 0, 'Fighter') };
  }

  test('reduces HP and reports what was dealt', () => {
    const { game, attacker } = duel();
    const ninja = hero(game, 1, 'Ninja');
    const out = gm.dealDamage(game, ninja, 4, attacker, { source: 'test' });
    assert.equal(ninja.currentHP, 11);
    assert.equal(out.dealt, 4);
    assert.equal(out.died, false);
    assert.ok(Array.isArray(out.effects));
  });

  test('negates damage through Arcane Shield, only once', () => {
    const { game, attacker } = duel();
    const wizard = hero(game, 1, 'Wizard');
    const first = gm.dealDamage(game, wizard, 9, attacker, { source: 'test' });
    assert.equal(first.dealt, 0);
    assert.equal(first.negated, true);
    assert.equal(wizard.currentHP, 15);
    const second = gm.dealDamage(game, wizard, 9, attacker, { source: 'test' });
    assert.equal(second.dealt, 9);
  });

  test('unreducible damage ignores Arcane Shield', () => {
    const { game, attacker } = duel();
    const wizard = hero(game, 1, 'Wizard');
    const out = gm.dealDamage(game, wizard, 9, attacker, { source: 'poison', reducible: false });
    assert.equal(out.dealt, 9);
    assert.equal(wizard.currentHP, 6);
  });

  test('never drops HP below zero and runs death processing', () => {
    const game = startBattle(gm, ['Fighter', 'Cleric', 'Monk'], ['Ninja', 'Silencer', 'Warden']);
    const ninja = hero(game, 1, 'Ninja');
    const out = gm.dealDamage(game, ninja, 99, hero(game, 0, 'Fighter'), { source: 'test' });
    assert.equal(ninja.currentHP, 0);
    assert.equal(ninja.deathProcessed, true);
    assert.equal(out.died, true);
    assert.equal(out.dealt, 15, 'dealt is the HP actually lost');
  });

  test('a lethal hit is resurrected by Angel', () => {
    const { game, attacker } = duel();
    const ninja = hero(game, 1, 'Ninja');
    const out = gm.dealDamage(game, ninja, 99, attacker, { source: 'test' });
    assert.equal(ninja.currentHP, 8);
    assert.equal(out.died, false);
  });

  test('Vanish fires for hostile damage, not for poison or self damage', () => {
    const game = startBattle(gm, ['Fighter', 'Cleric', 'Monk'], ['Ninja', 'Silencer', 'Warden']);
    const ninja = hero(game, 1, 'Ninja');
    gm.dealDamage(game, ninja, 2, null, { source: 'poison', reducible: false, reactive: false });
    assert.ok(!ninja.statusEffects.untargetable);
    gm.dealDamage(game, ninja, 2, ninja, { source: 'self' });
    assert.ok(!ninja.statusEffects.untargetable);
    gm.dealDamage(game, ninja, 2, hero(game, 0, 'Fighter'), { source: 'test' });
    assert.equal(ninja.statusEffects.untargetable, true);
  });

  test('Poison Aura reacts to any damage source', () => {
    const game = startBattle(gm, ['Fighter', 'Cleric', 'Monk'], ['Shroomguard', 'Silencer', 'Warden']);
    gm.dealDamage(game, hero(game, 1, 'Shroomguard'), 2, hero(game, 0, 'Fighter'), { source: 'turret' });
    assert.equal(hero(game, 0, 'Cleric').statusEffects.poison, 1);
  });

  test('ignores zero damage and dead targets', () => {
    const { game, attacker } = duel();
    const ninja = hero(game, 1, 'Ninja');
    assert.equal(gm.dealDamage(game, ninja, 0, attacker, {}).dealt, 0);
    ninja.currentHP = 0;
    assert.equal(gm.dealDamage(game, ninja, 5, attacker, {}).dealt, 0);
  });
});
