// Minimal WebSocket client exposing the subset of the socket.io-client API the app uses.
// Wire protocol (see backend/realtime/hub.js):
//   server -> client: {t, d:[args]} | {t:'__welcome', d:[id]} | {t:'__ack', a, d:[results]} | {t:'__kick', d:[]}
//   client -> server: {t, d:[args], a?: ackId} | {t:'__ping', d:[]} (answered by {t:'__pong', d:[]})

type Handler = (...args: any[]) => void;

export interface SocketOptions {
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  WebSocketImpl?: typeof WebSocket;
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
}

const MAX_BACKOFF_MS = 5000;

// The generic parameter is accepted for source compatibility with socket.io's Socket<Events>.
export class Socket<_E = any> {
  connected = false;
  id: string | undefined = undefined;

  private url: string;
  private WS: typeof WebSocket;
  private maxAttempts: number;
  private baseDelay: number;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();
  private acks = new Map<number, Handler>();
  private nextAck = 1;
  private buffer: string[] = [];
  private attempt = 0;
  private everConnected = false;
  private stopped = false;
  private kicked = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: number;
  private pongTimeout: number;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, opts: SocketOptions = {}) {
    this.url = url.replace(/^http/i, 'ws').replace(/\/+$/, '') + '/ws';
    this.WS = opts.WebSocketImpl ?? (globalThis as any).WebSocket;
    this.maxAttempts = opts.reconnectionAttempts ?? 5;
    this.baseDelay = opts.reconnectionDelay ?? 1000;
    this.pingInterval = opts.pingIntervalMs ?? 25000;
    this.pongTimeout = opts.pongTimeoutMs ?? 10000;
    this.open();
  }

  private open() {
    this.kicked = false;
    let ws: WebSocket;
    try {
      ws = new this.WS(this.url);
    } catch {
      this.onTransportClosed();
      return;
    }
    this.ws = ws;
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return;
      this.onFrame(ev.data);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onTransportClosed();
    };
    ws.onerror = () => {
      /* a close event follows */
    };
  }

  private onFrame(raw: any) {
    let f: any;
    try {
      f = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return;
    }
    if (!f || typeof f.t !== 'string') return;
    const d: any[] = Array.isArray(f.d) ? f.d : [];
    if (f.t === '__welcome') {
      this.id = d[0];
      this.connected = true;
      const attempts = this.attempt;
      const wasReconnect = this.everConnected;
      this.everConnected = true;
      this.attempt = 0;
      // Frames queued before the first connection go out now. Frames queued while reconnecting are
      // dropped: the new connection is a new session that is not logged in yet, so a replayed game
      // action would only fail (the app logs in again and rejoins its game on 'reconnect').
      const pending = wasReconnect ? [] : this.buffer;
      this.buffer = [];
      for (const s of pending) this.rawSend(s);
      this.startHeartbeat();
      this.fire('connect');
      if (wasReconnect) this.fire('reconnect', attempts);
    } else if (f.t === '__ack') {
      const cb = this.acks.get(f.a);
      if (cb) {
        this.acks.delete(f.a);
        cb(...d);
      }
    } else if (f.t === '__pong') {
      this.clearPongTimer();
    } else if (f.t === '__kick') {
      this.kicked = true;
    } else if (!f.t.startsWith('__')) {
      this.fire(f.t, ...d);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.rawSend(JSON.stringify({ t: '__ping', d: [] }));
      if (this.pongTimer) return;
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        // No pong: the connection is dead. Drop it and take the normal reconnect path.
        this.dropConnection();
      }, this.pongTimeout);
    }, this.pingInterval);
  }

  // Closes the current connection as dead and takes the normal reconnect path
  dropConnection() {
    if (this.stopped) return;
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    this.onTransportClosed();
  }

  // Checks the connection now (the page came back into view, or the network came back): pings with a
  // short timeout when connected, and retries at once when not, even after giving up.
  probe(timeoutMs = 3000) {
    if (this.stopped || this.kicked) return;
    if (this.connected) {
      this.rawSend(JSON.stringify({ t: '__ping', d: [] }));
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        this.dropConnection();
      }, timeoutMs);
      return;
    }
    if (this.ws) return; // already connecting
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempt = Math.max(this.attempt, 1);
    this.open();
  }

  private clearPongTimer() {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clearPongTimer();
  }

  private onTransportClosed() {
    this.stopHeartbeat();
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected) {
      this.fire('disconnect', this.kicked ? 'io server disconnect' : 'transport close');
    } else if (!this.stopped && !this.kicked && this.attempt > 0) {
      this.fire('reconnect_error', new Error('websocket error'));
    }
    if (this.kicked) {
      this.stopped = true;
      this.buffer = [];
      return;
    }
    if (this.stopped || this.attempt >= this.maxAttempts) return;
    const delay = Math.min(this.baseDelay * Math.pow(2, this.attempt), MAX_BACKOFF_MS);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }

  private fire(ev: string, ...args: any[]) {
    const hs = this.handlers.get(ev);
    if (!hs) return;
    for (const h of hs.slice()) {
      try {
        h(...args);
      } catch (e) {
        console.error('[socket] handler error for', ev, e);
      }
    }
  }

  private rawSend(text: string) {
    try {
      this.ws?.send(text);
    } catch {
      /* socket closing; the close handler takes over */
    }
  }

  private send(ev: string, args: any[], ackId?: number) {
    const frame: any = { t: ev, d: args };
    if (ackId !== undefined) frame.a = ackId;
    const text = JSON.stringify(frame);
    if (this.connected) this.rawSend(text);
    else if (!this.stopped) this.buffer.push(text);
  }

  on(ev: string, fn: Handler): this {
    const hs = this.handlers.get(ev);
    if (hs) hs.push(fn);
    else this.handlers.set(ev, [fn]);
    return this;
  }

  once(ev: string, fn: Handler): this {
    const w: any = (...a: any[]) => {
      this.off(ev, w);
      fn(...a);
    };
    w._orig = fn;
    return this.on(ev, w);
  }

  off(ev: string, fn?: Handler): this {
    if (!fn) {
      this.handlers.delete(ev);
      return this;
    }
    const hs = this.handlers.get(ev);
    if (hs) {
      const i = hs.findIndex((h: any) => h === fn || h._orig === fn);
      if (i >= 0) hs.splice(i, 1);
    }
    return this;
  }

  emit(ev: string, ...args: any[]): this {
    if (typeof args[args.length - 1] === 'function') {
      const cb = args.pop() as Handler;
      const id = this.nextAck++;
      this.acks.set(id, cb);
      this.send(ev, args, id);
    } else {
      this.send(ev, args);
    }
    return this;
  }

  timeout(ms: number) {
    return {
      emit: (ev: string, ...args: any[]) => {
        const cb = args.pop() as Handler;
        const id = this.nextAck++;
        const timer = setTimeout(() => {
          this.acks.delete(id);
          cb(new Error('operation has timed out'));
        }, ms);
        this.acks.set(id, (...res: any[]) => {
          clearTimeout(timer);
          cb(null, ...res);
        });
        this.send(ev, args, id);
      },
    };
  }

  disconnect(): this {
    this.stopped = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.buffer = [];
    const ws = this.ws;
    this.ws = null;
    const wasConnected = this.connected;
    this.connected = false;
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    if (wasConnected) this.fire('disconnect', 'io client disconnect');
    return this;
  }
}

export function createSocket(url: string, opts: SocketOptions = {}): Socket {
  return new Socket(url, opts);
}
