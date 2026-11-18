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
    <BattleDetailsPanel hero={props.hero ?? warlock()} side={props.side ?? 'enemy'} isFocused={props.isFocused ?? false} onClose={() => {}} />
  );

describe('BattleDetailsPanel', () => {
  it('shows the hero, its rules and its side', () => {
    const html = render();
    expect(html).toContain('Warlock');
    expect(html).toContain('Ability:');
    expect(html).toContain('Curse the focused enemy for two turns.');
    expect(html).toContain('Special:');
    expect(html).toContain('data-side="enemy"');
    expect(html).toContain('Enemy');
    expect(html).toContain('aria-label="Close details"');
    expect(html).not.toContain('Focused<');
    expect(html).not.toContain('Fallen');
  });

  it('tags a focused hero', () => {
    expect(render({ isFocused: true })).toContain('Focused');
  });

  it('tags a fallen hero', () => {
    expect(render({ hero: warlock(0) })).toContain('Fallen');
  });

  it('tags your own hero', () => {
    const html = render({ side: 'ally' });
    expect(html).toContain('Your hero');
    expect(html).toContain('data-side="ally"');
  });
});
