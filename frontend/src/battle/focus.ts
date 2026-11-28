// Battle Focus rules, pure (see docs/superpowers/specs/2026-11-18-battle-focus-design.md).
// The server enforces these; the client mirrors them to label and enable the action buttons.
import type { GameState, Hero, Player } from '../types';
import { isHeroAlive } from '../heroHealth';

// Where an ability lands: 'enemy' = the focus, 'all' = every enemy, 'self' = never the focus.
export type AbilityTargetKind = 'enemy' | 'self' | 'all';
export interface AbilityTargeting {
  kind: AbilityTargetKind;
  damaging: boolean;
}

// What the client assumes when the server sent no entry for an ability.
export const UNKNOWN_TARGETING: AbilityTargeting = { kind: 'enemy', damaging: true };

// Activated specials are all area effects; only activated_aoe (Self Destruct) deals damage.
export function specialTargeting(category: string | undefined): AbilityTargeting {
  return { kind: 'all', damaging: category === 'activated_aoe' };
}

// Viewer-relative side of a card, for the details panel only.
export type CardSide = 'enemy' | 'ally';
export interface InspectedCard {
  name: string;
  side: CardSide;
}

export interface Focus {
  name: string;
  alive: boolean;
}

// The attacker's focus, looked up only on the defender's team (both teams can hold a hero of the same name).
export function readFocus(attacker: Player | undefined, defender: Player | null | undefined): Focus | null {
  const name = attacker?.selectedTarget;
  if (!name || !defender) return null;
  const target = defender.team.find(h => h.name === name);
  if (!target) return null;
  return { name, alive: isHeroAlive(target) };
}

// The acting player's focus, for drawing the marker for everyone (acting player, opponent, spectators).
export function turnFocus(gameState: GameState): { focus: Focus; defenderId: string } | null {
  const attacker = gameState.players[gameState.currentTurn];
  const defender = gameState.players.find((_, i) => i !== gameState.currentTurn);
  if (!attacker || !defender) return null;
  const focus = readFocus(attacker, defender);
  return focus ? { focus, defenderId: defender.id } : null;
}

export type Gate = { ok: true } | { ok: false; reason: 'need-focus' | 'fallen' };

const OK: Gate = { ok: true };
const NEED_FOCUS: Gate = { ok: false, reason: 'need-focus' };
const FALLEN: Gate = { ok: false, reason: 'fallen' };

export function attackGate(focus: Focus | null): Gate {
  if (!focus) return NEED_FOCUS;
  return focus.alive ? OK : FALLEN;
}

// Mirrors backend/abilityTargeting.js lostWithFallenFocus: only single-target damage needs a living focus.
export function actionGate(t: AbilityTargeting, focus: Focus | null): Gate {
  if (!focus) return NEED_FOCUS;
  if (!focus.alive && t.kind === 'enemy' && t.damaging) return FALLEN;
  return OK;
}

// Buttons keep their own labels ("Attack (1D6)", "Fireball"): the marker on the card shows whom they hit.
// An action lost with a fallen focus says so. Before a focus the actions are hidden, so need-focus adds nothing.
export function attackLabel(base: string, gate: Gate): string {
  return !gate.ok && gate.reason === 'fallen' ? `${base} (Target Dead)` : base;
}

export function actionLabel(name: string, gate: Gate): string {
  return attackLabel(name, gate);
}

function ignoresTaunt(hero: Hero): boolean {
  const specials: any[] = hero.Special ? (Array.isArray(hero.Special) ? hero.Special : [hero.Special]) : [];
  return specials.some(special =>
    special?.effects?.some((effect: any) => effect.type === 'passive_modifier' && effect.effect === 'ignore_taunt'));
}

// The enemy a taunted hero must focus; null when not taunted, it ignores taunt, or the taunter is dead.
export function tauntTargetFor(active: Hero, opponent: Player | null): string | null {
  const name = active.statusEffects?.taunt?.target;
  if (!name || !opponent || ignoresTaunt(active)) return null;
  const taunter = opponent.team.find(h => h.name === name);
  return isHeroAlive(taunter) ? name : null;
}

// Whether the active hero may Focus this enemy despite Vanish. The server names the hero that hit the Ninja by id
// (untargetableAttackerId, safe in mirror matches); an old server sends only its name.
export function blockedByVanish(effects: Hero['statusEffects'] | undefined, active: { id?: string; name: string }): boolean {
  if (!effects?.untargetable) return false;
  if (effects.untargetableAttackerId) return effects.untargetableAttackerId !== active.id;
  return effects.untargetableAttacker !== active.name;
}

export interface FocusButtonInput {
  isMyTurn: boolean;
  isSpectating: boolean;
  inspected: { hero: Hero; side: CardSide };
  focus: Focus | null;
  focusLocked: boolean;
  tauntTarget: string | null;
  activeHeroName: string;
  activeHeroId?: string;
}

export type FocusButtonState = { show: false } | { show: true; enabled: boolean; label: string };

export function focusButtonState(input: FocusButtonInput): FocusButtonState {
  const { isMyTurn, isSpectating, inspected, focus, focusLocked, tauntTarget, activeHeroName, activeHeroId } = input;
  const target = inspected.hero;
  if (!isMyTurn || isSpectating || inspected.side !== 'enemy' || !isHeroAlive(target)) return { show: false };
  // The focus is final once chosen, so the button goes away with it
  if (focus || focusLocked) return { show: false };
  const disabled = (label: string): FocusButtonState => ({ show: true, enabled: false, label });
  if (tauntTarget && tauntTarget !== target.name) return disabled(`Taunted: focus ${tauntTarget}`);
  // The server forces a taunted hero's focus onto a living taunter, even an untargetable one
  const effects = tauntTarget ? undefined : target.statusEffects;
  if (blockedByVanish(effects, { id: activeHeroId, name: activeHeroName })) return disabled("Can't be Focused");
  return { show: true, enabled: true, label: `Focus ${target.name}` };
}
