'use strict';
// socket.io-compatible realtime hub over plain WebSocket-like transports.
// No Node-only imports: bundled for Cloudflare Workers.
const { v4: uuidv4 } = require('uuid');

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function createHub({ maxFrameBytes = 65536 } = {}) {
  const connectionHandlers = [];
  const socketsMap = new Map();
  const rooms = new Map(); // room -> Set<socketId>

  function safeSend(socket, frame) {
    try {
      socket._transport.send(JSON.stringify(frame));
    } catch (_) {
      // dead socket: never break a broadcast
    }
  }

  function makeEmitter(roomList, excludeId) {
    const list = roomList.slice();
    const api = {
      to(room) { list.push(room); return api; },
      emit(ev, ...args) {
        const ids = new Set();
        for (const r of list) {
          const members = rooms.get(r);
          if (members) for (const id of members) ids.add(id);
        }
        if (excludeId) ids.delete(excludeId);
        const frame = { t: ev, d: args };
        for (const id of ids) {
          const s = socketsMap.get(id);
          if (s) safeSend(s, frame);
        }
      },
    };
    return api;
  }

  function runHandler(fn, args) {
    try {
      const r = fn(...args);
      if (r && typeof r.then === 'function') {
        r.then(undefined, (e) => console.error('[hub] handler rejected:', e));
      }
    } catch (e) {
      console.error('[hub] handler error:', e);
    }
  }

  function removeFromRooms(socket) {
    for (const r of socket.rooms) {
      const m = rooms.get(r);
      if (m) { m.delete(socket.id); if (m.size === 0) rooms.delete(r); }
    }
    socket.rooms.clear();
  }

  function finish(socket, reason) {
    if (!socket.connected) return;
    socket.connected = false;
    removeFromRooms(socket);
    socketsMap.delete(socket.id);
    const hs = socket._handlers.get('disconnect');
    if (hs) for (const h of hs.slice()) runHandler(h, [reason]);
  }

  function createSocket(transport) {
    const id = uuidv4();
    const socket = {
      id,
      data: {},
      connected: true,
      rooms: new Set([id]),
      _transport: transport,
      _handlers: new Map(),
      join(room) {
        if (!socket.connected) return;
        socket.rooms.add(room);
        let m = rooms.get(room);
        if (!m) { m = new Set(); rooms.set(room, m); }
        m.add(id);
      },
      leave(room) {
        socket.rooms.delete(room);
        const m = rooms.get(room);
        if (m) { m.delete(id); if (m.size === 0) rooms.delete(room); }
      },
      emit(ev, ...args) { safeSend(socket, { t: ev, d: args }); },
      to(room) { return makeEmitter([room], id); },
      on(ev, fn) {
        if (!socket._handlers.has(ev)) socket._handlers.set(ev, []);
        socket._handlers.get(ev).push(fn);
        return socket;
      },
      once(ev, fn) {
        const w = (...a) => { socket.off(ev, w); return fn(...a); };
        w._orig = fn;
        return socket.on(ev, w);
      },
      off(ev, fn) {
        const hs = socket._handlers.get(ev);
        if (hs) {
          const i = hs.findIndex((h) => h === fn || h._orig === fn);
          if (i >= 0) hs.splice(i, 1);
        }
        return socket;
      },
      disconnect() {
        if (!socket.connected) return socket;
        safeSend(socket, { t: '__kick', d: [] });
        try { transport.close(1000); } catch (_) { /* already closed */ }
        finish(socket, 'server namespace disconnect');
        return socket;
      },
    };
    socket.broadcast = {
      emit(ev, ...args) {
        const frame = { t: ev, d: args };
        for (const [sid, s] of socketsMap) if (sid !== id) safeSend(s, frame);
      },
    };
    return socket;
  }

  const io = {
    sockets: { sockets: socketsMap },
    on(ev, fn) {
      if (ev === 'connection') connectionHandlers.push(fn);
      return io;
    },
    emit(ev, ...args) {
      const frame = { t: ev, d: args };
      for (const s of socketsMap.values()) safeSend(s, frame);
    },
    to(room) { return makeEmitter([room], null); },
    attach(transport) {
      const socket = createSocket(transport);
      socketsMap.set(socket.id, socket);
      socket.join(socket.id);
      safeSend(socket, { t: '__welcome', d: [socket.id] });
      for (const h of connectionHandlers.slice()) runHandler(h, [socket]);
      return {
        receive(text) {
          if (!socket.connected) return;
          try {
            if (typeof text !== 'string' || byteLength(text) > maxFrameBytes) {
              console.error('[hub] dropped oversize/non-text frame');
              return;
            }
            let frame;
            try { frame = JSON.parse(text); } catch (_) { return; }
            if (!frame || typeof frame !== 'object' || typeof frame.t !== 'string') return;
            if (frame.t === 'disconnect' || frame.t.startsWith('__')) return;
            const hs = socket._handlers.get(frame.t);
            if (!hs || hs.length === 0) return;
            const args = Array.isArray(frame.d) ? frame.d.slice() : [];
            if (typeof frame.a === 'number') {
              const a = frame.a;
              args.push((...res) => safeSend(socket, { t: '__ack', a, d: res }));
            }
            for (const h of hs.slice()) runHandler(h, args);
          } catch (e) {
            console.error('[hub] receive error:', e);
          }
        },
        closed() { finish(socket, 'transport close'); },
      };
    },
  };
  return io;
}

module.exports = { createHub };
