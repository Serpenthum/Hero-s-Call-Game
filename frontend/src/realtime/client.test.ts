import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSocket } from './client';

class FakeWS {
  static instances: FakeWS[] = [];
  url: string;
  sent: string[] = [];
  closed = false;
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  constructor(url: string) {
    this.url = url;
    FakeWS.instances.push(this);
  }
  send(s: string) { this.sent.push(s); }
  close() { this.serverClose(); }
  open() { this.onopen?.({}); }
  serverSend(frame: any) { this.onmessage?.({ data: JSON.stringify(frame) }); }
  serverClose() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({});
  }
  frames() { return this.sent.map((s) => JSON.parse(s)); }
}

const make = (opts: any = {}) =>
  createSocket('http://example.test:1234', {
    reconnectionAttempts: 3,
    reconnectionDelay: 100,
    WebSocketImpl: FakeWS as any,
    ...opts,
  });
const last = () => FakeWS.instances[FakeWS.instances.length - 1];

beforeEach(() => {
  FakeWS.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('realtime client', () => {
  it('connects to /ws and is connected only after __welcome', () => {
    const s = make();
    expect(last().url).toBe('ws://example.test:1234/ws');
    const onConnect = vi.fn();
    s.on('connect', onConnect);
    last().open();
    expect(s.connected).toBe(false);
    expect(s.id).toBeUndefined();
    last().serverSend({ t: '__welcome', d: ['abc'] });
    expect(s.connected).toBe(true);
    expect(s.id).toBe('abc');
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('maps https to wss', () => {
    createSocket('https://x.test', { WebSocketImpl: FakeWS as any });
    expect(last().url).toBe('wss://x.test/ws');
  });

  it('emit sends a frame', () => {
    const s = make();
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    s.emit('a', 1);
    expect(last().frames()).toEqual([{ t: 'a', d: [1] }]);
  });

  it('trailing function becomes an ack', () => {
    const s = make();
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    const cb = vi.fn();
    s.emit('p', cb);
    expect(last().frames()).toEqual([{ t: 'p', d: [], a: 1 }]);
    last().serverSend({ t: '__ack', a: 1, d: ['x'] });
    expect(cb).toHaveBeenCalledWith('x');
  });

  it('timeout emit calls back with an Error when no reply', () => {
    const s = make();
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    const cb = vi.fn();
    s.timeout(50).emit('p', cb);
    vi.advanceTimersByTime(60);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('timeout emit passes null err on reply', () => {
    const s = make();
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    const cb = vi.fn();
    s.timeout(50).emit('p', cb);
    last().serverSend({ t: '__ack', a: 1, d: ['r'] });
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(null, 'r');
  });

  it('buffers emits before the first connection and flushes them on connect', () => {
    const s = make();
    s.emit('early', 1);
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    expect(last().frames()).toEqual([{ t: 'early', d: [1] }]);
  });

  it('drops emits made while reconnecting (the new connection is not logged in yet)', () => {
    const s = make();
    const first = last();
    first.open();
    first.serverSend({ t: '__welcome', d: ['id1'] });
    const events: string[] = [];
    s.on('disconnect', (r: string) => events.push('disconnect:' + r));
    s.on('connect', () => events.push('connect:' + s.id));
    first.serverClose();
    expect(s.connected).toBe(false);
    s.emit('b');
    expect(first.sent).toEqual([]);
    vi.advanceTimersByTime(100);
    const second = last();
    expect(second).not.toBe(first);
    second.open();
    second.serverSend({ t: '__welcome', d: ['id2'] });
    expect(s.id).toBe('id2');
    expect(second.frames()).toEqual([]);
    expect(events).toEqual(['disconnect:transport close', 'connect:id2']);
  });

  it('probe() pings at once and drops a connection that does not answer', () => {
    const s = make();
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    const onDisconnect = vi.fn();
    s.on('disconnect', onDisconnect);
    s.probe(3000);
    expect(last().frames()).toEqual([{ t: '__ping', d: [] }]);
    vi.advanceTimersByTime(2999);
    expect(onDisconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDisconnect).toHaveBeenCalledWith('transport close');
  });

  it('probe() keeps a connection that answers', () => {
    const s = make();
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    s.probe(3000);
    last().serverSend({ t: '__pong', d: [] });
    vi.advanceTimersByTime(5000);
    expect(s.connected).toBe(true);
  });

  it('probe() retries at once after giving up', () => {
    const s = make({ reconnectionAttempts: 1 });
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    last().serverClose();
    vi.advanceTimersByTime(100);
    last().serverClose(); // the one retry fails too: the client gives up
    const count = FakeWS.instances.length;
    vi.advanceTimersByTime(60000);
    expect(FakeWS.instances.length).toBe(count);
    s.probe();
    expect(FakeWS.instances.length).toBe(count + 1);
  });

  it('dropConnection() closes at once and reconnects', () => {
    const s = make();
    const first = last();
    first.open();
    first.serverSend({ t: '__welcome', d: ['id1'] });
    s.dropConnection();
    expect(s.connected).toBe(false);
    vi.advanceTimersByTime(100);
    expect(last()).not.toBe(first);
  });

  it('fires reconnect_error and retries with backoff up to the limit', () => {
    const s = make({ reconnectionAttempts: 2 });
    const err = vi.fn();
    s.on('reconnect_error', err);
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    last().serverClose();
    vi.advanceTimersByTime(100);
    expect(FakeWS.instances.length).toBe(2);
    last().serverClose(); // failed attempt 1
    expect(err).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(199);
    expect(FakeWS.instances.length).toBe(2);
    vi.advanceTimersByTime(1);
    expect(FakeWS.instances.length).toBe(3);
    last().serverClose();
    vi.advanceTimersByTime(10000);
    expect(FakeWS.instances.length).toBe(3);
  });

  it('does not reconnect after __kick', () => {
    const s = make();
    const reasons: string[] = [];
    s.on('disconnect', (r: string) => reasons.push(r));
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    last().serverSend({ t: '__kick', d: [] });
    last().serverClose();
    vi.advanceTimersByTime(10000);
    expect(reasons).toEqual(['io server disconnect']);
    expect(FakeWS.instances.length).toBe(1);
    expect(s.connected).toBe(false);
  });

  it('does not reconnect after disconnect()', () => {
    const s = make();
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    s.disconnect();
    vi.advanceTimersByTime(10000);
    expect(FakeWS.instances.length).toBe(1);
    expect(s.connected).toBe(false);
  });

  it('dispatches server events and supports off/once', () => {
    const s = make();
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    const h = vi.fn();
    const o = vi.fn();
    s.on('ev', h);
    s.once('ev', o);
    last().serverSend({ t: 'ev', d: [1, 2] });
    expect(h).toHaveBeenCalledWith(1, 2);
    last().serverSend({ t: 'ev', d: [3] });
    expect(o).toHaveBeenCalledTimes(1);
    expect(h).toHaveBeenCalledTimes(2);
    s.off('ev', h);
    last().serverSend({ t: 'ev', d: [4] });
    expect(h).toHaveBeenCalledTimes(2);
  });

  it('off(ev) with no handler removes all handlers for the event', () => {
    const s = make();
    last().open();
    last().serverSend({ t: '__welcome', d: ['id1'] });
    const h = vi.fn();
    s.on('ev', h);
    s.off('ev');
    last().serverSend({ t: 'ev', d: [1] });
    expect(h).not.toHaveBeenCalled();
  });
  describe('heartbeat', () => {
    const connected = () => {
      const s = make();
      last().open();
      last().serverSend({ t: '__welcome', d: ['abc'] });
      return s;
    };

    it('pings every 25 s and stays up while pongs arrive', () => {
      const s = connected();
      const ws = last();
      vi.advanceTimersByTime(25000);
      expect(ws.frames().filter((f) => f.t === '__ping')).toHaveLength(1);
      ws.serverSend({ t: '__pong', d: [] });
      vi.advanceTimersByTime(10000);
      expect(s.connected).toBe(true);
      vi.advanceTimersByTime(15000);
      expect(ws.frames().filter((f) => f.t === '__ping')).toHaveLength(2);
    });

    it('closes, fires disconnect and reconnects when no pong arrives', () => {
      const s = connected();
      const onDisconnect = vi.fn();
      s.on('disconnect', onDisconnect);
      const first = last();
      vi.advanceTimersByTime(25000 + 10000);
      expect(onDisconnect).toHaveBeenCalledWith('transport close');
      expect(s.connected).toBe(false);
      expect(first.closed).toBe(true);
      vi.advanceTimersByTime(100);
      expect(FakeWS.instances).toHaveLength(2);
    });

    it('honours interval overrides and stops pinging after disconnect()', () => {
      const s = make({ pingIntervalMs: 1000, pongTimeoutMs: 500 });
      last().open();
      const ws = last();
      ws.serverSend({ t: '__welcome', d: ['abc'] });
      vi.advanceTimersByTime(1000);
      expect(ws.frames().some((f) => f.t === '__ping')).toBe(true);
      s.disconnect();
      const n = ws.sent.length;
      vi.advanceTimersByTime(5000);
      expect(ws.sent.length).toBe(n);
      expect(FakeWS.instances).toHaveLength(1);
    });
  });
});
