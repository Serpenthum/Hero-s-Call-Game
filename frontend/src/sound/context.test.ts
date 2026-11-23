// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, installFakeAudioContext } from './testAudio';
import { getAudioContext, installAudioUnlock, isAudioUnlocked, onAudioUnlocked, resetAudioContextForTests } from './context';
import { getMusicEnabled, getMusicVolume, onSoundSettingsChange, setMusicEnabled, setMusicVolume, setSfxEnabled, setSfxVolume } from './settings';

let uninstall: () => void;

beforeEach(() => {
  localStorage.clear();
  uninstall = installFakeAudioContext();
  resetAudioContextForTests();
});

afterEach(() => {
  uninstall();
  delete (navigator as unknown as { audioSession?: unknown }).audioSession;
  vi.restoreAllMocks();
});

describe('audio context and unlock', () => {
  it('makes one shared context lazily', () => {
    expect(FakeAudioContext.instances.length).toBe(0);
    const a = getAudioContext();
    expect(getAudioContext()).toBe(a);
    expect(FakeAudioContext.instances.length).toBe(1);
  });

  it('returns null when Web Audio is unsupported', () => {
    (window as unknown as { AudioContext?: unknown }).AudioContext = undefined;
    expect(getAudioContext()).toBeNull();
  });

  it('unlocks once on the first pointerdown: resumes, sets the playback session, tells listeners', () => {
    (navigator as unknown as { audioSession: { type: string } }).audioSession = { type: 'auto' };
    const heard = vi.fn();
    onAudioUnlocked(heard);
    installAudioUnlock();
    installAudioUnlock();
    getAudioContext();
    expect(isAudioUnlocked()).toBe(false);
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    expect(isAudioUnlocked()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.instances[0].resumeCalls).toBe(1);
    expect((navigator as unknown as { audioSession: { type: string } }).audioSession.type).toBe('playback');
  });

  it('a keydown unlocks too', () => {
    installAudioUnlock();
    window.dispatchEvent(new Event('keydown'));
    expect(isAudioUnlocked()).toBe(true);
  });

  it('on iOS without audioSession plays a silent audio element once', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    installAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointerdown'));
    expect(play).toHaveBeenCalledTimes(1);
    const el = play.mock.instances[0] as unknown as HTMLAudioElement;
    expect(el.muted).toBe(false);
  });

  it('keeps listening while resume leaves the context suspended, then unlocks on a later gesture', async () => {
    const heard = vi.fn();
    onAudioUnlocked(heard);
    installAudioUnlock();
    const c = getAudioContext() as unknown as FakeAudioContext;
    c.resumeLeavesSuspended = true;
    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    expect(isAudioUnlocked()).toBe(false);
    expect(heard).not.toHaveBeenCalled();
    c.resumeLeavesSuspended = false;
    window.dispatchEvent(new Event('touchend'));
    await Promise.resolve();
    expect(isAudioUnlocked()).toBe(true);
    expect(c.resumeCalls).toBe(2);
    window.dispatchEvent(new Event('click'));
    window.dispatchEvent(new Event('pointerup'));
    await Promise.resolve();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(c.resumeCalls).toBe(2);
  });

  it('unlocks when the context turns running after resume resolves', async () => {
    const heard = vi.fn();
    onAudioUnlocked(heard);
    installAudioUnlock();
    const c = getAudioContext() as unknown as FakeAudioContext;
    c.resume = () => { c.resumeCalls++; return Promise.resolve().then(() => { c.state = 'running'; }); };
    window.dispatchEvent(new Event('click'));
    expect(heard).not.toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 0));
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('with no Web Audio the first gesture still counts as unlocked, once', () => {
    (window as unknown as { AudioContext?: unknown }).AudioContext = undefined;
    const heard = vi.fn();
    onAudioUnlocked(heard);
    installAudioUnlock();
    window.dispatchEvent(new Event('pointerup'));
    window.dispatchEvent(new Event('keydown'));
    expect(isAudioUnlocked()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('after unlock, a later tap resumes a context iOS suspended or interrupted', () => {
    installAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    const c = getAudioContext() as unknown as FakeAudioContext;
    expect(isAudioUnlocked()).toBe(true);
    const before = c.resumeCalls;
    window.dispatchEvent(new Event('pointerup'));
    expect(c.resumeCalls).toBe(before); // running: nothing to do
    for (const [state, type] of [['suspended', 'pointerup'], ['interrupted', 'touchend'], ['suspended', 'keydown']] as const) {
      c.state = state;
      window.dispatchEvent(new Event(type));
      expect(c.state, type).toBe('running');
    }
    expect(c.resumeCalls).toBe(before + 3);
  });

  it('after unlock, returning to the page resumes a context that is not running', () => {
    let visibility: 'visible' | 'hidden' = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    installAudioUnlock();
    window.dispatchEvent(new Event('keydown'));
    const c = getAudioContext() as unknown as FakeAudioContext;
    c.state = 'interrupted';
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(c.state).toBe('interrupted');
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(c.state).toBe('running');
  });

  it('the resume listeners come off once the context is closed, and a throwing resume never escapes', () => {
    installAudioUnlock();
    window.dispatchEvent(new Event('keydown'));
    const c = getAudioContext() as unknown as FakeAudioContext;
    c.state = 'suspended';
    c.resume = () => { c.resumeCalls++; throw new Error('nope'); };
    expect(() => window.dispatchEvent(new Event('pointerup'))).not.toThrow();
    const calls = c.resumeCalls;
    c.state = 'closed';
    window.dispatchEvent(new Event('pointerup'));
    c.state = 'suspended';
    window.dispatchEvent(new Event('pointerup'));
    expect(c.resumeCalls).toBe(calls);
  });

  it('a subscriber added after unlock is called right away', () => {
    installAudioUnlock();
    window.dispatchEvent(new Event('keydown'));
    const late = vi.fn();
    onAudioUnlocked(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe('sound settings', () => {
  it('music defaults to on at 0.5 and keeps its keys', () => {
    expect(getMusicEnabled()).toBe(true);
    expect(getMusicVolume()).toBe(0.5);
    setMusicEnabled(false);
    setMusicVolume(2);
    expect(localStorage.getItem('heroscall.music')).toBe('off');
    expect(getMusicVolume()).toBe(1);
  });

  it('every setter fires onSoundSettingsChange', () => {
    const fn = vi.fn();
    const off = onSoundSettingsChange(fn);
    setSfxEnabled(false); setSfxVolume(0.3); setMusicEnabled(true); setMusicVolume(0.2);
    expect(fn).toHaveBeenCalledTimes(4);
    off();
    setSfxVolume(0.4);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
