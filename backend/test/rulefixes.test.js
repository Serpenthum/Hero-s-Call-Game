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
