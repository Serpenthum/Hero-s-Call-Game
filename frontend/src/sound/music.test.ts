// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeAudioElement, FakeGainNode, installFakeAudioContext, installFakeAudioElement } from './testAudio';
import { installAudioUnlock, resetAudioContextForTests } from './context';
import { CROSSFADE_MS, __musicStateForTests, resetMusicForTests, setMusicMode } from './music';
import { setMusicEnabled, setMusicVolume, setSfxVolume } from './settings';
import { MUSIC } from './manifest';

let uninstallCtx: () => void;
let uninstallEl: () => void;
let visibility: 'visible' | 'hidden' = 'visible';

function el(file: string): FakeAudioElement {
  const found = FakeAudioElement.instances.find(e => e.attributes['data-music'] === file);
  if (!found) throw new Error(`no element for ${file}`);
  return found;
}

function ctx(): FakeAudioContext {
  const c = FakeAudioContext.instances[0];
  if (!c) throw new Error('no audio context made');
  return c;
}

// The gain node a track's media source feeds: the one made right after its source.
function gainFor(file: string): FakeGainNode {
  const c = ctx();
  const i = c.mediaSources.findIndex(m => m.mediaElement === el(file));
  if (i < 0) throw new Error(`no source for ${file}`);
  return c.gains[i];
}

function tap(type = 'pointerup') {
  window.dispatchEvent(new Event(type));
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function setVisibility(v: 'visible' | 'hidden') {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
}

const [MENU1, MENU2] = MUSIC.menu;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  uninstallCtx = installFakeAudioContext();
  uninstallEl = installFakeAudioElement();
  resetAudioContextForTests();
  resetMusicForTests();
});

afterEach(() => {
  resetMusicForTests();
  resetAudioContextForTests();
  uninstallEl();
  uninstallCtx();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function startMenu() {
  setMusicMode('menu');
  tap();
  await flush();
}

describe('music', () => {
  it('CROSSFADE_MS is 2500', () => {
    expect(CROSSFADE_MS).toBe(2500);
  });

  it('nothing plays before the first tap', async () => {
    setMusicMode('menu');
    await flush();
    vi.advanceTimersByTime(5000);
    expect(FakeAudioElement.instances.length).toBe(0);
    expect(__musicStateForTests().playing).toBeNull();
  });

  it('menu track 1 starts after unlock', async () => {
    installAudioUnlock();
    setMusicMode('menu');
    // pointerdown unlocks the context but is not one of the gestures music primes on
    tap('pointerdown');
    await flush();
    expect(__musicStateForTests()).toMatchObject({ mode: 'menu', playing: MENU1 });
    expect(el(MENU1).paused).toBe(false);
  });

  it('plays synchronously inside the gesture (iOS refuses play() outside one)', () => {
    setMusicMode('menu');
    tap('touchend');
    // no await: the play() call must have happened during dispatch
    expect(el(MENU1).playCalls).toBeGreaterThan(0);
    expect(el(MENU1).paused).toBe(false);
  });

  it('primes the not-yet-active tracks in the gesture, then pauses them', async () => {
    setMusicMode('menu');
    tap('click');
    expect(el(MENU2).playCalls).toBe(1);
    expect(el(MUSIC.battle).playCalls).toBe(1);
    // primed on the tiny silent clip: no music file is fetched for them yet
    expect(el(MENU2).src.startsWith('data:audio/wav')).toBe(true);
    expect(el(MUSIC.battle).src.startsWith('data:audio/wav')).toBe(true);
    expect(el(MENU2).preload).toBe('none');
    expect(el(MENU1).src).toBe(`/audio/${MENU1}`);
    await flush();
    expect(el(MENU2).paused).toBe(true);
    expect(el(MUSIC.battle).paused).toBe(true);
    expect(el(MENU1).paused).toBe(false);
  });

  it('stops listening for gestures once every track has played', async () => {
    const removed = vi.spyOn(window, 'removeEventListener');
    await startMenu();
    const types = removed.mock.calls.map(c => c[0]);
    expect(types).toEqual(expect.arrayContaining(['pointerup', 'touchend', 'click', 'keydown']));
  });

  it('a music file loads only once its track is wanted', async () => {
    await startMenu();
    expect(el(MUSIC.battle).src).not.toContain(MUSIC.battle);
    expect(el(MENU2).src).not.toContain(MENU2);
    setMusicMode('battle');
    expect(el(MUSIC.battle).src).toBe(`/audio/${MUSIC.battle}`);
    expect(el(MUSIC.battle).preload).toBe('auto');
  });

  it('a failed menu file skips to the next menu track', async () => {
    await startMenu();
    el(MENU1).fail();
    await flush();
    expect(__musicStateForTests().playing).toBe(MENU2);
    // later rotation passes over the failed file
    el(MENU2).end();
    await flush();
    expect(__musicStateForTests().playing).toBe(MENU2);
  });

  it('a failed battle file leaves battle silent', async () => {
    await startMenu();
    setMusicMode('battle');
    el(MUSIC.battle).fail();
    vi.advanceTimersByTime(CROSSFADE_MS);
    expect(__musicStateForTests().playing).toBeNull();
    expect(FakeAudioElement.instances.every(e => e.paused)).toBe(true);
  });

  it('a failed file counts as primed so the gesture listeners come off', async () => {
    setMusicMode('menu');
    FakeAudioElement.refuseAll = true;
    tap(); // makes the elements; every play() refused
    await flush();
    FakeAudioElement.refuseAll = false;
    el(MENU1).refusePlay = true;
    const removed = vi.spyOn(window, 'removeEventListener');
    tap(); // primes track 2 and battle; track 1 still refused
    await flush();
    expect(removed.mock.calls.map(c => c[0])).not.toContain('pointerup');
    el(MENU1).fail();
    await flush();
    expect(removed.mock.calls.map(c => c[0])).toContain('pointerup');
    expect(__musicStateForTests().playing).toBe(MENU2);
  });

  it('menu rotation: track 1 ended → track 2 → track 1', async () => {
    await startMenu();
    expect(__musicStateForTests().playing).toBe(MENU1);
    el(MENU1).end();
    await flush();
    expect(__musicStateForTests().playing).toBe(MENU2);
    expect(el(MENU2).currentTime).toBe(0);
    expect(__musicStateForTests().gain).toBeCloseTo(0.5);
    el(MENU2).end();
    await flush();
    expect(__musicStateForTests().playing).toBe(MENU1);
  });

  it('battle mode crossfades: old gain ramps to 0 and new to the music volume over 2500 ms', async () => {
    await startMenu();
    ctx().currentTime = 10;
    setMusicVolume(0.4);
    setMusicMode('battle');
    expect(gainFor(MENU1).gain.lastRamp).toEqual({ type: 'ramp', value: 0, time: 12.5 });
    expect(gainFor(MUSIC.battle).gain.lastRamp).toEqual({ type: 'ramp', value: 0.4, time: 12.5 });
    expect(__musicStateForTests()).toMatchObject({ mode: 'battle', playing: MUSIC.battle });
    expect(el(MENU1).paused).toBe(false);
    vi.advanceTimersByTime(CROSSFADE_MS);
    expect(el(MENU1).paused).toBe(true);
    expect(el(MUSIC.battle).paused).toBe(false);
  });

  it('battle track loops', async () => {
    await startMenu();
    setMusicMode('battle');
    vi.advanceTimersByTime(CROSSFADE_MS);
    const battle = el(MUSIC.battle);
    expect(battle.loop).toBe(true);
    // a browser that fires 'ended' anyway: the battle track starts over instead of stopping
    battle.currentTime = 50;
    battle.paused = true;
    const calls = battle.playCalls;
    battle.dispatchEvent(new Event('ended'));
    await flush();
    expect(battle.currentTime).toBe(0);
    expect(battle.playCalls).toBe(calls + 1);
    expect(battle.paused).toBe(false);
    expect(__musicStateForTests().playing).toBe(MUSIC.battle);
    expect(el(MENU1).paused).toBe(true);
  });

  it('a quick battle -> menu -> battle keeps the battle position', async () => {
    await startMenu();
    setMusicMode('battle');
    vi.advanceTimersByTime(CROSSFADE_MS);
    el(MUSIC.battle).currentTime = 37;
    setMusicMode('menu');
    vi.advanceTimersByTime(1000);
    setMusicMode('battle');
    expect(el(MUSIC.battle).currentTime).toBe(37);
    expect(el(MUSIC.battle).paused).toBe(false);
    vi.advanceTimersByTime(CROSSFADE_MS);
    expect(el(MUSIC.battle).paused).toBe(false);
  });

  it('battle -> none -> menu also moves to the next menu track', async () => {
    await startMenu();
    setMusicMode('battle');
    setMusicMode('none');
    setMusicMode('menu');
    expect(__musicStateForTests().playing).toBe(MENU2);
  });

  it('leaving battle restarts the menu rotation at the track after the one last heard', async () => {
    await startMenu();
    el(MENU1).currentTime = 42;
    setMusicMode('battle');
    vi.advanceTimersByTime(CROSSFADE_MS);
    setMusicMode('menu');
    expect(__musicStateForTests().playing).toBe(MENU2);
    expect(el(MENU2).currentTime).toBe(0);
    setMusicMode('battle');
    setMusicMode('menu');
    expect(__musicStateForTests().playing).toBe(MENU1);
    expect(el(MENU1).currentTime).toBe(0);
  });

  it('hidden pauses, visible resumes the same track', async () => {
    await startMenu();
    el(MENU1).currentTime = 30;
    setVisibility('hidden');
    expect(FakeAudioElement.instances.every(e => e.paused)).toBe(true);
    setVisibility('visible');
    expect(el(MENU1).paused).toBe(false);
    expect(el(MENU1).currentTime).toBe(30);
    expect(__musicStateForTests().playing).toBe(MENU1);
  });

  it('returning to the page resumes a suspended or interrupted AudioContext before playing', async () => {
    await startMenu();
    for (const state of ['suspended', 'interrupted'] as const) {
      setVisibility('hidden');
      ctx().state = state;
      const before = ctx().resumeCalls;
      setVisibility('visible');
      expect(ctx().resumeCalls, state).toBeGreaterThan(before);
      expect(ctx().state).toBe('running');
      expect(el(MENU1).paused).toBe(false);
    }
  });

  it('music off pauses after the fade; on resumes', async () => {
    await startMenu();
    el(MENU1).currentTime = 20;
    setMusicEnabled(false);
    expect(gainFor(MENU1).gain.lastRamp?.value).toBe(0);
    expect(el(MENU1).paused).toBe(false);
    vi.advanceTimersByTime(CROSSFADE_MS);
    expect(el(MENU1).paused).toBe(true);
    expect(__musicStateForTests().playing).toBeNull();
    setMusicEnabled(true);
    expect(el(MENU1).paused).toBe(false);
    expect(el(MENU1).currentTime).toBe(20);
    expect(gainFor(MENU1).gain.lastRamp?.value).toBeCloseTo(0.5);
    expect(__musicStateForTests().playing).toBe(MENU1);
  });

  it('music volume change updates the active gain', async () => {
    await startMenu();
    ctx().currentTime = 5;
    setMusicVolume(0.2);
    const ramp = gainFor(MENU1).gain.lastRamp;
    expect(ramp?.value).toBeCloseTo(0.2);
    expect(ramp!.time - 5).toBeLessThanOrEqual(0.1);
    expect(__musicStateForTests().gain).toBeCloseTo(0.2);
  });

  it('a change to another sound setting leaves a fade-in alone', async () => {
    await startMenu();
    const n = gainFor(MENU1).gain.events.length;
    setSfxVolume(0.9);
    expect(gainFor(MENU1).gain.events.length).toBe(n);
  });

  it('routes each element through its own gain node', async () => {
    await startMenu();
    expect(ctx().mediaSources.map(m => m.mediaElement)).toContain(el(MENU1));
    expect(el(MENU1).volume).toBe(1);
  });

  it('without Web Audio, fades the element volume instead', async () => {
    (window as unknown as { AudioContext?: unknown }).AudioContext = undefined;
    resetAudioContextForTests();
    await startMenu();
    expect(__musicStateForTests().playing).toBe(MENU1);
    vi.advanceTimersByTime(CROSSFADE_MS + 100);
    expect(el(MENU1).volume).toBeCloseTo(0.5);
    setMusicMode('battle');
    vi.advanceTimersByTime(CROSSFADE_MS + 100);
    expect(el(MENU1).volume).toBeCloseTo(0);
    expect(el(MENU1).paused).toBe(true);
    expect(el(MUSIC.battle).volume).toBeCloseTo(0.5);
  });

  it('mode none plays nothing', async () => {
    await startMenu();
    setMusicMode('none');
    vi.advanceTimersByTime(CROSSFADE_MS);
    expect(FakeAudioElement.instances.every(e => e.paused)).toBe(true);
    expect(__musicStateForTests()).toMatchObject({ mode: 'none', playing: null, gain: 0 });
  });
});
