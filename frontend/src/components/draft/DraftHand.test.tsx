import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../../battleAnimations', () => ({ getAnimSpeed: () => 'off' }));
vi.mock('../../socketService', () => ({
  socketService: { banCard: vi.fn(), pickCard: vi.fn(), setAttackOrder: vi.fn(), abandonDraft: vi.fn() },
}));

import DraftHand, { DraftHandProps } from './DraftHand';
import DraftTopBar from './DraftTopBar';
import DraftBigCard from './DraftBigCard';
import HeroCard from '../HeroCard';
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

const HAND = ['Monk', 'Wizard', 'Bard', 'Druid', 'Cleric'].map(n => hero(n));

const render = (props: Partial<DraftHandProps> = {}) =>
  renderToStaticMarkup(
    <DraftHand cards={HAND} chosen={null} step={0} locked={false} onChoose={() => {}} {...props} />,
  );

// The markup of one hand card: from its wrapper up to the next one.
const handCard = (html: string, name: string) => {
  const start = html.indexOf(`data-name="${name}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('class="draft-hand-card', start + 1);
  return html.slice(html.lastIndexOf('<', start), next === -1 ? undefined : next);
};

describe('DraftHand', () => {
  it('asks for a ban in step 0', () => {
    const html = render({ step: 0 });
    expect(html).toContain('Ban one.');
    expect(html).toContain('Your opponent gets this hand next.');
  });

  it('asks for a pick in the pick steps', () => {
    const html = render({ step: 2 });
    expect(html).toContain('Pick one');
    expect(html).toContain('for your team.');
    expect(html).not.toContain('Ban one.');
  });

  it('tells you to tap to read in the big-card layout', () => {
    expect(render({ step: 0, layout: 'focus' })).toContain('Tap a card to read it.');
    expect(render({ step: 1, layout: 'focus' })).toContain('Pick one.');
  });

  it('marks the chosen card only', () => {
    const html = render({ chosen: 'Wizard' });
    expect(handCard(html, 'Wizard')).toContain('draft-hand-card--chosen');
    expect(handCard(html, 'Monk')).not.toContain('draft-hand-card--chosen');
  });

  it('draws a holographic hand card holographic', () => {
    const html = render({ cards: [hero('Monk', { holo: true }), hero('Bard')] });
    expect(handCard(html, 'Monk')).toContain('card-holo');
    expect(handCard(html, 'Bard')).not.toContain('card-holo');
  });

  it('offers no card to choose once locked', () => {
    expect(render({ locked: false })).toContain('selectable');
    expect(render({ locked: true })).not.toContain('selectable');
  });

  it('keeps the 12px rules-text floor on hand cards in the table layout only', () => {
    expect(render({ layout: 'table' }).match(/data-min-text-px="12"/g)?.length).toBe(HAND.length);
    expect(render({ layout: 'focus' })).not.toContain('data-min-text-px');
  });

  it('keeps cards readable by press', () => {
    expect(render()).toContain('data-read-mode="press"');
  });
});

describe('DraftTopBar', () => {
  const bar = (step: 0 | 1 | 2 | 3 | 4) =>
    renderToStaticMarkup(<DraftTopBar step={step} clock={null} connecting={false} onLeave={() => {}} />);

  it('marks done, current and ban steps', () => {
    const html = bar(2);
    expect(html.match(/draft-step--done/g)?.length).toBe(2);
    expect(html.match(/draft-step--now/g)?.length).toBe(1);
    expect(html).toContain('draft-step--ban');
    expect(html).toContain('Pick 2');
  });

  it('has a Leave button that returns to the lobby without rewards', () => {
    const html = bar(0);
    expect(html).toContain('draft-leave');
    expect(html).toContain('title="Return to lobby without rewards"');
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

const gameState = (currentDraftPhase: number, players: Player[]): GameState => ({
  id: 'g1',
  phase: 'draft',
  currentDraftPhase,
  draftTurn: 0,
  players,
} as unknown as GameState);

describe('DraftPhase', () => {
  it('follows the server after a timeout: the auto-pick is in slot 1 and nothing stays chosen', () => {
    // The clock ran out: the server picked Monk for you, and the hand you now hold has no Wizard
    // (the card you had tapped). The new hand must show with nothing chosen.
    const me = player('me', { team: [hero('Monk')], draftCards: ['Bard', 'Druid', 'Cleric'].map(n => hero(n)) });
    const them = player('them', { team: [hero('Paladin')] });
    const html = renderToStaticMarkup(
      <DraftPhase gameState={gameState(2, [me, them])} currentPlayer={me} opponent={them} allHeroes={[]} draftTimer={null} />,
    );
    const mine = html.slice(html.indexOf('draft-slots--me'), html.indexOf('draft-band-centre'));
    const firstSlot = mine.slice(0, mine.indexOf('draft-slot--empty'));
    expect(firstSlot).toContain('draft-slot--filled');
    expect(firstSlot).toContain('Monk');
    expect(html).not.toContain('draft-hand-card--chosen');
    expect(html).not.toContain('Wizard');
    expect(html).toContain('Pick 2');
  });

  it('hides the opponent ban until you have banned', () => {
    const me = player('me', { bannedCard: null, draftCards: HAND.slice(0, 4).filter(h => h.name !== 'Wizard') });
    const them = player('them', { bannedCard: 'Sorcerer' });
    const html = renderToStaticMarkup(
      <DraftPhase gameState={gameState(0, [me, them])} currentPlayer={me} opponent={them} allHeroes={[]} draftTimer={null} />,
    );
    expect(html).not.toContain('Sorcerer');
    expect(html).toContain('draft-act--ban');
  });

  it('renders the table root with its size variables', () => {
    const me = player('me', { draftCards: HAND });
    const html = renderToStaticMarkup(
      <DraftPhase gameState={gameState(0, [me, player('them')])} currentPlayer={me} opponent={null} allHeroes={[]} draftTimer={null} />,
    );
    expect(html).toContain('draft-table draft-table--table');
    expect(html).toContain('--draft-card-w');
    expect(html).toContain('--draft-slot-w');
    // Battle animations are off in this test (mocked): the root carries the still class motion keys off.
    expect(html).toContain('draft--still');
    expect(html).not.toContain('draft-table--still');
  });
});

describe('12px floor', () => {
  it('the big card keeps the 12px rules-text floor', () => {
    const html = renderToStaticMarkup(<DraftBigCard hero={hero('Monk')} waiting={false} />);
    expect(html).toContain('data-min-text-px="12"');
  });

  it('cards elsewhere (no prop) keep the usual fitting', () => {
    expect(renderToStaticMarkup(<HeroCard hero={hero('Monk')} />)).not.toContain('data-min-text-px');
  });
});
