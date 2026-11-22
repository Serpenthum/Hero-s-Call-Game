// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, fakeFetch, installFakeAudioContext } from './testAudio';
import { resetAudioContextForTests } from './context';
import { EFFECT_BASE_GAIN, MAX_VOICES, loadSoundGroup, playSound, resetEffectsForTests } from './effects';
import { setSfxEnabled, setSfxVolume } from './settings';

let uninstall: () => void;

function ctx(): FakeAudioContext {
  const c = FakeAudioContext.instances[0];
  if (!c) throw new Error('no audio context made');
  return c;
}

beforeEach(() => {
  localStorage.clear();
  uninstall = installFakeAudioContext();
  resetAudioContextForTests();
  resetEffectsForTests();
  vi.stubGlobal('fetch', vi.fn(fakeFetch()));
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
});

describe('effect player', () => {
  it('playSound skips a sound that is not loaded and does not throw', () => {
    expect(() => playSound('weapon.hit')).not.toThrow();
    const c = FakeAudioContext.instances[0];
    expect(c ? c.sources.length : 0).toBe(0);
  });

  it('a failed file does not stop the rest of its group loading', async () => {
    vi.stubGlobal('fetch', vi.fn(fakeFetch(['sfx/weapon-hit.mp3'])));
    await expect(loadSoundGroup('battle')).resolves.toBeUndefined();
    playSound('weapon.hit');
    expect(ctx().sources.length).toBe(0);
    playSound('weapon.crit');
    expect(ctx().sources.length).toBe(1);
    expect(ctx().sources[0].startedAt).not.toBeNull();
  });

  it('fetches each file once even when its group loads twice', async () => {
    await loadSoundGroup('pack');
    await loadSoundGroup('pack');
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('sfx off means no source starts', async () => {
    await loadSoundGroup('battle');
    setSfxEnabled(false);
    playSound('weapon.hit');
    expect(ctx().active.length).toBe(0);
  });

  it('volume 0 means no source starts', async () => {
    await loadSoundGroup('battle');
    setSfxVolume(0);
    playSound('weapon.hit');
    expect(ctx().active.length).toBe(0);
  });

  it('gain follows getSfxVolume at start time', async () => {
    await loadSoundGroup('battle');
    setSfxVolume(0.5);
    playSound('weapon.hit');
    expect(ctx().gains[ctx().gains.length - 1].gain.value).toBeCloseTo(0.5 * 2 * EFFECT_BASE_GAIN);
    setSfxVolume(0.25);
    playSound('weapon.hit');
    expect(ctx().gains[ctx().gains.length - 1].gain.value).toBeCloseTo(0.25 * 2 * EFFECT_BASE_GAIN);
  });

  it('no more than 6 sources play at once', async () => {
    await loadSoundGroup('battle');
    for (let i = 0; i < 8; i++) playSound('weapon.hit');
    expect(MAX_VOICES).toBe(6);
    expect(ctx().active.length).toBeLessThanOrEqual(6);
    // The oldest two are the ones that were stopped
    expect(ctx().sources[0].stopped).toBe(true);
    expect(ctx().sources[1].stopped).toBe(true);
    expect(ctx().sources[7].stopped).toBe(false);
  });

  it('a finished sound frees its voice', async () => {
    await loadSoundGroup('battle');
    for (let i = 0; i < 6; i++) playSound('weapon.hit');
    ctx().sources[2].finish();
    playSound('weapon.hit');
    expect(ctx().sources[0].stopped).toBe(false);
    expect(ctx().active.length).toBe(6);
  });

  it('delayMs schedules the start at currentTime + delay/1000', async () => {
    await loadSoundGroup('battle');
    ctx().currentTime = 3;
    playSound('weapon.hit', { delayMs: 250 });
    expect(ctx().sources[ctx().sources.length - 1].startedAt).toBeCloseTo(3.25);
  });

  it('a throwing localStorage never reaches the caller', async () => {
    await loadSoundGroup('battle');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => playSound('weapon.hit')).not.toThrow();
    vi.restoreAllMocks();
  });

  it('does nothing when Web Audio is unsupported', async () => {
    (window as unknown as { AudioContext?: unknown }).AudioContext = undefined;
    resetAudioContextForTests();
    await expect(loadSoundGroup('battle')).resolves.toBeUndefined();
    expect(() => playSound('weapon.hit')).not.toThrow();
  });
});
