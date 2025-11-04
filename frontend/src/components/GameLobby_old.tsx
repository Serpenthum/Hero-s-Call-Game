import React from 'react';

interface GameLobbyProps {
  onJoinGame: (mode: 'draft' | 'random') => void;
  isConnected: boolean;
  error: string | null;
}

const GameLobby: React.FC<GameLobbyProps> = ({ onJoinGame, isConnected, error }) => {
  const handleDraftMode = () => {
    if (isConnected) {
      onJoinGame('draft');
    }
  };

  const handleRandomMode = () => {
    if (isConnected) {
      onJoinGame('random');
    }
  };

  return (
    <div className="game-lobby">
      <div className="lobby-content">
        <h1 className="game-title">Hero's Call</h1>
        
        {error && (
          <div className="error">
            {error}
          </div>
        )}
        
        <div className="mode-selection">
          <div className="mode-option">
            <h3>Draft Mode</h3>
            <p>Strategic hero selection with banning and picking phases</p>
            <ul>
              <li>Ban 1 card, then pick heroes alternately</li>
              <li>Set your attack order</li>
              <li>Battle using attacks and abilities</li>
            </ul>
            <button 
              onClick={handleDraftMode}
              disabled={!isConnected}
              className="mode-button draft-button"
            >
              {isConnected ? 'Play Draft Mode' : 'Connecting...'}
            </button>
          </div>

          <div className="mode-option">
            <h3>Random Mode</h3>
            <p>Jump straight into battle with randomly assigned heroes</p>
            <ul>
              <li>3 random heroes assigned to each player</li>
              <li>Skip straight to initiative roll</li>
              <li>Quick battles for fast-paced gameplay</li>
            </ul>
            <button 
              onClick={handleRandomMode}
              disabled={!isConnected}
              className="mode-button random-button"
            >
              {isConnected ? 'Play Random Mode' : 'Connecting...'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameLobby;