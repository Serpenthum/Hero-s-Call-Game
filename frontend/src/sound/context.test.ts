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
