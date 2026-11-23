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
