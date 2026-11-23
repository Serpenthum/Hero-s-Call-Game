// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const sound = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock('../../sound', () => sound);
import useBinderTurn, { TURN_MS, type TurnState } from './useBinderTurn';
import type { TurnDir } from './binderRules';
import { cleanup, render, stubBrowserApis } from '../../testing/dom';

const SPREADS = 6;
const artFor = (spread: number) => [`art-${spread}.webp`];

// What the harness shows of the hook, refreshed on every render.
let now: { turn: TurnState | null; spread: number; request: (dir: TurnDir) => void; land: () => void;
  changeFilter: () => void };
let committed: number[];

// Stands in for the binder: it owns the spread, and a filter change goes back to spread 0 under a new view key.
function Harness() {
  const [state, setState] = useState({ spread: 0, viewKey: 'all' });
  const onSpreadChange = React.useCallback((spread: number) => {
    committed.push(spread);
    setState(s => ({ ...s, spread }));
  }, []);
  const { turn, request, land } = useBinderTurn({
    spread: state.spread, spreads: SPREADS, viewKey: state.viewKey, onSpreadChange, artFor,
  });
  now = { turn, spread: state.spread, request, land, changeFilter: () => setState({ spread: 0, viewKey: 'owned' }) };
  return null;
}

const tap = (dir: TurnDir, times = 1) => act(() => { for (let i = 0; i < times; i++) now.request(dir); });

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

const FRAMES = 40;           // two animation frames, with room
const LANDED = TURN_MS + 200; // past the fallback that lands a leaf whose animationend never came

describe('useBinderTurn', () => {
  beforeEach(() => {
    stubBrowserApis();
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'],
    });
    committed = [];
    render(<Harness />);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('a turn goes ready then moving, and commits the new spread after TURN_MS', async () => {
    tap(1);
    expect(now.turn).toEqual({ from: 0, to: 1, dir: 1, phase: 'ready' });
    expect(now.spread).toBe(0);

    await advance(FRAMES);
    expect(now.turn).toEqual({ from: 0, to: 1, dir: 1, phase: 'moving' });
    expect(now.spread).toBe(0);

    await advance(TURN_MS - FRAMES - 1);
    expect(now.turn?.phase).toBe('moving'); // never cut short
    await advance(200);
    expect(now.turn).toBeNull();
    expect(now.spread).toBe(1);
    expect(committed).toEqual([1]);
  });

  it('the leaf landing (animationend) commits at once, and only while it is moving', async () => {
    tap(-1);
    expect(now.turn).toEqual({ from: 0, to: SPREADS - 1, dir: -1, phase: 'ready' });
    act(() => now.land());
    expect(now.turn?.phase).toBe('ready');
    expect(committed).toEqual([]);

    await advance(FRAMES);
    act(() => now.land());
    expect(now.turn).toBeNull();
    expect(now.spread).toBe(SPREADS - 1);

    await advance(LANDED); // the fallback has nothing left to do
    expect(committed).toEqual([SPREADS - 1]);
  });

  it('five quick taps end three spreads on', async () => {
    tap(1, 5);
    for (let i = 0; i < 6; i++) await advance(FRAMES + LANDED);
    expect(now.turn).toBeNull();
    expect(now.spread).toBe(3);
    expect(committed).toEqual([1, 2, 3]); // one spread at a time, each from where the last one landed
  });

  it('a queued turn starts ready from the spread the last one landed on', async () => {
    tap(1, 2);
    await advance(FRAMES);
    act(() => now.land());
    expect(now.spread).toBe(1);
    expect(now.turn).toEqual({ from: 1, to: 2, dir: 1, phase: 'ready' });
  });

  it('a filter change during a turn clears the queue and lands on spread 0', async () => {
    tap(1, 3);
    await advance(FRAMES);
    expect(now.turn?.phase).toBe('moving');

    act(() => now.changeFilter());
    expect(now.turn).toBeNull();
    expect(now.spread).toBe(0);

    for (let i = 0; i < 4; i++) await advance(FRAMES + LANDED);
    expect(now.turn).toBeNull();
    expect(now.spread).toBe(0);
    expect(committed).toEqual([]);
  });

  it('waits for the art to decode before moving, but no longer than 150 ms', async () => {
    let decoded: () => void = () => {};
    let slow = false;
    vi.stubGlobal('Image', class {
      src = '';
      decode() { return slow ? new Promise<void>(() => {}) : new Promise<void>(resolve => { decoded = resolve; }); }
    });

    tap(1);
    await advance(FRAMES);
    expect(now.turn?.phase).toBe('ready'); // two frames have passed, the art hasn't decoded
    await act(async () => { decoded(); for (let i = 0; i < 5; i++) await Promise.resolve(); });
    expect(now.turn?.phase).toBe('moving');
    act(() => now.land());

    slow = true; // art that never decodes
    tap(1);
    await advance(149);
    expect(now.turn?.phase).toBe('ready');
    await advance(1);
    expect(now.turn?.phase).toBe('moving');
  });

  it('with cardMotionOff the spread changes at once and turn stays null', () => {
    localStorage.setItem('heroscall.animSpeed', 'off');
    tap(1);
    expect(now.turn).toBeNull();
    expect(now.spread).toBe(1);
    tap(-1);
    tap(-1);
    expect(now.turn).toBeNull();
    expect(now.spread).toBe(SPREADS - 1);
  });

  it('a page turn plays binder.page once, when the leaf starts moving', async () => {
    sound.playSound.mockClear();
    const pages = () => sound.playSound.mock.calls.filter(c => c[0] === 'binder.page').length;
    tap(1);
    expect(pages()).toBe(0);
    await advance(FRAMES);
    expect(now.turn?.phase).toBe('moving');
    expect(pages()).toBe(1);
    await advance(LANDED);
    expect(now.spread).toBe(1);
    expect(pages()).toBe(1);
  });
});
