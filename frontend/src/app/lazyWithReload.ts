import { lazy, type ComponentType } from 'react';

// A tab opened before a deploy still asks for the old hashed chunks. They are gone, so Pages answers with
// index.html and the dynamic import fails. Reloading picks up the new deploy. A marker in sessionStorage stops
// a reload loop: a second failure soon after is thrown, and the app's error boundary offers a Reload button.
export const CHUNK_RELOAD_KEY = 'heroscall.chunkReloadAt';
export const CHUNK_RELOAD_WINDOW_MS = 30_000;

export function shouldReloadForChunkError(now: number, lastReloadAt: number | null): boolean {
  if (lastReloadAt === null || !Number.isFinite(lastReloadAt) || lastReloadAt > now) return true;
  return now - lastReloadAt >= CHUNK_RELOAD_WINDOW_MS;
}

interface ReloadDeps {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  reload: () => void;
  now: () => number;
}

const browserDeps = (): ReloadDeps => ({
  storage: window.sessionStorage,
  reload: () => window.location.reload(),
  now: () => Date.now(),
});

// Reloads the page unless it already did so for a chunk in the last 30 s. Without storage there is no loop
// guard, so it never reloads then. Returns whether the page is reloading.
export function reloadOnceForChunkError(deps: ReloadDeps = browserDeps()): boolean {
  try {
    const saved = deps.storage.getItem(CHUNK_RELOAD_KEY);
    const now = deps.now();
    if (!shouldReloadForChunkError(now, saved === null ? null : Number(saved))) return false;
    deps.storage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  deps.reload();
  return true;
}

export function loadWithReload<T>(factory: () => Promise<T>, deps?: ReloadDeps): Promise<T> {
  return factory().catch((err) => {
    // While the page reloads, stay pending (Suspense keeps its fallback) rather than flashing the error panel
    if (reloadOnceForChunkError(deps)) return new Promise<T>(() => {});
    throw err;
  });
}

// Use instead of React.lazy for every code-split screen
export function lazyWithReload<P>(factory: () => Promise<{ default: ComponentType<P> }>) {
  return lazy(() => loadWithReload(factory));
}
