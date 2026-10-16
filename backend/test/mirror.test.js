// Both players can field the same hero (Random mode mirrors, Survival, Gauntlet).
// Effects must stay on the correct side of the board instead of matching on hero name.
const { test, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  makeManager, startBattle, hero, setD20, setRandom, resetDice, select
} = require('./support/battle');

let gm;
beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); });
afterEach(() => resetDice());

const kill = (game, h, killer = null) => {
  h.currentHP = 0;
  gm.updatePassiveEffectsOnDeath(game, h, killer, 'damage');
};

describe('Silencer Anti-Magic Field', () => {
  test('applies when a Silencer targets the enemy Silencer', () => {
    const game = startBattle(gm, ['Silencer', 'Fighter', 'Cleric'], ['Silencer', 'Wizard', 'Warden']);
    const result = gm.hasAdvantageDisadvantage(hero(game, 0, 'Silencer'), hero(game, 1, 'Silencer'), true, game);
    assert.equal(result.disadvantage, true);
  });
});

describe('Monk Deflect', () => {
  test('the enemy Monk can deflect an attack made by a Monk', () => {
    const game = startBattle(gm, ['Monk', 'Fighter', 'Cleric'], ['Monk', 'Wizard', 'Warden']);
    setD20(4); // 4 + 2 = 6: hits Wizard (AC 5) but is below Defense 9
    select(gm, 'p0', 'Wizard');
    gm.basicAttack('p0', 'Wizard');
    assert.equal(hero(game, 1, 'Wizard').currentHP, 15);
    assert.equal(game.players[1].monkDeflectUsed, true);
    assert.equal(game.players[0].monkDeflectUsed, false);
  });
});

describe('aura removal on death', () => {
  test("killing one Reaper only removes that Reaper's aura", () => {
    const game = startBattle(gm, ['Reaper', 'Fighter', 'Cleric'], ['Reaper', 'Wizard', 'Warden']);
    assert.equal(hero(game, 0, 'Fighter').modifiedDefense, 7, 'precondition: enemy Reaper aura');
    kill(game, hero(game, 0, 'Reaper'));
    assert.equal(hero(game, 0, 'Fighter').modifiedDefense, 7, 'the surviving enemy Reaper still debuffs');
    assert.equal(hero(game, 1, 'Wizard').modifiedDefense, 5, 'the dead Reaper no longer debuffs');
  });

  test("a Dual Defender's death only ends its own team's Defense sharing", () => {
    const game = startBattle(gm, ['Dual Defender', 'Fighter', 'Cleric'], ['Dual Defender', 'Wizard', 'Warden']);
    assert.ok(hero(game, 1, 'Wizard').sharedDefense, 'precondition');
    kill(game, hero(game, 0, 'Dual Defender'));
    assert.ok(hero(game, 1, 'Wizard').sharedDefense, 'enemy sharing is untouched');
    assert.equal(hero(game, 0, 'Fighter').sharedDefense, undefined);
  });
});

describe('taunt', () => {
  test('forces targeting of the enemy taunter even when the same-named ally is dead', () => {
    const game = startBattle(gm, ['Fighter', 'Warden', 'Cleric'], ['Warden', 'Wizard', 'Silencer']);
    hero(game, 0, 'Warden').currentHP = 0;
    hero(game, 0, 'Fighter').statusEffects.taunt = { target: 'Warden', duration: 1, appliedBy: 'Warden', source: 'Warden' };
    const result = gm.selectTarget('p0', 'Wizard');
    assert.equal(result.forced, true);
    assert.equal(result.selectedTarget, 'Warden');
  });

  test("an ally's death does not clear a taunt applied by the same-named enemy", () => {
    const game = startBattle(gm, ['Fighter', 'Warden', 'Cleric'], ['Warden', 'Wizard', 'Silencer']);
    hero(game, 0, 'Fighter').statusEffects.taunt = { target: 'Warden', duration: 1, appliedBy: 'Warden', source: 'Warden' };
    kill(game, hero(game, 0, 'Warden'));
    assert.ok(hero(game, 0, 'Fighter').statusEffects.taunt);
    kill(game, hero(game, 1, 'Warden'));
    assert.ok(!hero(game, 0, 'Fighter').statusEffects.taunt, "the taunter's own death clears it");
  });

  test('Paladin Shield of Faith finds the right attacker when both sides have the same heroes', () => {
    const game = startBattle(gm, ['Fighter', 'Paladin', 'Cleric'], ['Fighter', 'Paladin', 'Cleric']);
    gm.checkPaladinShieldOfFaith(game, hero(game, 0, 'Fighter'), hero(game, 1, 'Fighter'), 3);
    assert.equal(game.pendingTaunts.length, 1);
    assert.equal(game.pendingTaunts[0].targetPlayerIndex, 0);
    assert.equal(game.pendingTaunts[0].tauntTarget, 'Paladin');
  });
});

describe('timed effects keep their owner', () => {
  test("another Ranger's turn does not expire the first Ranger's Defense debuff", () => {
    const game = startBattle(gm, ['Ranger', 'Fighter', 'Cleric'], ['Ranger', 'Wizard', 'Warden']);
    select(gm, 'p0', 'Wizard');
    gm.useAbility('p0', 0, 'Wizard');
    const wizard = hero(game, 1, 'Wizard');
    assert.equal(wizard.statusEffects.statModifiers.Defense, -1, 'precondition');
    gm.processCasterDurationEffects(game, hero(game, 1, 'Ranger'));
    assert.equal(wizard.statusEffects.statModifiers.Defense, -1);
    gm.processCasterDurationEffects(game, hero(game, 0, 'Ranger'));
    assert.equal(wizard.statusEffects.statModifiers.Defense, undefined);
  });

  test("an enemy Hoarder's turn does not end the Bribe cast by the other Hoarder", () => {
    const game = startBattle(gm, ['Hoarder', 'Fighter', 'Cleric'], ['Hoarder', 'Wizard', 'Warden']);
    select(gm, 'p0', 'Wizard');
    gm.useAbility('p0', 0, 'Wizard');
    const wizard = hero(game, 1, 'Wizard');
    assert.ok(wizard.statusEffects.cannotTargetWithAbility, 'precondition');
    gm.processTurnStartEffects(game, hero(game, 1, 'Hoarder'), game.players[1]);
    assert.ok(wizard.statusEffects.cannotTargetWithAbility);
    gm.processTurnStartEffects(game, hero(game, 0, 'Hoarder'), game.players[0]);
    assert.ok(!wizard.statusEffects.cannotTargetWithAbility);
  });

  test("Cavalier's Ride Down outlives an enemy Cavalier but not its own", () => {
    const game = startBattle(gm, ['Cavalier', 'Fighter', 'Cleric'], ['Cavalier', 'Wizard', 'Warden']);
    select(gm, 'p0', 'Wizard');
    gm.basicAttack('p0', 'Wizard');
    const wizard = hero(game, 1, 'Wizard');
    assert.ok(wizard.statusEffects.rideDownDebuff, 'precondition');
    kill(game, hero(game, 1, 'Cavalier'));
    assert.ok(wizard.statusEffects.rideDownDebuff);
    kill(game, hero(game, 0, 'Cavalier'));
    assert.ok(!wizard.statusEffects.rideDownDebuff);
  });
});

describe('Timekeeper', () => {
  test('commands its own Fighter, not the enemy Fighter', () => {
    const game = startBattle(gm, ['Fighter', 'Wizard', 'Cleric'], ['Timekeeper', 'Fighter', 'Cleric'], { firstPlayer: 1 });
    hero(game, 0, 'Fighter').modifiedAccuracy = '-20'; // the wrong Fighter could never hit
    select(gm, 'p1', 'Wizard');
    gm.useAbility('p1', 0, 'Wizard', 'Fighter');
    assert.ok(hero(game, 0, 'Wizard').currentHP < 15, 'the commanded Fighter (accuracy +2) hit the Wizard');
  });
});

describe('Barbarian Break the Line', () => {
  const taunted = hero_ => {
    hero_.statusEffects.taunt = { target: 'Warden', duration: 1, appliedBy: 'Warden', source: 'Compel Duel' };
  };

  test('can choose any target while taunted', () => {
    const game = startBattle(gm, ['Barbarian', 'Fighter', 'Cleric'], ['Warden', 'Wizard', 'Silencer']);
    taunted(hero(game, 0, 'Barbarian'));
    const result = gm.selectTarget('p0', 'Wizard');
    assert.equal(result.success, true);
    assert.equal(result.forced, false);
    assert.equal(result.selectedTarget, 'Wizard');
    assert.equal(gm.basicAttack('p0', 'Wizard').success, true);
    assert.ok(hero(game, 1, 'Wizard').currentHP < 15);
  });

  test('other heroes are still forced onto the taunter', () => {
    const game = startBattle(gm, ['Fighter', 'Barbarian', 'Cleric'], ['Warden', 'Wizard', 'Silencer']);
    taunted(hero(game, 0, 'Fighter'));
    const result = gm.selectTarget('p0', 'Wizard');
    assert.equal(result.forced, true);
    assert.equal(result.selectedTarget, 'Warden');
  });
});

describe('Diplomat Declare War', () => {
  const declareWar = () => {
    const game = startBattle(gm, ['Diplomat', 'Fighter', 'Cleric'], ['Warden', 'Wizard', 'Silencer']);
    return game;
  };
  const run = () => {
    select(gm, 'p0', 'Wizard');
    return gm.useAbility('p0', 0, 'Wizard');
  };

  test('an unaffected ally attacks', () => {
    const game = declareWar();
    run();
    assert.ok(hero(game, 1, 'Wizard').currentHP < 15);
  });

  test('a stunned ally (Dual Defender Stun) is not commanded to attack', () => {
    const game = declareWar();
    hero(game, 0, 'Fighter').statusEffects.disableAttack = { active: true, duration: 1 };
    const result = run();
    assert.equal(hero(game, 1, 'Wizard').currentHP, 15);
    assert.ok(result.results.some(r => r.type === 'attack_prevented'));
  });

  test('an ally with the stun status is not commanded to attack', () => {
    const game = declareWar();
    hero(game, 0, 'Fighter').statusEffects.stun = { active: true, duration: 1 };
    run();
    assert.equal(hero(game, 1, 'Wizard').currentHP, 15);
  });
});
