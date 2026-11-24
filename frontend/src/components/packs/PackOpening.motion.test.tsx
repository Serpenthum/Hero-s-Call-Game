// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sound = vi.hoisted(() => ({ playSound: vi.fn(), loadSoundGroup: vi.fn() }));
vi.mock('../../sound', () => sound);
vi.mock('../../config', () => ({ default: { IMAGE_BASE_URL: 'http://img.test', API_BASE_URL: '', SOCKET_URL: '' } }));

import PackOpening from './PackOpening';
import { CardReaderProvider } from '../../cards/CardReader';
import type { PackCard, PackCardKind, PackResult } from './packTypes';
import type { Hero } from '../../types';
import { buttonByText, cleanup, click, render, stubBrowserApis } from '../../testing/dom';

const hero = (name: string): Hero => ({ name, HP: 18, Defense: 8, Accuracy: '+2', BasicAttack: '1D6', Ability: [], Special: [] });
const card = (name: string, kind: PackCardKind): PackCard => ({ name, kind, hero: hero(name) });
const fourCards: PackResult = {
  cards: [card('Ninja', 'new'), card('Monk', 'repeat'), card('Pirate', 'new'), card('Samurai', 'holo')],
  coinsBack: 2,
  shardsGained: 0,
  newVP: 30,
};
const noop = () => undefined;
const cards = (root: ParentNode) => Array.from(root.querySelectorAll('[data-kind]')) as HTMLElement[];
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

// Animations on (the default): cards turn on timers, and a holographic card trembles before it turns.
describe('PackOpening with animations on', () => {
  beforeEach(() => {
    stubBrowserApis();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  const openPack = (turns: string[]) => {
    const root = render(
      <CardReaderProvider>
        <PackOpening result={fourCards} price={12} canBuyAnother buying={false} onBuyAnother={noop} onDone={noop} onTurn={name => turns.push(name)} />
      </CardReaderProvider>
    );
    click(root.querySelector('.pack-opening__pack'));
    expect((root.querySelector('[data-stage]') as HTMLElement).dataset.stage).toBe('opening');
    advance(3000);
    expect(cards(root)).toHaveLength(4);
    return root;
  };

  it('turn all over, then a tap on the holographic card, turns each card exactly once', () => {
    const turns: string[] = [];
    const root = openPack(turns);

    click(buttonByText(root, 'Turn all over'));
    advance(100);
    click(cards(root)[3]);
    act(() => { vi.runAllTimers(); });

    expect(cards(root).map(c => c.dataset.turned)).toEqual(['true', 'true', 'true', 'true']);
    expect([...turns].sort()).toEqual(['Monk', 'Ninja', 'Pirate', 'Samurai']);
    expect(root.querySelector('[data-spot]')).toBeNull();
  });

  it('a repeat of a hero you own holographic turns holographic, without the holographic takeover', () => {
    const result: PackResult = {
      cards: [card('Ninja', 'new'), { ...card('Monk', 'repeat'), holo: true }, card('Pirate', 'new')],
      coinsBack: 2,
      shardsGained: 0,
      newVP: 30,
    };
    const root = render(
      <CardReaderProvider>
        <PackOpening result={result} price={12} canBuyAnother buying={false} onBuyAnother={noop} onDone={noop} />
      </CardReaderProvider>
    );
    click(root.querySelector('.pack-opening__pack'));
    advance(3000);
    const monk = cards(root)[1];

    click(monk);

    expect(monk.dataset.turned).toBe('true');
    expect(root.querySelector('[data-spot]')).toBeNull();
    expect(monk.querySelector('.card-holo')).not.toBeNull();
    expect(monk.querySelector('.pack-opening__label')?.textContent).toBe('Already owned · +2');
    expect(cards(root)[0].querySelector('.card-holo')).toBeNull();
  });

  it('tapping a plain card during turn all over does not turn it twice', () => {
    const turns: string[] = [];
    const root = openPack(turns);

    click(buttonByText(root, 'Turn all over'));
    advance(100);
    click(cards(root)[2]);
    act(() => { vi.runAllTimers(); });

    expect(turns.filter(name => name === 'Pirate')).toHaveLength(1);
    expect(turns).toHaveLength(4);
  });

  it('loads the pack sounds on mount, and the cut plays pack.tear once', () => {
    sound.playSound.mockClear();
    sound.loadSoundGroup.mockClear();
    const root = render(
      <CardReaderProvider>
        <PackOpening result={fourCards} price={12} canBuyAnother buying={false} onBuyAnother={noop} onDone={noop} />
      </CardReaderProvider>
    );
    expect(sound.loadSoundGroup).toHaveBeenCalledWith('pack');
    click(root.querySelector('.pack-opening__pack'));
    expect(sound.playSound).not.toHaveBeenCalledWith('pack.tear');
    advance(3000);
    expect(sound.playSound.mock.calls.filter(c => c[0] === 'pack.tear')).toHaveLength(1);
  });

  it('tapping the holo card plays pack.holo once, when it turns', () => {
    const root = openPack([]);
    sound.playSound.mockClear();
    click(cards(root)[3]);
    expect(sound.playSound).not.toHaveBeenCalledWith('pack.holo');
    act(() => { vi.runAllTimers(); });
    expect(sound.playSound.mock.calls.filter(c => c[0] === 'pack.holo')).toHaveLength(1);
    expect(cards(root)[3].dataset.turned).toBe('true');
  });

  it('a plain card plays no holo sound', () => {
    const root = openPack([]);
    sound.playSound.mockClear();
    click(cards(root)[0]);
    act(() => { vi.runAllTimers(); });
    expect(sound.playSound).not.toHaveBeenCalledWith('pack.holo');
  });
});
