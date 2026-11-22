// Loads what the binder shows: every hero, plus the signed-in player's owned, holo and favourite heroes.
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
}

const API = config.API_BASE_URL;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

export default function useBinderData(
  userId: number | undefined,
  onFavoritesChange?: (favs: string[]) => void,
): BinderData {
  const [heroes, setHeroes] = useState<BinderHero[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [holo, setHolo] = useState<string[]>([]);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const onFavoritesChangeRef = useRef(onFavoritesChange);
  onFavoritesChangeRef.current = onFavoritesChange;

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
      setOwned([]); setHolo([]); setFavourites([]);
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
        const { success, user } = data as { success?: boolean; user?: { available_heroes?: string[]; holo_heroes?: string[] } };
        setOwned(success && user ? user.available_heroes || [] : []);
        setHolo(success && user ? user.holo_heroes || [] : []);
      })
      .catch(err => {
        console.error('Error fetching owned heroes:', err);
        if (current) { setOwned([]); setHolo([]); }
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

  return { heroes, collection: { owned, favourites, holo }, loading, error, retry, toggleFavourite };
}
