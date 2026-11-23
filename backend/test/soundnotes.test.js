// Sound notes: the battle event names commanded allies, turret shots and triggered specials so the
// client can play the right sound for each. Purely additive: these tests only read the event.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager, startBattle, hero, setD20, setRandom, resetDice, select } = require('./support/battle');
const { snapshotBattle, buildBattleEvent, noteSound } = require('../battleEvents');

const ENEMIES = ['Barbarian', 'Fighter', 'Cleric'];
let gm;

beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); });
afterEach(resetDice);

// Runs one action the way withBattleEvent does and returns the built event.
function act(game, kind, run) {
  game.soundNotes = [];
  const before = snapshotBattle(game);
  const result = run();
  assert.equal(result.success, true, result.error);
  return buildBattleEvent(before, game, { kind, actorPlayerId: 'p0', actorHeroIndex: 0 });
}

test('Declare War lists both adjacent allies in order with hit and crit', () => {
  const game = startBattle(gm, ['Ranger', 'Diplomat', 'Monk'], ENEMIES);
  game.playerHeroIndex[0] = 1; // the Diplomat acts
  hero(game, 0, 'Diplomat').statusEffects.silenced = false;
  setD20(20);
  select(gm, 'p0', 'Barbarian');
  const event = act(game, 'ability', () => gm.useAbility('p0', 0, 'Barbarian'));
  assert.deepEqual(event.commands.map(c => c.name), ['Ranger', 'Monk']);
  assert.deepEqual(event.commands.map(c => c.kind), ['attack', 'attack']);
  assert.deepEqual(event.commands.map(c => c.key), ['p0:0', 'p0:2']);
  event.commands.forEach(c => {
    assert.equal(c.hit, true);
    assert.equal(c.crit, true);
    assert.equal('abilityName' in c, false);
  });
});

test('Declare War records a commanded miss as hit false', () => {
  const game = startBattle(gm, ['Ranger', 'Diplomat', 'Monk'], ENEMIES);
  game.playerHeroIndex[0] = 1;
  hero(game, 0, 'Diplomat').statusEffects.silenced = false;
  select(gm, 'p0', 'Barbarian');
  setD20(1);
  const event = act(game, 'ability', () => gm.useAbility('p0', 0, 'Barbarian'));
  assert.deepEqual(event.commands.map(c => [c.name, c.hit, c.crit]), [['Ranger', false, false], ['Monk', false, false]]);
});

test('Chrono Shift lists the commanded ally ability', () => {
  const game = startBattle(gm, ['Timekeeper', 'Ranger', 'Cleric'], ENEMIES);
  setD20(18);
  select(gm, 'p0', 'Barbarian');
  const event = act(game, 'ability', () => gm.useAbility('p0', 0, 'Barbarian', 'Ranger'));
  assert.equal(event.commands.length, 1);
  const [command] = event.commands;
  assert.equal(command.name, 'Ranger');
  assert.equal(command.key, 'p0:1');
  assert.equal(command.kind, 'ability');
  assert.equal(command.abilityName, 'Piercing Shot');
  assert.equal(command.hit, true);
  assert.equal(command.crit, false);
});

test('turret damage at end of turn is in turretKeys', () => {
  const game = startBattle(gm, ['Engineer', 'Ranger', 'Cleric'], ENEMIES);
  hero(game, 0, 'Engineer').statusEffects.turret_count = 1;
  setRandom(0); // the turret picks the first enemy
  const event = act(game, 'tick', () => gm.endTurn('p0'));
  assert.deepEqual(event.turretKeys, ['p1:0']);
});

test('Bomber death explosion is a trigger', () => {
  const game = startBattle(gm, ['Barbarian', 'Ranger', 'Cleric'], ['Bomber', 'Fighter', 'Cleric']);
  hero(game, 1, 'Bomber').currentHP = 1;
  setD20(18);
  select(gm, 'p0', 'Bomber');
  const event = act(game, 'attack', () => gm.basicAttack('p0', 'Bomber'));
  assert.deepEqual(event.triggers, [{ key: 'p1:0', name: 'Bomber', special: 'Explosion' }]);
});

test('Angel resurrection is a trigger', () => {
  const game = startBattle(gm, ['Barbarian', 'Ranger', 'Cleric'], ['Fighter', 'Angel', 'Cleric']);
  hero(game, 1, 'Fighter').currentHP = 1;
  setD20(18);
  select(gm, 'p0', 'Fighter');
  const event = act(game, 'attack', () => gm.basicAttack('p0', 'Fighter'));
  assert.deepEqual(event.triggers, [{ key: 'p1:1', name: 'Angel', special: 'Resurrect' }]);
});

test('Twin Spell recast is a trigger', () => {
  const game = startBattle(gm, ['Sorcerer', 'Ranger', 'Cleric'], ENEMIES);
  setD20(18); // Chromatic Orb hits, which grants the recast
  select(gm, 'p0', 'Barbarian');
  const event = act(game, 'ability', () => gm.useAbility('p0', 0, 'Barbarian'));
  assert.deepEqual(event.triggers, [{ key: 'p0:0', name: 'Sorcerer', special: 'Twin Spell' }]);
});

test('a plain attack has no commands, triggers or turretKeys fields', () => {
  const game = startBattle(gm, ['Barbarian', 'Ranger', 'Cleric'], ENEMIES);
  select(gm, 'p0', 'Fighter');
  const event = act(game, 'attack', () => gm.basicAttack('p0', 'Fighter'));
  assert.equal('commands' in event, false);
  assert.equal('triggers' in event, false);
  assert.equal('turretKeys' in event, false);
});

test('noteSound is a no-op without a soundNotes list', () => {
  const game = startBattle(gm, ['Barbarian', 'Ranger', 'Cleric'], ENEMIES);
  delete game.soundNotes;
  noteSound(game, { type: 'turret', targetHero: hero(game, 1, 'Fighter'), targetPlayerId: 'p1' });
  assert.equal(game.soundNotes, undefined);
  noteSound(null, { type: 'turret' }); // never throws
});

test('the event carries actor.name and abilityName when given', () => {
  const game = startBattle(gm, ['Barbarian', 'Ranger', 'Cleric'], ENEMIES);
  const before = snapshotBattle(game);
  const withName = buildBattleEvent(before, game, { kind: 'ability', actorPlayerId: 'p0', actorHeroIndex: 0, actorName: 'Barbarian', abilityName: 'Reckless Swing' });
  assert.equal(withName.actor.name, 'Barbarian');
  assert.equal(withName.abilityName, 'Reckless Swing');
  const plain = buildBattleEvent(before, game, { kind: 'attack', actorPlayerId: 'p0', actorHeroIndex: 0 });
  assert.equal('name' in plain.actor, false);
  assert.equal('abilityName' in plain, false);
});
