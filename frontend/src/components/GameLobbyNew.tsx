import React, { useState } from 'react';
import HeroCollection from './HeroCollection';
import '../styles/GameLobbyNew.css';

interface GameLobbyProps {
  onStartGame: (gameMode: 'DRAFT' | 'RANDOM') => void;
}

const GameLobby: React.FC<GameLobbyProps> = ({ onStartGame }) => {
  const [showCollection, setShowCollection] = useState(false);

  const handleModeSelect = (mode: 'DRAFT' | 'RANDOM') => {
    onStartGame(mode);
  };

  const handleShowCollection = () => {
    setShowCollection(true);
  };

  const handleCloseCollection = () => {
    setShowCollection(false);
  };

  return (
    <div className="game-lobby-modern">
      <div className="landing-background">
        <div className="bg-particles"></div>
        <div className="bg-gradient"></div>
      </div>
      
      <div className="landing-content">
        <div className="game-title">
          <h1 className="title-text">Hero's Call</h1>
          <p className="title-subtitle">Assemble your heroes and claim victory</p>
        </div>

        <div className="game-modes">
          <div className="mode-card draft-mode" onClick={() => handleModeSelect('DRAFT')}>
            <div className="mode-icon">⚔️</div>
            <h3 className="mode-title">Draft Mode</h3>
            <p className="mode-description">
              Strategic selection - choose your heroes carefully from alternating picks
            </p>
            <div className="mode-button">
              <span>Start Draft</span>
              <div className="button-glow"></div>
            </div>
          </div>

          <div className="mode-card random-mode" onClick={() => handleModeSelect('RANDOM')}>
            <div className="mode-icon">🎲</div>
            <h3 className="mode-title">Random Mode</h3>
            <p className="mode-description">
              Quick action - jump into battle with randomly assigned heroes
            </p>
            <div className="mode-button">
              <span>Start Random</span>
              <div className="button-glow"></div>
            </div>
          </div>
        </div>

        <div className="collection-section">
          <div className="collection-card" onClick={handleShowCollection}>
            <div className="collection-icon">📚</div>
            <h3 className="collection-title">View Collection</h3>
            <p className="collection-description">
              Browse all available heroes and their abilities
            </p>
            <div className="collection-button">
              <span>Explore Heroes</span>
              <div className="button-glow"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Collection Modal */}
      {showCollection && (
        <HeroCollection onClose={handleCloseCollection} />
      )}
    </div>
  );
};

export default GameLobby;