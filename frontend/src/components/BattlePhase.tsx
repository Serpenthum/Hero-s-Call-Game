import React, { useState } from 'react';
import { GameState, Player, Hero } from '../types';
import { socketService } from '../socketService';
import HeroCard from './HeroCard';

interface BattlePhaseProps {
  gameState: GameState;
  currentPlayer: Player;
  opponent: Player | null;
  playerId: string;
  onReturnToLobby?: (forceMainLobby?: boolean) => void;
  isSurvivalMode?: boolean;
  timekeeperAbilitySelection?: {
    ally: string;
    target: string;
    availableAbilities: Array<{
      index: number;
      name: string;
      description: string;
      category?: string;
    }>;
  };
  onClearTimekeeperSelection?: () => void;
}

const BattlePhase: React.FC<BattlePhaseProps> = ({ 
  gameState, 
  currentPlayer, 
  opponent, 
  playerId,
  onReturnToLobby,
  isSurvivalMode = false,
  timekeeperAbilitySelection,
  onClearTimekeeperSelection
}) => {

  const [initiativeChoice, setInitiativeChoice] = useState<boolean | null>(null);
  const [selectingAllyForAbility, setSelectingAllyForAbility] = useState<{ abilityIndex: number; targetId: string } | null>(null);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState<boolean>(false);

  // Helper function to check if current ability selection is Timekeeper's Chrono Shift
  const isTimekeeperChronoShift = () => {
    if (!selectingAllyForAbility) return false;
    const currentHero = getCurrentHero();
    const ability = currentHero?.Ability?.[selectingAllyForAbility.abilityIndex];
    return currentHero?.name === 'Timekeeper' && ability?.name === 'Chrono Shift';
  };

  // Helper function to handle ally selection for abilities
  const handleAllyClick = (targetId: string) => {
    if (selectingAllyForAbility) {
      socketService.useAbility(selectingAllyForAbility.abilityIndex, selectingAllyForAbility.targetId, targetId);
      setSelectingAllyForAbility(null);
    }
  };

  // Helper function to format damage display with stacks
  const formatDamageWithStacks = (hero: Hero, baseDamage: string) => {
    let displayString = baseDamage;
    
    // Add Berserker damage stacks (from status effects)
    if (hero.statusEffects?.damageStacks && hero.statusEffects.damageStacks > 0) {
      displayString += ` + ${hero.statusEffects.damageStacks}`;
    }
    
    // Add passive damage buffs (like Warlock Dark Pact)
    if (hero.passiveBuffs) {
      const damageBuffs = hero.passiveBuffs.filter(buff => buff.stat === 'damage');
      const totalPassiveDamage = damageBuffs.reduce((sum, buff) => sum + buff.value, 0);
      if (totalPassiveDamage > 0) {
        displayString += ` + ${totalPassiveDamage}`;
      }
    }
    
    return displayString;
  };

  // Helper function to check if a hero can use multiple abilities
  const canUseMultipleAbilities = (hero: Hero) => {
    // Check if hero has special ability that allows multiple ability usage
    if (!hero.Special) return false;
    
    const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
    return specials.some(special => 
      special.effects?.some((effect: any) => 
        effect.type === 'modify_ability_usage' && effect.effect === 'use_twice_per_turn'
      )
    );
  };

  // Helper function to check if a hero can use multiple attacks (like Berserker Frenzy)
  const canUseMultipleAttacks = (hero: Hero) => {
    if (!hero.Special) return false;
    
    const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
    
    // Check for Berserker Frenzy (conditional on HP < 10)
    const hasFrenzy = specials.some(special => 
      special.name === 'Frenzy' && 
      special.effects?.some((effect: any) => effect.type === 'extra_attack_per_turn')
    );
    if (hasFrenzy && hero.currentHP && hero.currentHP < 10) {
      return true;
    }
    
    // Check for Brawler attack_twice (always active)
    const hasAttackTwice = specials.some(special => 
      special.effects?.some((effect: any) => effect.effect === 'attack_twice')
    );
    if (hasAttackTwice) {
      return true;
    }
    
    return false;
  };

  const isMyTurn = (): boolean => {
    const playerIndex = gameState.players.findIndex(p => p.id === playerId);
    const isMyTurnResult = gameState.currentTurn === playerIndex;
    
    // Add debugging for silenced heroes
    const activeHero = getCurrentActiveHero();
    if (activeHero) {
      const isSilenced = activeHero.hero.statusEffects?.silenced === true || 
                        (typeof activeHero.hero.statusEffects?.silenced === 'object' && 
                         activeHero.hero.statusEffects.silenced?.active);
      
      if (isSilenced) {
        console.log(`🤐 Active hero ${activeHero.hero.name} is silenced (Player ${activeHero.playerIndex})`);
      }
    }
    
    console.log('🔍 Turn check:', {
      playerId,
      playerIndex,
      currentTurn: gameState.currentTurn,
      currentHeroTurn: gameState.currentHeroTurn,
      isMyTurn: isMyTurnResult,
      activeHero: activeHero ? `${activeHero.hero.name} (P${activeHero.playerIndex})` : 'none'
    });
    return isMyTurnResult;
  };

  const getCurrentActiveHero = () => {
    // Use the backend's activeHero information directly
    if (!gameState.activeHero) return null;
    
    const activePlayerIndex = gameState.activeHero.playerIndex;
    const activePlayer = gameState.players[activePlayerIndex];
    if (!activePlayer || !activePlayer.team) return null;
    
    // Find the hero by name (more reliable than index after deaths)
    const hero = activePlayer.team.find(h => h.name === gameState.activeHero!.name);
    if (!hero) return null;
    
    return {
      hero,
      playerIndex: activePlayerIndex,
      heroIndex: gameState.activeHero.heroIndex
    };
  };

  const getCurrentHero = (): Hero | null => {
    if (!isMyTurn()) return null;
    const activeHero = getCurrentActiveHero();
    return activeHero ? activeHero.hero : null;
  };



  const getTargetableEnemies = (): Hero[] => {
    // Only allow targeting if it's my turn AND I haven't selected a target yet
    if (!isMyTurn()) {
      console.log('🚫 Not my turn, no targetable enemies');
      return [];
    }
    
    if (!opponent) {
      console.log('🚫 No opponent, no targetable enemies');
      return [];
    }
    
    // Check if I already have a selected target
    const myPlayerData = gameState.players.find(p => p.id === playerId);
    if (myPlayerData?.selectedTarget) {
      console.log('🚫 Already have selected target:', myPlayerData.selectedTarget);
      return [];
    }

    // Check if current hero is taunted
    const currentHero = getCurrentHero();
    if (currentHero?.statusEffects?.taunt?.target) {
      const tauntTargetName = currentHero.statusEffects.taunt.target;
      const tauntTarget = opponent.team.find(h => h.name === tauntTargetName);
      if (tauntTarget) {
        const hp = tauntTarget.currentHP !== undefined ? tauntTarget.currentHP : (typeof tauntTarget.HP === 'string' ? parseInt(tauntTarget.HP) : tauntTarget.HP);
        // Return only the taunt target if alive, otherwise empty array
        console.log('🎯 Taunted, can only target:', tauntTargetName);
        return hp > 0 ? [tauntTarget] : [];
      }
    }
    
    const targetable = opponent.team.filter(hero => {
      const hp = hero.currentHP !== undefined ? hero.currentHP : (typeof hero.HP === 'string' ? parseInt(hero.HP) : hero.HP);
      const isAlive = hp > 0;
      const isTargetable = !hero.statusEffects?.untargetable;
      
      return isAlive && isTargetable;
    });
    
    console.log('🎯 Targetable enemies:', targetable.map(h => h.name));
    return targetable;
  };

  const handleTargetSelection = (targetId: string) => {
    socketService.selectTarget(targetId);
  };

  const handleRollInitiative = () => {
    socketService.rollInitiative();
  };

  const handleChooseTurnOrder = (goFirst: boolean) => {
    socketService.chooseTurnOrder(goFirst);
    setInitiativeChoice(goFirst);
  };

  const handleSurrenderClick = () => {
    setShowSurrenderConfirm(true);
  };

  const handleConfirmSurrender = () => {
    socketService.surrenderGame();
    setShowSurrenderConfirm(false);
  };

  const handleCancelSurrender = () => {
    setShowSurrenderConfirm(false);
  };

  const renderInitiativeOverlay = () => {
    return (
      <div className="initiative-overlay">
        <div className="initiative-phase">
          <h2>Starting Roll!</h2>
          <p>Roll a 20-sided die to determine turn order!</p>
          
          <div className="initiative-actions">
            <button
              onClick={handleRollInitiative}
              className="action-button"
              disabled={currentPlayer.initiativeRoll !== undefined}
            >
              {currentPlayer.initiativeRoll !== undefined ? 
                `You rolled: ${currentPlayer.initiativeRoll}` : 
                'Roll Initiative'
              }
            </button>
          </div>

          {opponent?.initiativeRoll !== undefined && (
            <p>Opponent rolled: {opponent.initiativeRoll}</p>
          )}

          {/* Show choice if player won initiative */}
          {initiativeChoice === null && 
           currentPlayer.initiativeRoll !== undefined && 
           opponent?.initiativeRoll !== undefined &&
           currentPlayer.initiativeRoll > opponent.initiativeRoll && (
            <div className="turn-order-choice">
              <h3>🎉 You won the starting roll!</h3>
              <p>Choose whether you want to go first or second:</p>
              <div className="choice-buttons">
                <button 
                  onClick={() => handleChooseTurnOrder(true)}
                  className="action-button"
                >
                  Go First
                </button>
                <button 
                  onClick={() => handleChooseTurnOrder(false)}
                  className="action-button"
                >
                  Go Second
                </button>
              </div>
            </div>
          )}

          {/* Show waiting message if opponent won */}
          {initiativeChoice === null && 
           currentPlayer.initiativeRoll !== undefined && 
           opponent?.initiativeRoll !== undefined &&
           currentPlayer.initiativeRoll < opponent.initiativeRoll && (
            <div className="waiting-choice">
              <h3>Your opponent won the starting roll</h3>
              <p>Waiting for them to choose turn order...</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderBattlePhase = () => {
    const targetableEnemies = getTargetableEnemies();

    return (
      <div className="battle-layout">
        <div className="game-board">
          <div className="opponent-area">
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <h3>Opponent's{'\n'}Team</h3>
            </div>

            <div className="team-display">
              {opponent?.team.map((hero, heroIndex) => (
                <HeroCard
                  key={`${hero.name}-${heroIndex}`}
                  hero={hero}
                  isCurrentTurn={(() => {
                    if (!gameState.activeHero) return false;
                    // Find opponent's player index
                    const opponentPlayerIndex = gameState.players.findIndex(p => p.id !== playerId);
                    // Match by name AND ensure it's the opponent's hero that's active
                    return gameState.activeHero.name === hero.name && 
                           gameState.activeHero.playerIndex === opponentPlayerIndex && // Active hero is opponent's
                           gameState.activeHero.heroIndex === heroIndex; // Match exact hero position
                  })()}
                  isEnemy={true}
                  isSelectable={isMyTurn() && targetableEnemies.includes(hero)}
                  onClick={() => {
                    if (isMyTurn() && targetableEnemies.includes(hero)) {
                      handleTargetSelection(hero.name);
                    }
                  }}
                />
              ))}
            </div>
          </div>

          <div className="player-area">
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <h3>Your{'\n'}Team</h3>
            </div>
            <div className="team-display">
              {currentPlayer.team.map((hero, heroIndex) => (
                <HeroCard
                  key={`${hero.name}-${heroIndex}`}
                  hero={hero}
                  isCurrentTurn={(() => {
                    if (!gameState.activeHero) return false;
                    // Find current player's index
                    const currentPlayerIndex = gameState.players.findIndex(p => p.id === playerId);
                    // Match by name AND ensure it's our hero that's active
                    return gameState.activeHero.name === hero.name && 
                           gameState.activeHero.playerIndex === currentPlayerIndex && // Active hero is ours
                           gameState.activeHero.heroIndex === heroIndex; // Match exact hero position
                  })()}
                  isSelectable={!!selectingAllyForAbility && (hero.currentHP ?? 0) > 0 && (
                    !isTimekeeperChronoShift() || (hero.name !== 'Timekeeper' && hero.Ability && hero.Ability.length > 0)
                  )}
                  onClick={() => {
                    if (selectingAllyForAbility && (hero.currentHP ?? 0) > 0) {
                      // Check if this is Timekeeper's Chrono Shift
                      if (isTimekeeperChronoShift()) {
                        // Prevent Timekeeper from targeting itself
                        if (hero.name === 'Timekeeper') {
                          alert(`Timekeeper cannot target itself with Chrono Shift!`);
                          return;
                        }
                        // Prevent targeting heroes with no abilities
                        if (!hero.Ability || hero.Ability.length === 0) {
                          alert(`${hero.name} has no abilities to copy with Chrono Shift!`);
                          return;
                        }
                      }
                      handleAllyClick(hero.name);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Action Bar - always show for visual consistency */}
        <div className="action-bar">
          <h3>Actions</h3>
          {(() => {
            if (!isMyTurn()) {
              const activeHero = getCurrentActiveHero();
              if (activeHero) {
                return (
                  <div className="action-prompt">
                    <div>Waiting for {activeHero.hero.name}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      Opponent's Turn
                    </div>
                  </div>
                );
              } else {
                return <div className="action-prompt">Waiting for opponent...</div>;
              }
            }
            
            // It's my turn - show normal action logic
            const myPlayerData = gameState.players.find(p => p.id === playerId);
            const activeHero = getCurrentActiveHero();
            
            // Helper function to check if the selected target is still alive
            const isSelectedTargetAlive = () => {
              if (!myPlayerData?.selectedTarget || !opponent) return false;
              const targetHero = opponent.team.find(hero => hero.name === myPlayerData.selectedTarget);
              return targetHero && (targetHero.currentHP || targetHero.HP) > 0;
            };
            
            if (!activeHero || !myPlayerData) {
              return <div>No active hero</div>;
            }

            // Check if active hero is dead
            const activeHeroHP = activeHero.hero.currentHP !== undefined ? activeHero.hero.currentHP : (typeof activeHero.hero.HP === 'string' ? parseInt(activeHero.hero.HP) : activeHero.hero.HP);
            if (activeHeroHP <= 0) {
              // Show message but let backend handle auto-advancement
              return (
                <div className="action-prompt">
                  <div>Your hero {activeHero.hero.name} has fallen! Turn will advance automatically...</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    (Backend is handling turn advancement)
                  </div>
                </div>
              );
            }

            if (!myPlayerData.selectedTarget) {
              return (
                <div className="action-prompt">
                  Select an enemy to target first!
                </div>
              );
            }



            // Check if selecting ally for ability
            if (selectingAllyForAbility) {
              const currentHero = getCurrentHero();
              const abilityName = currentHero?.Ability?.[selectingAllyForAbility.abilityIndex]?.name || 'Unknown Ability';
              
              return (
                <div className="action-prompt">
                  <div>Select an ally who's ability you want to trigger with {abilityName}!</div>
                  <button 
                    className="action-button"
                    onClick={() => setSelectingAllyForAbility(null)}
                    style={{ marginTop: '10px' }}
                  >
                    Cancel
                  </button>
                </div>
              );
            }

            return (
              <div className="action-buttons">
                <div className="hero-info">
                  <strong>{activeHero.hero.name}</strong>
                  <div style={{ fontSize: '12px', color: '#ccc' }}>
                    HP: {activeHero.hero.currentHP || activeHero.hero.HP} | 
                    AC: {(activeHero.hero as any).modifiedAC || activeHero.hero.AC} | 
                    Attack: {formatDamageWithStacks(activeHero.hero, activeHero.hero.BasicAttack)}
                  </div>
                </div>
                
                <div className="selected-target">
                  Target: <strong>{myPlayerData.selectedTarget}</strong>
                </div>
                
                {/* Show basic attack button only if hero has basic attack */}
                {activeHero.hero.BasicAttack !== "—" && (
                  (() => {
                    const canMultipleAttacks = canUseMultipleAttacks(activeHero.hero);
                    const usedAttacks = myPlayerData.usedAttacks || 0;
                    const oneTwoPunchRemaining = myPlayerData.oneTwoPunchAttacksRemaining || 0;
                    let attackButtonText = `Attack (${formatDamageWithStacks(activeHero.hero, activeHero.hero.BasicAttack)})`;
                    // Check if hero is stunned (has disableAttack status)
                    const isStunned = activeHero.hero.statusEffects?.disableAttack === true || 
                                     (typeof activeHero.hero.statusEffects?.disableAttack === 'object' && 
                                      activeHero.hero.statusEffects.disableAttack?.active);
                    
                    let isAttackDisabled = !isSelectedTargetAlive() || isStunned;
                    
                    // For heroes that can attack multiple times, check attack count instead of hasUsedAttack
                    if (canMultipleAttacks) {
                      isAttackDisabled = isAttackDisabled || usedAttacks >= 2;
                    } else {
                      isAttackDisabled = isAttackDisabled || myPlayerData.hasUsedAttack;
                    }
                    
                    // Handle Monk's attack tracking
                    if (activeHero.hero.name === 'Monk') {
                      const monkAttacksRemaining = (myPlayerData as any).monkAttacksRemaining || 0;
                      if (monkAttacksRemaining > 0) {
                        attackButtonText += ` (${monkAttacksRemaining} left)`;
                        isAttackDisabled = !isSelectedTargetAlive();
                      } else {
                        attackButtonText += ' (Used)';
                        isAttackDisabled = true;
                      }
                    }
                    else if (canMultipleAttacks) {
                      // Show attack counter for Berserker Frenzy
                      if (usedAttacks === 1) {
                        attackButtonText += ' (1/2)';
                      } else if (usedAttacks >= 2) {
                        attackButtonText += ' (Used)';
                      }
                    } else {
                      // Regular attack tracking
                      if (myPlayerData.hasUsedAttack) {
                        attackButtonText += ' (Used)';
                      }
                    }
                    
                    if (!isSelectedTargetAlive() && !myPlayerData.hasUsedAttack && oneTwoPunchRemaining === 0) {
                      attackButtonText += ' (Target Dead)';
                    }
                    
                    // Add stunned indicator
                    if (isStunned) {
                      attackButtonText += ' (Stunned)';
                    }
                    
                    return (
                      <button 
                        className={`action-button ${isStunned ? 'disable-attack' : ''}`}
                        disabled={isAttackDisabled}
                        onClick={() => {
                          socketService.basicAttack(myPlayerData.selectedTarget!);
                        }}
                      >
                        {attackButtonText}
                      </button>
                    );
                  })()
                )}
                
                {/* Show abilities */}
                {activeHero.hero.Ability?.map((ability, index) => {
                  const canUseMultiple = canUseMultipleAbilities(activeHero.hero);
                  const hasMultipleAbilities = activeHero.hero.Ability && activeHero.hero.Ability.length > 1;
                  
                  // Check if hero is silenced
                  const isSilenced = activeHero.hero.statusEffects?.silenced === true || 
                                   (typeof activeHero.hero.statusEffects?.silenced === 'object' && 
                                    activeHero.hero.statusEffects.silenced?.active);
                  
                  // Check if abilities are permanently disabled (Dragon Rider's Dismount)
                  const isPermanentlyDisabled = (activeHero.hero as any).permanentDisables?.abilities;
                  
                  // For heroes with multiple abilities (like Blood Hunter), check individual ability usage
                  let isDisabled;
                  let buttonText = ability.name;
                  
                  if (isPermanentlyDisabled) {
                    isDisabled = true;
                    buttonText += ' (Disabled)';
                  } else if (canUseMultiple && hasMultipleAbilities) {
                    // Check if this specific ability has been used
                    isDisabled = myPlayerData.usedAbilities?.includes(ability.name) || false;
                    if (isDisabled) buttonText += ' (Used)';
                  } else if (canUseMultiple && !hasMultipleAbilities) {
                    // For heroes like Assassin with one ability but can use it twice
                    const usageCount = myPlayerData.usedAbilities?.filter(name => name === ability.name).length || 0;
                    isDisabled = usageCount >= 2; // Can use the same ability twice
                    if (usageCount === 1) buttonText += ' (1/2)';
                    else if (usageCount >= 2) buttonText += ' (Used)';
                  } else if (activeHero.hero.name === 'Sorcerer' && (myPlayerData as any).twinSpellActive) {
                    // Special handling for Sorcerer Twin Spell active state
                    const usageCount = myPlayerData.usedAbilities?.filter(name => name === ability.name).length || 0;
                    isDisabled = usageCount >= 2; // Can use the ability twice when Twin Spell is active
                    if (usageCount === 1) buttonText += ' (1/2)';
                    else if (usageCount >= 2) buttonText += ' (Used)';
                  } else {
                    // Regular single ability usage
                    isDisabled = myPlayerData.hasUsedAbility;
                    if (isDisabled) buttonText += ' (Used)';
                  }
                  
                  // Disable if silenced (but not if already permanently disabled)
                  if (isSilenced && !isPermanentlyDisabled) {
                    isDisabled = true;
                    buttonText += ' (Silenced)';
                  }
                  
                  // Disable if selected target is dead (but not if already disabled)
                  if (!isSelectedTargetAlive() && !isSilenced && !isDisabled) {
                    isDisabled = true;
                    buttonText += ' (Target Dead)';
                  }
                  
                  return (
                    <button 
                      key={index}
                      className={`action-button ${isSilenced ? 'silenced' : ''} ${isPermanentlyDisabled ? 'permanently-disabled' : ''}`}
                      disabled={isDisabled}
                      onClick={() => {
                        // Special case for Timekeeper's Chrono Shift - needs to select ally to command
                        if (activeHero.hero.name === 'Timekeeper' && ability.name === 'Chrono Shift') {
                          setSelectingAllyForAbility({ abilityIndex: index, targetId: myPlayerData.selectedTarget! });
                        }
                        // Check if this ability requires ally targeting (like Paladin's Divine Smite)
                        else if (ability.requires_ally_target || 
                                 (ability.secondary_effects && 
                                  ability.secondary_effects.some((effect: any) => effect.target === 'selected_ally'))) {
                          setSelectingAllyForAbility({ abilityIndex: index, targetId: myPlayerData.selectedTarget! });
                        } else {
                          socketService.useAbility(index, myPlayerData.selectedTarget!);
                        }
                      }}
                    >
                      {buttonText}
                    </button>
                  );
                })}
                
                {/* Timekeeper Ability Selection UI */}
                {timekeeperAbilitySelection && (
                  <div className="ability-selection">
                    <h4>Select {timekeeperAbilitySelection.ally}'s Ability:</h4>
                    <div className="ability-options">
                      {timekeeperAbilitySelection.availableAbilities.map((ability, index) => (
                        <button
                          key={index}
                          className="ability-option-button"
                          onClick={() => {
                            socketService.useTimekeeperSelectedAbility(
                              timekeeperAbilitySelection.target,
                              timekeeperAbilitySelection.ally,
                              ability.index
                            );
                            onClearTimekeeperSelection?.();
                          }}
                        >
                          <div className="ability-name">{ability.name}</div>
                          <div className="ability-description">{ability.description}</div>
                        </button>
                      ))}
                    </div>
                    <button 
                      className="action-button cancel-ability-selection"
                      onClick={() => onClearTimekeeperSelection?.()}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                
                <button 
                  className="action-button end-turn-button"
                  onClick={() => {
                    socketService.endTurn();
                  }}
                >
                  End Turn
                </button>
              </div>
            );
          })()}
        </div>

      </div>
    );
  };

  const handleReturnToLobby = () => {
    if (onReturnToLobby) {
      // In survival mode, return to survival builder; otherwise return to main lobby
      onReturnToLobby(!isSurvivalMode);
    } else {
      // Fallback - reset the game state to return to lobby
      window.location.reload();
    }
  };

  const renderGameOverOverlay = () => {
    const isWinner = gameState.winner === playerId;
    
    return (
      <div className="game-over-overlay">
        <div className="game-over-modal">
          <div className="game-over-content">
            <h2 className={`game-over-title ${isWinner ? 'winner' : 'loser'}`}>
              {isWinner ? 'You Win!' : 'You Lose!'}
            </h2>
            <p className="game-over-message">
              {isWinner 
                ? 'Congratulations! You have defeated your opponent!' 
                : 'Better luck next time! Your opponent was victorious.'}
            </p>
            {isSurvivalMode ? (
              <button 
                className="return-to-lobby-button"
                onClick={handleReturnToLobby}
              >
                Return to Survival
              </button>
            ) : (
              <button 
                className="return-to-lobby-button"
                onClick={handleReturnToLobby}
              >
                Return to Lobby
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const battleContent = renderBattlePhase();
  
  // If game is ended, show battle scene with overlay
  if (gameState.phase === 'ended') {
    return (
      <div className="battle-with-overlay">
        {battleContent}
        {renderGameOverOverlay()}
      </div>
    );
  }
  
  // If initiative phase, show battle scene with initiative overlay
  if (gameState.phase === 'initiative') {
    return (
      <div className="battle-with-overlay">
        {battleContent}
        {renderInitiativeOverlay()}
      </div>
    );
  }
  
  return (
    <>
      {battleContent}
      
      {/* Floating Surrender Button - Bottom Right */}
      <button 
        className="floating-surrender-button"
        onClick={handleSurrenderClick}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 20px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
          zIndex: 1000,
          transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#c82333';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#dc3545';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          🏳️ Surrender
        </button>
        
        {showSurrenderConfirm && (
          <div className="game-over-overlay">
            <div className="game-over-modal">
              <div className="game-over-content">
                <h2 className="surrender-title">Surrender Game?</h2>
                <p className="surrender-message">
                  Are you sure you want to surrender? This will immediately end the battle and your opponent will be declared the winner.
                </p>
                <div className="button-group">
                  <button 
                    className="return-to-lobby-button"
                    onClick={handleConfirmSurrender}
                    style={{ backgroundColor: '#dc3545' }}
                  >
                    Yes, Surrender
                  </button>
                  <button 
                    className="return-to-lobby-button secondary"
                    onClick={handleCancelSurrender}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
};

export default BattlePhase;