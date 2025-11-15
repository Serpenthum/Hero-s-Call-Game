import React, { useState, useEffect } from 'react';
import { socketService } from '../socketService';
import '../styles/SpectatorView.css';

interface SpectatorGame {
  gameId: string;
  mode: string;
  phase: string;
  roomName: string | null;
  players: Array<{ id: string; name: string }>;
  spectatorCount: number;
  maxSpectators: number;
}

interface SpectatorViewProps {
  onSpectate: (gameId: string, spectatingPlayerId: string) => void;
  onClose: () => void;
}

const SpectatorView: React.FC<SpectatorViewProps> = ({ onSpectate, onClose }) => {
  const [games, setGames] = useState<SpectatorGame[]>([]);
  const [filteredGames, setFilteredGames] = useState<SpectatorGame[]>([]);
  const [roomNameSearch, setRoomNameSearch] = useState('');
  const [playerNameSearch, setPlayerNameSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Request spectatable games when component mounts
    socketService.getSpectatableGames();

    // Set up socket listener
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleSpectatableGames = (data: any) => {
      if (data.success) {
        setGames(data.games);
        setFilteredGames(data.games);
        setLoading(false);
      }
    };

    socket.on('spectatable-games-list', handleSpectatableGames);

    // Refresh list every 5 seconds
    const refreshInterval = setInterval(() => {
      socketService.getSpectatableGames();
    }, 5000);

    return () => {
      socket.off('spectatable-games-list', handleSpectatableGames);
      clearInterval(refreshInterval);
    };
  }, []);

  // Filter games when search changes
  useEffect(() => {
    let filtered = games;

    // Filter by room name
    if (roomNameSearch.trim()) {
      filtered = filtered.filter(game =>
        game.roomName?.toLowerCase().includes(roomNameSearch.toLowerCase())
      );
    }

    // Filter by player name
    if (playerNameSearch.trim()) {
      filtered = filtered.filter(game =>
        game.players.some(player =>
          player.name.toLowerCase().includes(playerNameSearch.toLowerCase())
        )
      );
    }

    setFilteredGames(filtered);
  }, [roomNameSearch, playerNameSearch, games]);

  const handleSpectateClick = (game: SpectatorGame, playerId: string) => {
    // Check if game has space for spectators
    if (game.spectatorCount >= game.maxSpectators) {
      alert('This game has reached its spectator limit (20 max)');
      return;
    }

    onSpectate(game.gameId, playerId);
  };

  const getModeDisplay = (mode: string) => {
    switch (mode) {
      case 'draft':
        return '⚔️ Draft';
      case 'random':
        return '🎲 Random';
      case 'survival':
        return '🔥 Survival';
      default:
        return mode;
    }
  };

  const getPhaseDisplay = (phase: string) => {
    switch (phase) {
      case 'battle':
        return '⚔️ In Battle';
      case 'ended':
        return '✅ Ended';
      default:
        return phase;
    }
  };

  if (loading) {
    return (
      <div className="spectator-view">
        <div className="spectator-view-header">
          <h3>Spectate a Game</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="spectator-view-loading">
          <p>Loading games...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="spectator-view">
      <div className="spectator-view-header">
        <h3>Spectate a Game</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>

      <div className="spectator-view-content">
        {/* Search filters */}
        <div className="spectator-filters">
          <div className="filter-group">
            <label htmlFor="room-search">Room Name:</label>
            <input
              id="room-search"
              type="text"
              value={roomNameSearch}
              onChange={(e) => setRoomNameSearch(e.target.value)}
              placeholder="Search by room name..."
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label htmlFor="player-search">Player Name:</label>
            <input
              id="player-search"
              type="text"
              value={playerNameSearch}
              onChange={(e) => setPlayerNameSearch(e.target.value)}
              placeholder="Search by player name..."
              className="filter-input"
            />
          </div>
        </div>

        {/* Games list */}
        <div className="spectator-games-list">
          {filteredGames.length === 0 ? (
            <div className="no-games-message">
              {games.length === 0 ? (
                <p>No active games available to spectate at the moment.</p>
              ) : (
                <p>No games match your search criteria.</p>
              )}
            </div>
          ) : (
            filteredGames.map((game) => (
              <div key={game.gameId} className="spectator-game-card">
                <div className="game-card-header">
                  <div className="game-info">
                    {game.roomName && (
                      <h4 className="room-name">🏠 {game.roomName}</h4>
                    )}
                    <div className="game-meta">
                      <span className="game-mode">{getModeDisplay(game.mode)}</span>
                      <span className="game-phase">{getPhaseDisplay(game.phase)}</span>
                      <span className="spectator-count">
                        👁️ {game.spectatorCount}/{game.maxSpectators}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="game-players">
                  {game.players.map((player) => (
                    <div key={player.id} className="player-option">
                      <span className="player-name">{player.name}</span>
                      <button
                        className="spectate-player-button"
                        onClick={() => handleSpectateClick(game, player.id)}
                        disabled={game.spectatorCount >= game.maxSpectators}
                      >
                        Spectate {player.name}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SpectatorView;
