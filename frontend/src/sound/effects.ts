// Sound-effect player: loads groups of files into decoded buffers and plays them on the shared context.
// A file that is not loaded (yet, or ever) is simply skipped; nothing here should ever throw or be awaited.

import { getAudioContext } from './context';
import { SOUNDS, type SoundGroup, type SoundId } from './manifest';
import { getSfxEnabled, getSfxVolume } from './settings';

/** Most effects that may sound at once; the oldest is stopped to make room. */
export const MAX_VOICES = 6;

/**
 * Loudness of a file effect at the default slider (0.5). Gain = base x volume x 2,
 * the same scaling the synthesized tones use. Effects are mastered quiet (about -20 LUFS),
 * so raise this if they sit under the music.
 */
export const EFFECT_BASE_GAIN = 1.0;

const buffers = new Map<SoundId, AudioBuffer>();
const loading = new Map<SoundId, Promise<void>>();
let voices: AudioBufferSourceNode[] = [];

function decode(c: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // Older Safari only supports the callback form.
  return new Promise((resolve, reject) => {
    const p = c.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

function loadOne(c: AudioContext, id: SoundId): Promise<void> {
  if (buffers.has(id)) return Promise.resolve();
  const inFlight = loading.get(id);
  if (inFlight) return inFlight;
  const job = (async () => {
    try {
      const res = await fetch(`/audio/${SOUNDS[id].file}`);
      if (!res.ok) return;
      buffers.set(id, await decode(c, await res.arrayBuffer()));
    } catch {
      // missing or broken file: the cue is skipped
    } finally {
      loading.delete(id);
    }
  })();
  loading.set(id, job);
  return job;
}

/** Fetches and decodes every file in a group (each once). Never rejects. */
export async function loadSoundGroup(group: SoundGroup): Promise<void> {
  const c = getAudioContext();
  if (!c) return;
  const ids = (Object.keys(SOUNDS) as SoundId[]).filter(id => SOUNDS[id].group === group);
  await Promise.all(ids.map(id => loadOne(c, id)));
}

/** Plays a loaded effect now, or delayMs from now. Silently does nothing when off, muted or not loaded. */
export function playSound(id: SoundId, opts?: { delayMs?: number }): void {
  if (!getSfxEnabled()) return;
  const level = EFFECT_BASE_GAIN * getSfxVolume() * 2;
  if (level <= 0) return;
  const buffer = buffers.get(id);
  if (!buffer) return;
  const c = getAudioContext();
  if (!c) return;
  try {
    if (c.state === 'suspended') {
      const p = c.resume();
      if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
    }
    while (voices.length >= MAX_VOICES) {
      const oldest = voices.shift()!;
      try { oldest.stop(); } catch { /* already stopped */ }
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    const gain = c.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(c.destination);
    source.onended = () => {
      voices = voices.filter(v => v !== source);
      try { source.disconnect(); gain.disconnect(); } catch { /* ignore */ }
    };
    voices.push(source);
    source.start(c.currentTime + Math.max(0, opts?.delayMs ?? 0) / 1000);
  } catch {
    // Audio is optional
  }
}

/** Test helper: forget loaded buffers and playing voices. */
export function resetEffectsForTests(): void {
  buffers.clear();
  loading.clear();
  voices = [];
}
