import { describe, expect, it } from 'vitest';
import type { GameState, Hero, Player } from '../types';
import {
  actionGate,
  actionLabel,
  attackGate,
  attackLabel,
  focusButtonState,
  readFocus,
  specialTargeting,
  tauntTargetFor,
  turnFocus,
  UNKNOWN_TARGETING,
  type AbilityTargeting,
  type Focus,
  type FocusButtonInput,
} from './focus';

const warlock: Focus = { name: 'Warlock', alive: true };
const fallen: Focus = { name: 'Warlock', alive: false };
const self: AbilityTargeting = { kind: 'self', damaging: false };
const all: AbilityTargeting = { kind: 'all', damaging: true };
const enemy: AbilityTargeting = { kind: 'enemy', damaging: true };

function hero(name: string, extra: Partial<Hero> = {}): Hero {
  return {
    name,
    HP: 12,
    Defense: 10,
    Accuracy: '+2',
    BasicAttack: '1D6',
    Ability: [],
    Special: [],
    ...extra,
  } as Hero;
}

function player(id: string, team: Hero[], extra: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    connected: true,
    team,
    attackOrder: team.map(h => h.name),
    currentHeroIndex: 0,
    hasUsedAttack: false,
    hasUsedAbility: false,
    ...extra,
  };
}

function taunted(name: string, by: string, extra: Partial<Hero> = {}): Hero {
  return hero(name, {
    statusEffects: { taunt: { target: by, duration: 1 } } as Hero['statusEffects'],
    ...extra,
  });
}

describe('targeting', () => {
  it('treats a missing entry as single-target damage', () => {
    expect(UNKNOWN_TARGETING).toEqual({ kind: 'enemy', damaging: true });
  });

  it('classifies specials as area effects, damaging only for activated_aoe', () => {
    expect(specialTargeting('activated_aoe')).toEqual({ kind: 'all', damaging: true });
    expect(specialTargeting('activated_aoe_heal')).toEqual({ kind: 'all', damaging: false });
    expect(specialTargeting(undefined)).toEqual({ kind: 'all', damaging: false });
  });
});

describe('gates and labels', () => {
  it('needs a focus before attacking', () => {
    expect(attackGate(null)).toEqual({ ok: false, reason: 'need-focus' });
    expect(attackLabel('Attack (1D6)', attackGate(null))).toBe('Attack (1D6)');
  });

  it('keeps the original attack label, adding (Target Dead) once the focus falls', () => {
    expect(attackGate(warlock)).toEqual({ ok: true });
    expect(attackLabel('Attack (1D6)', attackGate(warlock))).toBe('Attack (1D6)');
    expect(attackGate(fallen)).toEqual({ ok: false, reason: 'fallen' });
    expect(attackLabel('Attack (1D6)', attackGate(fallen))).toBe('Attack (1D6) (Target Dead)');
  });

  it('needs a focus before any ability, even a self ability', () => {
    expect(actionGate(self, null)).toEqual({ ok: false, reason: 'need-focus' });
    expect(actionLabel('Wildshape', actionGate(self, null))).toBe('Wildshape');
  });

  it('keeps self abilities after the focus falls', () => {
    expect(actionLabel('Wildshape', actionGate(self, fallen))).toBe('Wildshape');
  });

  it('keeps area attacks after the focus falls (owner ruling)', () => {
    expect(actionGate(all, fallen)).toEqual({ ok: true });
    expect(actionLabel('Fireball', actionGate(all, warlock))).toBe('Fireball');
    expect(actionLabel('Fireball', actionGate(all, fallen))).toBe('Fireball');
  });

  it('keeps plain ability names, and loses single-target ones once the focus falls', () => {
    expect(actionLabel('Poison Strike', actionGate(enemy, warlock))).toBe('Poison Strike');
    expect(actionGate(enemy, fallen)).toEqual({ ok: false, reason: 'fallen' });
    expect(actionLabel('Poison Strike', actionGate(enemy, fallen))).toBe('Poison Strike (Target Dead)');
  });

  it('keeps non-damaging enemy abilities after the focus falls', () => {
    const debuff: AbilityTargeting = { kind: 'enemy', damaging: false };
    expect(actionGate(debuff, fallen)).toEqual({ ok: true });
  });

  it('keeps every activated special after the focus falls, but needs a focus first', () => {
    expect(actionGate(specialTargeting('activated_aoe_heal'), fallen)).toEqual({ ok: true });
    expect(actionGate(specialTargeting('activated_aoe'), fallen)).toEqual({ ok: true }); // Self Destruct is an area attack
    expect(actionGate(specialTargeting('activated_aoe'), null)).toEqual({ ok: false, reason: 'need-focus' });
  });
});

describe('readFocus', () => {
  it('looks only at the defender team', () => {
    const attacker = player('p0', [hero('Warlock', { currentHP: 0 })], { selectedTarget: 'Warlock' });
    const defender = player('p1', [hero('Warlock', { currentHP: 7 })]);
    expect(readFocus(attacker, defender)).toEqual({ name: 'Warlock', alive: true });
  });

  it('reports a dead focus as fallen', () => {
    const attacker = player('p0', [], { selectedTarget: 'Warlock' });
    const defender = player('p1', [hero('Warlock', { currentHP: 0 })]);
    expect(readFocus(attacker, defender)).toEqual({ name: 'Warlock', alive: false });
  });

  it('is null without a focus, an attacker or a defender, or when the name is not on the defender team', () => {
    const defender = player('p1', [hero('Warlock')]);
    expect(readFocus(player('p0', []), defender)).toBeNull();
    expect(readFocus(undefined, defender)).toBeNull();
    expect(readFocus(player('p0', [], { selectedTarget: 'Warlock' }), null)).toBeNull();
    expect(readFocus(player('p0', [], { selectedTarget: 'Druid' }), defender)).toBeNull();
  });
});

describe('turnFocus', () => {
  it("resolves the active player's focus on the other team", () => {
    const p0 = player('p0', [hero('Druid')]);
    const p1 = player('p1', [hero('Paladin')], { selectedTarget: 'Druid' });
    const gameState = { players: [p0, p1], currentTurn: 1 } as unknown as GameState;
    expect(turnFocus(gameState)).toEqual({ focus: { name: 'Druid', alive: true }, defenderId: 'p0' });
  });

  it('is null without a focus', () => {
    const gameState = { players: [player('p0', [hero('Druid')]), player('p1', [])], currentTurn: 1 } as unknown as GameState;
    expect(turnFocus(gameState)).toBeNull();
  });
});

describe('tauntTargetFor', () => {
  it('returns the living taunter', () => {
    const opponent = player('p1', [hero('Paladin')]);
    expect(tauntTargetFor(taunted('Druid', 'Paladin'), opponent)).toBe('Paladin');
  });

  it('is null for a hero that ignores taunt', () => {
    const opponent = player('p1', [hero('Paladin')]);
    const barbarian = taunted('Barbarian', 'Paladin', {
      Special: [{ name: 'Rage', description: '', effects: [{ type: 'passive_modifier', effect: 'ignore_taunt' }] }],
    });
    expect(tauntTargetFor(barbarian, opponent)).toBeNull();
  });

  it('is null when the taunter is dead or the hero is not taunted', () => {
    expect(tauntTargetFor(taunted('Druid', 'Paladin'), player('p1', [hero('Paladin', { currentHP: 0 })]))).toBeNull();
    expect(tauntTargetFor(hero('Druid'), player('p1', [hero('Paladin')]))).toBeNull();
    expect(tauntTargetFor(taunted('Druid', 'Paladin'), null)).toBeNull();
  });
});

describe('focusButtonState', () => {
  const base: FocusButtonInput = {
    isMyTurn: true,
    isSpectating: false,
    inspected: { hero: hero('Warlock'), side: 'enemy' },
    focus: null,
    focusLocked: false,
    tauntTarget: null,
    activeHeroName: 'Druid',
  };

  it('offers to focus a living enemy', () => {
    expect(focusButtonState(base)).toEqual({ show: true, enabled: true, label: 'Focus Warlock' });
  });

  it('is hidden off turn, for spectators, for dead heroes and for allies', () => {
    expect(focusButtonState({ ...base, isMyTurn: false })).toEqual({ show: false });
    expect(focusButtonState({ ...base, isSpectating: true })).toEqual({ show: false });
    expect(focusButtonState({ ...base, inspected: { hero: hero('Warlock', { currentHP: 0 }), side: 'enemy' } })).toEqual({ show: false });
    expect(focusButtonState({ ...base, inspected: { hero: hero('Warlock'), side: 'ally' } })).toEqual({ show: false });
  });

  it('goes away once a focus is chosen (it is final)', () => {
    expect(focusButtonState({ ...base, focus: warlock, focusLocked: true })).toEqual({ show: false });
    expect(focusButtonState({ ...base, focus: { name: 'Shroomguard', alive: true }, focusLocked: true })).toEqual({ show: false });
    expect(focusButtonState({ ...base, focus: warlock })).toEqual({ show: false });
  });

  it(`a Vanished enemy shows "Can't be Focused"`, () => {
    const hidden = hero('Warlock', { statusEffects: { untargetable: true } as Hero['statusEffects'] });
    expect(focusButtonState({ ...base, inspected: { hero: hidden, side: 'enemy' } }))
      .toEqual({ show: true, enabled: false, label: "Can't be Focused" });
  });

  it('with untargetableAttackerId the matching active id may Focus', () => {
    // Mirror match: both teams have a Druid, only the one that hit the Ninja (id 1-0) may Focus it
    const marked = hero('Warlock', {
      statusEffects: { untargetable: true, untargetableAttacker: 'Druid', untargetableAttackerId: '1-0' } as Hero['statusEffects'],
    });
    const inspected = { hero: marked, side: 'enemy' as const };
    expect(focusButtonState({ ...base, inspected, activeHeroId: '1-0' }))
      .toEqual({ show: true, enabled: true, label: 'Focus Warlock' });
    expect(focusButtonState({ ...base, inspected, activeHeroId: '0-0' }))
      .toEqual({ show: true, enabled: false, label: "Can't be Focused" });
  });

  it('without untargetableAttackerId the name rule still works (old server)', () => {
    const marked = hero('Warlock', {
      statusEffects: { untargetable: true, untargetableAttacker: 'Druid' } as Hero['statusEffects'],
    });
    const inspected = { hero: marked, side: 'enemy' as const };
    expect(focusButtonState({ ...base, inspected, activeHeroId: '0-0' }))
      .toEqual({ show: true, enabled: true, label: 'Focus Warlock' });
    expect(focusButtonState({ ...base, inspected, activeHeroName: 'Paladin' }))
      .toEqual({ show: true, enabled: false, label: "Can't be Focused" });
  });

  it('points a taunted hero at its taunter', () => {
    expect(focusButtonState({ ...base, tauntTarget: 'Paladin' }))
      .toEqual({ show: true, enabled: false, label: 'Taunted: focus Paladin' });
    expect(focusButtonState({ ...base, inspected: { hero: hero('Paladin'), side: 'enemy' }, tauntTarget: 'Paladin' }))
      .toEqual({ show: true, enabled: true, label: 'Focus Paladin' });
  });

  it('lets a taunted hero focus its taunter even when the taunter is untargetable (the server forces it)', () => {
    const hidden = hero('Paladin', { statusEffects: { untargetable: true } as Hero['statusEffects'] });
    expect(focusButtonState({ ...base, inspected: { hero: hidden, side: 'enemy' }, tauntTarget: 'Paladin' }))
      .toEqual({ show: true, enabled: true, label: 'Focus Paladin' });
  });
});
