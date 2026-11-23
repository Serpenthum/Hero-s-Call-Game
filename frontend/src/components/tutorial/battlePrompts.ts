// The battle tutorial's prompts after the intro, chosen from the game state (pure, so it can be tested).
// The turn prompts teach the focus rules: tap an enemy to see it, press Focus, then Attack.
import type { Player } from '../../types';
import type { InspectedCard } from '../../battle/focus';
import type { OverlayStep } from './TutorialOverlay';

export interface LogEntryLike {
  id: string;
  crit?: boolean;
  attacker?: string;
}

export type PromptKind = 'poison' | 'crit' | 'log' | 'inspect' | 'focus' | 'attack' | 'ability' | 'endturn';

export interface Prompt {
  kind: PromptKind;
  step: OverlayStep;
}

export interface BattlePromptInput {
  me: Player;
  myTurn: boolean;
  battleLog: LogEntryLike[];
  shown: ReadonlySet<PromptKind>;
  // The card in the details panel (null when closed)
  inspected: InspectedCard | null;
  // Whether the Attack / ability button is on screen and enabled
  attackReady: boolean;
  abilityReady: boolean;
  // The sidebar says "No enemy can be focused" (it offers only End Turn)
  noFocusable?: boolean;
}

export interface PromptProgress {
  focused: boolean;
  inspectedEnemy: boolean;
  usedAttack: boolean;
  usedAbility: boolean;
  myTurn: boolean;
}

export const actionButton = (name: string, enabledOnly = false) =>
  `.action-bar [data-tutorial="${name}"]${enabledOnly ? ':not([disabled])' : ''}`;

export const usedAttackOf = (me: Player) => me.hasUsedAttack || (me.usedAttacks || 0) > 0;
export const usedAbilityOf = (me: Player) => me.hasUsedAbility || (me.usedAbilities?.length || 0) > 0;

// Prompts that point at the battle log or the board; the details panel would cover them, so it closes first
export const NEEDS_CLEAR_BOARD: ReadonlySet<PromptKind> = new Set<PromptKind>(['poison', 'crit', 'log', 'inspect']);

export function pickBattlePrompt(input: BattlePromptInput): Prompt | null {
  const { me, myTurn, battleLog, shown, inspected, attackReady, abilityReady, noFocusable } = input;
  const heroNames = new Set(me.team.map(h => h.name));
  const usedAttack = usedAttackOf(me);
  const usedAbility = usedAbilityOf(me);

  if (!shown.has('poison')) {
    const poisoned = me.team.find(h => (h.statusEffects?.poison || 0) > 0);
    if (poisoned) {
      return {
        kind: 'poison',
        step: {
          key: 'poison',
          text: "Looks like you've been poisoned. Poison lasts forever and does its damage at the end of that hero's turn.",
          target: [`.player-area [data-hero-name="${poisoned.name}"] .badge-token[data-badge="poison"]`, `.player-area [data-hero-name="${poisoned.name}"]`],
          showNext: true
        }
      };
    }
  }

  if (!shown.has('crit')) {
    const critEntry = battleLog.find(e => e.crit && e.attacker && heroNames.has(e.attacker));
    if (critEntry) {
      return {
        kind: 'crit',
        step: {
          key: 'crit',
          text: "That's a critical hit! A crit means you do the maximum damage you can roll on your damage dice!",
          target: [`[data-log-id="${critEntry.id}"]`, '.battle-log-section'],
          showNext: true
        }
      };
    }
  }

  if (!shown.has('log') && battleLog.length > 0) {
    const newest = battleLog[battleLog.length - 1];
    return {
      kind: 'log',
      step: {
        key: 'log',
        text: "This is the battle log. It'll tell you what happened and what dice were rolled.",
        target: [`[data-log-id="${newest.id}"]`, '.battle-log-section'],
        showNext: true
      }
    };
  }

  if (!myTurn) return null;

  // Before a focus the sidebar holds only the Focus button: first show an enemy, then press Focus
  if (!me.selectedTarget) {
    // Nothing to focus: End Turn is the only button, so asking for an enemy would go round in circles
    if (noFocusable) {
      if (shown.has('endturn')) return null;
      return {
        kind: 'endturn',
        step: {
          key: 'end-turn-no-focus',
          text: 'No enemy can be focused right now. Press End Turn to pass to your opponent!',
          target: [actionButton('end-turn')],
          interactive: true
        }
      };
    }
    if (inspected?.side === 'enemy') {
      if (shown.has('focus')) return null;
      return {
        kind: 'focus',
        step: {
          key: 'focus-btn',
          text: "Press Focus to choose who your hero attacks. Your hero can't do anything until it has a focus.",
          target: ['[data-tutorial="focus"]'],
          interactive: true
        }
      };
    }
    if (shown.has('inspect')) return null;
    return {
      kind: 'inspect',
      step: {
        key: 'inspect',
        text: 'Tap an enemy hero to see its card.',
        target: ['.opponent-area .team-display'],
        interactive: true
      }
    };
  }

  if (!shown.has('attack') && !usedAttack && attackReady) {
    return {
      kind: 'attack',
      step: {
        key: 'attack-btn',
        text: 'Now press Attack to strike the enemy you focused!',
        target: [actionButton('attack')],
        interactive: true
      }
    };
  }

  if (!shown.has('ability') && usedAttack && !usedAbility && abilityReady) {
    return {
      kind: 'ability',
      step: {
        key: 'ability-btn',
        text: 'Your hero can also use its ability this turn. Press it!',
        target: [actionButton('ability', true)],
        interactive: true
      }
    };
  }

  if (!shown.has('endturn') && usedAttack && (usedAbility || !abilityReady)) {
    return {
      kind: 'endturn',
      step: {
        key: 'end-turn-btn',
        text: usedAbility
          ? "You're out of actions for this hero. Press End Turn to pass to your opponent!"
          : "This hero can't use an ability right now. Press End Turn to pass to your opponent!",
        target: [actionButton('end-turn')],
        interactive: true
      }
    };
  }
  return null;
}

// An action prompt closes itself once the player does the thing it points at
export function promptFinished(kind: PromptKind, s: PromptProgress): boolean {
  switch (kind) {
    case 'inspect': return s.inspectedEnemy || s.focused;
    case 'focus': return s.focused;
    case 'attack': return s.usedAttack;
    case 'ability': return s.usedAbility;
    case 'endturn': return !s.myTurn;
    default: return false;
  }
}

// A turn prompt whose button went away before the player pressed it: the turn ended (the clock ran out), or the
// panel closed while Focus was asked for. It closes and is asked again when it applies.
export function promptAbandoned(kind: PromptKind, s: PromptProgress): boolean {
  if (promptFinished(kind, s)) return false;
  if (kind === 'inspect' || kind === 'focus' || kind === 'attack' || kind === 'ability') {
    if (!s.myTurn) return true;
  }
  return kind === 'focus' && !s.inspectedEnemy;
}
