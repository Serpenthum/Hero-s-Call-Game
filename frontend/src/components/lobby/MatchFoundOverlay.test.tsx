import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
const animSpeed = vi.hoisted(() => ({ value: 'normal' }));
vi.mock('../../battleAnimations', () => ({ getAnimSpeed: () => animSpeed.value }));

import MatchFoundOverlay, { MATCH_FOUND_DONE_AT_MS, MATCH_FOUND_FADE_AT_MS } from './MatchFoundOverlay';

const render = (me: { name: string; icon: string | null }, them: { name: string; icon: string | null }) =>
  renderToStaticMarkup(<MatchFoundOverlay me={me} them={them} onDone={() => {}} />);

describe('MatchFoundOverlay', () => {
  it('shows the caption, VS, both names and both portraits', () => {
    const html = render({ name: 'Ava', icon: 'Arcane Archer' }, { name: 'Rival', icon: 'Ninja' });
    expect(html).toContain('Match found');
    expect(html).toContain('>VS<');
    expect(html).toContain('>Ava<');
    expect(html).toContain('>Rival<');
    expect(html).toContain('src="http://img.test/hero-images/arcanearcher.webp"');
    expect(html).toContain('src="http://img.test/hero-images/ninja.webp"');
    expect(html).not.toContain('match-found-portrait--initial');
  });

  it('shows a frame with the initial for a player without a profile hero', () => {
    const html = render({ name: 'Ava', icon: 'Wizard' }, { name: 'rival', icon: null });
    expect(html).toContain('match-found-portrait--initial');
    expect(html).toMatch(/match-found-portrait--initial"[^>]*>R</);
    expect(html.match(/<img/g)).toHaveLength(1);
  });

  it('is marked still when battle animations are off', () => {
    expect(render({ name: 'A', icon: null }, { name: 'B', icon: null })).not.toContain('match-found--still');
    animSpeed.value = 'off';
    expect(render({ name: 'A', icon: null }, { name: 'B', icon: null })).toContain('match-found--still');
    animSpeed.value = 'normal';
  });

  it('is over within two seconds, after a 400 ms fade', () => {
    expect(MATCH_FOUND_DONE_AT_MS).toBeLessThan(2000);
    expect(MATCH_FOUND_DONE_AT_MS - MATCH_FOUND_FADE_AT_MS).toBe(400);
  });
});
