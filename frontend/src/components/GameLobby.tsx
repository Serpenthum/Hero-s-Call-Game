import React, { useState, useEffect } from 'react';
import HeroCollection from './HeroCollection';
import HeroCard from './HeroCard';
import { Hero, GameState } from '../types';
import '../styles/GameLobby.css';

interface User {
  id: number;
  username: string;
  victory_points: number;
  survival_wins: number;
  survival_losses: number;
  survival_used_heroes: string[];
  available_heroes: string[];
}

interface GameLobbyProps {
  onStartGame: (gameMode: 'draft' | 'random') => void;
  onStartFriendlyGame: (action: 'create' | 'join', roomName: string) => void;
  onStartSurvival: () => void;
  victoryPoints: number;
  user: User;
  onLogout: () => void;
  isSearching?: boolean;
  searchMode?: 'draft' | 'random' | null;
  onCancelSearch?: () => void;
  gameState?: GameState | null;
}

const GameLobby: React.FC<GameLobbyProps> = ({ onStartGame, onStartFriendlyGame, onStartSurvival, victoryPoints, user, onLogout, isSearching = false, searchMode = null, onCancelSearch }) => {
  const [showCollection, setShowCollection] = useState(false);
  const [showFriendlyModal, setShowFriendlyModal] = useState(false);
  const [friendlyAction, setFriendlyAction] = useState<'create' | 'join'>('create');
  const [roomName, setRoomName] = useState('');
  const [allHeroes, setAllHeroes] = useState<Hero[]>([]);
  const [currentRandomHero, setCurrentRandomHero] = useState<Hero | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleModeSelect = (mode: 'draft' | 'random') => {
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    onStartGame(mode);
  };

  const handleFriendlyBattleClick = () => {
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    setShowFriendlyModal(true);
  };

  const handleCloseFriendlyModal = () => {
    setShowFriendlyModal(false);
    setRoomName('');
    setFriendlyAction('create');
  };

  const handleFriendlySubmit = () => {
    if (roomName.trim()) {
      onStartFriendlyGame(friendlyAction, roomName.trim());
      handleCloseFriendlyModal();
    }
  };

  const handleShowCollection = () => {
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    setShowCollection(true);
  };

  const handleCloseCollection = () => {
    setShowCollection(false);
  };

  const handleSurvivalClick = () => {
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    onStartSurvival();
  };

  // Fetch heroes and set up rotation
  useEffect(() => {
    const fetchHeroes = async () => {
      try {
        console.log('Fetching heroes from API...');
        const response = await fetch('http://localhost:3001/api/heroes');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const heroes = await response.json();
        console.log('Heroes loaded successfully:', heroes.length, 'heroes');
        setAllHeroes(heroes);
        
        if (heroes.length > 0) {
          const randomHero = heroes[Math.floor(Math.random() * heroes.length)];
          console.log('Setting random hero:', randomHero.name);
          setCurrentRandomHero(randomHero);
        }
      } catch (error) {
        console.error('Failed to fetch heroes from API, using fallback data:', error);
        
        // Fallback heroes data if API fails
        const fallbackHeroes = [
          {
            name: "Barbarian",
            HP: 25,
            Defense: 8,
            Accuracy: "+1",
            BasicAttack: "2d6+2",
            Ability: [{ 
              name: "Rage", 
              description: "Increase damage", 
              effects: [{ type: "damage_boost", value: 5 }]
            }],
            Special: [{ 
              name: "Berserker", 
              description: "Continue fighting when low HP", 
              effects: [{ type: "survival", trigger: "low_hp" }]
            }]
          },
          {
            name: "Wizard",
            HP: 15,
            Defense: 6,
            Accuracy: "+0",
            BasicAttack: "1d6",
            Ability: [{ 
              name: "Fireball", 
              description: "Area damage spell", 
              effects: [{ type: "area_damage", value: "2d6" }]
            }],
            Special: [{ 
              name: "Arcane Power", 
              description: "Bonus spell damage", 
              effects: [{ type: "spell_boost", value: 3 }]
            }]
          },
          {
            name: "Rogue",
            HP: 18,
            Defense: 7,
            Accuracy: "+2",
            BasicAttack: "1d6+3",
            Ability: [{ 
              name: "Sneak Attack", 
              description: "High damage from stealth", 
              effects: [{ type: "sneak_damage", value: "3d6" }]
            }],
            Special: [{ 
              name: "Evasion", 
              description: "Avoid some attacks", 
              effects: [{ type: "dodge_chance", value: 25 }]
            }]
          }
        ];
        
        console.log('Using fallback heroes:', fallbackHeroes.length);
        setAllHeroes(fallbackHeroes);
        
        if (fallbackHeroes.length > 0) {
          const randomHero = fallbackHeroes[Math.floor(Math.random() * fallbackHeroes.length)];
          console.log('Setting fallback random hero:', randomHero.name);
          setCurrentRandomHero(randomHero);
        }
      }
    };

    fetchHeroes();
  }, []);

  // Set up hero rotation timer with smooth transition
  useEffect(() => {
    if (allHeroes.length === 0) return;

    const interval = setInterval(() => {
      // Start transition
      setIsTransitioning(true);
      
      // After fade out completes, change hero and fade back in
      setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * allHeroes.length);
        setCurrentRandomHero(allHeroes[randomIndex]);
        setIsTransitioning(false);
      }, 300); // Half of transition duration
    }, 4000); // Change every 4 seconds

    return () => clearInterval(interval);
  }, [allHeroes]);

  return (
    <div className="game-lobby-modern">
      {/* Animated Background */}
      <div className="cosmic-background">
        <div className="stars-layer"></div>
        <div className="nebula-layer"></div>
        <div className="energy-waves"></div>
      </div>
      
      {/* Header */}
      <header className="lobby-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-text">
              <h1>Hero's Call</h1>
              <span>Assemble your heroes and claim victory</span>
            </div>
          </div>
          <div className="user-stats">
            <div className="user-info">
              <span className="username">Welcome, {user.username}!</span>
              <button className="logout-button" onClick={onLogout}>Logout</button>
            </div>
            <div className="victory-points">
              <span className="trophy-icon">🏆</span>
              <span className="points-text">Victory Points: {victoryPoints}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="lobby-dashboard">
        <div className="dashboard-grid">
          
          {/* How to Play Panel */}
          <div className="info-panel">
            <div className="panel-header">
              <h2>Battle Guide</h2>
              <div className="header-accent"></div>
            </div>
            <div className="panel-content">
              <div className="guide-steps">
                <div className="step-item">
                  <div className="step-bullet"></div>
                  <div className="step-text">Choose 3 heroes for your team</div>
                </div>
                <div className="step-item">
                  <div className="step-bullet"></div>
                  <div className="step-text">Each hero has unique abilities and stats</div>
                </div>
                <div className="step-item">
                  <div className="step-bullet"></div>
                  <div className="step-text">Use attacks and abilities strategically</div>
                </div>
                <div className="step-item">
                  <div className="step-bullet"></div>
                  <div className="step-text">Defeat all enemy heroes to win</div>
                </div>
              </div>
            </div>
          </div>

          {/* Game Modes */}
          <div className="modes-panel">
            <div className="panel-header">
              <h2>Game Modes</h2>
              <div className="header-accent"></div>
            </div>
            <div className="modes-grid">
              
              <div className={`game-mode draft-mode ${isSearching && searchMode === 'draft' ? 'searching' : ''}`} onClick={isSearching && searchMode === 'draft' ? undefined : () => handleModeSelect('draft')}>
                <div className="mode-overlay"></div>
                <div className="mode-icon">⚔️</div>
                {isSearching && searchMode === 'draft' ? (
                  <div className="mode-info searching-info">
                    <h3>Finding Opponent...</h3>
                    <div className="searching-dots">
                      <span className="dot"></span>
                      <span className="dot"></span>
                      <span className="dot"></span>
                    </div>
                  </div>
                ) : (
                  <div className="mode-info">
                    <h3>Draft Mode</h3>
                    <p>Strategic hero selection</p>
                  </div>
                )}
                {isSearching && searchMode === 'draft' ? (
                  <button className="mode-cancel-btn" onClick={(e) => { e.stopPropagation(); onCancelSearch?.(); }}>
                    <span>Leave Queue</span>
                    <div className="btn-glow"></div>
                  </button>
                ) : (
                  <button className="mode-play-btn">
                    <span>Play Draft</span>
                    <div className="btn-glow"></div>
                  </button>
                )}
              </div>

              <div className={`game-mode random-mode ${isSearching && searchMode === 'random' ? 'searching' : ''}`} onClick={isSearching && searchMode === 'random' ? undefined : () => handleModeSelect('random')}>
                <div className="mode-overlay"></div>
                <div className="mode-icon">🎲</div>
                {isSearching && searchMode === 'random' ? (
                  <div className="mode-info searching-info">
                    <h3>Finding Opponent...</h3>
                    <div className="searching-dots">
                      <span className="dot"></span>
                      <span className="dot"></span>
                      <span className="dot"></span>
                    </div>
                  </div>
                ) : (
                  <div className="mode-info">
                    <h3>Random Mode</h3>
                    <p>Quick battle start</p>
                  </div>
                )}
                {isSearching && searchMode === 'random' ? (
                  <button className="mode-cancel-btn" onClick={(e) => { e.stopPropagation(); onCancelSearch?.(); }}>
                    <span>Leave Queue</span>
                    <div className="btn-glow"></div>
                  </button>
                ) : (
                  <button className="mode-play-btn">
                    <span>Play Random</span>
                    <div className="btn-glow"></div>
                  </button>
                )}
              </div>

              <div className="game-mode friendly-mode" onClick={handleFriendlyBattleClick}>
                <div className="mode-overlay"></div>
                <div className="mode-icon">🤝</div>
                <div className="mode-info">
                  <h3>Friendly Battle</h3>
                  <p>Play with friends</p>
                </div>
                <button className="mode-play-btn">
                  <span>Create/Join</span>
                  <div className="btn-glow"></div>
                </button>
              </div>

              <div className="game-mode survival-mode" onClick={handleSurvivalClick}>
                <div className="mode-overlay"></div>
                <div className="mode-icon">🔥</div>
                <div className="mode-info">
                  <h3>Survival Mode</h3>
                  <p>Test your endurance</p>
                </div>
                <button className="mode-play-btn">
                  <span>Enter Survival</span>
                  <div className="btn-glow"></div>
                </button>
              </div>

            </div>
          </div>

          {/* Collection Panel */}
          <div className="collection-panel" onClick={handleShowCollection}>
            <div className="panel-header">
              <h2>Hero Collection</h2>
              <div className="header-accent"></div>
            </div>
            <div className="collection-preview">
              <div className="collection-text">
                <h3>Explore Heroes</h3>
                <p>Browse all available heroes, abilities, and lore</p>
              </div>
              <button className="collection-btn">
                <span>View Collection</span>
                <div className="btn-arrow">→</div>
              </button>
              {currentRandomHero && (
                <div className={`random-hero-card ${isTransitioning ? 'transitioning' : ''}`}>
                  <HeroCard 
                    hero={{
                      name: currentRandomHero.name,
                      HP: currentRandomHero.HP,
                      Defense: currentRandomHero.Defense,
                      Accuracy: currentRandomHero.Accuracy,
                      BasicAttack: currentRandomHero.BasicAttack,
                      Ability: currentRandomHero.Ability,
                      Special: currentRandomHero.Special
                      // Only include base hero properties, no runtime modifications
                    }} 
                    showFullInfo={false}
                    disableHPAnimations={true}
                  />
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Collection Modal */}
      {showCollection && (
        <HeroCollection onClose={handleCloseCollection} userId={user.id} victoryPoints={victoryPoints} />
      )}

      {/* Friendly Battle Modal */}
      {showFriendlyModal && (
        <div className="modal-overlay">
          <div className="friendly-modal">
            <div className="friendly-modal-header">
              <h3>Friendly Battle</h3>
              <button className="close-button" onClick={handleCloseFriendlyModal}>×</button>
            </div>
            
            <div className="friendly-modal-content">
              <div className="action-selection">
                <div 
                  className={`action-option ${friendlyAction === 'create' ? 'selected' : ''}`}
                  onClick={() => setFriendlyAction('create')}
                >
                  <div className="action-icon">🏗️</div>
                  <h4>Create Game</h4>
                  <p>Create a new room and wait for a friend to join</p>
                </div>
                
                <div 
                  className={`action-option ${friendlyAction === 'join' ? 'selected' : ''}`}
                  onClick={() => setFriendlyAction('join')}
                >
                  <div className="action-icon">🚪</div>
                  <h4>Join Game</h4>
                  <p>Enter a room name to join your friend's game</p>
                </div>
              </div>
              
              <div className="room-input-section">
                <label htmlFor="room-name">
                  {friendlyAction === 'create' ? 'Room Name:' : 'Enter Room Name:'}
                </label>
                <input
                  id="room-name"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder={friendlyAction === 'create' ? 'Choose a room name...' : 'Enter room name to join...'}
                  className="room-input"
                  maxLength={20}
                />
              </div>
              
              <div className="friendly-modal-actions">
                <button 
                  className="friendly-submit-button"
                  onClick={handleFriendlySubmit}
                  disabled={!roomName.trim()}
                >
                  {friendlyAction === 'create' ? 'Create Room' : 'Join Room'}
                </button>
                <button 
                  className="friendly-cancel-button"
                  onClick={handleCloseFriendlyModal}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default GameLobby;