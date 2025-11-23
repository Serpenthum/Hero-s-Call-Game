import React, { useState, useEffect } from 'react';
import HeroCollection from './HeroCollection';
import HeroCard from './HeroCard';
import ProfileModal from './ProfileModal';
import XPBar from './XPBar';
import SpectatorView from './SpectatorView';
import Shop from './Shop';
import RequirementModal from './RequirementModal';
import { Hero, GameState } from '../types';
import config from '../config';
import '../styles/GameLobby.css';

interface User {
  id: number;
  username: string;
  victory_points: number;
  survival_wins: number;
  survival_losses: number;
  survival_used_heroes: string[];
  available_heroes: string[];
  favorite_heroes: string[];
  xp: number;
  level: number;
  best_gauntlet_trial: number;
  player_id?: string;
}

interface GameLobbyProps {
  onStartGame: (gameMode: 'draft' | 'random') => void;
  onStartFriendlyGame: (action: 'create' | 'join', roomName: string) => void;
  onStartSurvival: () => void;
  onStartGauntlet: () => void;
  onSpectateGame: (gameId: string, spectatingPlayerId: string) => void;
  victoryPoints: number;
  user: User;
  onLogout: () => void;
  isSearching?: boolean;
  searchMode?: 'draft' | 'random' | null;
  onCancelSearch?: () => void;
  gameState?: GameState | null;
  onCollectionStateChange?: (isOpen: boolean) => void;
  onFavoritesChange?: (favoriteHeroes: string[]) => void;
}

const GameLobby: React.FC<GameLobbyProps> = ({ onStartGame, onStartFriendlyGame, onStartSurvival, onStartGauntlet, onSpectateGame, victoryPoints, user, onLogout, isSearching = false, searchMode = null, onCancelSearch, onCollectionStateChange, onFavoritesChange }) => {
  const [showCollection, setShowCollection] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showFriendlyModal, setShowFriendlyModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [friendlyAction, setFriendlyAction] = useState<'create' | 'join' | 'spectate'>('create');
  const [roomName, setRoomName] = useState('');
  const [allHeroes, setAllHeroes] = useState<Hero[]>([]);
  const [showRequirementModal, setShowRequirementModal] = useState(false);
  const [requirementModalData, setRequirementModalData] = useState({
    message: '',
    currentCount: 0,
    requiredCount: 0,
    type: 'heroes' as 'heroes' | 'level'
  });
  const [currentRandomHero, setCurrentRandomHero] = useState<Hero | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [userRefreshTrigger, setUserRefreshTrigger] = useState(0);

  const handleModeSelect = (mode: 'draft' | 'random') => {
    // Check if player meets level requirement for Draft mode
    if (mode === 'draft' && user.level < 3) {
      setRequirementModalData({
        message: 'You must reach level 3 to unlock Draft Mode.',
        currentCount: user.level,
        requiredCount: 3,
        type: 'level'
      });
      setShowRequirementModal(true);
      return;
    }
    
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
    if (friendlyAction === 'spectate') {
      // Spectate mode doesn't need room name validation
      return; // SpectatorView component handles its own actions
    }
    
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
    onCollectionStateChange?.(true);
  };

  const handleCloseCollection = () => {
    setShowCollection(false);
    onCollectionStateChange?.(false);
  };

  const handleShowShop = () => {
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    setShowShop(true);
  };

  const handleCloseShop = () => {
    setShowShop(false);
  };

  const handlePurchaseComplete = async () => {
    // Fetch updated user data without reloading the page
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/user/${user.id}`);
      if (response.ok) {
        const data = await response.json();
        // API returns { success: true, user: {...} }
        const userData = data.user || data;
        // Update the user object by merging with existing data
        Object.assign(user, {
          victory_points: userData.victory_points,
          available_heroes: userData.available_heroes
        });
        setUserRefreshTrigger(prev => prev + 1);
        console.log(`✅ User data updated: ${userData.available_heroes.length} heroes`);
      }
    } catch (error) {
      console.error('Error fetching updated user data:', error);
    }
  };

  const handleSurvivalClick = () => {
    // Check if player has enough heroes for Survival mode
    const ownedHeroCount = user.available_heroes?.length || 0;
    console.log(`🔍 Survival check: ${ownedHeroCount} heroes owned, need 21`);
    if (ownedHeroCount < 21) {
      setRequirementModalData({
        message: 'You need at least 21 heroes to play Survival Mode.',
        currentCount: ownedHeroCount,
        requiredCount: 21,
        type: 'heroes'
      });
      setShowRequirementModal(true);
      return;
    }
    
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    onStartSurvival();
  };

  const handleGauntletClick = () => {
    // Cancel any existing search first
    if (isSearching && onCancelSearch) {
      onCancelSearch();
    }
    onStartGauntlet();
  };

  // Fetch heroes and set up rotation
  useEffect(() => {
    const fetchHeroes = async () => {
      try {
        console.log('Fetching heroes from API...');
        const response = await fetch(`${config.API_BASE_URL}/api/heroes`);
        
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
            <div className="stats-row">
              <div className="victory-points">
                <span className="trophy-icon">🏆</span>
                <span className="points-text">Victory Points: {victoryPoints}</span>
              </div>
              <div className="xp-section">
                <span className="level-text">Level {user.level || 1}</span>
                <XPBar 
                  currentXP={user.xp || 0} 
                  level={user.level || 1} 
                  animated={false}
                />
              </div>
              <button className="logout-button" onClick={onLogout}>
                <span className="logout-icon">🚪</span>
                <span className="logout-text">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="lobby-dashboard">
        <div className="dashboard-grid">
          
          {/* Player Info Panel */}
          <div className="player-info-panel">
            <div className="panel-header">
              <h2>{user.username}</h2>
              <div className="header-accent"></div>
            </div>
            <div className="panel-content">
              <button 
                className="profile-btn"
                onClick={() => setShowProfileModal(true)}
              >
                Profile
              </button>
              
              <button 
                className="profile-btn"
                onClick={() => setShowRulesModal(true)}
              >
                Rules
              </button>
              
              <div className="quests-section">
                <h3>Quests</h3>
                <div className="daily-quests">
                  <div className="quest-item">
                    <div className="quest-text">Win 1 battle in survival mode</div>
                    <div className="quest-progress">0/1</div>
                  </div>
                  <div className="quest-item">
                    <div className="quest-text">Win 1 battle with Ninja</div>
                    <div className="quest-progress">0/1</div>
                  </div>
                  <div className="quest-item">
                    <div className="quest-text">Win 1 battle going 2nd</div>
                    <div className="quest-progress">0/1</div>
                  </div>
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
            <div className="modes-container">
              
              {/* Ranked Section */}
              <div className="mode-category">
                <div className="category-header">
                  <h3>Ranked</h3>
                  <div className="category-divider"></div>
                </div>
                <div className="category-modes">
                  
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

                  {/* Gauntlet Mode - Hidden for now */}
                  {/* <div className="game-mode gauntlet-mode" onClick={handleGauntletClick}>
                    <div className="mode-overlay"></div>
                    <div className="mode-icon">⚔️</div>
                    <div className="mode-info">
                      <h3>Gauntlet Mode</h3>
                      <p>Face 13 trials</p>
                    </div>
                    <button className="mode-play-btn">
                      <span>Enter Gauntlet</span>
                      <div className="btn-glow"></div>
                    </button>
                  </div> */}

                </div>
              </div>

              {/* Casual Section */}
              <div className="mode-category">
                <div className="category-header">
                  <h3>Casual</h3>
                  <div className="category-divider"></div>
                </div>
                <div className="category-modes">
                  
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

                </div>
              </div>

            </div>
          </div>

          {/* Collection Panel */}
          <div className="collection-panel">
            <div className="panel-header">
              <h2>Hero Collection</h2>
              <div className="header-accent"></div>
            </div>
            <div className="collection-preview">
              <button className="collection-btn shop-btn" onClick={handleShowShop} style={{ marginBottom: '10px' }}>
                <span>Shop</span>
                <div className="btn-arrow">→</div>
              </button>
              <button className="collection-btn" onClick={handleShowCollection}>
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

      {/* Shop Modal */}
      {showShop && (
        <Shop
          onClose={handleCloseShop}
          userId={user.id}
          victoryPoints={user.victory_points}
          availableHeroes={user.available_heroes}
          onPurchaseComplete={handlePurchaseComplete}
        />
      )}

      {/* Collection Modal */}
      {showCollection && (
        <HeroCollection 
          onClose={handleCloseCollection} 
          userId={user.id} 
          victoryPoints={victoryPoints} 
          onFavoritesChange={onFavoritesChange}
        />
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
              {friendlyAction ? (
                <>
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
                    
                    <div 
                      className={`action-option ${friendlyAction === 'spectate' ? 'selected' : ''}`}
                      onClick={() => setFriendlyAction('spectate')}
                    >
                      <div className="action-icon">👁️</div>
                      <h4>Spectate</h4>
                      <p>Watch an ongoing game</p>
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
                </>
              ) : (
                <SpectatorView 
                  onSpectate={(gameId, spectatingPlayerId) => {
                    onSpectateGame(gameId, spectatingPlayerId);
                    handleCloseFriendlyModal();
                  }}
                  onClose={handleCloseFriendlyModal}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      <ProfileModal
        user={user}
        allHeroes={allHeroes}
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      {/* Rules Modal */}
      {showRulesModal && (
        <div className="modal-overlay">
          <div className="rules-modal">
            <div className="rules-modal-header">
              <h3>📖 Game Rules</h3>
              <button className="close-button" onClick={() => setShowRulesModal(false)}>×</button>
            </div>
            
            <div className="rules-modal-content">
              
              <div className="rules-category">
                <h4>🎯 Game Objective</h4>
                <div className="rule-text">Defeat all enemy heroes to win the battle</div>
                <div className="rule-text">Last team standing wins</div>
              </div>

              <div className="rules-category">
                <h4>⚔️ Combat Basics</h4>
                <div className="rule-item">
                  <span className="rule-label">Turn Structure:</span>
                  <span className="rule-value">Each turn you can use a Basic Attack OR an Ability, then End Turn</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">First Turn Restriction:</span>
                  <span className="rule-value">The player who starts CANNOT use their first hero's ability on turn 1</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Attack Rolls:</span>
                  <span className="rule-value">Roll 1D20 + Accuracy vs enemy Defense to hit</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Critical Hits:</span>
                  <span className="rule-value">Natural 20 = Critical (max damage), Natural 1 = Auto-miss</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Damage:</span>
                  <span className="rule-value">Roll dice for damage (e.g., 2D6 = roll two 6-sided dice)</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Defense:</span>
                  <span className="rule-value">Higher Defense = harder to hit</span>
                </div>
              </div>

              <div className="rules-category">
                <h4>🎲 Special Mechanics</h4>
                <div className="rule-item">
                  <span className="rule-label">Advantage:</span>
                  <span className="rule-value">Roll twice, take the higher result</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Disadvantage:</span>
                  <span className="rule-value">Roll twice, take the lower result</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Taunt:</span>
                  <span className="rule-value">Forces enemy to target a specific hero</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Poison:</span>
                  <span className="rule-value">Takes damage at start of each turn</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Silence:</span>
                  <span className="rule-value">Cannot use abilities</span>
                </div>
              </div>

              <div className="rules-category">
                <h4>🎮 Game Modes</h4>
                <div className="rule-item">
                  <span className="rule-label">Draft Mode:</span>
                  <span className="rule-value">Take turns picking heroes (ban 1, pick 3)</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Random Mode:</span>
                  <span className="rule-value">Both players get random teams instantly</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Survival Mode:</span>
                  <span className="rule-value">Fight other players using Survival Mode decks. Heroes that win in this battle cannot be used again</span>
                </div>
                <div className="rule-item">
                  <span className="rule-label">Friendly Battle:</span>
                  <span className="rule-value">Create/join custom rooms to play with friends</span>
                </div>
              </div>

              <div className="rules-category">
                <h4>🦸 Hero Abilities</h4>
                <div className="rule-text">Each hero has a unique <strong>Ability</strong> and <strong>Special</strong></div>
                <div className="rule-text">Abilities cost your action for the turn</div>
                <div className="rule-text">Specials are passive or triggered automatically</div>
                <div className="rule-text">Check the Hero Collection to learn each hero's abilities</div>
              </div>

              <div className="rules-category">
                <h4>💡 Tips</h4>
                <div className="rule-item">
                  <span className="rule-label">Team Composition:</span>
                  <span className="rule-value">Build your team carefully - synergy between heroes is crucial</span>
                </div>
                <div className="rule-text">Position matters - some abilities affect adjacent allies/enemies</div>
                <div className="rule-text">Team synergy is key - combine hero abilities strategically</div>
                <div className="rule-text">Pay attention to turn order - some heroes shine when going first/second</div>
                <div className="rule-text">Read enemy abilities carefully to plan your strategy</div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Requirement Modal */}
      <RequirementModal
        isOpen={showRequirementModal}
        onClose={() => setShowRequirementModal(false)}
        message={requirementModalData.message}
        currentCount={requirementModalData.currentCount}
        requiredCount={requirementModalData.requiredCount}
        type={requirementModalData.type}
      />

    </div>
  );
};

export default GameLobby;
