// The one shared AudioContext, plus unlocking audio on the first tap or key press
// (browsers keep audio suspended until a user gesture; iPhones also mute Web Audio on silent).

let ctx: AudioContext | null = null;
let triedCreate = false;
let installed = false;
let unlocked = false;
const unlockListeners = new Set<() => void>();

/** The shared AudioContext, made on first use; null when Web Audio is unsupported. */
export function getAudioContext(): AudioContext | null {
  if (ctx || triedCreate) return ctx;
  triedCreate = true;
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext || w.webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

export function isAudioUnlocked(): boolean { return unlocked; }

/** Calls fn once audio is unlocked (right away, inside the gesture); returns an unsubscribe function. */
export function onAudioUnlocked(fn: () => void): () => void {
  unlockListeners.add(fn);
  return () => { unlockListeners.delete(fn); };
}

function isIOS(): boolean {
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
}

// 0.1 s of silence as an 8 kHz, 8-bit mono WAV.
function silentWavUrl(): string {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  text(36, 'data'); view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8-bit silence is the midpoint
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return `data:audio/wav;base64,${btoa(bin)}`;
}

// Playing an <audio> element switches iOS's audio session to "playback", which ignores the silent switch.
function playSilentElement() {
  try {
    const el = document.createElement('audio');
    el.setAttribute('x-webkit-airplay', 'deny');
    el.setAttribute('playsinline', '');
    el.preload = 'auto';
    el.muted = true;
    el.src = silentWavUrl();
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
  } catch {
    // optional
  }
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);

  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try {
    if (nav.audioSession) nav.audioSession.type = 'playback';
    else if (isIOS()) playSilentElement();
  } catch {
    // optional
  }

  const c = getAudioContext();
  try {
    if (c && c.state === 'suspended') {
      const p = c.resume();
      if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
    }
  } catch {
    // optional
  }

  unlockListeners.forEach(fn => {
    try { fn(); } catch { /* one bad listener must not stop the others */ }
  });
}

/** Listens (once) for the first pointerdown or keydown and unlocks audio then. Safe to call many times. */
export function installAudioUnlock(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

/** Test helper: forget the context and unlock state. */
export function resetAudioContextForTests(): void {
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
  ctx = null;
  triedCreate = false;
  installed = false;
  unlocked = false;
  unlockListeners.clear();
}
