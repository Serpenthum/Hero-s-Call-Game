// A small stand-in for AudioContext so sound code can be tested without a browser audio stack.

export class FakeAudioParam {
  value = 1;
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}

export class FakeNode {
  connect<T>(next: T): T { return next; }
  disconnect() {}
}

export class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam();
}

export class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  startedAt: number | null = null;
  stopped = false;
  onended: (() => void) | null = null;
  start(when = 0) { this.startedAt = when; }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.onended?.();
  }
  /** Simulate the sound reaching its end. */
  finish() { this.stop(); }
}

export class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeAudioParam();
  start() {}
  stop() {}
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination = new FakeNode();
  sources: FakeBufferSource[] = [];
  gains: FakeGainNode[] = [];
  resumeCalls = 0;
  /** When true, resume() resolves but the context stays suspended (iOS without a real activation). */
  resumeLeavesSuspended = false;
  constructor() { FakeAudioContext.instances.push(this); }
  resume() { this.resumeCalls++; if (!this.resumeLeavesSuspended) this.state = 'running'; return Promise.resolve(); }
  createBufferSource() { const s = new FakeBufferSource(); this.sources.push(s); return s; }
  createGain() { const g = new FakeGainNode(); this.gains.push(g); return g; }
  createOscillator() { return new FakeOscillator(); }
  decodeAudioData(data: ArrayBuffer) { return Promise.resolve({ duration: 1, data }); }
  /** Sources that have started and not stopped. */
  get active() { return this.sources.filter(s => s.startedAt !== null && !s.stopped); }
}

/** Installs FakeAudioContext as window.AudioContext; returns an uninstall function. */
export function installFakeAudioContext(): () => void {
  const w = window as unknown as { AudioContext?: unknown };
  const before = w.AudioContext;
  FakeAudioContext.instances = [];
  w.AudioContext = FakeAudioContext;
  return () => { w.AudioContext = before; };
}

/** A fetch stand-in: every /audio/ URL answers with a tiny body, except the ones listed as failing. */
export function fakeFetch(failing: string[] = []) {
  return async (url: string) => {
    if (failing.some(f => url.endsWith(f))) throw new Error('network');
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
  };
}
