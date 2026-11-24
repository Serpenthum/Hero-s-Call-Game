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

// Today's server: one card, its result beside it. Times are the approved mockup's (section b).
describe('PackOpening, one card', () => {
  beforeEach(() => {
    stubBrowserApis();
    vi.useFakeTimers();
    sound.playSound.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  const one = (kind: PackCardKind, extra: Partial<PackResult> = {}, holo?: boolean): PackResult => ({
    cards: [{ ...card('Ninja', kind), ...(holo === undefined ? null : { holo }) }],
    coinsBack: 0,
    newVP: 30,
    shardsGained: 0,
    ...extra,
  });
  const mount = (result: PackResult) => render(
    <CardReaderProvider>
      <PackOpening result={result} price={20} canBuyAnother buying={false} onBuyAnother={noop} onDone={noop} />
    </CardReaderProvider>
  );
  // The pack is open and the one card lies face down
  const openOne = (result: PackResult) => {
    const root = mount(result);
    click(root.querySelector('.pack-opening__pack'));
    advance(3000);
    expect(cards(root).map(c => c.dataset.turned)).toEqual(['false']);
    return root;
  };
  const opening = (root: ParentNode) => root.querySelector('.pack-opening') as HTMLElement;
  const bursts = (root: ParentNode) => Array.from(root.querySelectorAll('.pack-opening__burst')).map(b => (b as HTMLElement).dataset.tone);
  const holoSounds = () => sound.playSound.mock.calls.filter(c => c[0] === 'pack.holo').length;

  it('the single card reveals with the approved timing', () => {
    // A plain card turns on the tap; gold sparks 580ms later, once its face is up
    const plain = openOne(one('new'));
    expect(plain.querySelector('.pack-opening__turn-hint')?.textContent).toBe('Tap the card to turn it over');
    click(cards(plain)[0]);
    expect(cards(plain)[0].dataset.turned).toBe('true');
    expect(opening(plain).dataset.spot).toBeUndefined();
    advance(579);
    expect(bursts(plain)).toEqual([]);
    advance(1);
    expect(bursts(plain)).toEqual(['gold']);
    expect(holoSounds()).toBe(0);
    cleanup();

    // A holographic card has the screen: it trembles where it lies for 900ms, turns, bursts 580ms later, and the
    // screen is back at 3000ms. The result beside it names it; there is no banner.
    const holo = openOne(one('holo', {}, true));
    click(cards(holo)[0]);
    expect(opening(holo).dataset.spot).toBe('on');
    expect(cards(holo)[0].style.getPropertyValue('--spot-x')).toBe('');
    advance(899);
    expect(cards(holo)[0].dataset.turned).toBe('false');
    expect(holoSounds()).toBe(0);
    advance(1);
    expect(cards(holo)[0].dataset.turned).toBe('true');
    expect(holoSounds()).toBe(1);
    expect(holo.querySelector('.pack-opening__kind')?.textContent).toBe('Holographic!');
    expect(holo.querySelector('.pack-opening__banner')).toBeNull();
    advance(579);
    expect(bursts(holo)).toEqual([]);
    expect(opening(holo).dataset.jolt).toBe('a'); // the pack's top coming off was the first jolt
    advance(1);
    expect(bursts(holo)).toEqual(['rainbow']);
    expect(opening(holo).dataset.jolt).toBe('b');
    advance(1519);
    expect(opening(holo).dataset.spot).toBe('on');
    advance(1);
    expect(opening(holo).dataset.spot).toBeUndefined();
    expect(holo.querySelector('.pack-opening__banner')).toBeNull();
  });

  it('a repeat shows its shard gain and new balance, and its shard sparks fly as the gain lands', () => {
    const root = openOne(one('repeat', { shardsGained: 10, shards: 70 }));
    click(cards(root)[0]);
    const gain = root.querySelector('.pack-opening__shards');
    expect(gain?.textContent).toBe('+10 shards');
    expect(gain?.querySelector('svg.shard-icon')).not.toBeNull();
    expect(root.querySelector('.pack-opening__sub')?.textContent).toBe('You now have 70 shards.');
    expect(root.querySelector('.pack-opening__sub b')?.textContent).toBe('70');
    // Shard sparks fly from the crystal as "+10 shards" lands: 700ms after the face is up (280ms)
    advance(979);
    expect(bursts(root)).toEqual(['gold']);
    advance(1);
    expect(bursts(root)).toEqual(['gold', 'shard']);
    cleanup();

    // A holographic repeat is a plain turn: no takeover, no holographic sound, the same shards
    const holo = openOne(one('repeat', { shardsGained: 10, shards: 80 }, true));
    click(cards(holo)[0]);
    expect(cards(holo)[0].dataset.turned).toBe('true');
    expect(opening(holo).dataset.spot).toBeUndefined();
    advance(980);
    expect(bursts(holo)).toEqual(['gold', 'shard']);
    expect(holoSounds()).toBe(0);
    cleanup();

    // A new hero pays no shards: no crystal, no shard sparks
    const fresh = openOne(one('new', { shards: 40 }));
    click(cards(fresh)[0]);
    advance(980);
    expect(fresh.querySelector('.shard-icon')).toBeNull();
    expect(bursts(fresh)).toEqual(['gold']);
  });

  it('animation off shows the end state at once', () => {
    const atOnce = (result: PackResult, kind: string) => {
      const root = mount(result);
      click(root.querySelector('.pack-opening__pack'));
      expect(opening(root).dataset.stage).toBe('cards');
      expect(opening(root).className).toContain('pack-opening--still');
      expect(cards(root).map(c => c.dataset.turned)).toEqual(['true']);
      expect(root.querySelector('.pack-opening__kind')?.textContent).toBe(kind);
      expect(root.querySelector('.pack-opening__turn-hint')).toBeNull();
      expect(opening(root).dataset.spot).toBeUndefined();
      expect(opening(root).dataset.jolt).toBeUndefined();
      expect(root.querySelector('.pack-opening__banner')).toBeNull();
      // ...and nothing is waiting to move
      advance(5000);
      expect(bursts(root)).toEqual([]);
      expect(opening(root).dataset.spot).toBeUndefined();
      expect(opening(root).dataset.jolt).toBeUndefined();
      return root;
    };

    localStorage.setItem('heroscall.animSpeed', 'off');
    const repeat = atOnce(one('repeat', { shardsGained: 10, shards: 70 }), 'Already owned');
    expect(repeat.querySelector('.pack-opening__shards')?.textContent).toBe('+10 shards');
    expect(repeat.querySelector('.pack-opening__sub')?.textContent).toBe('You now have 70 shards.');
    cleanup();
    atOnce(one('holo', {}, true), 'Holographic!');
    expect(holoSounds()).toBe(1);
    cleanup();

    // The system's reduced-motion setting does the same
    localStorage.clear();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    atOnce(one('new'), 'New hero!');
  });
});
