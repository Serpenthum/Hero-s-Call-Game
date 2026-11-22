// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BattleFX from './BattleFX';
import { battleEventBus, setAnimSpeed, sfx, type BattleEvent, type BattleEventTarget } from '../battleAnimations';
import { cleanup, render, stubBrowserApis } from '../testing/dom';
import { startBattleSound } from '../sound/battleSound';

let n = 0;
function target(key: string, delta: number, extra: Partial<BattleEventTarget> = {}): BattleEventTarget {
  return { key, playerId: key.split(':')[0], heroIndex: 0, name: 'X', delta, hpAfter: 5, died: false, revived: false, statusesAdded: [], ...extra };
}
function ev(extra: Partial<BattleEvent>): BattleEvent {
  return {
    id: `fx-${++n}`, kind: 'attack', cast: null,
    actor: { playerId: 'p0', heroIndex: 0, key: 'p0:0', name: 'Ranger' },
    hit: true, crit: false, targetName: 'X', targetKey: 'p1:0',
    targets: [target('p1:0', -3)],
    ...extra
  } as BattleEvent;
}

function heroNode(key: string) {
  const el = document.createElement('div');
  el.dataset.animKey = key;
  el.dataset.heroName = 'X';
  document.body.appendChild(el);
}

describe('BattleFX sounds', () => {
  beforeEach(() => {
    stubBrowserApis();
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 1);
    (HTMLElement.prototype as unknown as { animate: () => object }).animate = () => ({});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    setAnimSpeed('normal');
    heroNode('p0:0');
    heroNode('p1:0');
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('BattleFX no longer calls sfx.swing/miss/cast/heal/hit', () => {
    const spies = (['miss', 'cast', 'heal', 'hit', 'death'] as const).map(k => vi.spyOn(sfx, k).mockImplementation(() => {}));
    render(<BattleFX gameOverResult={null} />);
    act(() => {
      battleEventBus.emit(ev({}));
      battleEventBus.emit(ev({ hit: false, targets: [] }));
      battleEventBus.emit(ev({ kind: 'ability', cast: 'damage', crit: true }));
      battleEventBus.emit(ev({ kind: 'ability', cast: 'heal', targets: [target('p0:0', 4)] }));
      battleEventBus.emit(ev({ kind: 'tick', actor: null, targets: [target('p1:0', -1)] }));
      vi.runAllTimers();
    });
    const [miss, cast, heal, hit] = spies;
    expect(miss).not.toHaveBeenCalled();
    expect(cast).not.toHaveBeenCalled();
    expect(heal).not.toHaveBeenCalled();
    expect(hit).not.toHaveBeenCalled();
    expect('swing' in sfx).toBe(false);
  });

  it('death plays exactly once per kill (from the battle sound listener) at normal and off speed', () => {
    const death = vi.spyOn(sfx, 'death').mockImplementation(() => {});
    const stop = startBattleSound();
    render(<BattleFX gameOverResult={null} />);
    for (const speed of ['normal', 'off'] as const) {
      death.mockClear();
      setAnimSpeed(speed);
      act(() => {
        battleEventBus.emit(ev({ targets: [target('p1:0', -9, { died: true, hpAfter: 0 })] }));
        vi.runAllTimers();
      });
      expect(death, speed).toHaveBeenCalledTimes(1);
    }
    stop();
  });

  it('BattleFX itself no longer plays the death sound', () => {
    const death = vi.spyOn(sfx, 'death').mockImplementation(() => {});
    render(<BattleFX gameOverResult={null} />);
    act(() => {
      battleEventBus.emit(ev({ targets: [target('p1:0', -9, { died: true, hpAfter: 0 })] }));
      vi.runAllTimers();
    });
    expect(death).not.toHaveBeenCalled();
  });

  for (const speed of ['normal', 'off'] as const) {
    it(`win and lose each play exactly once with animation speed ${speed}`, () => {
      const win = vi.spyOn(sfx, 'win').mockImplementation(() => {});
      const lose = vi.spyOn(sfx, 'lose').mockImplementation(() => {});
      setAnimSpeed(speed);
      render(<BattleFX gameOverResult="victory" />);
      act(() => { vi.runAllTimers(); });
      expect(win).toHaveBeenCalledTimes(1);
      expect(lose).not.toHaveBeenCalled();
      cleanup();
      render(<BattleFX gameOverResult="defeat" />);
      act(() => { vi.runAllTimers(); });
      expect(lose).toHaveBeenCalledTimes(1);
      expect(win).toHaveBeenCalledTimes(1);
    });
  }
});
