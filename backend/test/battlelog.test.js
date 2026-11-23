// The battle log as data: what each kind of action records.
const { test, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager, startBattle, hero, setD20, setRandom, resetDice } = require('./support/battle');

const FOES = ['Fighter', 'Swordsman', 'Brawler'];
let gm;
beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); });
afterEach(() => resetDice());

const attack = (pid, target) => { gm.selectTarget(pid, target); return gm.basicAttack(pid, target); };
const ability = (pid, target, index = 0, ally = null) => { gm.selectTarget(pid, target); return gm.useAbility(pid, index, target, ally); };
const last = game => game.log[game.log.length - 1];
const chips = row => row.chips.map(c => c.text);
const reaction = (entry, name) => entry.reactions.find(r => r.action === name);

describe('basic attacks', () => {
  test('a hit records the roll, the defense it had to beat, and the damage', () => {
    const game = startBattle(gm, ['Reaper', 'Fighter', 'Cleric'], FOES);
    const result = attack('p0', 'Swordsman');
    const entry = last(game);
    assert.equal(entry.action, 'Attack');
    assert.deepEqual(entry.actor, { name: 'Reaper', side: 0, slot: 0 });
    assert.deepEqual(entry.rows[0].target, { name: 'Swordsman', side: 1, slot: 1 });
    assert.deepEqual(entry.rows[0].roll, { d20: 15, mod: 2, total: 17, vs: 7, adv: null, rolls: null, why: null, auto: null });
    assert.equal(entry.rows[0].outcome, 'hit');
    assert.equal(entry.rows[0].amount, -5);
    assert.deepEqual(result.gameState.log, game.log, 'the result carries the log');
  });

  test('a miss has no amount', () => {
    const game = startBattle(gm, ['Reaper', 'Fighter', 'Swordsman'], FOES);
    setD20(2);
    attack('p0', 'Swordsman');
    assert.equal(last(game).rows[0].outcome, 'miss');
    assert.equal(last(game).rows[0].amount, null);
  });

  test('advantage names the special that gave it', () => {
    const game = startBattle(gm, ['Ranger', 'Fighter', 'Swordsman'], FOES);
    attack('p0', 'Swordsman');
    assert.equal(last(game).rows[0].roll.adv, 'advantage');
    assert.equal(last(game).rows[0].roll.why, 'Eagle Eye');
  });

  test('a bonus is explained next to the dice', () => {
    const game = startBattle(gm, ['Berserker', 'Fighter', 'Swordsman'], FOES);
    ability('p0', 'Swordsman');
    assert.deepEqual(chips(last(game).rows[0]), ['Stack 1/2']);
    attack('p0', 'Swordsman');
    assert.deepEqual(last(game).rows[0].parts, [{ label: 'Bloodbath', value: 1 }]);
  });

  test('a kill marks the row and lists who fell', () => {
    const game = startBattle(gm, ['Reaper', 'Fighter', 'Swordsman'], FOES);
    hero(game, 1, 'Swordsman').currentHP = 1;
    attack('p0', 'Swordsman');
    assert.equal(last(game).rows[0].killed, true);
    assert.deepEqual(last(game).falls.map(f => f.name), ['Swordsman']);
  });
});

describe('abilities', () => {
  test('a status the ability applies is a chip on its row', () => {
    const game = startBattle(gm, ['Assassin', 'Fighter', 'Swordsman'], FOES);
    ability('p0', 'Fighter');
    assert.deepEqual(chips(last(game).rows[0]), ['Poison 1']);
  });

  test('an area ability is one entry with a row per target', () => {
    const game = startBattle(gm, ['Wizard', 'Fighter', 'Swordsman'], FOES);
    ability('p0', 'Fighter');
    assert.equal(game.log.length, 1);
    assert.deepEqual(last(game).rows.map(r => r.target.name), FOES);
  });

  test('recoil and lifesteal show on the hero that used the ability', () => {
    let game = startBattle(gm, ['Barbarian', 'Fighter', 'Swordsman'], FOES);
    ability('p0', 'Swordsman');
    let self = last(game).rows.find(r => r.target.name === 'Barbarian');
    assert.equal(self.amount, -6);
    assert.deepEqual(chips(self), ['recoil']);

    game = startBattle(gm, ['Warlock', 'Fighter', 'Swordsman'], FOES);
    hero(game, 0, 'Warlock').currentHP = 5;
    ability('p0', 'Swordsman');
    self = last(game).rows.find(r => r.target.name === 'Warlock');
    assert.equal(self.amount, 4);
  });

  test('a heal on an ally is its own row', () => {
    const game = startBattle(gm, ['Paladin', 'Fighter', 'Swordsman'], FOES);
    hero(game, 0, 'Fighter').currentHP = 5;
    ability('p0', 'Swordsman');
    const healed = last(game).rows.find(r => r.target.name === 'Fighter' && r.target.side === 0);
    assert.equal(healed.amount, 3);
  });

  test('a self-buff reads as one row on the hero', () => {
    const game = startBattle(gm, ['Druid', 'Fighter', 'Swordsman'], FOES);
    hero(game, 0, 'Druid').currentHP = 10;
    ability('p0', 'Swordsman');
    assert.equal(last(game).rows.length, 1);
    assert.equal(last(game).rows[0].amount, 3);
    assert.equal(last(game).rows[0].target.name, 'Druid');
  });

  test('a summon is a note with the count', () => {
    const game = startBattle(gm, ['Engineer', 'Fighter', 'Swordsman'], FOES);
    ability('p0', 'Swordsman');
    assert.equal(last(game).note, 'Turrets 1/2');
  });

  test('in a mirror match the row names the enemy copy', () => {
    const game = startBattle(gm, ['Fighter', 'Swordsman', 'Brawler'], ['Swordsman', 'Fighter', 'Brawler']);
    ability('p0', 'Fighter');
    assert.ok(last(game).rows.every(r => r.target.side === 1));
    assert.ok(last(game).rows.every(r => r.amount === -4));
  });

  test("an ally ordered by Timekeeper gets its own entry", () => {
    const game = startBattle(gm, ['Timekeeper', 'Fighter', 'Swordsman'], FOES);
    ability('p0', 'Swordsman', 0, 'Fighter');
    const [order, act] = game.log;
    assert.equal(order.action, 'Chrono Shift');
    assert.equal(act.actor.name, 'Fighter');
    assert.equal(act.note, 'ordered by Timekeeper');
    assert.equal(act.rows[0].roll.auto, 'Auto-hit');
  });
});

describe('reactions', () => {
  test('specials that answer a basic attack are recorded', () => {
    let game = startBattle(gm, ['Ninja', 'Fighter', 'Swordsman'], FOES, { firstPlayer: 1 });
    attack('p1', 'Ninja');
    assert.ok(reaction(last(game), 'Vanish'));

    game = startBattle(gm, ['Warden', 'Fighter', 'Swordsman'], FOES, { firstPlayer: 1 });
    setD20(2);
    attack('p1', 'Warden');
    assert.equal(reaction(last(game), 'Shield Bash').rows[0].amount, -4);
  });

  test('a blocked hit reads as blocked', () => {
    const game = startBattle(gm, ['Wizard', 'Fighter', 'Swordsman'], ['Brawler', 'Swordsman', 'Fighter'], { firstPlayer: 1 });
    setRandom(0.99);
    attack('p1', 'Wizard');
    assert.equal(last(game).rows[0].outcome, 'blocked');
    assert.ok(reaction(last(game), 'Arcane Shield'));
  });

  test('a deflected ability reads as deflected, with the counter', () => {
    const game = startBattle(gm, ['Wizard', 'Monk', 'Swordsman'], FOES, { firstPlayer: 1 });
    setD20(5);
    ability('p1', 'Wizard');
    assert.equal(last(game).rows[0].outcome, 'deflected');
    assert.equal(reaction(last(game), 'Deflect').rows[0].amount, -3);
  });

  test('Health Link passes damage on', () => {
    const game = startBattle(gm, ['Angel', 'Fighter', 'Swordsman'], FOES);
    ability('p0', 'Swordsman');
    assert.deepEqual(chips(last(game).rows[0]), ['Linked']);
    gm.endTurn('p0');
    attack('p1', 'Angel');
    assert.equal(reaction(last(game), 'Health Link').rows[0].amount, -4);
  });

  test('Resurrect is recorded once and never again', () => {
    const game = startBattle(gm, ['Fighter', 'Angel', 'Swordsman'], FOES, { firstPlayer: 1 });
    hero(game, 0, 'Fighter').currentHP = 1;
    attack('p1', 'Fighter');
    assert.ok(reaction(last(game), 'Resurrect'));
    assert.deepEqual(last(game).falls, []);
    gm.endTurn('p1');
    attack('p0', 'Brawler');
    assert.equal(game.log.filter(e => reaction(e, 'Resurrect')).length, 1);
  });

  test('silent passives are recorded when they change', () => {
    let game = startBattle(gm, ['Dragon Rider', 'Fighter', 'Swordsman'], FOES, { firstPlayer: 1 });
    hero(game, 0, 'Dragon Rider').currentHP = 10;
    attack('p1', 'Dragon Rider');
    assert.ok(reaction(last(game), 'Dismount'));

    game = startBattle(gm, ['Fighter', 'Hoarder', 'Champion'], FOES, { firstPlayer: 1 });
    hero(game, 0, 'Fighter').currentHP = 1;
    attack('p1', 'Fighter');
    assert.ok(reaction(last(game), 'Collect Weapons'));
    assert.ok(reaction(last(game), 'Last Stand'));
  });

  test("Bomber's Explosion names Bomber once", () => {
    const game = startBattle(gm, ['Bomber', 'Fighter', 'Swordsman'], FOES, { firstPlayer: 1 });
    hero(game, 0, 'Bomber').currentHP = 1;
    attack('p1', 'Bomber');
    const boom = reaction(last(game), 'Explosion');
    assert.equal(boom.actor.name, 'Bomber');
    assert.equal(boom.rows[0].amount, -4);
  });
});

describe('turn changes', () => {
  test('end-of-turn effects are entries of their own', () => {
    const game = startBattle(gm, ['Druid', 'Fighter', 'Swordsman'], FOES);
    hero(game, 0, 'Fighter').currentHP = 5;
    gm.endTurn('p0');
    assert.equal(last(game).action, 'Healing Word');
    assert.equal(last(game).when, 'end');
    assert.equal(last(game).rows[0].amount, 3);
  });

  test('poison ticks name the poisoned hero', () => {
    const game = startBattle(gm, ['Assassin', 'Fighter', 'Swordsman'], FOES);
    ability('p0', 'Fighter');
    gm.endTurn('p0');
    gm.endTurn('p1');
    const tick = game.log.find(e => e.action === 'Poison');
    assert.equal(tick.actor.name, 'Fighter');
    assert.equal(tick.rows[0].amount, -1);
  });

  test('a turn with nothing to report adds nothing, and the turn number moves on', () => {
    const game = startBattle(gm, ['Reaper', 'Fighter', 'Swordsman'], FOES);
    attack('p0', 'Swordsman');
    gm.endTurn('p0');
    assert.equal(game.log.length, 1);
    attack('p1', 'Reaper');
    assert.equal(game.log[0].turn.n, 0);
    assert.equal(game.log[1].turn.n, 1);
    assert.equal(game.log[1].turn.side, 1);
  });

  test('a hero that dies from its own recoil is logged before the turn it ends', () => {
    const game = startBattle(gm, ['Blood Hunter', 'Fighter', 'Swordsman'], FOES);
    hero(game, 0, 'Blood Hunter').currentHP = 2;
    ability('p0', 'Swordsman');
    assert.equal(game.log[0].action, 'Crimson Rite');
    assert.deepEqual(game.log[0].falls.map(f => f.name), ['Blood Hunter']);
    assert.deepEqual(game.log.map(e => e.id).sort((a, b) => a - b), game.log.map((e, i) => i + 1));
  });
});

describe('activated specials', () => {
  test('Self Destruct is one entry and Mech appears once', () => {
    const game = startBattle(gm, ['Mech', 'Fighter', 'Swordsman'], FOES);
    gm.selectTarget('p0', 'Swordsman');
    gm.activateSpecial('p0');
    const entry = game.log[0];
    assert.equal(entry.action, 'Self Destruct');
    assert.equal(entry.actor.name, 'Mech');
    assert.equal(entry.rows.filter(r => r.target.name === 'Mech').length, 1);
    assert.equal(entry.rows.length, 6);
  });

  test('Peace Treaty heals everyone in one entry', () => {
    const game = startBattle(gm, ['Diplomat', 'Fighter', 'Swordsman'], FOES);
    game.players.forEach(p => p.team.forEach(h => { h.currentHP = 5; }));
    gm.selectTarget('p0', 'Swordsman');
    gm.activateSpecial('p0');
    assert.equal(game.log.length, 1);
    assert.equal(game.log[0].action, 'Peace Treaty');
    assert.ok(game.log[0].rows.length === 6 && game.log[0].rows.every(r => r.amount === 8));
  });
});
