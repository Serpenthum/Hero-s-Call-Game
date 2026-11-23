// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./effects', () => ({ playSound: vi.fn() }));

import { battleEventBus, setAnimSpeed, sfx, type BattleEvent } from '../battleAnimations';
import { playSound } from './effects';
import { startBattleSound } from './battleSound';

let n = 0;
function attack(extra: Partial<BattleEvent> = {}): BattleEvent {
  return {
    id: `bs-${++n}`,
    kind: 'attack',
    cast: null,
    actor: { playerId: 'p0', heroIndex: 0, key: 'p0:0', name: 'Ranger' },
    hit: true,
    crit: false,
    targetName: 'X',
    targets: [{ key: 'p1:0', playerId: 'p1', heroIndex: 0, name: 'X', delta: -3, hpAfter: 5, died: false, revived: false, statusesAdded: [] }],
    ...extra
  } as BattleEvent;
}

let stop: () => void;
beforeEach(() => {
  vi.mocked(playSound).mockClear();
  localStorage.clear();
  stop = startBattleSound();
});
afterEach(() => { stop(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('startBattleSound', () => {
  it('an emitted attack event plays one cue through playSound', () => {
    battleEventBus.emit(attack());
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(vi.mocked(playSound).mock.calls[0][0]).toBe('bow.hit');
    expect(vi.mocked(playSound).mock.calls[0][1]).toEqual({ delayMs: expect.any(Number) });
  });

  it('cues play with animation speed off', () => {
    setAnimSpeed('off');
    battleEventBus.emit(attack());
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it('synth.tick plays the legacy synthesized hit at its delay', () => {
    vi.useFakeTimers();
    const hit = vi.spyOn(sfx, 'hit').mockImplementation(() => {});
    battleEventBus.emit(attack({ kind: 'tick', actor: null,
      targets: [{ key: 'p1:0', playerId: 'p1', heroIndex: 0, name: 'X', delta: -1, hpAfter: 5, died: false, revived: false, statusesAdded: [] }] }));
    expect(playSound).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(hit).toHaveBeenCalledWith(false);
  });

  it('synth.death plays the synthesized death sound, also with animation speed off', () => {
    vi.useFakeTimers();
    const death = vi.spyOn(sfx, 'death').mockImplementation(() => {});
    setAnimSpeed('off');
    battleEventBus.emit(attack({ targets: [{ key: 'p1:0', playerId: 'p1', heroIndex: 0, name: 'X', delta: -9, hpAfter: 0, died: true, revived: false, statusesAdded: [] }] }));
    vi.runAllTimers();
    expect(death).toHaveBeenCalledTimes(1);
  });

  it('a throwing playSound does not escape the listener', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(playSound).mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => battleEventBus.emit(attack())).not.toThrow();
    expect(warn).toHaveBeenCalledWith('battle sound failed', expect.any(Error));
  });

  it('stops listening after the returned unsubscribe', () => {
    stop();
    battleEventBus.emit(attack());
    expect(playSound).not.toHaveBeenCalled();
    stop = () => {};
  });
});

describe('battleEventBus isolation', () => {
  it('a throwing listener does not stop the next listener, and emit does not throw', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = battleEventBus.subscribe(() => { throw new Error('bad listener'); });
    const after = vi.fn();
    const unsub = battleEventBus.subscribe(after);
    expect(() => battleEventBus.emit(attack())).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('battleEventBus listener failed', expect.any(Error));
    error.mockRestore();
    before();
    unsub();
  });
});
