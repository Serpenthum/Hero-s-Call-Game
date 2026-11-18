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
    expect(attackLabel(null, attackGate(null))).toBe('Focus an enemy first');
  });

  it('names the focus on the attack, and says when it has fallen', () => {
    expect(attackGate(warlock)).toEqual({ ok: true });
    expect(attackLabel(warlock, attackGate(warlock))).toBe('Attack Warlock');
    expect(attackGate(fallen)).toEqual({ ok: false, reason: 'fallen' });
    expect(attackLabel(fallen, attackGate(fallen))).toBe('Warlock has fallen');
  });

  it('needs a focus before any ability, even a self ability', () => {
    expect(actionGate(self, null)).toEqual({ ok: false, reason: 'need-focus' });
    expect(actionLabel('Wildshape', self, null, actionGate(self, null))).toBe('Focus an enemy first');
  });

  it('keeps self abilities after the focus falls', () => {
    expect(actionLabel('Wildshape', self, fallen, actionGate(self, fallen))).toBe('Wildshape');
  });

  it('keeps area attacks after the focus falls (owner ruling)', () => {
    expect(actionGate(all, fallen)).toEqual({ ok: true });
    expect(actionLabel('Fireball', all, warlock, actionGate(all, warlock))).toBe('Fireball');
    expect(actionLabel('Fireball', all, fallen, actionGate(all, fallen))).toBe('Fireball');
  });

  it('names the focus on single-target abilities and loses them once it falls', () => {
    expect(actionLabel('Poison Strike', enemy, warlock, actionGate(enemy, warlock))).toBe('Poison Strike on Warlock');
    expect(actionGate(enemy, fallen)).toEqual({ ok: false, reason: 'fallen' });
    expect(actionLabel('Poison Strike', enemy, fallen, actionGate(enemy, fallen))).toBe('Warlock has fallen');
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

  it('says Focused on the current focus', () => {
    expect(focusButtonState({ ...base, focus: warlock })).toEqual({ show: true, enabled: false, label: 'Focused' });
  });

  it('says Focus locked once the focus is locked on another enemy', () => {
    expect(focusButtonState({ ...base, focus: { name: 'Shroomguard', alive: true }, focusLocked: true }))
      .toEqual({ show: true, enabled: false, label: 'Focus locked' });
  });

  it("refuses an untargetable enemy unless the active hero is its allowed attacker", () => {
    const hidden = hero('Warlock', { statusEffects: { untargetable: true } as Hero['statusEffects'] });
    expect(focusButtonState({ ...base, inspected: { hero: hidden, side: 'enemy' } }))
      .toEqual({ show: true, enabled: false, label: "Can't be targeted" });
    const marked = hero('Warlock', {
      statusEffects: { untargetable: true, untargetableAttacker: 'Druid' } as Hero['statusEffects'],
    });
    expect(focusButtonState({ ...base, inspected: { hero: marked, side: 'enemy' } }))
      .toEqual({ show: true, enabled: true, label: 'Focus Warlock' });
  });

  it('points a taunted hero at its taunter', () => {
    expect(focusButtonState({ ...base, tauntTarget: 'Paladin' }))
      .toEqual({ show: true, enabled: false, label: 'Taunted: focus Paladin' });
    expect(focusButtonState({ ...base, inspected: { hero: hero('Paladin'), side: 'enemy' }, tauntTarget: 'Paladin' }))
      .toEqual({ show: true, enabled: true, label: 'Focus Paladin' });
  });
});
