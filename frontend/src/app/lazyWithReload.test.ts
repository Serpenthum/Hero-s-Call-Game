import { describe, it, expect, vi } from 'vitest';
import {
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  shouldReloadForChunkError,
  reloadOnceForChunkError,
  loadWithReload,
} from './lazyWithReload';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
    data,
  };
};

describe('shouldReloadForChunkError', () => {
  it('reloads when this tab has never reloaded for a chunk', () => {
    expect(shouldReloadForChunkError(1_000_000, null)).toBe(true);
  });
  it('does not reload again within the window (a loop guard)', () => {
    expect(shouldReloadForChunkError(1_000_000, 1_000_000 - 5_000)).toBe(false);
    expect(shouldReloadForChunkError(1_000_000, 1_000_000 - CHUNK_RELOAD_WINDOW_MS + 1)).toBe(false);
  });
  it('reloads again once the window has passed (a later deploy)', () => {
    expect(shouldReloadForChunkError(1_000_000, 1_000_000 - CHUNK_RELOAD_WINDOW_MS)).toBe(true);
  });
  it('treats a marker from the future (clock changed) or garbage as no marker', () => {
    expect(shouldReloadForChunkError(1_000_000, 2_000_000)).toBe(true);
    expect(shouldReloadForChunkError(1_000_000, Number.NaN)).toBe(true);
  });
});

describe('reloadOnceForChunkError', () => {
  it('stamps the marker and reloads the first time', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    expect(reloadOnceForChunkError({ storage, reload, now: () => 5_000_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.data.get(CHUNK_RELOAD_KEY)).toBe('5000000');
  });
  it('does not reload when the marker is recent', () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: String(5_000_000 - 1_000) });
    const reload = vi.fn();
    expect(reloadOnceForChunkError({ storage, reload, now: () => 5_000_000 })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
  it('does not reload when storage is unavailable (no loop guard, so no risk)', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const reload = vi.fn();
    expect(reloadOnceForChunkError({ storage, reload, now: () => 5_000_000 })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('loadWithReload', () => {
  it('passes a working import through', async () => {
    const mod = { default: () => null };
    await expect(loadWithReload(() => Promise.resolve(mod), { storage: memoryStorage(), reload: vi.fn(), now: () => 1 })).resolves.toBe(mod);
  });
  it('rethrows the import error when the reload is suppressed, so the error boundary shows', async () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: '999' });
    const reload = vi.fn();
    const err = new TypeError('Failed to fetch dynamically imported module');
    await expect(loadWithReload(() => Promise.reject(err), { storage, reload, now: () => 1_000 })).rejects.toBe(err);
    expect(reload).not.toHaveBeenCalled();
  });
  it('reloads and never settles while the page goes away (no error flash)', async () => {
    const reload = vi.fn();
    let settled = false;
    loadWithReload(() => Promise.reject(new Error('x')), { storage: memoryStorage(), reload, now: () => 1 })
      .then(() => { settled = true; }, () => { settled = true; });
    await new Promise(r => setTimeout(r, 10));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
  });
});
