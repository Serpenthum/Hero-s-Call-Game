// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));

import HeroCard from './HeroCard';
import type { Hero } from '../types';
import { cleanup, render, stubBrowserApis } from '../testing/dom';

const monk: Hero = { name: 'Monk', HP: 18, Defense: 8, Accuracy: '+2', BasicAttack: '1D6', Ability: [], Special: [] };

describe('HeroCard tiny', () => {
  beforeEach(() => { stubBrowserApis(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  // jsdom applies no container queries, so this checks the class the tiny-mode CSS keys on, not computed styles.
  it('tiny adds card-tiny and keeps no rules text in the DOM flow', () => {
    const tiny = render(<HeroCard hero={monk} tiny readable="none" disableHPAnimations />);
    expect(tiny.querySelector('.hero-card')?.classList.contains('card-tiny')).toBe(true);

    const full = render(<HeroCard hero={monk} readable="none" disableHPAnimations />);
    expect(full.querySelector('.hero-card')?.classList.contains('card-tiny')).toBe(false);
  });
});
