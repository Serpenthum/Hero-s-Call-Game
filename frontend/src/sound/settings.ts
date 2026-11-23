// Sound settings kept in localStorage. Every setter tells onSoundSettingsChange listeners.

const SFX_KEY = 'heroscall.sfx';
const VOLUME_KEY = 'heroscall.sfxVolume';
const MUSIC_KEY = 'heroscall.music';
const MUSIC_VOLUME_KEY = 'heroscall.musicVolume';

const listeners = new Set<() => void>();

function changed() {
  listeners.forEach(fn => {
    try { fn(); } catch { /* one bad listener must not stop the others */ }
  });
}

function readVolume(key: string): number {
  const stored = parseFloat(localStorage.getItem(key) ?? '');
  return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 0.5;
}

function writeVolume(key: string, volume: number) {
  localStorage.setItem(key, String(Math.min(1, Math.max(0, volume))));
  changed();
}

export function getSfxEnabled(): boolean { return localStorage.getItem(SFX_KEY) !== 'off'; }
export function setSfxEnabled(on: boolean) { localStorage.setItem(SFX_KEY, on ? 'on' : 'off'); changed(); }

// Slider position 0-1; 0.5 plays effects at their designed loudness, 1 is twice as loud.
export function getSfxVolume(): number { return readVolume(VOLUME_KEY); }
export function setSfxVolume(volume: number) { writeVolume(VOLUME_KEY, volume); }

export function getMusicEnabled(): boolean { return localStorage.getItem(MUSIC_KEY) !== 'off'; }
export function setMusicEnabled(on: boolean) { localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off'); changed(); }

export function getMusicVolume(): number { return readVolume(MUSIC_VOLUME_KEY); }
export function setMusicVolume(volume: number) { writeVolume(MUSIC_VOLUME_KEY, volume); }

/** Calls fn after any sound setting changes; returns an unsubscribe function. */
export function onSoundSettingsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
