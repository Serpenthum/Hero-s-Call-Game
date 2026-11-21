// True when a spectator's game state no longer contains the player they were watching
// (the player left the game), so the spectator should be taken back to the lobby.
export function watchedPlayerLeft(
  isSpectating: boolean,
  spectatingPlayerId: string | null | undefined,
  gameState: { players: Array<{ id: string }> } | null | undefined
): boolean {
  if (!isSpectating || !spectatingPlayerId || !gameState) return false;
  return !gameState.players.some(p => p.id === spectatingPlayerId);
}

// What a spectator does when the server says a player in the watched game left:
// 'leave' if it is the player they watch, 'notify' if it is the other player (keep watching), else 'ignore'.
export function spectatorReactionToLeaver(
  isSpectating: boolean,
  spectatingPlayerId: string | null | undefined,
  leftPlayerId: string | null | undefined
): 'leave' | 'notify' | 'ignore' {
  if (!isSpectating) return 'ignore';
  if (!spectatingPlayerId || !leftPlayerId || leftPlayerId === spectatingPlayerId) return 'leave';
  return 'notify';
}
