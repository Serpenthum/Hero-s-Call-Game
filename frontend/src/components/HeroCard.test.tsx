// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import HeroCard from './HeroCard';
import type { Hero, StatusEffects } from '../types';
import type { Badge } from '../battle/badges';
import { cleanup, click, render, stubBrowserApis } from '../testing/dom';

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

  // Rules-text fitting does style writes and forced layouts; a tiny card shows no rules text, so it skips them.
  // jsdom has no layout, so give every element a height to let the fitting run.
  it('tiny skips rules-text fitting; a full card still fits its text', () => {
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    try {
      const tiny = render(<HeroCard hero={monk} tiny readable="none" disableHPAnimations />);
      expect((tiny.querySelector('.hero-card') as HTMLElement).style.getPropertyValue('--card-text-size')).toBe('');

      const full = render(<HeroCard hero={monk} readable="none" disableHPAnimations />);
      expect((full.querySelector('.hero-card') as HTMLElement).style.getPropertyValue('--card-text-size')).not.toBe('');
    } finally {
      height.mockRestore();
    }
  });
});

describe('HeroCard badge tokens', () => {
  beforeEach(() => { stubBrowserApis(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const effects = (extra: Partial<StatusEffects>): StatusEffects =>
    ({ poison: 0, taunt: null, silenced: false, disableAttack: false, untargetable: false, ...extra }) as StatusEffects;
  const poisoned: Hero = { ...monk, currentHP: 18, statusEffects: effects({ poison: 3 }) };
  const busy: Hero = { ...monk, currentHP: 18, statusEffects: effects({ poison: 3, untargetable: true }) };
  const tokens = (root: ParentNode) => Array.from(root.querySelectorAll('.card-status > .badge-token'));
  const tip = (root: ParentNode) => root.querySelector('.badge-tip');
  const btn = (root: ParentNode, key: string) => root.querySelector(`.badge-token[data-badge="${key}"] .badge-token-btn`) as HTMLElement;

  it('a poisoned hero shows one poison token and no emoji pill', () => {
    const root = render(<HeroCard hero={poisoned} readable="none" disableHPAnimations />);
    expect(tokens(root).map(t => t.getAttribute('data-badge'))).toEqual(['poison']);
    expect(root.querySelector('.status-effect, .status-effect-tooltip, .status-effects-buffs, .status-effects-debuffs')).toBeNull();
    expect(root.querySelector('.card-status')!.textContent).not.toMatch(/☠|🍄|✨/u);
  });

  it('tapping a token opens its tip and does not call onClick or onInspect', () => {
    const onClick = vi.fn();
    const onInspect = vi.fn();
    const outerClick = vi.fn();
    const outerDown = vi.fn();
    const outerUp = vi.fn();
    const outerMenu = vi.fn();
    const root = render(
      <div onClick={outerClick} onPointerDown={outerDown} onPointerUp={outerUp} onContextMenu={outerMenu}>
        <HeroCard hero={poisoned} isEnemy onInspect={onInspect} disableHPAnimations />
        <HeroCard hero={poisoned} isSelectable onClick={onClick} disableHPAnimations />
      </div>
    );
    expect(root.querySelectorAll('.badge-token-btn')).toHaveLength(2);
    root.querySelectorAll('.badge-token-btn').forEach(b => {
      act(() => {
        b.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        b.dispatchEvent(new Event('pointerup', { bubbles: true }));
        b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      });
      click(b);
      expect(b.closest('.badge-token')!.querySelector('.badge-tip')).not.toBeNull();
    });
    expect(onInspect).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(outerClick).not.toHaveBeenCalled();
    expect(outerDown).not.toHaveBeenCalled();
    expect(outerUp).not.toHaveBeenCalled();
    expect(outerMenu).not.toHaveBeenCalled();
    // A tap on the card itself still reaches it
    click(root.querySelector('.hero-card .card-art'));
    expect(onInspect).toHaveBeenCalledTimes(1);
  });

  it('tapping another token closes the first', () => {
    const root = render(<HeroCard hero={busy} readable="none" disableHPAnimations />);
    click(btn(root, 'poison'));
    click(btn(root, 'hidden'));
    expect(root.querySelectorAll('.badge-tip')).toHaveLength(1);
    expect(btn(root, 'hidden').getAttribute('aria-expanded')).toBe('true');
  });

  it('tapping outside closes it', () => {
    const root = render(<HeroCard hero={poisoned} readable="none" disableHPAnimations />);
    click(btn(root, 'poison'));
    expect(tip(root)).not.toBeNull();
    click(root.querySelector('.card-art'));
    expect(tip(root)).toBeNull();
  });

  it('Escape closes it', () => {
    const root = render(<HeroCard hero={poisoned} readable="none" disableHPAnimations />);
    click(btn(root, 'poison'));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(tip(root)).toBeNull();
  });

  it('the tip closes when the turn changes', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const show = (turn: string) => act(() => {
      root.render(<HeroCard hero={poisoned} readable="none" disableHPAnimations badgeResetKey={turn} />);
    });
    show('0:0:0');
    click(btn(container, 'poison'));
    show('0:0:0');
    expect(tip(container)).not.toBeNull();
    show('1:1:0');
    expect(tip(container)).toBeNull();
    act(() => root.unmount());
  });

  it('the tip closes when its badge goes away', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const show = (hero: Hero) => act(() => { root.render(<HeroCard hero={hero} readable="none" disableHPAnimations />); });
    show(busy);
    click(btn(container, 'poison'));
    show({ ...busy, statusEffects: effects({ untargetable: true }) });
    expect(tip(container)).toBeNull();
    // ...and does not come back by itself when the badge returns
    show(busy);
    expect(tip(container)).toBeNull();
    act(() => root.unmount());
  });

  it('a fallen hero shows no tokens', () => {
    expect(tokens(render(<HeroCard hero={poisoned} readable="none" disableHPAnimations />))).toHaveLength(1);
    const root = render(<HeroCard hero={{ ...poisoned, currentHP: 0 }} readable="none" disableHPAnimations />);
    expect(tokens(root)).toHaveLength(0);
  });

  it('tokens are reachable by Tab and have an accessible name', () => {
    const root = render(<HeroCard hero={busy} readable="none" disableHPAnimations />);
    const buttons = tokens(root).map(t => t.querySelector('.badge-token-btn') as HTMLButtonElement);
    expect(buttons).toHaveLength(2);
    buttons.forEach(b => {
      expect(b.tagName).toBe('BUTTON');
      expect(b.tabIndex).toBe(0);
      expect(b.disabled).toBe(false);
      expect(b.getAttribute('aria-label')).toMatch(/\S+\. \S+/);
    });
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual([expect.stringMatching(/^Hidden\. /), expect.stringMatching(/^Poison 3\. /)]);
  });

  it('shows the badges it is given instead of working them out', () => {
    const given = [{ key: 'tauntComing', symbol: 'i-taunt', rim: 'debuff', dashed: true, short: 'Taunt coming', full: 'x.' }] as Badge[];
    const root = render(<HeroCard hero={poisoned} badges={given} readable="none" disableHPAnimations />);
    expect(tokens(root).map(t => t.getAttribute('data-badge'))).toEqual(['tauntComing']);
  });
});
