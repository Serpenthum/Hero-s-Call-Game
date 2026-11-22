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

/** Calls fn once audio is unlocked (inside the gesture when possible; at once if already unlocked); returns an unsubscribe function. */
export function onAudioUnlocked(fn: () => void): () => void {
  if (unlocked) {
    try { fn(); } catch { /* ignore */ }
  }
  unlockListeners.add(fn);
  return () => { unlockListeners.delete(fn); };
}

function isIOS(): boolean {
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
}

// 0.1 s of silence as an 8 kHz, 8-bit mono WAV (also used to prime music elements in a gesture).
export function silentWavUrl(): string {
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
    // Unmuted on purpose: the clip is silence, and a muted element may not switch the session.
    el.src = silentWavUrl();
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* ignore */ });
  } catch {
    // optional
  }
}

// Touch pointerdown is not a user activation on iOS, so listen for several gestures and keep
// trying on each until the context is running.
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

function removeGestureListeners() {
  GESTURES.forEach(type => window.removeEventListener(type, onGesture, true));
}

function markUnlocked() {
  removeGestureListeners();
  if (unlocked) return;
  unlocked = true;
  unlockListeners.forEach(fn => {
    try { fn(); } catch { /* one bad listener must not stop the others */ }
  });
}

function onGesture() {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  try {
    if (nav.audioSession) nav.audioSession.type = 'playback';
    else if (isIOS()) playSilentElement();
  } catch {
    // optional
  }

  const c = getAudioContext();
  if (!c) { markUnlocked(); return; }
  try {
    if (c.state !== 'running') {
      const p = c.resume();
      if (p && typeof p.then === 'function') {
        p.then(() => { if (c.state === 'running') markUnlocked(); }, () => { /* try again next gesture */ });
      }
    }
  } catch {
    // try again next gesture
  }
  if (c.state === 'running') markUnlocked();
}

/** Listens for gestures and unlocks audio on the first one that works. Safe to call many times. */
export function installAudioUnlock(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  GESTURES.forEach(type => window.addEventListener(type, onGesture, true));
}

/** Test helper: forget the context and unlock state. */
export function resetAudioContextForTests(): void {
  removeGestureListeners();
  ctx = null;
  triedCreate = false;
  installed = false;
  unlocked = false;
  unlockListeners.clear();
}
