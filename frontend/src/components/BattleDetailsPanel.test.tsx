// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../battleAnimations', () => ({ getAnimSpeed: () => 'off', startClockSound: () => () => {} }));
vi.mock('./BattleFX', () => ({ default: () => null }));
vi.mock('../socketService', () => ({
  socketService: { selectTarget: vi.fn(), basicAttack: vi.fn(), useAbility: vi.fn(), activateSpecial: vi.fn(), endTurn: vi.fn() },
}));

import BattleDetailsPanel from './BattleDetailsPanel';
import BattlePhase from './BattlePhase';
import type { GameState, Hero, Player } from '../types';
import type { Badge } from '../battle/badges';
import { cleanup, click, render as mount, stubBrowserApis } from '../testing/dom';

const warlock = (currentHP = 20): Hero => ({
  name: 'Warlock',
  HP: 20,
  currentHP,
  Defense: 8,
  Accuracy: '+2',
  BasicAttack: '1D6',
  Ability: [{ name: 'Hex', description: 'Curse the focused enemy for two turns.', effects: [] }],
  Special: [{ name: 'Dark Pact', description: 'Gains strength when an ally falls.', effects: [] }],
});

// The panel's markup, rendered in the page
const render = (props: Partial<{ hero: Hero; side: 'enemy' | 'ally'; isFocused: boolean; badges: Badge[] }> = {}) =>
  mount(
    <BattleDetailsPanel
      hero={props.hero ?? warlock()}
      side={props.side ?? 'enemy'}
      isFocused={props.isFocused ?? false}
      badges={props.badges}
    />
  ).innerHTML;

const POISON: Badge = {
  key: 'poison', symbol: 'i-poison', rim: 'poison', count: '2', short: 'Poison 2',
  full: 'Takes 2 damage at the start of each turn.',
};
const COMING: Badge = {
  key: 'tauntComing', symbol: 'i-taunt', rim: 'debuff', dashed: true, short: 'Taunt coming',
  full: 'Will be taunted by Paladin at the end of this turn.',
};

describe('BattleDetailsPanel', () => {
  beforeEach(() => { stubBrowserApis(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('shows only the card: no header, tags, close button or separate rules text', () => {
    const html = render();
    expect(html).toContain('Warlock');
    expect(html).toContain('aria-label="Warlock"');
    expect(html).toContain('data-side="enemy"');
    expect(html).toContain('hero-card');
    for (const gone of ['<header', 'battle-details-tag', 'Close details', 'Enemy', 'battle-details-rules', 'More']) {
      expect(html).not.toContain(gone);
    }
    expect(render({ side: 'ally' })).not.toContain('Your hero');
  });

  it('puts the focus ring on the card without marking it as the board focus', () => {
    const html = render({ isFocused: true });
    expect(html).toContain('battle-details--focused');
    expect(html).not.toContain('>Focused<');
    expect(html).not.toContain('data-focused');
    expect(html).not.toMatch(/hero-card[^"]*\bfocused\b/);
    expect(html).not.toContain('card-focus-halo');
    expect(render()).not.toContain('battle-details--focused');
  });

  it('shows a fallen hero as dead on the card, with no tag', () => {
    const html = render({ hero: warlock(0) });
    expect(html).toMatch(/hero-card[^"]*\bdead\b/);
    expect(html).not.toContain('Fallen');
  });

  it('the details view lists every badge with short and full text', () => {
    const html = render({ badges: [POISON, COMING] });
    const list = html.slice(html.indexOf('<ul class="badge-list"'));
    expect(list).toContain('<ul class="badge-list"');
    expect(list.match(/<li class="badge-list-item"/g)).toHaveLength(2);
    for (const b of [POISON, COMING]) {
      expect(list).toContain(`data-badge="${b.key}"`);
      expect(list).toContain(`<strong class="badge-list-short">${b.short}</strong>`);
      expect(list).toContain(`<span class="badge-list-full">${b.full}</span>`);
      expect(list).toContain(`href="#${b.symbol}"`);
    }
    expect(list).toContain('class="badge-token badge-poison"');
    expect(list).toContain('class="badge-token badge-debuff badge-dashed"');
    expect(list).toContain('<span class="badge-count">2</span>');
    // A picture only: nothing in the list can be tapped or opened
    const ul = list.slice(0, list.indexOf('</ul>'));
    expect(ul).not.toContain('<button');
    expect(ul).not.toContain('badge-tip');
  });

  it('no list when the hero has no badges', () => {
    expect(render()).not.toContain('badge-list');
    expect(render({ badges: [] })).not.toContain('badge-list');
  });

  describe('in the page', () => {
    it('a tap on the list still closes the panel as today', () => {
      const onClose = vi.fn();
      const root = mount(
        <BattleDetailsPanel hero={warlock()} side="enemy" isFocused={false} badges={[POISON, COMING]} onClose={onClose} />
      );
      click(root.querySelector('.badge-list-full'));
      click(root.querySelector('.badge-list .badge-token'));
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    // The panel's card and list use the board's badge context, not the hero alone
    const hero = (name: string, id: string): Hero => ({ ...warlock(), name, id, statusEffects: { poison: 0, taunt: null } } as Hero);
    const player = (id: string, team: Hero[]): Player => ({
      id, name: id, connected: true, team, attackOrder: team.map(h => h.name), currentHeroIndex: 0,
      hasUsedAttack: false, hasUsedAbility: false, selectedTarget: null,
    } as Player);
    const openPanel = (taunterHP: number) => {
      const taunted = hero('Monk', '0-0');
      taunted.statusEffects = { poison: 0, taunt: { target: 'Paladin', duration: 1 } } as Hero['statusEffects'];
      const paladin = { ...hero('Paladin', '1-0'), currentHP: taunterHP };
      const me = player('me', [taunted, hero('Druid', '0-1')]);
      const them = player('them', [paladin, hero('Wizard', '1-1')]);
      const gameState = {
        id: 'g1', phase: 'battle', players: [me, them], currentTurn: 0,
        activeHero: { name: 'Druid', playerIndex: 0, heroIndex: 1 }, currentDraftPhase: 0, draftTurn: 0, winner: null,
      } as GameState;
      const slot = document.createElement('div');
      slot.id = 'battle-details-slot';
      document.body.appendChild(slot);
      const root = mount(<BattlePhase gameState={gameState} currentPlayer={me} opponent={them} playerId="me" />);
      click(root.querySelector('[data-anim-key="me:0"] .card-art'));
      const panel = slot.querySelector('.battle-details');
      expect(panel).not.toBeNull();
      return panel!;
    };

    it('a dead taunter shows no Taunted in the panel', () => {
      const panel = openPanel(0);
      expect(panel.querySelector('[data-badge="taunted"]')).toBeNull();
      expect(panel.textContent).not.toContain('Taunted');
    });

    it('a living taunter shows Taunted on the panel card and in its list', () => {
      const panel = openPanel(20);
      expect(panel.querySelector('.hero-card [data-badge="taunted"]')).not.toBeNull();
      expect(panel.querySelector('.badge-list [data-badge="taunted"]')).not.toBeNull();
    });
  });
});
