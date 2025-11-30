import React, { useState, useEffect } from 'react';
import { GameState, Player, Hero } from '../types';
import { socketService } from '../socketService';
import HeroCard from './HeroCard';

interface DraftPhaseProps {
  gameState: GameState;
  currentPlayer: Player;
  opponent: Player | null;
  allHeroes: Hero[];
}

const DraftPhase: React.FC<DraftPhaseProps> = ({ 
  gameState, 
  currentPlayer, 
  opponent, 
  allHeroes 
}) => {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [teamOrder, setTeamOrder] = useState<string[]>([]);
  const [draggedHero, setDraggedHero] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredHero, setHoveredHero] = useState<string | null>(null);

  // Reset selected card when draft phase or turn changes
  useEffect(() => {
    setSelectedCard(null);
  }, [gameState.currentDraftPhase, gameState.draftTurn]);

  // Initialize team order when entering setup phase
  useEffect(() => {
    if (gameState.phase === 'setup' && currentPlayer.team && currentPlayer.team.length > 0) {
      console.log('Setup phase - Current player team:', currentPlayer.team.map(h => h.name));
      console.log('Current teamOrder length:', teamOrder.length);
      // Always update teamOrder when in setup phase to ensure it reflects current team
      const newTeamOrder = currentPlayer.team.map(h => h.name);
      console.log('New team order would be:', newTeamOrder);
      console.log('Current team order is:', teamOrder);
      if (teamOrder.length !== newTeamOrder.length || JSON.stringify(newTeamOrder) !== JSON.stringify(teamOrder)) {
        console.log('Updating teamOrder to:', newTeamOrder);
        setTeamOrder(newTeamOrder);
      }
    }
  }, [gameState.phase, currentPlayer.team]);

  // Reset ready state when opponent's ready state changes
  useEffect(() => {
    if (opponent?.isReady !== undefined) {
      // This will help update UI when opponent becomes ready
    }
  }, [opponent?.isReady]);

  const getHeroByName = (name: string): Hero | undefined => {
    // In setup phase, prioritize looking in currentPlayer.team since those are the drafted heroes
    if (gameState.phase === 'setup' && currentPlayer.team) {
      const teamHero = currentPlayer.team.find(h => h.name === name);
      if (teamHero) return teamHero;
    }
    // Fallback to allHeroes for draft phase
    return allHeroes.find(h => h.name === name);
  };

  const getDraftCards = (): Hero[] => {
    // Use the current player's draftCards directly from the player object
    if (currentPlayer.draftCards && Array.isArray(currentPlayer.draftCards)) {
      console.log('Using current player draft cards:', currentPlayer.draftCards.map(h => h.name));
      return currentPlayer.draftCards;
    }
    
    // Fallback to the old method if draftCards is not available on player
    if (!gameState.draftCards) {
      console.log('No draftCards in gameState');
      return [];
    }
    
    const playerIndex = gameState.players.findIndex(p => p.id === currentPlayer.id);
    console.log('Player index:', playerIndex, 'Current player ID:', currentPlayer.id);
    
    if (playerIndex === -1) {
      console.error('Player not found in game state');
      return [];
    }
    
    const cardNames = playerIndex === 0 ? 
      gameState.draftCards.player1 : 
      gameState.draftCards.player2;
    
    console.log('Card names for player (fallback):', cardNames);
    
    if (!cardNames || !Array.isArray(cardNames)) {
      console.error('Invalid card names:', cardNames);
      return [];
    }
    
    const heroes = cardNames.map(name => getHeroByName(name)).filter(Boolean) as Hero[];
    console.log('Mapped heroes (fallback):', heroes.map(h => h.name));
    return heroes;
  };

  const handleBanCard = () => {
    if (selectedCard) {
      socketService.banCard(selectedCard);
      setSelectedCard(null);
    }
  };

  const handlePickCard = () => {
    if (selectedCard) {
      socketService.pickCard(selectedCard);
      setSelectedCard(null);
    }
  };

  // TODO: Implement drag-and-drop attack order functionality
  /*
  const handleAttackOrderChange = (heroName: string, newPosition: number) => {
    const newOrder = [...attackOrder];
    const currentIndex = newOrder.indexOf(heroName);
    
    if (currentIndex >= 0) {
      newOrder.splice(currentIndex, 1);
    }
    
    newOrder.splice(newPosition, 0, heroName);
    setAttackOrder(newOrder.slice(0, 3)); // Ensure max 3
  };
  */

  const handleSetAttackOrder = () => {
    if (teamOrder.length === 3) {
      socketService.setAttackOrder(teamOrder);
      setIsReady(true);
    }
  };

  const handleDragStart = (heroName: string, e: React.DragEvent) => {
    setDraggedHero(heroName);
    setHoveredHero(null); // Hide tooltip when dragging starts
    // Create a transparent drag image to hide the default ghost
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
    // Set initial drag position
    setDragPosition({ x: e.clientX, y: e.clientY });
  };

  const handleDrag = (e: React.DragEvent) => {
    if (e.clientX !== 0 && e.clientY !== 0) {
      setDragPosition({ x: e.clientX, y: e.clientY });
    }
  };

  const handleDragEnd = () => {
    setDragPosition(null);
    setDraggedHero(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedHero) {
      const currentIndex = teamOrder.indexOf(draggedHero);
      if (currentIndex !== targetIndex) {
        const newOrder = [...teamOrder];
        newOrder.splice(currentIndex, 1);
        newOrder.splice(targetIndex, 0, draggedHero);
        setTeamOrder(newOrder);
      }
      setDraggedHero(null);
      setDragPosition(null);
    }
  };

  const canPick = (): boolean => {
    // Can pick if haven't picked this round yet
    return (currentPlayer.team?.length || 0) < gameState.currentDraftPhase;
  };

  const renderBanPhase = () => {
    const draftCards = getDraftCards();
    
    return (
      <div className="draft-phase">
        {/* Show teams display for consistency */}
        <div className="teams-display">
          <div className="current-team">
            <h3>Your Team (0/3)</h3>
            <div className="team-cards">
              {/* Empty during ban phase */}
            </div>
          </div>
          
          {opponent && (
            <div className="opponent-team">
              <h3>Opponent's Team (0/3)</h3>
              <div className="team-cards">
                {/* Empty during ban phase */}
              </div>
            </div>
          )}
        </div>

        <div className="draft-cards ban-phase">
          {draftCards.map((hero, index) => (
            <HeroCard
              key={hero.name}
              hero={hero}
              isSelectable={!currentPlayer.bannedCard}
              isSelected={selectedCard === hero.name}
              onClick={() => setSelectedCard(hero.name)}
              tooltipPosition={index >= draftCards.length - 1 ? 'left' : 'right'}
            />
          ))}
        </div>

        <div className="draft-actions">
          <button
            onClick={handleBanCard}
            disabled={!selectedCard || !!currentPlayer.bannedCard}
            className="action-button"
          >
            Ban Selected Card
          </button>
        </div>

        {currentPlayer.bannedCard && (
          <p>You banned: <strong>{currentPlayer.bannedCard}</strong></p>
        )}
        
        {opponent?.bannedCard && (
          <p>Opponent banned: <strong>{opponent.bannedCard}</strong></p>
        )}
      </div>
    );
  };

  const renderPickPhase = () => {
    const draftCards = getDraftCards();
    
    return (
      <div className="draft-phase">
        {/* Main Draft Content */}
        <div className="draft-main-content">
          <div className="teams-display">
            <div className="current-team">
              <h3>Your Team ({currentPlayer.team?.length || 0}/3)</h3>
              <div className="team-cards">
                {(currentPlayer.team || []).map((hero) => (
                  <HeroCard
                    key={hero.name}
                    hero={hero}
                  />
                ))}
              </div>
            </div>
            
            {opponent && (
              <div className="opponent-team">
                <h3>Opponent's Team ({opponent.team?.length || 0}/3)</h3>
                <div className="team-cards">
                  {(opponent.team || []).map((hero, index) => (
                    <HeroCard
                      key={hero.name}
                      hero={hero}
                      isEnemy={true}
                      tooltipPosition={index === 2 ? 'left' : 'right'}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={`draft-cards${gameState.currentDraftPhase > 1 ? ' pick-phase' : ''}`}>
            {draftCards.map((hero, index) => (
              <HeroCard
                key={hero.name}
                hero={hero}
                isSelectable={canPick()}
                isSelected={selectedCard === hero.name}
                onClick={() => canPick() && setSelectedCard(hero.name)}
                tooltipPosition={index >= draftCards.length - 1 ? 'left' : 'right'}
              />
            ))}
          </div>

          <div className="draft-actions">
            <button
              onClick={handlePickCard}
              disabled={!selectedCard || !canPick()}
              className="action-button"
            >
              Pick Selected Card
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSetupPhase = () => {
    return (
      <div className="setup-phase">
        <h2>Team Setup</h2>
        <p>Drag and drop to arrange your heroes' attack order (left to right):</p>
        
        {opponent && opponent.isReady && (
          <div className="opponent-ready-indicator">
            <span>✓ Opponent is ready</span>
          </div>
        )}
        
        <div className="team-order-setup">
          <div className="draggable-team">
            {teamOrder.map((heroName, index) => {
              const hero = getHeroByName(heroName);
              if (!hero) {
                console.error('Hero not found for name:', heroName);
                console.log('All heroes names:', allHeroes.map(h => h.name));
              }
              const isDragging = draggedHero === heroName;
              return hero ? (
                <div
                  key={heroName}
                  className={`draggable-hero-slot ${isDragging ? 'dragging' : ''}`}
                  draggable={!isReady}
                  onDragStart={(e) => !isReady && handleDragStart(heroName, e)}
                  onDrag={handleDrag}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={() => !isReady && handleDrop(index)}
                  onMouseEnter={() => !isDragging && setHoveredHero(heroName)}
                  onMouseLeave={() => setHoveredHero(null)}
                  style={{
                    opacity: isDragging ? 0.3 : 1,
                    transition: 'opacity 0.15s ease, transform 0.3s ease'
                  }}
                >
                  <div className="position-badge">{index + 1}</div>
                  <HeroCard
                    hero={hero}
                    isSelectable={false}
                    hideAbilities={hoveredHero !== heroName}
                    tooltipPosition="right"
                  />
                </div>
              ) : null;
            })}
          </div>
        </div>

        {/* Floating card that follows cursor during drag */}
        {draggedHero && dragPosition && (
          <div
            style={{
              position: 'fixed',
              left: dragPosition.x - 100,
              top: dragPosition.y - 150,
              pointerEvents: 'none',
              zIndex: 9999,
              opacity: 0.9,
              transform: 'rotate(-5deg)',
              transition: 'none',
              willChange: 'transform'
            }}
          >
            <HeroCard
              hero={getHeroByName(draggedHero)!}
              isSelectable={false}
              hideAbilities={true}
            />
          </div>
        )}

        <div className="setup-actions">
          {!isReady ? (
            <button
              onClick={handleSetAttackOrder}
              disabled={teamOrder.length !== 3}
              className="action-button ready-button"
            >
              Ready
            </button>
          ) : (
            <div className="ready-status">
              <span className="ready-indicator">✓ You are ready - Waiting for opponent...</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (gameState.phase === 'setup') {
    return renderSetupPhase();
  } else if (gameState.currentDraftPhase === 0) {
    return renderBanPhase();
  } else {
    return renderPickPhase();
  }
};

export default DraftPhase;