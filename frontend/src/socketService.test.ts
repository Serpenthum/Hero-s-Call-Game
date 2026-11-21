import { describe, expect, it, vi } from 'vitest';

// A stand-in socket: enough for connect() to wire its own listeners, and to be "stopped" on demand
const made = vi.hoisted(() => [] as { stopped: boolean }[]);
vi.mock('./realtime/client', () => ({
  createSocket: () => {
    const s = {
      stopped: false,
      on: () => s,
      off: () => s,
      emit: () => s,
      isStopped: () => s.stopped,
      disconnect: () => { s.stopped = true; return s; },
    };
    made.push(s);
    return s;
  },
}));
vi.mock('./config', () => ({ default: { SOCKET_URL: 'ws://test', API_BASE_URL: '', IMAGE_BASE_URL: '' } }));
vi.mock('./battleAnimations', () => ({ getAutoEndTurnEnabled: () => false }));
vi.mock('./authSession', () => ({ getAuthToken: () => null }));

import { socketService } from './socketService';

describe('socketService.onSocketChange', () => {
  it('tells subscribers when the socket is created, replaced and dropped', () => {
    const seen: unknown[] = [];
    const stop = socketService.onSocketChange(s => seen.push(s));

    const first = socketService.connect();
    expect(seen).toEqual([first]);

    // A live socket is reused: no change to report
    expect(socketService.connect()).toBe(first);
    expect(seen).toHaveLength(1);

    // A socket the server closed is replaced: subscribers get the new object, never a null in between
    made[made.length - 1].stopped = true;
    const second = socketService.connect();
    expect(second).not.toBe(first);
    expect(seen).toEqual([first, second]);

    socketService.disconnect();
    expect(seen).toEqual([first, second, null]);

    stop();
    socketService.connect();
    expect(seen).toHaveLength(3);
    socketService.disconnect();
  });
});
