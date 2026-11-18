// Disconnect and rejoin helpers. When a player drops out of a battle the server holds their seat for a
// grace period (30 s) and counts down; if they don't come back the player who stayed wins.

// Phases where the server holds a dropped player's seat
const LIVE_PHASES = new Set(['draft', 'setup', 'initiative', 'battle']);

export function isLiveGamePhase(phase: string | null | undefined): boolean {
  return !!phase && LIVE_PHASES.has(phase);
}

type TimerLike = { remainingMs?: number; remainingTime?: number } | null | undefined;

// Milliseconds left on a countdown from the server (newer servers send remainingMs, older ones seconds)
export function countdownMs(timer: TimerLike): number | null {
  if (!timer) return null;
  if (typeof timer.remainingMs === 'number') return Math.max(0, timer.remainingMs);
  if (typeof timer.remainingTime === 'number') return Math.max(0, timer.remainingTime * 1000);
  return null;
}

// Local deadlines (Date.now() based) for every player the state shows as disconnected with a countdown
export function deadlinesFromState(
  gameState: { players: Array<{ id: string; connected?: boolean; disconnectionTimer?: TimerLike }> } | null | undefined,
  now: number
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of gameState?.players ?? []) {
    const ms = p.connected === false ? countdownMs(p.disconnectionTimer) : null;
    if (ms !== null) out[p.id] = now + ms;
  }
  return out;
}

// Whole seconds left before a deadline, never below zero
export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

// The countdown line under a disconnected player's badge
export function forfeitLabel(seconds: number | null, viewerIsOpponent: boolean): string {
  if (seconds === null) return 'Waiting for them to return';
  return viewerIsOpponent ? `You win in ${seconds}s` : `Forfeits in ${seconds}s`;
}

// After logging in again: should the client drop the game it still shows? Only when it was a live game
// the server no longer holds a seat in (it ended, or the countdown ran out while we were away).
export function staleGameAfterLogin(
  gameState: { id: string; phase: string; mode?: string } | null | undefined,
  activeGameId: string | null | undefined,
  isSpectating: boolean
): boolean {
  if (!gameState || isSpectating) return false;
  if (gameState.mode === 'tutorial' || !isLiveGamePhase(gameState.phase)) return false;
  return gameState.id !== activeGameId;
}
