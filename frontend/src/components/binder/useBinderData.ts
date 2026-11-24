// Loads what the binder shows: every hero, plus the signed-in player's owned, holo and favourite heroes and their
// shards. Crafting a hero with shards goes through here too.
import { useCallback, useEffect, useRef, useState } from 'react';
import config from '../../config';
import { authHeaders } from '../../authSession';
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
    let data: { success?: boolean; message?: string; shards?: number; available_heroes?: string[] };
    try {
      response = await fetch(`${API}/api/shop/craft`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ heroName }),
      });
      if (response.status === 404) return { ok: false, message: CRAFT_UNAVAILABLE };
      data = await response.json();
    } catch (err) {
      console.error('Error crafting hero:', err);
      return { ok: false, message: CRAFT_UNAVAILABLE };
    }
    if (!response.ok || !data.success) return { ok: false, message: data.message || CRAFT_UNAVAILABLE };
    if (Array.isArray(data.available_heroes)) setOwned(data.available_heroes);
    if (typeof data.shards === 'number') setShards(data.shards);
    onPurchaseCompleteRef.current?.();
    return { ok: true };
  }, []);

  return { heroes, collection: { owned, favourites, holo }, loading, error, retry, toggleFavourite, shards, craft };
}
