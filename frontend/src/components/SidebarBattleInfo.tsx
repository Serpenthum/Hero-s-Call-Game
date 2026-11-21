import type { ReactNode } from 'react';
import type { GameState } from '../types';

interface SidebarBattleInfoProps {
  phase: GameState['phase'];
  isMyTurn: boolean;
  isSpectating: boolean;
  /** The player whose turn it is (shown to spectators) */
  activePlayerName?: string;
  /** Both players are known, or this is a spectator: the turn line and the log can show */
  hasPlayers: boolean;
  /** The active hero and the battle log */
  children?: ReactNode;
}

/**
 * The sidebar's battle panel. It shows during the starting roll as well as the battle, so the
 * board has its battle geometry (the `:has(.battle-combined-info)` rules) from the first frame
 * of `initiative` and does not reflow when the battle starts.
 */
export default function SidebarBattleInfo({
  phase, isMyTurn, isSpectating, activePlayerName, hasPlayers, children,
}: SidebarBattleInfoProps) {
  if (phase !== 'initiative' && phase !== 'battle') return null;

  const turnLine = phase === 'initiative'
    ? <div className="current-turn">Starting roll</div>
    : isSpectating
    ? (activePlayerName ? <div className="spectator-turn">Watching: {activePlayerName}'s turn</div> : null)
    : isMyTurn
    ? <div className="current-turn">Your turn</div>
    : <div className="opponent-turn">Opponent's turn</div>;

  return (
    <div className="battle-combined-info">
      <div id="battle-details-slot" />
      <h3>Battle</h3>
      {hasPlayers ? (
        <>
          <div className="turn-info">{turnLine}</div>
          {children}
        </>
      ) : null}
    </div>
  );
}
