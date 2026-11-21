import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, getAuthToken, restoreSession, saveSession, setAuthToken } from './authSession';

// A stand-in for the browser's per-tab sessionStorage
function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    data
  };
}

let storage: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  storage = fakeStorage();
  (globalThis as any).sessionStorage = storage;
  setAuthToken(null);
});
afterEach(() => {
  delete (globalThis as any).sessionStorage;
});

describe('session kept across a refresh', () => {
  it('saves the account with its token and restores both', () => {
    setAuthToken('tok-1');
    saveSession({ id: 7, username: 'Kid' });
    setAuthToken(null); // the page reloads: memory is gone
    const restored = restoreSession<{ id: number; username: string }>();
    expect(restored?.user.username).toBe('Kid');
    expect(restored?.token).toBe('tok-1');
    expect(getAuthToken()).toBe('tok-1');
  });

  it('saves nothing without a token or for the offline test account', () => {
    saveSession({ id: 7 });
    setAuthToken('tok');
    saveSession({ id: -1 });
    expect(storage.data.size).toBe(0);
  });

  it('forgets the account on sign out', () => {
    setAuthToken('tok');
    saveSession({ id: 3 });
    clearSession();
    expect(restoreSession()).toBeNull();
  });

  it('ignores damaged data', () => {
    storage.setItem('heroCallSession', '{not json');
    expect(restoreSession()).toBeNull();
    storage.setItem('heroCallSession', JSON.stringify({ userId: 1, token: 't', user: { id: 2 } }));
    expect(restoreSession()).toBeNull();
  });

  it('copes with storage being unavailable', () => {
    delete (globalThis as any).sessionStorage;
    setAuthToken('tok');
    expect(() => saveSession({ id: 3 })).not.toThrow();
    expect(restoreSession()).toBeNull();
    expect(() => clearSession()).not.toThrow();
  });
});
