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
  const [attackOrder, setAttackOrder] = useState<string[]>([]);

  // Reset selected card when draft phase or turn changes
  useEffect(() => {
    setSelectedCard(null);
  }, [gameState.currentDraftPhase, gameState.draftTurn]);

  const getHeroByName = (name: string): Hero | undefined => {
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
    if (attackOrder.length === 3) {
      socketService.setAttackOrder(attackOrder);
    }
  };

  const canPick = (): boolean => {
    // Can pick if haven't picked this round yet
    return (currentPlayer.team?.length || 0) < gameState.currentDraftPhase;
  };



  const renderBanPhase = () => {
    const draftCards = getDraftCards();
    
    // Split cards into rows for better layout (3 in first row, 2 in second row)
    const firstRowCards = draftCards.slice(0, 3);
    const secondRowCards = draftCards.slice(3, 5);
    
    return (
      <div className="draft-phase">
        <div className="draft-cards ban-phase">
          <div className="ban-row-1">
            {firstRowCards.map((hero) => (
              <HeroCard
                key={hero.name}
                hero={hero}
                isSelectable={!currentPlayer.bannedCard}
                isSelected={selectedCard === hero.name}
                onClick={() => setSelectedCard(hero.name)}
              />
            ))}
          </div>
          {secondRowCards.length > 0 && (
            <div className="ban-row-2">
              {secondRowCards.map((hero) => (
                <HeroCard
                  key={hero.name}
                  hero={hero}
                  isSelectable={!currentPlayer.bannedCard}
                  isSelected={selectedCard === hero.name}
                  onClick={() => setSelectedCard(hero.name)}
                />
              ))}
            </div>
          )}
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
                {(opponent.team || []).map((hero) => (
                  <HeroCard
                    key={hero.name}
                    hero={hero}
                    isEnemy={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="draft-cards">
          {draftCards.map((hero) => (
            <HeroCard
              key={hero.name}
              hero={hero}
              isSelectable={canPick()}
              isSelected={selectedCard === hero.name}
              onClick={() => canPick() && setSelectedCard(hero.name)}
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
    );
  };

  const renderSetupPhase = () => {
    const availableHeroes = currentPlayer.team.filter(h => !attackOrder.includes(h.name));
    
    return (
      <div className="setup-phase">
        <h2>Set Attack Order</h2>
        <p>Arrange your heroes from left to right (leftmost attacks first):</p>
        
        <div className="attack-order-setup">
          <div className="available-heroes">
            <h3>Available Heroes</h3>
            {availableHeroes.map(hero => (
              <HeroCard
                key={hero.name}
                hero={hero}
                isSelectable={true}
                onClick={() => {
                  if (attackOrder.length < 3) {
                    setAttackOrder([...attackOrder, hero.name]);
                  }
                }}
                showFullInfo={false}
              />
            ))}
          </div>
          
          <div className="attack-order">
            <h3>Attack Order</h3>
            <div className="ordered-heroes">
              {attackOrder.map((heroName, index) => {
                const hero = getHeroByName(heroName);
                return hero ? (
                  <div key={heroName} className="ordered-hero">
                    <span className="position-number">{index + 1}</span>
                    <HeroCard
                      hero={hero}
                      onClick={() => {
                        setAttackOrder(attackOrder.filter(h => h !== heroName));
                      }}
                      showFullInfo={false}
                    />
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </div>

        <div className="setup-actions">
          <button
            onClick={handleSetAttackOrder}
            disabled={attackOrder.length !== 3}
            className="action-button"
          >
            Confirm Attack Order
          </button>
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