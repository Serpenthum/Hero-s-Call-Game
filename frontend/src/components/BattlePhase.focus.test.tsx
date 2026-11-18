import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../battleAnimations', () => ({ getAnimSpeed: () => 'off', startClockSound: () => () => {} }));
vi.mock('./BattleFX', () => ({ default: () => null }));
vi.mock('../socketService', () => ({
  socketService: {
    selectTarget: vi.fn(),
    basicAttack: vi.fn(),
    useAbility: vi.fn(),
    activateSpecial: vi.fn(),
    endTurn: vi.fn(),
  },
}));

import BattlePhase, { FocusButton } from './BattlePhase';
import { focusButtonState } from '../battle/focus';
import type { GameState, Hero, Player } from '../types';
import type { AbilityTargeting } from '../battle/focus';

const hero = (name: string, extra: Partial<Hero> = {}): Hero => ({
  name,
  HP: 20,
  currentHP: 20,
  Defense: 8,
  Accuracy: '+2',
  BasicAttack: '1D6',
  Ability: [],
  Special: [],
  ...extra,
} as Hero);

const ability = (name: string) => ({ name, description: `${name} rules`, effects: [] });

const HEROES: Record<string, () => Hero> = {
  Barbarian: () => hero('Barbarian', { Ability: [ability('Reckless Swing')] }),
  Druid: () => hero('Druid', { Ability: [ability('Wildshape')] }),
  Mech: () => hero('Mech', {
    Special: [{ name: 'Self Destruct', description: 'Explode.', category: 'activated_aoe', effects: [] } as any],
  }),
  Timekeeper: () => hero('Timekeeper', { Ability: [ability('Chrono Shift')] }),
  Warlock: () => hero('Warlock', { Ability: [ability('Hex')] }),
  Wizard: () => hero('Wizard', { Ability: [ability('Fireball')] }),
  Shroomguard: () => hero('Shroomguard'),
  'Plague Spreader': () => hero('Plague Spreader'),
};

const TARGETING: Record<string, AbilityTargeting[]> = {
  Barbarian: [{ kind: 'enemy', damaging: true }],
  Druid: [{ kind: 'self', damaging: false }],
  Mech: [],
  Timekeeper: [{ kind: 'enemy', damaging: true }], // a command at a dead focus is lost (server)
  Warlock: [{ kind: 'enemy', damaging: true }],
  Wizard: [{ kind: 'all', damaging: true }],
};

const player = (id: string, names: string[], extra: Partial<Player> = {}): Player => ({
  id,
  name: id === 'me' ? 'Admin1' : 'Admin2',
  connected: true,
  team: names.map(n => HEROES[n]()),
  attackOrder: names,
  currentHeroIndex: 0,
  hasUsedAttack: false,
  hasUsedAbility: false,
  selectedTarget: null,
  ...extra,
} as Player);

interface Setup {
  active: string;
  myTeam?: string[];
  enemyTeam?: string[];
  me?: Partial<Player>;
  them?: Partial<Player>;
  turn?: 'me' | 'them';
  warlockHP?: number;
}

const ENEMIES = ['Warlock', 'Shroomguard', 'Plague Spreader'];

function state(s: Setup): { gameState: GameState; me: Player; them: Player } {
  const myTeam = s.myTeam ?? [s.active, 'Shroomguard', 'Plague Spreader'];
  const me = player('me', myTeam, s.me);
  const them = player('them', s.enemyTeam ?? ENEMIES, s.them);
  if (s.warlockHP !== undefined) them.team.find(h => h.name === 'Warlock')!.currentHP = s.warlockHP;
  const turn = s.turn ?? 'me';
  const actingTeam = turn === 'me' ? me.team : them.team;
  const heroIndex = actingTeam.findIndex(h => h.name === s.active);
  const gameState = {
    id: 'g1',
    phase: 'battle',
    players: [me, them],
    currentTurn: turn === 'me' ? 0 : 1,
    activeHero: { name: s.active, playerIndex: turn === 'me' ? 0 : 1, heroIndex, abilityTargeting: TARGETING[s.active] },
    currentDraftPhase: 0,
    draftTurn: 0,
    winner: null,
  } as GameState;
  return { gameState, me, them };
}

function render(s: Setup, spectating = false) {
  const { gameState, me, them } = state(s);
  return renderToStaticMarkup(
    <BattlePhase
      gameState={gameState}
      currentPlayer={me}
      opponent={them}
      playerId={spectating ? 'watcher' : 'me'}
      isSpectating={spectating}
    />
  );
}

// The <button ...>label</button> whose label starts with the given text
function button(html: string, label: string): string {
  const buttons = html.match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
  const found = buttons.find(b => b.replace(/<button[^>]*>/, '').startsWith(label));
  if (!found) throw new Error(`no button "${label}" in:\n${buttons.join('\n')}`);
  return found;
}
const isDisabled = (b: string) => /<button[^>]*\sdisabled=""/.test(b);
const focusedCount = (html: string) => (html.match(/data-focused="true"/g) ?? []).length;

// The Actions sidebar only (the floating Surrender button follows it in the markup)
const actionBar = (html: string) => {
  const bar = html.slice(html.indexOf('class="action-bar"'));
  const end = bar.indexOf('<button class="ui-btn ui-btn--danger floating-surrender-button');
  return end < 0 ? bar : bar.slice(0, end);
};
const abilityButton = (html: string) => html.match(/<button[^>]*data-tutorial="ability"[^>]*>[^<]*<\/button>/)![0];
const specialButton = (html: string) => html.match(/<button[^>]*special-button[^>]*>[^<]*<\/button>/)![0];
const focused = (extra: Partial<Player> = {}) => ({ selectedTarget: 'Warlock', focusLocked: true, ...extra });
const fallenFocus = { warlockHP: 0, me: focused({ hasUsedAttack: true }) };

describe('BattlePhase focus', () => {
  it('shows only how to focus until an enemy is focused', () => {
    for (const active of ['Barbarian', 'Druid', 'Mech']) {
      const bar = actionBar(render({ active }));
      expect(bar, active).toContain('Tap an enemy to focus');
      expect(bar, active).not.toContain('<button');
      expect(bar, active).not.toContain(`<strong>${active}</strong>`);
      expect(bar, active).not.toContain('Focus:');
    }
    expect(focusedCount(render({ active: 'Barbarian' }))).toBe(0);
  });

  it('offers End Turn when no enemy can be focused', () => {
    const s = state({ active: 'Barbarian' });
    s.them.team.forEach(h => { h.statusEffects = { untargetable: true } as any; });
    const bar = actionBar(renderToStaticMarkup(
      <BattlePhase gameState={s.gameState} currentPlayer={s.me} opponent={s.them} playerId="me" />
    ));
    expect(bar).toContain('No enemy can be focused');
    expect(isDisabled(button(bar, 'End Turn'))).toBe(false);
    expect(bar).not.toContain('Attack');
  });

  it('brings back every action with its own label once focused, and marks the card', () => {
    const html = render({ active: 'Barbarian', me: focused() });
    expect(isDisabled(button(html, 'Attack (1D6)'))).toBe(false);
    expect(isDisabled(button(html, 'Reckless Swing'))).toBe(false);
    expect(isDisabled(button(html, 'End Turn'))).toBe(false);
    expect(actionBar(html)).toContain('<strong>Barbarian</strong>');
    expect(actionBar(html)).not.toContain('Focus:');
    expect(html).not.toContain('Attack Warlock');
    expect(html).not.toContain('data-tutorial="focus"');
    expect(focusedCount(html)).toBe(1);
    expect(html).toMatch(/data-focused="true"[^>]*>[\s\S]*?Warlock/);
    expect(html).not.toContain('Target Dead');
  });

  it('marks lost actions (Target Dead) and keeps self abilities after the focus has fallen', () => {
    const html = render({ active: 'Druid', ...fallenFocus });
    expect(isDisabled(button(html, 'Attack (1D6) (Target Dead)'))).toBe(true);
    expect(isDisabled(button(html, 'Wildshape'))).toBe(false);
    expect(abilityButton(html)).not.toContain('Target Dead');
    expect(focusedCount(html)).toBe(1);
  });

  it('shows the opponent and spectators the marker on the focused hero', () => {
    const mirror = { active: 'Warlock', myTeam: ENEMIES, turn: 'them' as const, them: focused() };
    const opponentView = render(mirror);
    expect(focusedCount(opponentView)).toBe(1);
    const playerArea = opponentView.slice(opponentView.indexOf('class="player-area"'));
    expect(focusedCount(playerArea)).toBe(1);
    expect(opponentView).not.toContain('data-tutorial="focus"');
    expect(opponentView).toMatch(/action-prompt[\s\S]*Focus: <strong>Warlock<\/strong>/);

    const spectatorView = render(mirror, true);
    expect(focusedCount(spectatorView)).toBe(1);
    const spectatorPlayerArea = spectatorView.slice(spectatorView.indexOf('class="player-area"'));
    expect(focusedCount(spectatorPlayerArea)).toBe(1);
  });

  it('gates Chrono Shift on a living focus', () => {
    expect(actionBar(render({ active: 'Timekeeper' }))).not.toContain('Chrono Shift');
    const live = render({ active: 'Timekeeper', me: focused() });
    expect(abilityButton(live)).toContain('>Chrono Shift<');
    expect(isDisabled(abilityButton(live))).toBe(false);
    const dead = render({ active: 'Timekeeper', warlockHP: 0, me: focused() });
    expect(abilityButton(dead)).toContain('>Chrono Shift (Target Dead)<');
    expect(isDisabled(abilityButton(dead))).toBe(true);
  });

  it('keeps area abilities and activated specials after the focus has fallen', () => {
    const wizard = render({ active: 'Wizard', ...fallenFocus });
    expect(abilityButton(wizard)).toContain('>Fireball<');
    expect(isDisabled(abilityButton(wizard))).toBe(false);
    expect(isDisabled(button(wizard, 'Attack (1D6) (Target Dead)'))).toBe(true);

    const mech = render({ active: 'Mech', ...fallenFocus });
    expect(specialButton(mech)).toContain('>Self Destruct<');
    expect(isDisabled(specialButton(mech))).toBe(false);
    expect(specialButton(mech)).not.toContain('style=');
  });

  function renderWith(setup: Setup, statusEffects: any, rename?: string) {
    const s = state(setup);
    s.me.team[0].statusEffects = statusEffects;
    if (rename) { s.me.team[0].name = rename; s.gameState.activeHero!.name = rename; }
    return renderToStaticMarkup(
      <BattlePhase gameState={s.gameState} currentPlayer={s.me} opponent={s.them} playerId="me" />
    );
  }

  it('blocks abilities at a living briber, but not self abilities', () => {
    const bribe = { cannotTargetWithAbility: { owner: 'Warlock' } };
    const barbarian = renderWith({ active: 'Barbarian', me: focused() }, bribe);
    expect(isDisabled(button(barbarian, 'Reckless Swing (Bribed)'))).toBe(true);
    expect(isDisabled(button(barbarian, 'Attack (1D6)'))).toBe(false);

    const druid = renderWith({ active: 'Druid', me: focused() }, bribe);
    expect(isDisabled(button(druid, 'Wildshape'))).toBe(false);
    expect(druid).not.toContain('(Bribed)');
  });

  it('disables a stunned Monk with attacks left', () => {
    const html = renderWith(
      { active: 'Barbarian', me: focused({ monkAttacksRemaining: 1 } as any) },
      { stun: { active: true } },
      'Monk'
    );
    const attack = button(html, 'Attack (1D6) (1 left)');
    expect(attack).toContain('(Stunned)');
    expect(isDisabled(attack)).toBe(true);
  });

  it('renders the Focus button from its state', () => {
    const warlock = HEROES.Warlock();
    const base = {
      isMyTurn: true, isSpectating: false, inspected: { hero: warlock, side: 'enemy' as const },
      focus: null, focusLocked: false, tauntTarget: null, activeHeroName: 'Barbarian',
    };
    const show = (input: any) => {
      const st = focusButtonState(input);
      if (!st.show) throw new Error('hidden');
      return renderToStaticMarkup(<FocusButton state={st} onFocus={() => {}} />);
    };
    const ready = show(base);
    expect(ready).toContain('data-tutorial="focus"');
    expect(ready).toContain('data-keep-details');
    expect(ready).toContain('>Focus Warlock<');
    expect(isDisabled(ready)).toBe(false);

    const taunted = show({ ...base, tauntTarget: 'Shroomguard' });
    expect(taunted).toContain('>Taunted: focus Shroomguard<');
    expect(isDisabled(taunted)).toBe(true);

    const vanished = show({ ...base, inspected: { hero: { ...warlock, statusEffects: { untargetable: true } }, side: 'enemy' } });
    expect(vanished).toMatch(/>Can(&#x27;|')t be targeted</);
    expect(isDisabled(vanished)).toBe(true);

    expect(focusButtonState({ ...base, focus: { name: 'Warlock', alive: true }, focusLocked: true })).toEqual({ show: false });
  });
});
