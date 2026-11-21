import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthToken, restoreSession, saveSession, setAuthToken } from './authSession';
import { endSession, signOutLocally } from './signOut';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); }
  };
}

beforeEach(() => {
  (globalThis as any).sessionStorage = fakeStorage();
  setAuthToken('shared-token');
  saveSession({ id: 5 });
});
afterEach(() => {
  delete (globalThis as any).sessionStorage;
});

describe('forced logout (the account moved to another tab)', () => {
  it('forgets the login locally and never tells the server, so the other tab keeps the shared token', async () => {
    const post = vi.fn(async () => ({}));
    await endSession({ notifyServer: false, userId: 5, apiBase: 'http://api', post });
    expect(post).not.toHaveBeenCalled();
    expect(getAuthToken()).toBeNull();
    expect(restoreSession()).toBeNull();
  });

  it('signOutLocally does the same without any request', () => {
    signOutLocally();
    expect(getAuthToken()).toBeNull();
    expect(restoreSession()).toBeNull();
  });
});

describe('sign out chosen by the player', () => {
  it('ends the session on the server with the token, then forgets it', async () => {
    const post = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer shared-token');
      return {};
    });
    await endSession({ notifyServer: true, userId: 5, apiBase: 'http://api', post });
    expect(post).toHaveBeenCalledWith('http://api/api/logout', expect.objectContaining({ method: 'POST' }));
    expect(getAuthToken()).toBeNull();
    expect(restoreSession()).toBeNull();
  });

  it('still signs out locally when the server cannot be reached', async () => {
    const post = vi.fn(async () => { throw new Error('offline'); });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    await endSession({ notifyServer: true, userId: 5, apiBase: 'http://api', post });
    quiet.mockRestore();
    expect(getAuthToken()).toBeNull();
  });
});
