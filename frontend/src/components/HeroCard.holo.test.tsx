import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../battleAnimations', () => ({ getAnimSpeed: () => 'off' }));

import HeroCard from './HeroCard';
import { setHoloEffects } from '../holoSetting';
import type { Hero } from '../types';

const monk: Hero = { name: 'Monk', HP: 18, Defense: 8, Accuracy: '+2', BasicAttack: '1D6', Ability: [], Special: [] };

// The card's stylesheet, read as text (vitest hands CSS imports over empty)
const cardCss = readFileSync(resolve(__dirname, '../styles/HeroCard.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
// Every innermost rule: its selector and its declarations.
const rules = (css: string) => Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), m => ({ selector: m[1].trim(), body: m[2] }));

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

    setHoloEffects(true);
    const on = renderToStaticMarkup(<HeroCard hero={monk} holo readable="none" disableHPAnimations />);
    expect(on).toContain('card-holo');
    expect(on).toContain('card-sheen');
    expect(on).toContain('card-spark');
  });

  // Owner's ruling, 2026-11-24: a holographic card keeps a normal card's frame and shadow; only its face differs.
  it('a holographic card has no rainbow border', () => {
    setHoloEffects(true);
    const on = renderToStaticMarkup(<HeroCard hero={monk} holo readable="none" disableHPAnimations />);
    expect(on).not.toContain('card-foil');

    expect(cardCss).not.toContain('card-foil');
    expect(cardCss).not.toContain('conic-gradient');
    const holoRules = rules(cardCss).filter(rule => rule.selector.includes('card-holo'));
    expect(holoRules.length).toBeGreaterThan(0);
    for (const rule of holoRules) {
      expect(rule.body, rule.selector).not.toMatch(/--card-frame|--card-glow|border|box-shadow|outline/);
    }
  });
});
