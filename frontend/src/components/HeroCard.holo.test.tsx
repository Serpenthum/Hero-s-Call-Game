import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../battleAnimations', () => ({ getAnimSpeed: () => 'off' }));

import HeroCard from './HeroCard';
import { setHoloEffects } from '../holoSetting';
import type { Hero } from '../types';

const monk: Hero = { name: 'Monk', HP: 18, Defense: 8, Accuracy: '+2', BasicAttack: '1D6', Ability: [], Special: [] };

const memoryStorage = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  };
};

describe('HeroCard holo', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('HeroCard hides the holo layers when holo effects are off', () => {
    setHoloEffects(false);
    const off = renderToStaticMarkup(<HeroCard hero={monk} holo readable="none" disableHPAnimations />);
    expect(off).not.toContain('card-holo');
    expect(off).not.toContain('card-sheen');
    expect(off).not.toContain('card-spark');
    expect(off).not.toContain('card-foil');

    setHoloEffects(true);
    const on = renderToStaticMarkup(<HeroCard hero={monk} holo readable="none" disableHPAnimations />);
    expect(on).toContain('card-holo');
    expect(on).toContain('card-sheen');
    expect(on).toContain('card-spark');
    expect(on).toContain('card-foil');
  });
});
