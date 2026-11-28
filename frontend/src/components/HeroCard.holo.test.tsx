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

  // Owner's ruling, 2026-11-24: the draft's round portrait tokens keep the rim, the only thing that tells a
  // holographic hero's token from a plain one.
  it('a holographic draft portrait has a turning rainbow rim, which stands still with animations off', () => {
    const draftCss = sheets.find(s => s.file === 'Draft.css')!.css;
    const holoRules = rules(draftCss).filter(r => r.selector.includes('draft-portrait--holo'));
    const rim = holoRules.find(r => RAINBOW.test(r.body));
    expect(rim, 'the rim rule').toBeDefined();
    expect(rim!.selector.split(',').map(s => s.trim())).toContain('.draft-portrait--holo');
    expect(rim!.body).toMatch(/border:[^;]*transparent/);
    expect(rim!.body).toMatch(/conic-gradient\(\s*from var\(--draft-rim-a\)[\s\S]*border-box/);
    expect(rim!.body).toMatch(/animation:\s*draft-rim\b[^;]*infinite/);
    expect(draftCss).toMatch(/@property --draft-rim-a\s*\{/);
    expect(draftCss).toMatch(/@keyframes draft-rim\s*\{\s*to\s*\{\s*--draft-rim-a:\s*360deg/);

    // Animation speed "off" (the draft table carries draft--still), and the system's reduced-motion setting
    const stops = holoRules.filter(r => /animation:\s*none/.test(r.body)).map(r => r.selector);
    expect(stops).toContain('.draft--still .draft-portrait--holo');
    const reduced = draftCss.slice(draftCss.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    const reducedStop = rules(reduced).find(r => r.selector.includes('draft-portrait--holo'));
    expect(reducedStop?.body).toMatch(/animation:\s*none/);
    // ...which must reach every selector of the rim rule (a ban's token is the stronger one), or that rim keeps turning
    expect(reducedStop!.selector.split(',').map(s => s.trim())).toEqual(rim!.selector.split(',').map(s => s.trim()));
  });
});
