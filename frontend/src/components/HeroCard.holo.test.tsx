import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));
vi.mock('../battleAnimations', () => ({ getAnimSpeed: () => 'off' }));

import HeroCard from './HeroCard';
import { setHoloEffects } from '../holoSetting';
import type { Hero } from '../types';

const monk: Hero = { name: 'Monk', HP: 18, Defense: 8, Accuracy: '+2', BasicAttack: '1D6', Ability: [], Special: [] };

// Every stylesheet, read as text without comments (vitest hands CSS imports over empty)
const stylesDir = resolve(__dirname, '../styles');
const sheets = readdirSync(stylesDir).filter(f => f.endsWith('.css'))
  .map(file => ({ file, css: readFileSync(resolve(stylesDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));
const cardCss = sheets.find(s => s.file === 'HeroCard.css')!.css;
// Every innermost rule: its selector and its declarations.
const rules = (css: string) => Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), m => ({ selector: m[1].trim(), body: m[2] }));
// Anything that draws round a box: a frame, a line, a shadow or a glow. border-radius is a shape, not a line.
const DRAWS_ROUND = /--card-frame|--card-glow|\bborder(?!-radius)|outline|box-shadow|drop-shadow/;
const RAINBOW = /conic-gradient|--holo-(pink|yellow|mint|blue|violet)/;

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
    const holoRules = sheets.flatMap(sheet => rules(sheet.css)
      .filter(rule => rule.selector.includes('card-holo'))
      .map(rule => ({ ...rule, where: `${sheet.file}: ${rule.selector}` })));
    expect(holoRules.length).toBeGreaterThan(0);
    for (const rule of holoRules) {
      expect(rule.body, rule.where).not.toMatch(DRAWS_ROUND);
    }
  });

  // The draft's round portrait tokens: a holographic hero's token has a normal token's rim.
  it('a holographic draft portrait has no rainbow rim', () => {
    for (const sheet of sheets) {
      expect(sheet.css, sheet.file).not.toContain('draft-rim');
      for (const rule of rules(sheet.css).filter(r => r.selector.includes('draft-portrait--holo'))) {
        expect(rule.body, `${sheet.file}: ${rule.selector}`).not.toMatch(DRAWS_ROUND);
        expect(rule.body, `${sheet.file}: ${rule.selector}`).not.toMatch(RAINBOW);
        expect(rule.body, `${sheet.file}: ${rule.selector}`).not.toMatch(/animation/);
      }
    }
  });
});
