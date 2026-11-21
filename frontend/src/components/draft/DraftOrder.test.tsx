import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../../battleAnimations', () => ({ getAnimSpeed: () => 'off' }));
vi.mock('../../socketService', () => ({
  socketService: { banCard: vi.fn(), pickCard: vi.fn(), setAttackOrder: vi.fn(), abandonDraft: vi.fn() },
}));

import DraftOrder, { tapOrder } from './DraftOrder';
import DraftPhase from '../DraftPhase';
import type { GameState, Hero, Player } from '../../types';

const hero = (name: string, extra: Partial<Hero> = {}): Hero => ({
  name,
  HP: 18,
  Defense: 8,
  Accuracy: '+2',
  BasicAttack: '1D6',
  Ability: [{ name: `${name} move`, description: `${name} rules`, effects: [] } as any],
  Special: [],
  ...extra,
});

const ORDER = ['Cleric', 'Fighter', 'Barbarian'].map(n => hero(n));

const render = (props: Partial<React.ComponentProps<typeof DraftOrder>> = {}) =>
  renderToStaticMarkup(<DraftOrder order={ORDER} selected={null} ready={false} onTap={() => {}} {...props} />);

// The markup of one order card: from its wrapper up to the next one.
const orderCard = (html: string, name: string) => {
  const start = html.indexOf(`data-name="${name}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('class="draft-order-card', start + 1);
  return html.slice(html.lastIndexOf('<', start), next === -1 ? undefined : next);
};

describe('DraftOrder', () => {
  it('numbers the heroes 1-3 in order, with "Attacks first" once, under number 1', () => {
    const html = render();
    const badges = [...html.matchAll(/class="draft-order-badge"[^>]*>(\d)</g)].map(m => m[1]);
    expect(badges).toEqual(['1', '2', '3']);
    expect(html.match(/Attacks first/g)?.length).toBe(1);
    expect(orderCard(html, 'Cleric')).toContain('Attacks first');
    expect(html.indexOf('data-name="Cleric"')).toBeLessThan(html.indexOf('data-name="Fighter"'));
    expect(html.indexOf('data-name="Fighter"')).toBeLessThan(html.indexOf('data-name="Barbarian"'));
  });

  it('marks the tapped card selected', () => {
    const html = render({ selected: 'Fighter' });
    expect(orderCard(html, 'Fighter')).toContain('draft-order-card--selected');
    expect(orderCard(html, 'Cleric')).not.toContain('draft-order-card--selected');
  });

  it('offers no card to tap once ready', () => {
    expect(render({ ready: false })).toContain('selectable');
    expect(render({ ready: true })).not.toContain('selectable');
  });

  it('asks the player to set their order', () => {
    expect(render()).toContain('Set your order.');
  });

  it('draws holographic heroes holographic', () => {
    const html = render({ order: [hero('Cleric', { holo: true }), hero('Fighter'), hero('Barbarian')] });
    expect(orderCard(html, 'Cleric')).toContain('card-holo');
    expect(orderCard(html, 'Fighter')).not.toContain('card-holo');
  });

  it('keeps the 12px rules-text floor on every card that is not tiny', () => {
    expect(render().match(/data-min-text-px="12"/g)?.length).toBe(3);
    expect(render({ tiny: false }).match(/data-min-text-px="12"/g)?.length).toBe(3);
    expect(render({ tiny: true })).not.toContain('data-min-text-px');
  });
});

describe('tapOrder', () => {
  const names = ['Cleric', 'Fighter', 'Barbarian'];

  it('first tap selects', () => {
    expect(tapOrder({ order: names, selected: null }, 'Fighter')).toEqual({ order: names, selected: 'Fighter' });
  });

  it('tapping the selected card again cancels', () => {
    expect(tapOrder({ order: names, selected: 'Fighter' }, 'Fighter')).toEqual({ order: names, selected: null });
  });

  it('tapping another swaps the two and clears the selection', () => {
    expect(tapOrder({ order: names, selected: 'Cleric' }, 'Barbarian')).toEqual({
      order: ['Barbarian', 'Fighter', 'Cleric'],
      selected: null,
    });
  });
});

const player = (id: string, extra: Partial<Player> = {}): Player => ({
  id,
  name: id === 'me' ? 'Ada' : 'Bo',
  connected: true,
  team: [],
  attackOrder: [],
  currentHeroIndex: 0,
  hasUsedAttack: false,
  hasUsedAbility: false,
  ...extra,
});

const setup = (players: Player[]): GameState =>
  ({ id: 'g1', phase: 'setup', currentDraftPhase: 3, draftTurn: 0, players } as unknown as GameState);

const renderSetup = (me: Player, them: Player, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <DraftPhase gameState={setup([me, them])} currentPlayer={me} opponent={them} allHeroes={[]} draftTimer={null} {...extra} />,
  );

describe('DraftPhase order step', () => {
  const team = ORDER;

  it('shows a player whose attack order is set as ready: "Ready ✓", disabled, and "Done ✓"', () => {
    const me = player('me', { team, attackOrder: ['Cleric', 'Fighter', 'Barbarian'] });
    const html = renderSetup(me, player('them', { team: [hero('Monk'), hero('Bard'), hero('Druid')] }));
    const button = html.slice(html.lastIndexOf('<button', html.indexOf('draft-act')));
    expect(button).toMatch(/^<button[^>]*disabled=""[^>]*>Ready ✓<\/button>/);
    expect(html).toContain('draft-status--done');
    expect(html).not.toContain('selectable');
  });

  it('before Ready: "Ready" enabled, the three heroes numbered, the step strip on Order', () => {
    const me = player('me', { team });
    const html = renderSetup(me, player('them', { team: [hero('Monk'), hero('Bard'), hero('Druid')] }));
    const button = html.slice(html.lastIndexOf('<button', html.indexOf('draft-act')));
    expect(button).toMatch(/^<button[^>]*>Ready<\/button>/);
    expect(button).not.toMatch(/^<button[^>]*disabled/);
    expect(html.match(/class="draft-order-badge"/g)?.length).toBe(3);
    expect(html).toContain('draft-table');
    expect(html).not.toContain('setup-phase');
  });

  it('shows the order a refreshed player already sent, in the band too', () => {
    const me = player('me', { team: [hero('Fighter'), hero('Barbarian'), hero('Cleric')], attackOrder: ['Fighter', 'Barbarian', 'Cleric'] });
    const html = renderSetup(me, player('them'));
    const hand = html.slice(html.indexOf('draft-hand'));
    expect(hand.indexOf('data-name="Fighter"')).toBeLessThan(hand.indexOf('data-name="Cleric"'));
    const band = html.slice(html.indexOf('draft-slots--me'), html.indexOf('draft-band-centre'));
    expect(band.indexOf('data-name="Fighter"')).toBeLessThan(band.indexOf('data-name="Cleric"'));
  });

  it("shows the opponent's status as Done once they are ready", () => {
    const me = player('me', { team });
    const waiting = renderSetup(me, player('them', { isReady: false } as Partial<Player>));
    const them = waiting.slice(waiting.indexOf('draft-side--them'));
    expect(them).toContain('draft-status--choosing');
    const ready = renderSetup(me, player('them', { isReady: true } as Partial<Player>));
    expect(ready.slice(ready.indexOf('draft-side--them'))).toContain('draft-status--done');
  });

  it('shows the away banner across the hand area and Connecting… in the top bar', () => {
    const me = player('me', { team });
    const html = renderSetup(me, player('them'), { away: <div className="test-away">Bo is away</div>, connecting: true });
    expect(html).toContain('draft-away');
    expect(html.indexOf('test-away')).toBeGreaterThan(html.indexOf('draft-hand'));
    expect(html).toContain('Connecting…');
    expect(renderSetup(me, player('them'))).not.toContain('draft-away');
  });
});
