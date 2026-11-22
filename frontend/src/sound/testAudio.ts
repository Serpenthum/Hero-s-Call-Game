// A small stand-in for AudioContext so sound code can be tested without a browser audio stack.

export class FakeAudioParam {
  value = 1;
  /** Every scheduled change, so tests can check ramp targets and end times. */
  events: { type: 'set' | 'ramp'; value: number; time: number }[] = [];
  setValueAtTime(v: number, time = 0) { this.value = v; this.events.push({ type: 'set', value: v, time }); return this; }
  linearRampToValueAtTime(v: number, time = 0) { this.value = v; this.events.push({ type: 'ramp', value: v, time }); return this; }
  /** The last linear ramp scheduled, or undefined. */
  get lastRamp() { return [...this.events].reverse().find(e => e.type === 'ramp'); }
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

export class FakeMediaElementSource extends FakeNode {
  constructor(public mediaElement: unknown) { super(); }
}

/** A stand-in for HTMLAudioElement: play/pause, loop, volume, currentTime and an end() to fire 'ended'. */
export class FakeAudioElement extends EventTarget {
  static instances: FakeAudioElement[] = [];
  /** When true, every element's play() rejects. */
  static refuseAll = false;
  src = '';
  preload = '';
  loop = false;
  volume = 1;
  currentTime = 0;
  paused = true;
  playCalls = 0;
  attributes: Record<string, string> = {};
  /** When true, play() rejects (a browser refusing playback outside a gesture). */
  refusePlay = false;
  constructor() { super(); FakeAudioElement.instances.push(this); }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  play() {
    this.playCalls++;
    if (this.refusePlay || FakeAudioElement.refuseAll) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  /** Simulate the file failing to load (404, decode error). */
  fail() { this.paused = true; this.dispatchEvent(new Event('error')); }
  /** Simulate the track reaching its end (a looping element never ends). */
  end() {
    if (this.loop) { this.currentTime = 0; return; }
    this.paused = true;
    this.dispatchEvent(new Event('ended'));
  }
}

/** Installs FakeAudioElement as window.Audio; returns an uninstall function. */
export function installFakeAudioElement(): () => void {
  const w = window as unknown as { Audio?: unknown };
  const before = w.Audio;
  FakeAudioElement.instances = [];
  FakeAudioElement.refuseAll = false;
  w.Audio = FakeAudioElement;
  return () => { w.Audio = before; };
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended';
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
  mediaSources: FakeMediaElementSource[] = [];
  createMediaElementSource(el: unknown) { const m = new FakeMediaElementSource(el); this.mediaSources.push(m); return m; }
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
