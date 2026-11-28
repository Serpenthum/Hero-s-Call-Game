// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useBadgeTip, type BadgeTip } from './useBadgeTip';
import { cleanup, render } from '../../testing/dom';

// Mounts one hook per "card"; each handle always holds that card's latest result
function mount(resetKey: unknown = 1): { tip: () => BadgeTip; rerender: (key: unknown) => void } {
  let latest: BadgeTip | null = null;
  const Probe = ({ k }: { k: unknown }) => { latest = useBadgeTip(k); return null; };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => { root.render(createElement(Probe, { k: resetKey })); });
  roots.push(root);
  return {
    tip: () => latest!,
    rerender: (key: unknown) => act(() => { root.render(createElement(Probe, { k: key })); }),
  };
}
let roots: Root[] = [];

afterEach(() => {
  roots.forEach(r => act(() => r.unmount()));
  roots = [];
  cleanup();
});

describe('useBadgeTip', () => {
  it('a tap toggles the tip open and shut', () => {
    const card = mount();
    act(() => card.tip().toggle('poison'));
    expect(card.tip().openKey).toBe('poison');
    act(() => card.tip().toggle('poison'));
    expect(card.tip().openKey).toBeNull();
  });

  it('tapping another token closes the first', () => {
    const card = mount();
    act(() => card.tip().toggle('poison'));
    act(() => card.tip().toggle('taunted'));
    expect(card.tip().openKey).toBe('taunted');
  });

  it('opening a tip on another card closes this one', () => {
    const a = mount();
    const b = mount();
    act(() => a.tip().toggle('poison'));
    act(() => b.tip().toggle('hidden'));
    expect(a.tip().openKey).toBeNull();
    expect(b.tip().openKey).toBe('hidden');
  });

  it('tapping outside closes it, a tap on a badge does not', () => {
    const card = mount();
    act(() => card.tip().toggle('poison'));
    const token = render(createElement('span', { className: 'badge-token' }, createElement('b', null, 'x')));
    act(() => { (token.querySelector('b') as HTMLElement).click(); });
    expect(card.tip().openKey).toBe('poison');
    act(() => { document.body.click(); });
    expect(card.tip().openKey).toBeNull();
  });

  it('Escape closes it', () => {
    const card = mount();
    act(() => card.tip().toggle('poison'));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(card.tip().openKey).toBeNull();
  });

  it('a hover opens and leaving closes', () => {
    const card = mount();
    act(() => card.tip().hover('poison', true));
    expect(card.tip().openKey).toBe('poison');
    act(() => card.tip().hover('poison', false));
    expect(card.tip().openKey).toBeNull();
  });

  it('a click while hovering keeps it open after the mouse leaves', () => {
    const card = mount();
    act(() => { card.tip().hover('poison', true); card.tip().toggle('poison'); });
    act(() => card.tip().hover('poison', false));
    expect(card.tip().openKey).toBe('poison');
  });

  it('the tip closes when the turn changes', () => {
    const card = mount('0:0:0');
    act(() => card.tip().toggle('poison'));
    card.rerender('0:0:0');
    expect(card.tip().openKey).toBe('poison');
    card.rerender('1:1:0');
    expect(card.tip().openKey).toBeNull();
  });
});
