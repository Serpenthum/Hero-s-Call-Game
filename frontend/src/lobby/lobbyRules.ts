// Pure rules behind the lobby: quest reset countdown, search clock, record line,
// featured hero, collection counts, arrival flag, match-found players, hero images.

/** Countdown to the next UTC midnight, rounded up to the minute: "New in 5h 12m", "New in 12m". */
export function timeUntilUtcMidnight(now: Date): string {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const minutes = Math.max(1, Math.ceil((midnight - now.getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `New in ${h}h ${m}m` : `New in ${m}m`;
}

/** The UTC calendar day ("2026-11-18"): quests turn over when it changes. */
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Time spent searching as m:ss; "0:00" before a search starts. */
export function searchElapsed(startedAt: number | null, now: number): string {
  if (startedAt === null) return '0:00';
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "24 wins · 11 losses"; null when there are no stats. */
export function formatRecord(
  stats: { total_wins?: number; total_losses?: number } | null,
): string | null {
  if (!stats) return null;
  const wins = stats.total_wins ?? 0;
  const losses = stats.total_losses ?? 0;
  return `${wins} ${wins === 1 ? 'win' : 'wins'} · ${losses} ${losses === 1 ? 'loss' : 'losses'}`;
}

/**
 * Next hero to feature. Enabled heroes only; every fourth turn (turn % 4 === 3) prefers a
 * favourite; avoids repeating `previous` when another choice exists.
 */
export function nextFeaturedHero<H extends { name: string; disabled?: boolean }>(
  heroes: H[],
  favorites: string[],
  turn: number,
  previous: string | null,
  random: () => number,
): H | null {
  const enabled = heroes.filter((h) => !h.disabled);
  if (enabled.length === 0) return null;
  const favs = turn % 4 === 3 ? enabled.filter((h) => favorites.includes(h.name)) : [];
  const pool = favs.length > 0 ? favs : enabled;
  const fresh = (list: H[]) => list.filter((h) => h.name !== previous);
  let candidates = fresh(pool);
  if (candidates.length === 0) candidates = fresh(enabled);
  if (candidates.length === 0) candidates = enabled;
  const i = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[i];
}

/** Collection counts over enabled heroes; holo is null until holo data exists. */
export function collectionSummary(
  heroes: { name: string; disabled?: boolean }[],
  owned: string[],
  favorites: string[],
  holo?: string[],
): { owned: number; total: number; favorites: number; holo: number | null } {
  const enabled = heroes.filter((h) => !h.disabled);
  const count = (names: string[]) => enabled.filter((h) => names.includes(h.name)).length;
  return {
    owned: count(owned),
    total: enabled.length,
    favorites: count(favorites),
    holo: holo === undefined ? null : count(holo),
  };
}

let lobbyArrival = false;

/** Note that the player has just arrived at the lobby. */
export function markLobbyArrival(): void {
  lobbyArrival = true;
}

/** True once after each markLobbyArrival, then false. */
export function consumeLobbyArrival(): boolean {
  const arrived = lobbyArrival;
  lobbyArrival = false;
  return arrived;
}

type MatchPlayer = { name: string; icon: string | null };

/** Me and my opponent for the match-found screen; null unless exactly one other player is found. */
export function matchFoundPlayers(
  players: { id: string; name: string; profile_icon?: string }[],
  myId: string | null,
): { me: MatchPlayer; them: MatchPlayer } | null {
  if (myId === null) return null;
  const me = players.find((p) => p.id === myId);
  const others = players.filter((p) => p.id !== myId);
  if (!me || others.length !== 1) return null;
  const toPlayer = (p: { name: string; profile_icon?: string }): MatchPlayer => ({
    name: p.name,
    icon: p.profile_icon ?? null,
  });
  return { me: toPlayer(me), them: toPlayer(others[0]) };
}

/** Hero portrait URL: lowercased name with non-alphanumerics removed. */
export function heroImageUrl(base: string, name: string): string {
  return `${base}/hero-images/${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.webp`;
}
