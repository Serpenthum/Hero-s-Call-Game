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
