// Battle Focus: a hero must focus an enemy before acting; the focus locks as soon as it is chosen.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeManager, startBattle, hero, setD20, setRandom, resetDice, select } = require('./support/battle');
const { classifyAbility } = require('../abilityTargeting');
const heroList = require('../heros.json');

const ENEMIES = ['Warlock', 'Shroomguard', 'Plague Spreader'];
let gm;

beforeEach(() => { gm = makeManager(); setD20(15); setRandom(0.5); });
afterEach(resetDice);

// The named hero acts first for p0, with Fighter and Cleric behind it.
function battle(first, enemies = ENEMIES) {
  return startBattle(gm, [first, 'Fighter', 'Cleric'], enemies);
}

function killFocus(game) {
  hero(game, 1, 'Warlock').currentHP = 1;
  setD20(20);
  select(gm, 'p0', 'Warlock');
  const result = gm.basicAttack('p0', 'Warlock');
  assert.equal(result.success, true, result.error);
  assert.ok(hero(game, 1, 'Warlock').currentHP <= 0, 'the focus fell');
}

const FALLEN = { success: false, error: 'Your focused target has fallen' };
const pick = (r) => ({ success: r.success, error: r.error });

test('classifyAbility matches the design table', () => {
  const self = { kind: 'self', damaging: false };
  const all = { kind: 'all', damaging: true };
  const enemy = { kind: 'enemy', damaging: true };
  const selfAbilities = ['Druid', 'Champion', 'Berserker', 'Engineer', 'Medic'];
  const allAbilities = ['Wizard', 'Bomber'];

  for (const h of heroList) {
    if (h.disabled) continue;
    const caster = { name: h.name, statusEffects: {} };
    for (const ability of h.Ability || []) {
      let expected = enemy;
      if (selfAbilities.includes(h.name)) expected = self;
      if (allAbilities.includes(h.name)) expected = all;
      if (h.name === 'Beast Tamer') expected = self;
      assert.deepEqual(classifyAbility(ability, caster), expected, `${h.name} / ${ability.name}`);
    }
  }

  const tamer = heroList.find(h => h.name === 'Beast Tamer');
  assert.deepEqual(classifyAbility(tamer.Ability[0], { name: 'Beast Tamer', statusEffects: { beast_active: false } }), self);
  assert.deepEqual(classifyAbility(tamer.Ability[0], { name: 'Beast Tamer', statusEffects: { beast_active: true } }), enemy);
});

test('every action needs a focus', () => {
  const cases = [
    ['Barbarian', (g) => gm.basicAttack('p0', 'Warlock')],
    ['Barbarian', (g) => gm.useAbility('p0', 0, 'Warlock')],
    ['Druid', (g) => gm.useAbility('p0', 0, 'Warlock')],
    ['Berserker', (g) => gm.useAbility('p0', 0, 'Warlock')],
    ['Wizard', (g) => gm.useAbility('p0', 0, 'Warlock')],
    ['Beast Tamer', (g) => gm.useAbility('p0', 0, 'Warlock')],
    ['Mech', (g) => gm.activateSpecial('p0')],
    ['Diplomat', (g) => gm.activateSpecial('p0')],
    ['Timekeeper', (g) => gm.useTimekeeperSelectedAbility('p0', 'Warlock', 'Fighter', 0)]
  ];
  for (const [name, act] of cases) {
    gm = makeManager();
    const game = battle(name);
    const result = act(game);
    assert.deepEqual(pick(result), { success: false, error: 'Focus an enemy first' }, name);
    assert.equal(!!game.players[0].focusLocked, false, name);
  }
});

test('focus locks when chosen', () => {
  const game = battle('Barbarian');
  select(gm, 'p0', 'Warlock');
  assert.equal(game.players[0].focusLocked, true);
  assert.deepEqual(pick(gm.selectTarget('p0', 'Shroomguard')), { success: false, error: 'Focus is locked for this turn' });
  assert.equal(game.players[0].selectedTarget, 'Warlock');
});

test('a taunt forces the focus, and locks it', () => {
  const game = battle('Fighter');
  hero(game, 0, 'Fighter').statusEffects.taunt = { target: 'Shroomguard', duration: 1 };
  const result = gm.selectTarget('p0', 'Warlock');
  assert.equal(result.success, true, result.error);
  assert.equal(result.forced, true);
  assert.equal(game.players[0].selectedTarget, 'Shroomguard');
  assert.equal(game.players[0].focusLocked, true);
  assert.deepEqual(pick(gm.selectTarget('p0', 'Shroomguard')), { success: false, error: 'Focus is locked for this turn' });
});

test('focus stays locked after the first action', () => {
  const locked = { success: false, error: 'Focus is locked for this turn' };
  const actions = [
    ['Barbarian', () => gm.basicAttack('p0', 'Shroomguard')],
    ['Barbarian', () => gm.useAbility('p0', 0, 'Shroomguard')],
    ['Diplomat', () => gm.activateSpecial('p0')]
  ];
  for (const [name, act] of actions) {
    gm = makeManager();
    const game = battle(name);
    select(gm, 'p0', 'Shroomguard');
    const result = act();
    assert.equal(result.success, true, `${name}: ${result.error}`);
    assert.equal(gm.getCurrentTurnInfo(game).player.id, 'p0', `${name}: still p0's turn`);
    assert.equal(game.players[0].focusLocked, true, name);
    assert.deepEqual(pick(gm.selectTarget('p0', 'Warlock')), locked, name);
    assert.equal(game.players[0].selectedTarget, 'Shroomguard', name);
  }
});

test('Mech Self Destruct ends the turn and clears its focus', () => {
  const game = battle('Mech');
  select(gm, 'p0', 'Shroomguard');
  assert.equal(gm.activateSpecial('p0').success, true);
  // The Mech died, so p1 now acts; p0's stale focus must not be broadcast during p1's turn
  assert.equal(game.phase, 'battle');
  assert.equal(gm.getCurrentTurnInfo(game).player.id, 'p1');
  assert.equal(game.players[0].selectedTarget, null);
  assert.equal(game.players[0].focusLocked, false);
  assert.equal(game.players[1].focusLocked, false);
  const state = gm.getFullGameState(game);
  assert.equal(state.players[0].selectedTarget, null);
  assert.equal(state.players[0].focusLocked, false);
});

test('single-target damaging actions are lost when the focus falls', () => {
  let game = battle('Barbarian');
  killFocus(game);
  assert.deepEqual(pick(gm.useAbility('p0', 0, 'Warlock')), FALLEN, 'Barbarian ability');

  // Cleave hits the focus and splashes a neighbour: still lost with the focus
  gm = makeManager();
  game = startBattle(gm, ['Fighter', 'Wizard', 'Cleric'], ENEMIES);
  killFocus(game);
  assert.deepEqual(pick(gm.useAbility('p0', 0, 'Warlock')), FALLEN, 'Cleave');

  gm = makeManager();
  game = battle('Timekeeper');
  killFocus(game);
  assert.deepEqual(pick(gm.useAbility('p0', 0, 'Warlock', 'Fighter')), FALLEN, 'Chrono Shift');
  assert.deepEqual(pick(gm.useTimekeeperSelectedAbility('p0', 'Warlock', 'Fighter', 0)), FALLEN, 'Chrono Shift pick');
});

test('a silenced hero with a fallen focus is told it is silenced', () => {
  const game = battle('Barbarian');
  killFocus(game);
  hero(game, 0, 'Barbarian').statusEffects.silenced = true;
  assert.deepEqual(pick(gm.useAbility('p0', 0, 'Warlock')),
    { success: false, error: 'Hero is silenced and cannot use abilities' });
});

test('self, area and special actions survive a fallen focus', () => {
  let game = battle('Druid');
  hero(game, 0, 'Druid').currentHP = 5;
  killFocus(game);
  let result = gm.useAbility('p0', 0, 'Warlock');
  assert.equal(result.success, true, result.error);
  assert.ok(hero(game, 0, 'Druid').currentHP > 5);

  gm = makeManager();
  game = battle('Berserker');
  killFocus(game);
  result = gm.useAbility('p0', 0, 'Warlock');
  assert.equal(result.success, true, result.error);

  gm = makeManager();
  game = battle('Diplomat');
  killFocus(game);
  result = gm.activateSpecial('p0');
  assert.equal(result.success, true, result.error);

  gm = makeManager();
  game = battle('Beast Tamer');
  killFocus(game);
  result = gm.useAbility('p0', 0, 'Warlock');
  assert.equal(result.success, true, result.error);
  assert.equal(hero(game, 0, 'Beast Tamer').statusEffects.beast_active, true);

  // Area attacks still go off: Fireball and Self Destruct hit the enemies left standing
  gm = makeManager();
  game = battle('Wizard');
  killFocus(game);
  result = gm.useAbility('p0', 0, 'Warlock');
  assert.equal(result.success, true, result.error);
  assert.equal(result.target, 'All Enemies');

  gm = makeManager();
  game = battle('Mech');
  killFocus(game);
  result = gm.activateSpecial('p0');
  assert.equal(result.success, true, result.error);
});

test('Chrono Shift pick is made once, and only after Chrono Shift', () => {
  const game = startBattle(gm, ['Timekeeper', 'Blood Hunter', 'Cleric'], ENEMIES);
  const warlock = hero(game, 1, 'Warlock');
  warlock.HP = 200;
  warlock.currentHP = 200;
  select(gm, 'p0', 'Warlock');
  const none = { success: false, error: 'No Chrono Shift pick is pending' };
  assert.deepEqual(pick(gm.useTimekeeperSelectedAbility('p0', 'Warlock', 'Blood Hunter', 0)), none, 'no Chrono Shift yet');

  setD20(20);
  const shift = gm.useAbility('p0', 0, 'Warlock', 'Blood Hunter');
  assert.equal(shift.success, true, shift.error);
  assert.ok(shift.results.some(r => r.type === 'ability_selection_required'), 'Blood Hunter has two abilities to pick from');

  assert.deepEqual(pick(gm.useTimekeeperSelectedAbility('p0', 'Warlock', 'Cleric', 0)), none, 'a different ally');
  const first = gm.useTimekeeperSelectedAbility('p0', 'Warlock', 'Blood Hunter', 0);
  assert.equal(first.success, true, first.error);
  assert.deepEqual(pick(gm.useTimekeeperSelectedAbility('p0', 'Warlock', 'Blood Hunter', 1)), none, 'a second pick');
});

test('a revived focus is still focused', () => {
  const game = startBattle(gm, ['Barbarian', 'Fighter', 'Cleric'], ['Fighter', 'Angel', 'Cleric']);
  const fighter = hero(game, 1, 'Fighter');
  fighter.currentHP = 1;
  setD20(20);
  select(gm, 'p0', 'Fighter');
  assert.equal(gm.basicAttack('p0', 'Fighter').success, true);
  assert.ok(fighter.currentHP > 0);
  assert.equal(fighter.resurrected, true);
  assert.equal(game.players[0].selectedTarget, 'Fighter');
  assert.equal(gm.isFocusFallen(game, game.players[0]), false);
  const result = gm.useAbility('p0', 0, 'Fighter');
  assert.equal(result.success, true, result.error);
});

test('untargetable enemies cannot be focused', () => {
  const game = battle('Barbarian');
  hero(game, 1, 'Warlock').statusEffects.untargetable = true;
  assert.deepEqual(pick(gm.selectTarget('p0', 'Warlock')), { success: false, error: "Can't be targeted" });
  assert.equal(game.players[0].selectedTarget, null);
});

test('the hero that triggered a Vanish can still focus it', () => {
  const game = battle('Barbarian');
  const warlock = hero(game, 1, 'Warlock');
  warlock.statusEffects.untargetable = true;
  warlock.statusEffects.untargetableAttacker = 'Barbarian';
  const result = gm.selectTarget('p0', 'Warlock');
  assert.equal(result.success, true, result.error);
  assert.equal(game.players[0].selectedTarget, 'Warlock');
});

test('no focusable enemy leaves no actions', () => {
  const game = battle('Barbarian');
  assert.equal(gm.hasNoActionsLeft(game), false);
  for (const name of ENEMIES) hero(game, 1, name).statusEffects.untargetable = true;
  assert.equal(gm.hasNoActionsLeft(game), true);
});

test('hasNoActionsLeft after the focus falls', () => {
  let game = battle('Barbarian');
  killFocus(game);
  assert.equal(gm.hasNoActionsLeft(game), true, 'Barbarian has only damaging actions left');

  gm = makeManager();
  game = battle('Druid');
  killFocus(game);
  assert.equal(gm.hasNoActionsLeft(game), false, 'Druid can still Wildshape');
  assert.equal(gm.useAbility('p0', 0, 'Warlock').success, true);
  assert.equal(gm.hasNoActionsLeft(game), true);

  gm = makeManager();
  game = battle('Wizard');
  killFocus(game);
  assert.equal(gm.hasNoActionsLeft(game), false, 'Wizard can still Fireball');
  assert.equal(gm.useAbility('p0', 0, 'Warlock').success, true);
  assert.equal(gm.hasNoActionsLeft(game), true);

  gm = makeManager();
  game = battle('Mech');
  killFocus(game);
  assert.equal(gm.hasNoActionsLeft(game), false, 'Mech can still Self Destruct');
});

test('focus lock resets at turn change', () => {
  const game = battle('Barbarian');
  select(gm, 'p0', 'Shroomguard');
  assert.equal(gm.basicAttack('p0', 'Shroomguard').success, true);
  assert.equal(gm.endTurn('p0').success, true);
  assert.equal(game.players[0].focusLocked, false);
  assert.equal(game.players[0].selectedTarget, null);
  select(gm, 'p1', 'Barbarian');
  assert.equal(game.players[1].selectedTarget, 'Barbarian');
});

test('focus lock survives rekeyPlayer', () => {
  const game = battle('Barbarian');
  select(gm, 'p0', 'Shroomguard');
  assert.equal(gm.basicAttack('p0', 'Shroomguard').success, true);
  gm.rekeyPlayer(game, 'p0', 'p0b');
  assert.deepEqual(pick(gm.selectTarget('p0b', 'Warlock')), { success: false, error: 'Focus is locked for this turn' });
  assert.equal(game.players[0].selectedTarget, 'Shroomguard');
  assert.equal(gm.getFullGameState(game).players[0].focusLocked, true);
});

test('game state carries focus and targeting', () => {
  const game = battle('Barbarian');
  select(gm, 'p0', 'Warlock');
  let state = gm.getFullGameState(game);
  assert.equal(state.players[0].selectedTarget, 'Warlock');
  assert.deepEqual(state.activeHero.abilityTargeting, [{ kind: 'enemy', damaging: true }]);
  assert.equal(state.players[0].focusLocked, true, 'locked when chosen');
  assert.equal(gm.basicAttack('p0', 'Warlock').success, true);
  state = gm.getFullGameState(game);
  assert.equal(state.players[0].focusLocked, true);
});

test('focusedHero looks only at the enemy team', () => {
  const game = startBattle(gm, ['Barbarian', 'Fighter', 'Cleric'], ['Fighter', 'Angel', 'Cleric']);
  select(gm, 'p0', 'Fighter');
  assert.equal(gm.focusedHero(game, game.players[0]), hero(game, 1, 'Fighter'));
});

test('a bribed hero that kills the Hoarder can still use an area ability', () => {
  const game = battle('Wizard', ['Hoarder', 'Shroomguard', 'Plague Spreader']);
  const hoarder = hero(game, 1, 'Hoarder');
  hero(game, 0, 'Wizard').statusEffects.cannotTargetWithAbility = { owner: 'Hoarder', ownerId: hoarder.id, duration: 1, source: 'Hoarder' };
  select(gm, 'p0', 'Hoarder');
  // While the Hoarder stands, the bribe blocks Fireball
  assert.deepEqual(pick(gm.useAbility('p0', 0, 'Hoarder')), { success: false, error: 'Cannot use abilities against Hoarder (Bribed)' });
  hoarder.currentHP = 1;
  setD20(20);
  assert.equal(gm.basicAttack('p0', 'Hoarder').success, true);
  assert.ok(hoarder.currentHP <= 0, 'the Hoarder fell');
  const result = gm.useAbility('p0', 0, 'Hoarder');
  assert.equal(result.success, true, result.error);
});
