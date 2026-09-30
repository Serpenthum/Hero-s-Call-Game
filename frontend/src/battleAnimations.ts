// Shared plumbing for combat animations: event bus, user settings, and synthesized SFX.

export type CastType = 'damage' | 'heal' | 'buff' | 'debuff' | 'summon' | 'generic';

export interface BattleEventTarget {
  key: string;
  playerId: string;
  heroIndex: number;
  name: string;
  delta: number;
  hpAfter: number;
  died: boolean;
  revived: boolean;
  poisoned?: boolean;
  statusesAdded: string[];
}

export interface BattleEvent {
  id: string;
  kind: 'attack' | 'ability' | 'tick';
  cast: CastType | null;
  actor: { playerId: string; heroIndex: number; key: string } | null;
  hit: boolean;
  crit: boolean;
  targetName: string | null;
  targets: BattleEventTarget[];
}

type Listener = (event: BattleEvent) => void;
const listeners = new Set<Listener>();
const seenIds = new Set<string>();

export const battleEventBus = {
  emit(event: BattleEvent | undefined | null) {
    if (!event || seenIds.has(event.id)) return;
    seenIds.add(event.id);
    if (seenIds.size > 50) seenIds.delete(seenIds.values().next().value as string);
    listeners.forEach(l => l(event));
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }
};

// ---- Settings ----
export type AnimSpeed = 'off' | 'fast' | 'normal';
const SPEED_KEY = 'heroscall.animSpeed';
const SFX_KEY = 'heroscall.sfx';

export function getAnimSpeed(): AnimSpeed {
  const stored = localStorage.getItem(SPEED_KEY);
  if (stored === 'off' || stored === 'fast' || stored === 'normal') return stored;
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduced ? 'off' : 'normal';
}
export function setAnimSpeed(speed: AnimSpeed) { localStorage.setItem(SPEED_KEY, speed); }
export function speedFactor(speed: AnimSpeed): number { return speed === 'fast' ? 0.6 : 1; }

export function getSfxEnabled(): boolean { return localStorage.getItem(SFX_KEY) !== 'off'; }
export function setSfxEnabled(on: boolean) { localStorage.setItem(SFX_KEY, on ? 'on' : 'off'); }

// Slider position 0-1; 0.5 plays effects at their designed loudness, 1 is twice as loud.
const VOLUME_KEY = 'heroscall.sfxVolume';
export function getSfxVolume(): number {
  const stored = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
  return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 0.5;
}
export function setSfxVolume(volume: number) { localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, volume)))); }

// ---- Synthesized SFX (no asset files) ----
let audioCtx: AudioContext | null = null;

function tone(freq: number, duration: number, type: OscillatorType, volume: number, slideTo?: number, delay = 0) {
  const level = volume * getSfxVolume() * 2;
  if (!getSfxEnabled() || level <= 0) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  } catch {
    // Audio is optional; ignore autoplay/unsupported errors
  }
}

export const sfx = {
  swing: () => tone(320, 0.14, 'sawtooth', 0.06, 120),
  hit: (crit: boolean) => tone(crit ? 140 : 110, crit ? 0.28 : 0.18, 'square', crit ? 0.12 : 0.08, 40, 0.1),
  miss: () => tone(500, 0.16, 'sine', 0.04, 250, 0.1),
  cast: () => tone(300, 0.3, 'triangle', 0.06, 700),
  heal: () => { tone(520, 0.18, 'sine', 0.06); tone(780, 0.25, 'sine', 0.06, undefined, 0.12); },
  death: () => tone(200, 0.5, 'sawtooth', 0.08, 50, 0.15),
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.07, undefined, i * 0.12)); },
  lose: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.4, 'sine', 0.07, undefined, i * 0.18)); }
};
