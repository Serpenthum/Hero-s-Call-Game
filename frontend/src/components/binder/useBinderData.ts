// Loads what the binder shows: every hero, plus the signed-in player's owned, holo and favourite heroes and their
// shards. Crafting a hero with shards goes through here too.
import { useCallback, useEffect, useRef, useState } from 'react';
import config from '../../config';
import { authHeaders } from '../../authSession';
import { craftErrorText } from '../shop/shopRules';
import type { BinderHero, Collection } from './binderRules';

export interface BinderData {
  heroes: BinderHero[];
  collection: Collection;
  loading: boolean;
  error: boolean;
  retry: () => void;
  toggleFavourite: (name: string) => Promise<void>;
  shards: number;
  craft: (name: string) => Promise<CraftResult>;
}

export type CraftResult = { ok: true } | { ok: false; message: string };

const API = config.API_BASE_URL;
// An old server has no craft route (404); no network reads the same
export const CRAFT_UNAVAILABLE = "Crafting isn't available right now.";
// A stalled connection must not hold the large view shut: past this the craft gives up and reads as unavailable
export const CRAFT_TIMEOUT_MS = 15000;
// The server's refusal when the account already has the hero: the binder, which showed it locked, is out of date
const ALREADY_OWNED = 'You already have this hero.';

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

export default function useBinderData(
  userId: number | undefined,
  onFavoritesChange?: (favs: string[]) => void,
  onPurchaseComplete?: () => void, // after a craft, so the lobby refreshes its user as it does after a pack
): BinderData {
  const [heroes, setHeroes] = useState<BinderHero[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [holo, setHolo] = useState<string[]>([]);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [shards, setShards] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const onFavoritesChangeRef = useRef(onFavoritesChange);
  onFavoritesChangeRef.current = onFavoritesChange;
  const onPurchaseCompleteRef = useRef(onPurchaseComplete);
  onPurchaseCompleteRef.current = onPurchaseComplete;

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);

    const heroesUrl = userId ? `${API}/api/heroes?userId=${userId}&showAll=true` : `${API}/api/heroes`;
    getJson(heroesUrl)
      .then(data => { if (current) setHeroes(data as BinderHero[]); })
      .catch(err => {
        console.error('Error fetching heroes:', err);
        if (current) { setHeroes([]); setError(true); }
      })
      .finally(() => { if (current) setLoading(false); });

    if (!userId) {
      setOwned([]); setHolo([]); setFavourites([]); setShards(0);
      return () => { current = false; };
    }

    getJson(`${API}/api/favorite-heroes/${userId}`)
      .then(data => {
        if (current) setFavourites((data as { favoriteHeroes?: string[] }).favoriteHeroes || []);
      })
      .catch(err => {
        console.error('Error fetching favourite heroes:', err);
        if (current) setFavourites([]);
      });

    getJson(`${API}/api/user/${userId}`)
      .then(data => {
        if (!current) return;
        const { success, user } = data as {
          success?: boolean; user?: { available_heroes?: string[]; holo_heroes?: string[]; shards?: number };
        };
        setOwned(success && user ? user.available_heroes || [] : []);
        setHolo(success && user ? user.holo_heroes || [] : []);
        setShards(success && typeof user?.shards === 'number' ? user.shards : 0); // an old server sends none
      })
      .catch(err => {
        console.error('Error fetching owned heroes:', err);
        if (current) { setOwned([]); setHolo([]); setShards(0); }
      });

    return () => { current = false; };
  }, [userId, attempt]);

  const retry = useCallback(() => setAttempt(a => a + 1), []);

  // After a craft whose outcome is unsure: reads the account again (owned, holo, shards) and applies it only when
  // the read works. A failed read keeps everything on screen as it was; nothing reloads and nothing reads as loading.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const refreshAccount = useCallback(async () => {
    if (!userId) return;
    try {
      const { success, user } = await getJson(`${API}/api/user/${userId}`) as {
        success?: boolean; user?: { available_heroes?: string[]; holo_heroes?: string[]; shards?: number };
      };
      if (!success || !user || userIdRef.current !== userId) return;
      setOwned(user.available_heroes || []);
      setHolo(user.holo_heroes || []);
      if (typeof user.shards === 'number') setShards(user.shards);
    } catch (err) {
      console.error('Error crafting hero: the account could not be refreshed:', err);
    }
  }, [userId]);

  const toggleFavourite = useCallback(async (heroName: string) => {
    if (!userId) return;
    try {
      const response = await fetch(`${API}/api/toggle-favorite-hero`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId, heroName }),
      });
      if (!response.ok) return;
      const data = await response.json() as { favoriteHeroes?: string[] };
      const next = data.favoriteHeroes || [];
      setFavourites(next);
      onFavoritesChangeRef.current?.(next);
    } catch (err) {
      console.error('Error toggling favourite hero:', err);
    }
  }, [userId]);

  // The request names the hero and nothing else: a craft always makes the normal card, never a holographic.
  const craft = useCallback(async (heroName: string): Promise<CraftResult> => {
    let response: Response;
    // A reply may be any JSON at all, null included: only an object that says success is a craft
    let data: { success?: boolean; message?: unknown; shards?: number; available_heroes?: string[] } | null;
    // Unsure whether it went through (no answer), or the binder was out of date (already owned): refresh the
    // account from the server. The craft itself is never sent again.
    const failed = (message: string): CraftResult => {
      if (message === CRAFT_UNAVAILABLE || message === ALREADY_OWNED) void refreshAccount();
      return { ok: false, message };
    };
    // A timer of our own, not AbortSignal.timeout, so it is cleared the moment the request settles
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(), CRAFT_TIMEOUT_MS);
    try {
      response = await fetch(`${API}/api/shop/craft`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ heroName }),
        signal: limit.signal,
      });
      if (response.status === 404) return failed(CRAFT_UNAVAILABLE);
      data = await response.json();
      // Nothing is assumed from a reply that lands after the limit: the next account load shows the truth
      if (limit.signal.aborted) throw new Error(`no answer within ${CRAFT_TIMEOUT_MS} ms`);
    } catch (err) {
      console.error('Error crafting hero:', err);
      return failed(CRAFT_UNAVAILABLE);
    } finally {
      clearTimeout(timer);
    }
    // Only a refusal the binder knows is shown as sent; a server error's own text never is
    if (!response.ok || !data?.success) return failed(craftErrorText(data?.message, CRAFT_UNAVAILABLE));
    if (Array.isArray(data.available_heroes)) setOwned(data.available_heroes);
    if (typeof data.shards === 'number') setShards(data.shards);
    // The server said yes: a lobby refresh that throws does not undo the craft
    try {
      onPurchaseCompleteRef.current?.();
    } catch (err) {
      console.error('Error crafting hero: the lobby could not be told:', err);
    }
    return { ok: true };
  }, [refreshAccount]);

  return { heroes, collection: { owned, favourites, holo }, loading, error, retry, toggleFavourite, shards, craft };
}
