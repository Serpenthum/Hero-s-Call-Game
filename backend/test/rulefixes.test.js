// Rule fixes from the badges and wording redesign (spec 2026-11-22), one describe per fix.
const { test, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager, startBattle, hero, heroAt, setD20, setRandom, resetDice } = require('./support/battle');

let gm;
beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); });
afterEach(resetDice);

const attack = (pid, t) => { gm.selectTarget(pid, t); return gm.basicAttack(pid, t); };

// Ends turns until the given hero is the one acting.
function passTurnsUntil(game, target) {
  for (let i = 0; i < 20; i++) {
    const info = gm.getCurrentTurnInfo(game);
    if (info.hero === target) return;
    gm.endTurn(info.player.id);
  }
  throw new Error(`${target.name} never got a turn`);
}

describe("fix a: a dead Paladin's waiting taunt is dropped", () => {
  test("a dead Paladin's queued taunt never lands", () => {
    // Paladin sits left of Sorcerer, so Fighter's Cleave on Sorcerer splashes onto Paladin
    const game = startBattle(gm, ['Fighter', 'Swordsman', 'Cleric'], ['Paladin', 'Sorcerer', 'Cleric']);
    const fighter = hero(game, 0, 'Fighter');
    const paladin = hero(game, 1, 'Paladin');
    paladin.currentHP = 1;

    // Damaging Sorcerer (next to Paladin) queues the taunt
    assert.equal(attack('p0', 'Sorcerer').success, true);
    assert.ok(game.pendingTaunts.some(t => t.appliedBy === 'Paladin'), 'taunt queued');

    // Cleave's splash kills Paladin through the real death path
    assert.equal(gm.useAbility('p0', 0, 'Sorcerer').success, true);
    assert.ok(paladin.currentHP <= 0, 'Paladin died');

    assert.ok(!(game.pendingTaunts || []).some(t => t.appliedById === paladin.id), 'entry dropped on death');
    gm.endTurn('p0');
    assert.ok(!fighter.statusEffects?.taunt, "no taunt");
    assert.ok(!(game.pendingTaunts || []).some(t => t.appliedById === paladin.id));

    passTurnsUntil(game, fighter);
    assert.equal(gm.selectTarget('p0', 'Cleric').success, true);
    assert.equal(gm.basicAttack('p0', 'Cleric').success, true);
    assert.equal(gm.useAbility('p0', 0, 'Cleric').success, true);
  });

  test('a taunt entry whose taunter is dead is skipped when applied', () => {
    const game = startBattle(gm, ['Fighter', 'Swordsman', 'Cleric'], ['Sorcerer', 'Paladin', 'Cleric']);
    const fighter = hero(game, 0, 'Fighter');
    assert.equal(attack('p0', 'Sorcerer').success, true);
    assert.equal(game.pendingTaunts.length, 1, 'taunt queued');

    // Dead without the death hook running
    hero(game, 1, 'Paladin').currentHP = 0;
    gm.endTurn('p0');
    assert.ok(!fighter.statusEffects?.taunt, "no taunt");
  });

  test("mirror: only the attacking side's hero is taunted", () => {
    const game = startBattle(gm, ['Fighter', 'Paladin', 'Cleric'], ['Fighter', 'Paladin', 'Cleric']);
    const myFighter = heroAt(game, 0, 0);
    const theirFighter = heroAt(game, 1, 0);
    theirFighter.currentHP = 99;
    assert.equal(attack('p0', 'Fighter').success, true);

    assert.equal(game.pendingTaunts.length, 1);
    assert.equal(game.pendingTaunts[0].targetId, myFighter.id);
    assert.equal(game.pendingTaunts[0].appliedById, heroAt(game, 1, 1).id);

    gm.endTurn('p0');
    assert.equal(myFighter.statusEffects.taunt.target, 'Paladin');
    assert.ok(!theirFighter.statusEffects?.taunt, "no taunt");
  });
});

describe('fix b: Dark Pact stays after Warlock dies', () => {
  const hasDarkPact = h => (h.passiveBuffs || []).some(b => b.sourceName === 'Dark Pact' && b.stat === 'damage' && b.value === 1);
  const darkPactStartLines = game => (game.battleLog || []).filter(e => JSON.stringify(e).includes('Dark Pact') && JSON.stringify(e).includes('battle start'));

  // Kills Warlock, then drops its Fighter below 10 HP so the bonuses are recounted
  function killWarlockThenRecount() {
    const game = startBattle(gm, ['Swordsman', 'Brawler', 'Cleric'], ['Fighter', 'Warlock', 'Cleric']);
    const fighter = hero(game, 1, 'Fighter');
    const warlock = hero(game, 1, 'Warlock');
    const cleric = hero(game, 1, 'Cleric');
    assert.ok(hasDarkPact(fighter) && hasDarkPact(cleric), 'Dark Pact at battle start');

    warlock.currentHP = 1;
    assert.equal(attack('p0', 'Warlock').success, true);
    assert.ok(warlock.currentHP <= 0, 'Warlock died');
    gm.endTurn('p0');

    passTurnsUntil(game, hero(game, 0, 'Brawler'));
    fighter.currentHP = 10;
    assert.equal(attack('p0', 'Fighter').success, true);
    assert.ok(fighter.currentHP > 0 && fighter.currentHP < 10, 'Fighter below 10 HP');
    assert.equal(fighter.conditionalEffects?.['Desperate Blows'], true, 'recount ran');
    return { game, fighter, cleric };
  }

  test('Dark Pact survives a recount after Warlock dies', () => {
    const { fighter, cleric } = killWarlockThenRecount();
    assert.ok(hasDarkPact(fighter), 'Fighter keeps Dark Pact');
    assert.ok(hasDarkPact(cleric), 'Cleric keeps Dark Pact');
  });

  test('the Dark Pact battle-start log line appears once', () => {
    const { game } = killWarlockThenRecount();
    assert.equal(darkPactStartLines(game).length, 1);
  });
});

describe('fix c: a hero revived and killed again in the same turn dies properly', () => {
  const hasTotemicBond = h => (h.passiveBuffs || []).some(b => b.sourceName === 'Totemic Bond' && b.stat === 'Defense');
  const shamanEntries = h => (h.scalingBuffs?.collectedDice || []).filter(c => c.from === 'Shaman').length;

  // Brawler's first attack kills Shaman, Angel revives it
  function killShamanOnce() {
    const game = startBattle(gm, ['Brawler', 'Fighter', 'Hoarder'], ['Shaman', 'Angel', 'Champion']);
    const shaman = hero(game, 1, 'Shaman');
    shaman.currentHP = 1;
    const first = attack('p0', 'Shaman');
    assert.equal(first.success, true);
    assert.ok(shaman.currentHP > 0, 'Angel revived Shaman');
    assert.equal(hero(game, 1, 'Angel').statusEffects?.resurrectUsed, true);
    return { game, shaman, hoarder: hero(game, 0, 'Hoarder') };
  }

  test('a revived Shaman killed again loses its aura', () => {
    const { game, shaman, hoarder } = killShamanOnce();
    const afterFirst = shamanEntries(hoarder);

    shaman.currentHP = 1;
    assert.equal(attack('p0', 'Shaman').success, true);
    assert.ok(shaman.currentHP <= 0, 'Shaman died again');

    assert.ok(!hasTotemicBond(hero(game, 1, 'Angel')), 'Angel lost Totemic Bond');
    assert.ok(!hasTotemicBond(hero(game, 1, 'Champion')), 'Champion lost Totemic Bond');
    assert.equal(shamanEntries(hoarder), afterFirst + 1, 'Hoarder collects once for the second death');
    const champion = hero(game, 1, 'Champion');
    assert.equal(champion.scalingBuffs?.damage, 1, 'Last Stand counts one fallen ally');
  });

  test('the death that caused the revive is not processed twice', () => {
    const { game, hoarder } = killShamanOnce();
    const afterFirst = shamanEntries(hoarder);
    assert.equal(attack('p0', 'Champion').success, true);
    assert.equal(shamanEntries(hoarder), afterFirst);
    assert.ok(hasTotemicBond(hero(game, 1, 'Champion')), 'Shaman alive, aura kept');
  });

  test('dealDamage says the target was revived by this hit', () => {
    const game = startBattle(gm, ['Brawler', 'Fighter', 'Hoarder'], ['Shaman', 'Angel', 'Champion']);
    const shaman = hero(game, 1, 'Shaman');
    shaman.currentHP = 1;
    const result = gm.dealDamage(game, shaman, 5, hero(game, 0, 'Brawler'));
    assert.equal(result.revived, true);
    assert.equal(result.died, false);
    shaman.currentHP = 1;
    const again = gm.dealDamage(game, shaman, 5, hero(game, 0, 'Brawler'));
    assert.equal(again.died, true);
    assert.ok(!again.revived);
  });
});

describe('fixes g and h: a revived hero keeps no Ride Down and gets no second Arcane Shield', () => {
  const ability = (pid, t, index = 0) => { gm.selectTarget(pid, t); return gm.useAbility(pid, index, t); };

  test("a hero revived after Cavalier's killing attack has no Ride Down", () => {
    const game = startBattle(gm, ['Cavalier', 'Fighter', 'Cleric'], ['Wizard', 'Angel', 'Cleric']);
    const wizard = hero(game, 1, 'Wizard');
    wizard.currentHP = 1;
    assert.equal(attack('p0', 'Wizard').success, true);
    assert.ok(wizard.currentHP > 0, 'Angel revived Wizard');
    assert.equal(wizard.statusEffects.rideDownDebuff, undefined);
  });

  test("same for Cavalier's ability", () => {
    const game = startBattle(gm, ['Cavalier', 'Fighter', 'Cleric'], ['Wizard', 'Angel', 'Cleric']);
    const wizard = hero(game, 1, 'Wizard');
    wizard.currentHP = 1;
    assert.equal(ability('p0', 'Wizard').success, true);
    assert.ok(wizard.currentHP > 0, 'Angel revived Wizard');
    assert.equal(wizard.statusEffects.rideDownDebuff, undefined);
  });

  test('a revived Wizard gets no second Arcane Shield', () => {
    // Brawler's 2D4 rolls 6 and it attacks twice
    const game = startBattle(gm, ['Brawler', 'Fighter', 'Cleric'], ['Wizard', 'Angel', 'Cleric']);
    const wizard = hero(game, 1, 'Wizard');
    const startHP = wizard.currentHP;
    assert.equal(attack('p0', 'Wizard').success, true);
    assert.equal(wizard.currentHP, startHP, 'Arcane Shield blocked the first hit');
    assert.equal(wizard.statusEffects.arcaneShieldUsed, true);

    wizard.currentHP = 1;
    assert.equal(attack('p0', 'Wizard').success, true);
    assert.ok(wizard.currentHP > 0, 'Angel revived Wizard');
    const reviveEntry = game.log[game.log.length - 1];
    assert.ok(reviveEntry.reactions.some(r => r.action === 'Resurrect'));
    assert.ok(!reviveEntry.reactions.some(r => r.action === 'Arcane Shield'), 'no Arcane Shield on the revive');
    assert.equal(wizard.statusEffects.arcaneShieldAvailable, false);

    const hpBefore = wizard.currentHP;
    gm.dealDamage(game, wizard, 6, hero(game, 0, 'Brawler'), { source: 'Basic Attack', isAttack: true });
    assert.equal(wizard.currentHP, hpBefore - 6, 'the 6-damage hit is not blocked');
    assert.equal(wizard.statusEffects.arcaneShieldAvailable, false);
  });
});

describe("fixes d and e: Piercing Shot's -1 Defense ends properly", () => {
  const { calculateEffectiveDefense } = require('../utils');

  // p0's Ranger hits Wizard with Piercing Shot; returns Wizard's Defense from before the shot
  function piercingShot(game) {
    const wizard = hero(game, 1, 'Wizard');
    const base = wizard.modifiedDefense;
    gm.selectTarget('p0', 'Wizard');
    assert.equal(gm.useAbility('p0', 0, 'Wizard').success, true);
    assert.equal(wizard.statusEffects.statModifiers.Defense, -1, 'precondition: debuff on');
    assert.equal(wizard.modifiedDefense, base - 1, 'precondition: Defense lowered');
    return { wizard, base };
  }

  test("Piercing Shot's -1 ends when Ranger dies", () => {
    const game = startBattle(gm, ['Ranger', 'Fighter', 'Cleric'], ['Fighter', 'Wizard', 'Cleric']);
    const ranger = hero(game, 0, 'Ranger');
    const { wizard, base } = piercingShot(game);
    gm.endTurn('p0');

    ranger.currentHP = 1;
    assert.equal(attack('p1', 'Ranger').success, true);
    assert.ok(ranger.currentHP <= 0, 'Ranger died');

    assert.equal(wizard.statusEffects.statModifiers.Defense, undefined);
    assert.equal(wizard.modifiedDefense, base);
    assert.equal(calculateEffectiveDefense(wizard), base);
  });

  test("Piercing Shot's -1 ends at Ranger's next turn with no other action", () => {
    const game = startBattle(gm, ['Ranger', 'Fighter', 'Cleric'], ['Fighter', 'Wizard', 'Cleric']);
    const ranger = hero(game, 0, 'Ranger');
    const { wizard, base } = piercingShot(game);
    gm.endTurn('p0');
    passTurnsUntil(game, ranger);

    assert.equal(wizard.statusEffects.statModifiers.Defense, undefined);
    assert.equal(wizard.modifiedDefense, base);
    assert.equal(calculateEffectiveDefense(wizard), base);
  });

  test("mirror: an enemy Ranger's death does not end our Ranger's -1", () => {
    const game = startBattle(gm, ['Ranger', 'Fighter', 'Cleric'], ['Fighter', 'Ranger', 'Wizard']);
    const { wizard, base } = piercingShot(game);
    const theirRanger = hero(game, 1, 'Ranger');
    theirRanger.currentHP = 1;
    gm.dealDamage(game, theirRanger, 5, hero(game, 0, 'Fighter'));
    assert.ok(theirRanger.currentHP <= 0, 'enemy Ranger died');

    assert.equal(wizard.statusEffects.statModifiers.Defense, -1);
    assert.equal(wizard.modifiedDefense, base - 1);
  });
});

describe('fix i: Vanish once per round, enemy damage only, the exception ends with the turn', () => {
  // Vanish reactions recorded anywhere in the structured battle log
  const vanishEntries = game => JSON.stringify(game.log).match(/"action":"Vanish"/g) || [];

  test('Vanish triggers once per round', () => {
    const game = startBattle(gm, ['Fighter', 'Wizard', 'Cleric'], ['Silencer', 'Ninja', 'Warden']);
    const ninja = hero(game, 1, 'Ninja');
    const fighter = hero(game, 0, 'Fighter');
    const wizard = hero(game, 0, 'Wizard');

    assert.equal(attack('p0', 'Ninja').success, true);
    assert.equal(ninja.statusEffects.untargetable, true);
    assert.equal(ninja.statusEffects.untargetableAttackerId, fighter.id);
    assert.equal(ninja.statusEffects.untargetableAttacker, 'Fighter', 'the live site reads the name');
    gm.endTurn('p0');
    gm.endTurn('p1');

    // The second enemy hits Ninja (Fireball reaches it) before Ninja's next turn
    const hpBefore = ninja.currentHP;
    gm.selectTarget('p0', 'Silencer');
    assert.equal(gm.useAbility('p0', 0, 'Silencer').success, true);
    assert.ok(ninja.currentHP < hpBefore, 'precondition: Fireball hit Ninja');
    assert.notEqual(ninja.statusEffects.untargetableAttackerId, wizard.id);
    assert.notEqual(ninja.statusEffects.untargetableAttacker, 'Wizard');
    assert.equal(vanishEntries(game).length, 1);
  });

  test('the hitter may Focus Ninja only until its turn ends', () => {
    // Brawler is p0's only living hero, so it acts again before Ninja (p1's third hero)
    const game = startBattle(gm, ['Brawler', 'Fighter', 'Cleric'], ['Silencer', 'Warden', 'Ninja']);
    hero(game, 0, 'Fighter').currentHP = 0;
    hero(game, 0, 'Cleric').currentHP = 0;
    const ninja = hero(game, 1, 'Ninja');

    assert.equal(attack('p0', 'Ninja').success, true);
    assert.equal(ninja.statusEffects.untargetable, true);
    const second = gm.basicAttack('p0', 'Ninja');
    assert.equal(second.success, true, second.error);
    assert.ok(ninja.currentHP > 0, 'precondition: Ninja survives both hits');
    gm.endTurn('p0');
    assert.equal(ninja.statusEffects.untargetableAttackerId, undefined);
    assert.equal(ninja.statusEffects.untargetableAttacker, undefined);
    assert.equal(ninja.statusEffects.untargetable, true, 'Ninja stays hidden until its turn');
    gm.endTurn('p1');

    assert.equal(gm.getCurrentTurnInfo(game).hero, hero(game, 0, 'Brawler'));
    assert.equal(gm.selectTarget('p0', 'Ninja').success, false);
  });

  test("Vanish can trigger again after Ninja's next turn starts", () => {
    const game = startBattle(gm, ['Fighter', 'Wizard', 'Cleric'], ['Silencer', 'Ninja', 'Warden']);
    const ninja = hero(game, 1, 'Ninja');
    assert.equal(attack('p0', 'Ninja').success, true);
    passTurnsUntil(game, ninja);
    assert.ok(!ninja.statusEffects.untargetable, 'Vanish ended at Ninja turn start');
    assert.ok(!ninja.statusEffects.vanishUsedThisRound);
    gm.endTurn('p1');

    assert.equal(attack('p0', 'Ninja').success, true);
    assert.equal(ninja.statusEffects.untargetable, true);
    assert.equal(ninja.statusEffects.untargetableAttackerId, hero(game, 0, 'Cleric').id);
    assert.equal(vanishEntries(game).length, 2);
  });

  test('ally damage does not trigger Vanish', () => {
    const game = startBattle(gm, ['Fighter', 'Cleric', 'Monk'], ['Mech', 'Ninja', 'Warden'], { firstPlayer: 1 });
    const ninja = hero(game, 1, 'Ninja');
    gm.selectTarget('p1', 'Fighter');
    assert.equal(gm.activateSpecial('p1').success, true);
    assert.ok(ninja.currentHP > 0 && ninja.currentHP < ninja.HP, 'precondition: Self Destruct hit Ninja');
    assert.ok(!ninja.statusEffects.untargetable);
    assert.ok(!ninja.statusEffects.vanishUsedThisRound);
  });

  test('area abilities still hit a Vanished Ninja', () => {
    const game = startBattle(gm, ['Fighter', 'Wizard', 'Cleric'], ['Silencer', 'Ninja', 'Warden']);
    const ninja = hero(game, 1, 'Ninja');
    assert.equal(attack('p0', 'Ninja').success, true);
    gm.endTurn('p0');
    gm.endTurn('p1');
    assert.equal(ninja.statusEffects.untargetable, true);

    const hpBefore = ninja.currentHP;
    gm.selectTarget('p0', 'Silencer');
    assert.equal(gm.useAbility('p0', 0, 'Silencer').success, true);
    assert.ok(ninja.currentHP < hpBefore);
  });

  test('mirror: both teams have Ninja; only the hit Ninja vanishes', () => {
    const game = startBattle(gm, ['Fighter', 'Ninja', 'Cleric'], ['Wizard', 'Ninja', 'Warden']);
    const ourNinja = hero(game, 0, 'Ninja');
    const theirNinja = hero(game, 1, 'Ninja');

    assert.equal(attack('p0', 'Ninja').success, true);
    assert.equal(theirNinja.statusEffects.untargetable, true);
    assert.equal(theirNinja.statusEffects.untargetableAttackerId, hero(game, 0, 'Fighter').id);
    assert.ok(!ourNinja.statusEffects.untargetable);
    gm.endTurn('p0');

    // Their Wizard's Fireball hits our Ninja: it vanishes on its own
    gm.selectTarget('p1', 'Fighter');
    assert.equal(gm.useAbility('p1', 0, 'Fighter').success, true);
    assert.equal(ourNinja.statusEffects.untargetable, true);
    assert.equal(ourNinja.statusEffects.untargetableAttackerId, hero(game, 1, 'Wizard').id);
    gm.endTurn('p1');

    // Our Ninja's turn start ends only our Ninja's Vanish
    assert.equal(gm.getCurrentTurnInfo(game).hero, ourNinja);
    assert.ok(!ourNinja.statusEffects.untargetable);
    assert.ok(!ourNinja.statusEffects.vanishUsedThisRound);
    assert.equal(theirNinja.statusEffects.untargetable, true);
    assert.equal(theirNinja.statusEffects.vanishUsedThisRound, true);
    assert.equal(gm.selectTarget('p0', 'Ninja').success, false);
  });
});

describe('fix k: Bribe, Health Link and Beast end when their source dies', () => {
  // A death hook straight after HP reaches 0, as dealDamage would call it
  const kill = (game, h) => {
    h.currentHP = 0;
    gm.updatePassiveEffectsOnDeath(game, h, null, 'damage');
  };

  test("Hoarder's death clears its Bribe", () => {
    const game = startBattle(gm, ['Hoarder', 'Fighter', 'Cleric'], ['Wizard', 'Fighter', 'Warden']);
    const hoarder = hero(game, 0, 'Hoarder');
    const wizard = hero(game, 1, 'Wizard');
    gm.selectTarget('p0', 'Wizard');
    assert.equal(gm.useAbility('p0', 0, 'Wizard').success, true);
    assert.equal(wizard.statusEffects.cannotTargetWithAbility?.ownerId, hoarder.id, 'precondition: Bribed');
    gm.dealDamage(game, hoarder, 99, hero(game, 1, 'Fighter'));
    assert.ok(hoarder.currentHP <= 0, 'precondition: Hoarder died');
    assert.equal(wizard.statusEffects.cannotTargetWithAbility, undefined);
  });

  test("Angel's death clears its Health Link", () => {
    // Damage to Angel reflects and spends the link, so the death hook is called without damage here
    const game = startBattle(gm, ['Angel', 'Fighter', 'Cleric'], ['Wizard', 'Fighter', 'Warden']);
    const angel = hero(game, 0, 'Angel');
    const wizard = hero(game, 1, 'Wizard');
    gm.selectTarget('p0', 'Wizard');
    assert.equal(gm.useAbility('p0', 0, 'Wizard').success, true);
    assert.equal(wizard.statusEffects.health_link?.sourceId, angel.id, 'precondition: linked');
    kill(game, angel);
    assert.equal(wizard.statusEffects.health_link, undefined);
  });

  test("Beast Tamer's death clears beast_active", () => {
    const game = startBattle(gm, ['Beast Tamer', 'Fighter', 'Cleric'], ['Wizard', 'Fighter', 'Warden']);
    const tamer = hero(game, 0, 'Beast Tamer');
    gm.selectTarget('p0', 'Wizard');
    assert.equal(gm.useAbility('p0', 0, 'Wizard').success, true);
    assert.equal(tamer.statusEffects.beast_active, true, 'precondition: Beast called');
    gm.dealDamage(game, tamer, 99, hero(game, 1, 'Fighter'));
    assert.ok(tamer.currentHP <= 0, 'precondition: Beast Tamer died');
    assert.equal(tamer.statusEffects.beast_active, false);
  });

  test("mirror: an enemy Hoarder's death does not clear our Hoarder's Bribe", () => {
    const game = startBattle(gm, ['Hoarder', 'Fighter', 'Cleric'], ['Hoarder', 'Wizard', 'Warden']);
    const ourHoarder = hero(game, 0, 'Hoarder');
    const wizard = hero(game, 1, 'Wizard');
    gm.selectTarget('p0', 'Wizard');
    assert.equal(gm.useAbility('p0', 0, 'Wizard').success, true);
    assert.equal(wizard.statusEffects.cannotTargetWithAbility?.ownerId, ourHoarder.id, 'precondition: Bribed');
    kill(game, hero(game, 1, 'Hoarder'));
    assert.equal(wizard.statusEffects.cannotTargetWithAbility?.ownerId, ourHoarder.id);
    kill(game, ourHoarder);
    assert.equal(wizard.statusEffects.cannotTargetWithAbility, undefined);
  });
});
