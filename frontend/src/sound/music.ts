// Background music: the menu rotation and the looping battle track, with crossfades.
// Each track is an <audio> element routed through its own GainNode (iOS ignores element.volume);
// without Web Audio the element volume is faded instead.

import { getAudioContext, onAudioUnlocked, silentWavUrl } from './context';
import { MUSIC } from './manifest';
import { getMusicEnabled, getMusicVolume, onSoundSettingsChange } from './settings';

export type MusicMode = 'menu' | 'battle' | 'none';

export const CROSSFADE_MS = 2500;
const VOLUME_RAMP_MS = 50;
const FALLBACK_STEP_MS = 50;

type Track = {
  file: string;
  el: HTMLAudioElement;
  gain: GainNode | null;
  pauseTimer: ReturnType<typeof setTimeout> | null;
  fadeTimer: ReturnType<typeof setInterval> | null;
  /** The real music file has been assigned as src (it loads only once the track is first wanted). */
  loaded: boolean;
  /** The music file failed to load; the track is skipped from then on. */
  failed: boolean;
};

const ALL_FILES = [...MUSIC.menu, MUSIC.battle];
// iOS only lets an element play() outside a gesture once it has played inside one.
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;

let installed = false;
let mode: MusicMode = 'none';
let menuIndex = 0;
let menuHeard = false;
let lastRealMode: MusicMode = 'none'; // the last mode other than 'none'
let fresh = false; // the next track to sound starts from the beginning
let started = false; // a gesture or the unlock has happened
let sounding: Track | null = null;
let lastVolume = 0;
const tracks = new Map<string, Track>();
const primed = new Set<string>();
let unsubscribers: (() => void)[] = [];

function safeEnabled(): boolean { try { return getMusicEnabled(); } catch { return true; } }
function safeVolume(): number { try { return getMusicVolume(); } catch { return 0.5; } }
function isHidden(): boolean { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; }

function getTrack(file: string): Track | null {
  const existing = tracks.get(file);
  if (existing) return existing;
  let el: HTMLAudioElement;
  try {
    el = new Audio();
    // No src yet: the music file loads only when the track is first wanted.
    el.preload = 'none';
    el.setAttribute('playsinline', '');
    el.setAttribute('data-music', file);
    el.loop = file === MUSIC.battle;
  } catch {
    return null;
  }
  let gain: GainNode | null = null;
  const c = getAudioContext();
  if (c) {
    try {
      const source = c.createMediaElementSource(el);
      gain = c.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(c.destination);
    } catch {
      gain = null;
    }
  }
  if (!gain) el.volume = 0;
  const track: Track = { file, el, gain, pauseTimer: null, fadeTimer: null, loaded: false, failed: false };
  el.addEventListener('ended', () => onEnded(track));
  el.addEventListener('error', () => onError(track));
  tracks.set(file, track);
  return track;
}

function level(track: Track): number {
  return track.gain ? track.gain.gain.value : track.el.volume;
}

function rampLevel(track: Track, target: number, ms: number) {
  if (track.fadeTimer) { clearInterval(track.fadeTimer); track.fadeTimer = null; }
  const c = getAudioContext();
  if (track.gain && c) {
    try {
      const p = track.gain.gain;
      const now = c.currentTime;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      if (ms <= 0) p.setValueAtTime(target, now);
      else p.linearRampToValueAtTime(target, now + ms / 1000);
    } catch { /* ignore */ }
    return;
  }
  const el = track.el;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  if (ms <= 0) { try { el.volume = clamp(target); } catch { /* ignore */ } return; }
  const from = el.volume;
  const steps = Math.max(1, Math.round(ms / FALLBACK_STEP_MS));
  let step = 0;
  track.fadeTimer = setInterval(() => {
    step++;
    try { el.volume = clamp(from + (target - from) * (step / steps)); } catch { /* ignore */ }
    if (step >= steps && track.fadeTimer) { clearInterval(track.fadeTimer); track.fadeTimer = null; }
  }, FALLBACK_STEP_MS);
}

function playEl(track: Track): Promise<boolean> {
  try {
    const p = track.el.play();
    if (p && typeof p.then === 'function') {
      return p.then(() => { markPrimed(track.file); return true; }, () => false);
    }
    markPrimed(track.file);
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

function markPrimed(file: string) {
  primed.add(file);
  if (ALL_FILES.every(f => primed.has(f))) removeGestureListeners();
}

function fadeOut(track: Track, ms: number) {
  rampLevel(track, 0, ms);
  if (track.pauseTimer) clearTimeout(track.pauseTimer);
  track.pauseTimer = setTimeout(() => {
    track.pauseTimer = null;
    if (sounding !== track) { try { track.el.pause(); } catch { /* ignore */ } }
  }, ms);
}

function hasFailed(file: string): boolean { return tracks.get(file)?.failed ?? false; }

function targetFile(): string | null {
  if (mode === 'battle') return hasFailed(MUSIC.battle) ? null : MUSIC.battle;
  if (mode !== 'menu') return null;
  for (let i = 0; i < MUSIC.menu.length; i++) {
    if (!hasFailed(MUSIC.menu[menuIndex])) return MUSIC.menu[menuIndex];
    menuIndex = (menuIndex + 1) % MUSIC.menu.length;
  }
  return null;
}

function load(track: Track) {
  if (track.loaded) return;
  track.loaded = true;
  try {
    track.el.preload = 'auto';
    track.el.src = `/audio/${track.file}`;
  } catch { /* ignore */ }
}

/** Brings what is sounding in line with mode, settings and visibility. */
function sync(fadeMs: number) {
  const volume = safeVolume();
  const want = started && safeEnabled() ? targetFile() : null;
  const wantTrack = want ? getTrack(want) : null;

  if (sounding && sounding !== wantTrack) {
    fadeOut(sounding, fadeMs);
    sounding = null;
  }
  if (!wantTrack) return;

  if (sounding !== wantTrack) {
    if (wantTrack.pauseTimer) { clearTimeout(wantTrack.pauseTimer); wantTrack.pauseTimer = null; }
    // A track still sounding (mid fade-out after a quick switch) keeps its position.
    const stillAudible = wantTrack.loaded && !wantTrack.el.paused;
    load(wantTrack);
    if (fresh && !stillAudible) { try { wantTrack.el.currentTime = 0; } catch { /* ignore */ } }
    fresh = false;
    sounding = wantTrack;
    if (mode === 'menu') menuHeard = true;
    rampLevel(wantTrack, volume, fadeMs);
    lastVolume = volume;
  } else if (volume !== lastVolume) {
    rampLevel(wantTrack, volume, VOLUME_RAMP_MS);
    lastVolume = volume;
  }
  if (!isHidden() && wantTrack.el.paused) void playEl(wantTrack);
}

function onEnded(track: Track) {
  if (track !== sounding) return;
  if (track.file === MUSIC.battle) {
    try { track.el.currentTime = 0; } catch { /* ignore */ }
    if (!isHidden()) void playEl(track);
    return;
  }
  if (mode !== 'menu') return;
  rampLevel(track, 0, 0);
  sounding = null;
  menuIndex = (menuIndex + 1) % MUSIC.menu.length;
  fresh = true;
  sync(0);
}

// A missing or broken file: skip it (menu moves to the other track, battle goes silent).
function onError(track: Track) {
  if (!track.loaded || track.failed) return; // errors from the priming clip don't count
  track.failed = true;
  markPrimed(track.file);
  if (track !== sounding) return;
  rampLevel(track, 0, 0);
  sounding = null;
  if (mode === 'menu') {
    menuIndex = (menuIndex + 1) % MUSIC.menu.length;
    fresh = true;
  }
  sync(0);
}

function onVisibility() {
  if (isHidden()) {
    tracks.forEach(t => { try { t.el.pause(); } catch { /* ignore */ } });
  } else if (sounding) {
    void playEl(sounding);
  }
}

// Runs synchronously inside the gesture: play the track that should sound, and play-then-pause
// the others (at zero level, on the tiny silent clip so no music downloads) so they may play
// later outside a gesture.
function onGesture() {
  if (isHidden()) return;
  started = true;
  sync(CROSSFADE_MS);
  for (const file of ALL_FILES) {
    const track = getTrack(file);
    if (!track || track === sounding || !track.el.paused || primed.has(file)) continue;
    rampLevel(track, 0, 0);
    if (!track.loaded) { try { track.el.src = silentWavUrl(); } catch { /* ignore */ } }
    void playEl(track).then(ok => {
      if (ok && track !== sounding) { try { track.el.pause(); } catch { /* ignore */ } }
    });
  }
}

function removeGestureListeners() {
  if (typeof window === 'undefined') return;
  GESTURES.forEach(type => window.removeEventListener(type, onGesture, true));
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  GESTURES.forEach(type => window.addEventListener(type, onGesture, true));
  document.addEventListener('visibilitychange', onVisibility);
  unsubscribers = [
    () => removeGestureListeners(),
    () => document.removeEventListener('visibilitychange', onVisibility),
    onSoundSettingsChange(() => sync(CROSSFADE_MS)),
    onAudioUnlocked(() => { started = true; sync(CROSSFADE_MS); }),
  ];
}

/** Sets which music plays: the menu rotation, the battle loop, or nothing. Mode changes crossfade. */
export function setMusicMode(next: MusicMode): void {
  install();
  if (next === mode) return;
  // Leaving battle restarts the menu rotation at the track after the one last heard.
  // Keyed on the last real mode, so battle -> none -> menu also advances.
  if (lastRealMode === 'battle' && next === 'menu' && menuHeard) menuIndex = (menuIndex + 1) % MUSIC.menu.length;
  mode = next;
  if (next !== 'none') lastRealMode = next;
  fresh = true;
  sync(CROSSFADE_MS);
}

export function __musicStateForTests(): { mode: MusicMode; playing: string | null; gain: number } {
  return {
    mode,
    playing: sounding && !sounding.el.paused ? sounding.file : null,
    gain: sounding ? level(sounding) : 0,
  };
}

/** Test helper: stop everything and forget all state and listeners. */
export function resetMusicForTests(): void {
  unsubscribers.forEach(fn => fn());
  unsubscribers = [];
  tracks.forEach(t => {
    if (t.pauseTimer) clearTimeout(t.pauseTimer);
    if (t.fadeTimer) clearInterval(t.fadeTimer);
    try { t.el.pause(); } catch { /* ignore */ }
  });
  tracks.clear();
  primed.clear();
  installed = false;
  mode = 'none';
  menuIndex = 0;
  menuHeard = false;
  lastRealMode = 'none';
  fresh = false;
  started = false;
  sounding = null;
  lastVolume = 0;
}
