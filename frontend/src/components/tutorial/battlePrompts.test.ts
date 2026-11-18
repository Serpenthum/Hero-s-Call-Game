import { describe, expect, it } from 'vitest';
import { pickBattlePrompt, promptAbandoned, promptFinished } from './battlePrompts';
import type { BattlePromptInput, PromptKind, PromptProgress } from './battlePrompts';
import type { Hero, Player } from '../../types';

const hero = (name: string, extra: Partial<Hero> = {}): Hero => ({
  name, HP: 20, currentHP: 20, Defense: 8, Accuracy: '+2', BasicAttack: '1D6', Ability: [], Special: [], ...extra,
} as Hero);

const me = (extra: Partial<Player> = {}): Player => ({
  id: 'me',
  name: 'Student',
  connected: true,
  team: [hero('Druid'), hero('Beast Tamer'), hero('Wizard')],
  attackOrder: ['Druid', 'Beast Tamer', 'Wizard'],
  currentHeroIndex: 0,
  hasUsedAttack: false,
  hasUsedAbility: false,
  selectedTarget: null,
  ...extra,
} as Player);

// The intro is over and the log prompt has been seen: only the turn prompts are left
const input = (extra: Partial<BattlePromptInput> = {}): BattlePromptInput => ({
  me: me(),
  myTurn: true,
  battleLog: [],
  shown: new Set<PromptKind>(['log']),
  inspected: null,
  attackReady: false,
  abilityReady: false,
  ...extra,
});

const progress = (extra: Partial<PromptProgress> = {}): PromptProgress => ({
  focused: false, inspectedEnemy: false, usedAttack: false, usedAbility: false, myTurn: true, ...extra,
});

describe('pickBattlePrompt', () => {
  it('asks for a tap on an enemy before anything is focused', () => {
    const prompt = pickBattlePrompt(input());
    expect(prompt?.kind).toBe('inspect');
    expect(prompt?.step.text).toBe('Tap an enemy hero to see its card.');
    expect(prompt?.step.target).toEqual(['.opponent-area .team-display']);
    expect(prompt?.step.interactive).toBe(true);
  });

  it('points at the Focus button once an enemy is shown', () => {
    const prompt = pickBattlePrompt(input({ inspected: { name: 'Barbarian', side: 'enemy' } }));
    expect(prompt?.kind).toBe('focus');
    expect(prompt?.step.target).toEqual(['[data-tutorial="focus"]']);
    expect(prompt?.step.interactive).toBe(true);
    // Focus is final once chosen, so the prompt never says it can be switched
    expect(prompt?.step.text).toBe("Press Focus to choose who your hero attacks. Your hero can't do anything until it has a focus.");
  });

  it('still asks for an enemy when an ally is shown', () => {
    expect(pickBattlePrompt(input({ inspected: { name: 'Druid', side: 'ally' } }))?.kind).toBe('inspect');
  });

  it('asks for Attack once focused, then the ability, then End Turn', () => {
    const focused = me({ selectedTarget: 'Barbarian', focusLocked: true });
    const attack = pickBattlePrompt(input({ me: focused, attackReady: true, abilityReady: true }));
    expect(attack?.kind).toBe('attack');
    expect(attack?.step.text).toBe('Now press Attack to strike the enemy you focused!');

    const attacked = me({ selectedTarget: 'Barbarian', focusLocked: true, hasUsedAttack: true });
    const shown = new Set<PromptKind>(['log', 'inspect', 'focus', 'attack']);
    const ability = pickBattlePrompt(input({ me: attacked, shown, abilityReady: true }));
    expect(ability?.kind).toBe('ability');
    expect(ability?.step.text).toBe('Your hero can also use its ability this turn. Press it!');

    expect(pickBattlePrompt(input({ me: attacked, shown, abilityReady: false }))?.kind).toBe('endturn');
  });

  it('asks nothing on the opponent\'s turn once the log has been shown', () => {
    expect(pickBattlePrompt(input({ myTurn: false }))).toBeNull();
    expect(pickBattlePrompt(input({ myTurn: false, inspected: { name: 'Barbarian', side: 'enemy' } }))).toBeNull();
  });

  it('shows each turn prompt once', () => {
    const shown = new Set<PromptKind>(['log', 'inspect', 'focus']);
    expect(pickBattlePrompt(input({ shown }))).toBeNull();
    expect(pickBattlePrompt(input({ shown, inspected: { name: 'Barbarian', side: 'enemy' } }))).toBeNull();
  });

  it('shows the battle log first, pointing at its newest entry', () => {
    const prompt = pickBattlePrompt(input({ shown: new Set(), battleLog: [{ id: 'a' }, { id: 'b' }] }));
    expect(prompt?.kind).toBe('log');
    expect(prompt?.step.target).toEqual(['[data-log-id="b"]', '.battle-log-section']);
  });
});

describe('promptFinished', () => {
  it('finishes inspect on an enemy shown and focus on a focus', () => {
    expect(promptFinished('inspect', progress({ inspectedEnemy: true }))).toBe(true);
    expect(promptFinished('inspect', progress())).toBe(false);
    expect(promptFinished('focus', progress({ focused: true }))).toBe(true);
    expect(promptFinished('focus', progress({ inspectedEnemy: true }))).toBe(false);
    expect(promptFinished('attack', progress({ usedAttack: true }))).toBe(true);
    expect(promptFinished('ability', progress({ usedAbility: true }))).toBe(true);
    expect(promptFinished('endturn', progress({ myTurn: false }))).toBe(true);
  });
});

describe('promptAbandoned', () => {
  it('drops the focus prompt when the panel closes before Focus is pressed', () => {
    expect(promptAbandoned('focus', progress({ inspectedEnemy: false }))).toBe(true);
    expect(promptAbandoned('focus', progress({ inspectedEnemy: true }))).toBe(false);
    expect(promptAbandoned('focus', progress({ focused: true }))).toBe(false);
  });

  it('drops a turn prompt when the turn ends first', () => {
    for (const kind of ['inspect', 'focus', 'attack', 'ability'] as PromptKind[]) {
      expect(promptAbandoned(kind, progress({ myTurn: false })), kind).toBe(true);
    }
    expect(promptAbandoned('focus', progress({ myTurn: false, inspectedEnemy: true }))).toBe(true);
    expect(promptAbandoned('log', progress({ myTurn: false }))).toBe(false);
  });
});
