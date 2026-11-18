import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../battleAnimations', () => ({ getAnimSpeed: () => 'off', startClockSound: () => () => {} }));

import BattleDetailsPanel from './BattleDetailsPanel';
import type { Hero } from '../types';

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

const render = (props: Partial<{ hero: Hero; side: 'enemy' | 'ally'; isFocused: boolean }> = {}) =>
  renderToStaticMarkup(
    <BattleDetailsPanel hero={props.hero ?? warlock()} side={props.side ?? 'enemy'} isFocused={props.isFocused ?? false} />
  );

describe('BattleDetailsPanel', () => {
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
});
