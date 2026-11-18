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

describe('BattlePhase focus', () => {
  it('disables every action until an enemy is focused', () => {
    const barbarian = render({ active: 'Barbarian' });
    const attack = button(barbarian, 'Focus an enemy first');
    expect(attack).toContain('data-tutorial="attack"');
    expect(isDisabled(attack)).toBe(true);
    const abilityButtons = (barbarian.match(/<button[^>]*data-tutorial="ability"[^>]*>[^<]*<\/button>/g) ?? []);
    expect(abilityButtons).toHaveLength(1);
    expect(abilityButtons[0]).toContain('>Focus an enemy first<');
    expect(isDisabled(abilityButtons[0] ?? '')).toBe(true);
    expect(isDisabled(button(barbarian, 'End Turn'))).toBe(false);
    expect(barbarian).toContain('Focus: none');
    expect(focusedCount(barbarian)).toBe(0);

    const druid = render({ active: 'Druid' });
    const wildshape = druid.match(/<button[^>]*data-tutorial="ability"[^>]*>[^<]*<\/button>/)![0];
    expect(wildshape).toContain('>Focus an enemy first<');
    expect(isDisabled(wildshape)).toBe(true);

    const mech = render({ active: 'Mech' });
    const special = mech.match(/<button[^>]*special-button[^>]*>[^<]*<\/button>/)![0];
    expect(special).toContain('>Focus an enemy first<');
    expect(isDisabled(special)).toBe(true);
    expect(isDisabled(button(mech, 'End Turn'))).toBe(false);
  });

  it('labels and enables actions on a live focus, and marks the card', () => {
    const html = render({ active: 'Barbarian', me: { selectedTarget: 'Warlock' } });
    expect(isDisabled(button(html, 'Attack Warlock'))).toBe(false);
    expect(isDisabled(button(html, 'Reckless Swing on Warlock'))).toBe(false);
    expect(html).toContain('Focus: <strong>Warlock</strong>');
    expect(focusedCount(html)).toBe(1);
    expect(html).toMatch(/data-focused="true"[^>]*>[\s\S]*?Warlock/);
    expect(html).not.toContain('Target Dead');
  });

  it('keeps self abilities after the focus has fallen', () => {
    const html = render({
      active: 'Druid',
      warlockHP: 0,
      me: { selectedTarget: 'Warlock', focusLocked: true, hasUsedAttack: true },
    });
    expect(isDisabled(button(html, 'Warlock has fallen'))).toBe(true);
    expect(isDisabled(button(html, 'Wildshape'))).toBe(false);
    expect(focusedCount(html)).toBe(1);
    expect(html).not.toContain('Target Dead');
  });

  it('shows the opponent and spectators the marker on the focused hero', () => {
    const mirror = { active: 'Warlock', myTeam: ENEMIES, turn: 'them' as const, them: { selectedTarget: 'Warlock' } };
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

  it('gates Chrono Shift on the focus', () => {
    const none = render({ active: 'Timekeeper' });
    const chrono = none.match(/<button[^>]*data-tutorial="ability"[^>]*>[^<]*<\/button>/)![0];
    expect(chrono).toContain('>Focus an enemy first<');
    expect(isDisabled(chrono)).toBe(true);

    const live = render({ active: 'Timekeeper', me: { selectedTarget: 'Warlock' } });
    expect(isDisabled(button(live, 'Chrono Shift on Warlock'))).toBe(false);
  });

  it('loses Chrono Shift once the focus has fallen', () => {
    const html = render({ active: 'Timekeeper', warlockHP: 0, me: { selectedTarget: 'Warlock', focusLocked: true } });
    const chrono = html.match(/<button[^>]*data-tutorial="ability"[^>]*>[^<]*<\/button>/)![0];
    expect(chrono).toContain('>Warlock has fallen<');
    expect(isDisabled(chrono)).toBe(true);
  });

  it('keeps area abilities and activated specials after the focus has fallen', () => {
    const fallen = { warlockHP: 0, me: { selectedTarget: 'Warlock', focusLocked: true, hasUsedAttack: true } };
    const wizard = render({ active: 'Wizard', ...fallen });
    expect(isDisabled(button(wizard, 'Fireball'))).toBe(false);
    expect(isDisabled(button(wizard, 'Warlock has fallen'))).toBe(true);

    const mech = render({ active: 'Mech', ...fallen });
    const special = mech.match(/<button[^>]*special-button[^>]*>[^<]*<\/button>/)![0];
    expect(special).toContain('>Self Destruct<');
    expect(isDisabled(special)).toBe(false);
    expect(special).not.toContain('style=');
  });

  it('blocks abilities at a living briber, but not self abilities', () => {
    const bribe = { cannotTargetWithAbility: { owner: 'Warlock' } } as any;
    const barbarian = state({ active: 'Barbarian', me: { selectedTarget: 'Warlock' } });
    barbarian.me.team[0].statusEffects = bribe;
    const html = renderToStaticMarkup(
      <BattlePhase gameState={barbarian.gameState} currentPlayer={barbarian.me} opponent={barbarian.them} playerId="me" />
    );
    expect(isDisabled(button(html, 'Reckless Swing on Warlock (Bribed)'))).toBe(true);
    expect(isDisabled(button(html, 'Attack Warlock'))).toBe(false);

    const druid = state({ active: 'Druid', me: { selectedTarget: 'Warlock' } });
    druid.me.team[0].statusEffects = bribe;
    const druidHtml = renderToStaticMarkup(
      <BattlePhase gameState={druid.gameState} currentPlayer={druid.me} opponent={druid.them} playerId="me" />
    );
    expect(isDisabled(button(druidHtml, 'Wildshape'))).toBe(false);
    expect(druidHtml).not.toContain('(Bribed)');
  });

  it('disables a stunned Monk with attacks left', () => {
    const monk = state({ active: 'Barbarian', me: { selectedTarget: 'Warlock', monkAttacksRemaining: 1 } as any });
    monk.me.team[0].name = 'Monk';
    monk.gameState.activeHero!.name = 'Monk';
    monk.me.team[0].statusEffects = { stun: { active: true } } as any;
    const html = renderToStaticMarkup(
      <BattlePhase gameState={monk.gameState} currentPlayer={monk.me} opponent={monk.them} playerId="me" />
    );
    const attack = button(html, 'Attack Warlock (1 left)');
    expect(attack).toContain('(Stunned)');
    expect(isDisabled(attack)).toBe(true);
  });

  it('renders the Focus button from its state', () => {
    const warlock = HEROES.Warlock();
    const base = {
      isMyTurn: true, isSpectating: false, inspected: { hero: warlock, side: 'enemy' as const },
      focus: null, focusLocked: false, tauntTarget: null, activeHeroName: 'Barbarian',
    };
    const show = (input: typeof base | any) => {
      const s = focusButtonState(input);
      if (!s.show) throw new Error('hidden');
      return renderToStaticMarkup(<FocusButton state={s} onFocus={() => {}} />);
    };
    const ready = show(base);
    expect(ready).toContain('data-tutorial="focus"');
    expect(ready).toContain('data-keep-details');
    expect(ready).toContain('>Focus Warlock<');
    expect(isDisabled(ready)).toBe(false);

    const focused = show({ ...base, focus: { name: 'Warlock', alive: true } });
    expect(focused).toContain('>Focused<');
    expect(isDisabled(focused)).toBe(true);

    const locked = show({ ...base, focus: { name: 'Shroomguard', alive: true }, focusLocked: true });
    expect(locked).toContain('>Focus locked<');
    expect(isDisabled(locked)).toBe(true);

    const taunted = show({ ...base, tauntTarget: 'Shroomguard' });
    expect(taunted).toContain('>Taunted: focus Shroomguard<');
    expect(isDisabled(taunted)).toBe(true);
  });
});
