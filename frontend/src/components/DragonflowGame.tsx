import React, { useState, useEffect } from 'react';
import { 
  DragonflowGameState, 
  DragonCard, 
  DragonType,
  HARMONIZATION_RULES,
  COMBAT_RULES,
  DRAGON_ABILITIES 
} from '../types/dragonflow';
import '../styles/DragonflowGame.css';
import { socketService } from '../socketService';

interface DragonflowGameProps {
  onBack: () => void;
  username: string;
  gameId: string;
  opponent: {
    username: string;
    userId: string;
  };
  playerRole: 'player1' | 'player2';
}

const DragonflowGame: React.FC<DragonflowGameProps> = ({ onBack, username, gameId, opponent, playerRole }) => {
  const [gameState, setGameState] = useState<DragonflowGameState>(() => {
    // Only player1 initializes the game
    if (playerRole === 'player1') {
      return initializeGame();
    }
    // player2 waits for initial state from player1
    return null as any;
  });
  const [summonMode, setSummonMode] = useState(false);
  const [attackMode, setAttackMode] = useState(false);
  const [harmonizationQueue, setHarmonizationQueue] = useState<any[]>([]);
  const [showOreMenu, setShowOreMenu] = useState(false);
  const [oreAbilityMode, setOreAbilityMode] = useState<'move' | 'return' | 'conflict' | 'reharmonize' | 'search' | null>(null);
  const [oreSelectedCard, setOreSelectedCard] = useState<string | null>(null);
  const [searchDragonType, setSearchDragonType] = useState<DragonType | null>(null);
  const [searchDestination, setSearchDestination] = useState<'hand' | 'flow' | null>(null);
  const [harmonyAbilityMode, setHarmonyAbilityMode] = useState<'fire' | 'water' | 'earth' | null>(null);
  const [waterSelectedCard, setWaterSelectedCard] = useState<string | null>(null);
  const [waterSelectedCardFlow, setWaterSelectedCardFlow] = useState<'player' | 'opponent' | null>(null);
  const [waterSelectedCardColumn, setWaterSelectedCardColumn] = useState<number | null>(null);
  const [draggedCardIndex, setDraggedCardIndex] = useState<number | null>(null);

  // Reset all game state
  const resetAllState = () => {
    setSummonMode(false);
    setAttackMode(false);
    setHarmonizationQueue([]);
    setShowOreMenu(false);
    setOreAbilityMode(null);
    setOreSelectedCard(null);
    setSearchDragonType(null);
    setSearchDestination(null);
    setHarmonyAbilityMode(null);
    setWaterSelectedCard(null);
    setWaterSelectedCardFlow(null);
    setWaterSelectedCardColumn(null);
    setDraggedCardIndex(null);
  };

  // Handle going back to lobby with full cleanup
  const handleBackToLobby = () => {
    resetAllState();
    onBack();
  };

  // Socket synchronization
  useEffect(() => {
    // Listen for state updates from opponent
    const handleStateUpdate = (data: any) => {
      console.log('Received state update:', data);
      if (data.gameState) {
        setGameState(data.gameState);
      }
    };

    socketService.onDragonflowStateUpdate(handleStateUpdate);

    return () => {
      // Socket cleanup handled by socketService
    };
  }, []);

  // Separate effect to send initial state when player1's gameState is ready
  useEffect(() => {
    if (playerRole === 'player1' && gameState) {
      // Small delay to ensure opponent's socket listeners are registered
      setTimeout(() => {
        console.log('Player1 syncing initial game state');
        socketService.syncDragonflowState(gameState);
      }, 100);
    }
  }, [playerRole]);

  // Helper to update state and sync to opponent
  const syncGameState = (newState: DragonflowGameState) => {
    setGameState(newState);
    socketService.syncDragonflowState(newState);
  };

  // Initialize a new game
  function initializeGame(): DragonflowGameState {
    const deck = createDeck();
    const playerHand = deck.splice(0, 4);
    const opponentHand = deck.splice(0, 4);

    // Randomly determine who chooses turn order
    const chooser = Math.random() < 0.5 ? 'player1' : 'player2';
    
    return {
      phase: 'choose-starter',
      currentTurn: 'player',
      choosingPlayer: chooser,
      board: {
        playerFlow: Array(5).fill(null).map((_, i) => ({ 
          columnIndex: i, 
          card: null, 
          isBlocked: false,
          blockedBy: null 
        })),
        opponentFlow: Array(5).fill(null).map((_, i) => ({ 
          columnIndex: i, 
          card: null, 
          isBlocked: false,
          blockedBy: null 
        })),
        playerHand,
        opponentHand,
        deck,
        discardPile: [],
        playerOre: 0,
        opponentOre: 0
      },
      actionsUsed: {
        summon: 0,
        attack: 0,
        draw: 0,
        gainOre: 0,
        spendOre: 0
      },
      actionsRemaining: 3,
      selectedCard: null,
      selectedFlowPosition: null,
      pendingHarmonization: null,
      winner: null,
      harmonizedThisTurn: []
    };
  }

  // Create deck with 6 of each dragon type
  function createDeck(): DragonCard[] {
    const types: DragonType[] = ['fire', 'water', 'earth', 'wood', 'metal'];
    const deck: DragonCard[] = [];
    
    types.forEach(type => {
      for (let i = 0; i < 6; i++) {
        deck.push({
          id: `${type}-${i}-${Math.random()}`,
          type,
          owner: null
        });
      }
    });

    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }



  const handleStarterChoice = (goFirst: boolean) => {
    // Determine which player goes first based on who chose
    const firstPlayer = goFirst ? playerRole : (playerRole === 'player1' ? 'player2' : 'player1');
    
    syncGameState({
      ...gameState,
      phase: 'playing',
      currentTurn: firstPlayer
    });
  };

  // Helper to check if it's the current player's turn
  const isMyTurn = () => {
    return gameState.currentTurn === playerRole;
  };

  // Helpers to get board from correct perspective
  const getMyFlow = () => playerRole === 'player1' ? gameState.board.playerFlow : gameState.board.opponentFlow;
  const getOpponentFlow = () => playerRole === 'player1' ? gameState.board.opponentFlow : gameState.board.playerFlow;
  const getMyHand = () => playerRole === 'player1' ? gameState.board.playerHand : gameState.board.opponentHand;
  const getOpponentHand = () => playerRole === 'player1' ? gameState.board.opponentHand : gameState.board.playerHand;
  const getMyOre = () => playerRole === 'player1' ? gameState.board.playerOre : gameState.board.opponentOre;
  const getOpponentOre = () => playerRole === 'player1' ? gameState.board.opponentOre : gameState.board.playerOre;

  // Drag and drop handlers for hand rearrangement
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedCardIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedCardIndex === null || draggedCardIndex === dropIndex) return;

    const myHand = [...getMyHand()];
    const [draggedCard] = myHand.splice(draggedCardIndex, 1);
    myHand.splice(dropIndex, 0, draggedCard);

    const newBoard = { ...gameState.board };
    if (playerRole === 'player1') {
      newBoard.playerHand = myHand;
    } else {
      newBoard.opponentHand = myHand;
    }

    syncGameState({
      ...gameState,
      board: newBoard
    });

    setDraggedCardIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedCardIndex(null);
  };

  // Check win condition: Player needs one of each dragon type (5 unique types)
  const checkWinCondition = (): 'player1' | 'player2' | null => {
    const checkFlow = (flow: typeof gameState.board.playerFlow) => {
      const types = new Set<DragonType>();
      flow.forEach(pos => {
        if (pos.card) {
          types.add(pos.card.type);
        }
      });
      // Win condition: have all 5 different dragon types on the board
      return types.size === 5;
    };

    if (checkFlow(gameState.board.playerFlow)) return 'player1';
    if (checkFlow(gameState.board.opponentFlow)) return 'player2';
    return null;
  };

  // End turn
  const handleEndTurn = () => {
    if (gameState.phase === 'game-over') return; // Prevent ending turn when game is over
    
    // Check hand size limit
    let newBoard = { ...gameState.board };
    const hand = gameState.currentTurn === 'player1' ? newBoard.playerHand : newBoard.opponentHand;
    
    if (hand.length > 5) {
      const cardsToDiscard = hand.splice(5);
      newBoard.discardPile.push(...cardsToDiscard);
    }

    // Validate all Earth dragon blocks
    validateEarthBlocks(newBoard);

    const winner = checkWinCondition();
    if (winner) {
      syncGameState({
        ...gameState,
        phase: 'game-over',
        winner
      });
      return;
    }

    syncGameState({
      ...gameState,
      currentTurn: gameState.currentTurn === 'player1' ? 'player2' : 'player1',
      actionsUsed: {
        summon: 0,
        attack: 0,
        draw: 0,
        gainOre: 0,
        spendOre: 0
      },
      actionsRemaining: 3,
      board: newBoard,
      selectedCard: null,
      selectedFlowPosition: null,
      harmonizedThisTurn: []
    });
  };

  // Summon Action
  const handleSummonAction = () => {
    if (gameState.phase === 'game-over') return; // Prevent actions when game is over
    if (gameState.actionsUsed.summon >= 2 || gameState.actionsRemaining === 0) return;
    // Clear other modes
    setAttackMode(false);
    setSummonMode(true);
  };

  const handleCardSelect = (cardId: string) => {
    if (!summonMode) return;
    setGameState({
      ...gameState,
      selectedCard: cardId
    });
  };

  const handleFlowSpaceClick = (columnIndex: number) => {
    if (!summonMode || !gameState.selectedCard) return;

    const isPlayer = gameState.currentTurn === 'player1';
    // Always use player's perspective - player1's board is playerFlow, player2's board is opponentFlow  
    const flow = playerRole === 'player1' ? gameState.board.playerFlow : gameState.board.opponentFlow;
    const hand = playerRole === 'player1' ? gameState.board.playerHand : gameState.board.opponentHand;

    // Check if space is blocked or occupied
    if (flow[columnIndex].isBlocked || flow[columnIndex].card) return;

    // Find the card in hand
    const cardIndex = hand.findIndex(c => c.id === gameState.selectedCard);
    if (cardIndex === -1) return;

    const card = hand[cardIndex];
    
    // Remove from hand and place on board
    const newHand = [...hand];
    newHand.splice(cardIndex, 1);

    const newFlow = [...flow];
    newFlow[columnIndex] = {
      ...newFlow[columnIndex],
      card: { ...card, owner: gameState.currentTurn }
    };

    // Update board
    const newBoard = { ...gameState.board };
    if (isPlayer) {
      newBoard.playerHand = newHand;
      newBoard.playerFlow = newFlow;
    } else {
      newBoard.opponentHand = newHand;
      newBoard.opponentFlow = newFlow;
    }

    // Check for harmonization
    const harmonizations = checkHarmonization(newFlow, columnIndex, card.type, isPlayer);

    syncGameState({
      ...gameState,
      board: newBoard,
      actionsUsed: {
        ...gameState.actionsUsed,
        summon: gameState.actionsUsed.summon + 1
      },
      actionsRemaining: gameState.actionsRemaining - 1,
      selectedCard: null
    });

    setSummonMode(false);

    // Process harmonizations after state sync completes
    if (harmonizations.length > 0) {
      setTimeout(() => processHarmonizationQueue(harmonizations), 100);
    }
  };

  // Check for harmonization when a card enters the flow
  const checkHarmonization = (flow: any[], placedIndex: number, placedType: DragonType, isPlayer: boolean): any[] => {
    const harmonizations: any[] = [];

    // Check if placed card harmonizes the card to its right
    if (placedIndex < 4 && flow[placedIndex + 1].card) {
      const rightCard = flow[placedIndex + 1].card;
      if (HARMONIZATION_RULES[rightCard.type as DragonType] === placedType) {
        harmonizations.push({
          cardId: rightCard.id,
          dragonType: rightCard.type,
          effect: DRAGON_ABILITIES[rightCard.type as DragonType],
          columnIndex: placedIndex + 1,
          owner: rightCard.owner // Use the card's actual owner
        });
      }
    }

    // Check if there's a card to the left that harmonizes this placed card
    if (placedIndex > 0 && flow[placedIndex - 1].card) {
      const leftCard = flow[placedIndex - 1].card;
      if (HARMONIZATION_RULES[placedType] === leftCard.type) {
        harmonizations.push({
          cardId: flow[placedIndex].card!.id,
          dragonType: placedType,
          effect: DRAGON_ABILITIES[placedType],
          columnIndex: placedIndex,
          owner: flow[placedIndex].card!.owner // Use the card's actual owner
        });
      }
    }

    // Filter out cards that have already harmonized this turn
    const filteredHarmonizations = harmonizations.filter(h => 
      !gameState.harmonizedThisTurn.includes(h.cardId)
    );

    // Sort by priority order: Fire, Earth, Metal, Water, Wood
    const priorityOrder: DragonType[] = ['fire', 'earth', 'metal', 'water', 'wood'];
    filteredHarmonizations.sort((a, b) => {
      const aPriority = priorityOrder.indexOf(a.dragonType);
      const bPriority = priorityOrder.indexOf(b.dragonType);
      if (aPriority !== bPriority) return aPriority - bPriority;
      // If same type, sort by column (left to right)
      return a.columnIndex - b.columnIndex;
    });

    return filteredHarmonizations;
  };

  const processHarmonizationQueue = (harmonizations: any[]) => {
    if (harmonizations.length === 0) return;

    const [first, ...rest] = harmonizations;
    setHarmonizationQueue(rest);
    
    // Use setGameState callback to get the latest state, then sync
    setGameState((currentState) => {
      const updatedState = {
        ...currentState,
        pendingHarmonization: first
      };
      socketService.syncDragonflowState(updatedState);
      return updatedState;
    });
  };

  const handleUseAbility = () => {
    if (!gameState.pendingHarmonization) return;

    const harmony = gameState.pendingHarmonization;
    
    // Execute the ability based on dragon type
    executeHarmonizationAbility(harmony);

    // Clear current harmonization and mark card as harmonized this turn
    setGameState((currentState) => {
      const updatedState = {
        ...currentState,
        pendingHarmonization: null,
        harmonizedThisTurn: [...currentState.harmonizedThisTurn, harmony.cardId]
      };
      socketService.syncDragonflowState(updatedState);
      return updatedState;
    });

    if (harmonizationQueue.length > 0) {
      setTimeout(() => processHarmonizationQueue(harmonizationQueue), 300);
    }
  };

  const handleSkipAbility = () => {
    setGameState((currentState) => {
      const updatedState = {
        ...currentState,
        pendingHarmonization: null
      };
      socketService.syncDragonflowState(updatedState);
      return updatedState;
    });

    if (harmonizationQueue.length > 0) {
      setTimeout(() => processHarmonizationQueue(harmonizationQueue), 300);
    }
  };

  const executeHarmonizationAbility = (harmony: any) => {
    const { dragonType, owner } = harmony;

    switch (dragonType) {
      case 'wood':
        // Draw one card
        drawCard(owner);
        break;
      case 'metal':
        // Gain 2 ore
        syncGameState({
          ...gameState,
          board: {
            ...gameState.board,
            [owner === 'player1' ? 'playerOre' : 'opponentOre']: 
              gameState.board[owner === 'player1' ? 'playerOre' : 'opponentOre'] + 2
          }
        });
        break;
      case 'fire':
        // Fire: Destroy an enemy dragon (requires target selection)
        setHarmonyAbilityMode('fire');
        break;
      case 'water':
        // Water: Swap two dragons (requires two card selections)
        setHarmonyAbilityMode('water');
        setWaterSelectedCard(null);
        setWaterSelectedCardFlow(null);
        setWaterSelectedCardColumn(null);
        break;
      case 'earth':
        // Earth: Block an enemy space (requires space selection)
        setHarmonyAbilityMode('earth');
        break;
    }
  };

  const drawCard = (player: 'player1' | 'player2') => {
    const newBoard = { ...gameState.board };
    
    if (newBoard.deck.length === 0) {
      // Shuffle discard pile into deck
      newBoard.deck = [...newBoard.discardPile];
      newBoard.discardPile = [];
      
      // Shuffle
      for (let i = newBoard.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newBoard.deck[i], newBoard.deck[j]] = [newBoard.deck[j], newBoard.deck[i]];
      }
    }

    if (newBoard.deck.length > 0) {
      const card = newBoard.deck.shift()!;
      if (player === 'player1') {
        newBoard.playerHand.push(card);
      } else {
        newBoard.opponentHand.push(card);
      }
    }

    setGameState({
      ...gameState,
      board: newBoard
    });
  };

  // Attack Action
  const handleAttackAction = () => {
    if (gameState.actionsUsed.attack >= 2 || gameState.actionsRemaining === 0) return;
    // Clear other modes
    setSummonMode(false);
    setAttackMode(true);
  };

  const handleAttackerSelect = (columnIndex: number) => {
    if (!attackMode) return;
    
    // Use perspective helpers to get the correct flows
    const myFlow = getMyFlow();
    const opponentFlow = getOpponentFlow();
    
    // Must select a card that exists on current player's side
    if (!myFlow[columnIndex].card) return;
    
    // Check if there's a target in the same column
    const targetCard = opponentFlow[columnIndex].card;
    if (!targetCard) {
      // No target to attack
      return;
    }

    const attackerCard = myFlow[columnIndex].card!;
    
    // Debug logging
    console.log('Attack attempt:', {
      attacker: attackerCard.type,
      target: targetCard.type,
      canDefeat: COMBAT_RULES[attackerCard.type],
      matches: COMBAT_RULES[attackerCard.type] === targetCard.type
    });
    
    // Check if attacker can defeat target based on combat rules
    if (COMBAT_RULES[attackerCard.type] !== targetCard.type) {
      // Cannot defeat this target
      console.log('Attack blocked: attacker cannot defeat this target');
      return;
    }

    // Valid attack - destroy target
    performAttack(columnIndex);
  };

  const performAttack = (columnIndex: number) => {
    const isPlayer = gameState.currentTurn === 'player1';
    const newBoard = { ...gameState.board };
    const opponentFlow = isPlayer ? newBoard.opponentFlow : newBoard.playerFlow;
    
    // Get the target card before destroying it
    const targetCard = opponentFlow[columnIndex].card;
    if (!targetCard) return;

    // Add animation class
    const cardElement = document.querySelector(
      `.${isPlayer ? 'opponent' : 'player'}-flow .flow-space:nth-child(${columnIndex + 1}) .dragon-card`
    );
    if (cardElement) {
      cardElement.classList.add('fire-destroy-animation');
    }

    // Destroy the target after animation
    setTimeout(() => {
      const updatedBoard = { ...gameState.board };
      const updatedOpponentFlow = isPlayer ? updatedBoard.opponentFlow : updatedBoard.playerFlow;
      
      // Move to discard pile
      if (updatedOpponentFlow[columnIndex].card) {
        updatedBoard.discardPile.push(updatedOpponentFlow[columnIndex].card!);
      }
      
      // Clear the space
      updatedOpponentFlow[columnIndex].card = null;
      
      // Clear any blocks created by this card (important for Earth dragons)
      clearBlocksForCard(targetCard.id, updatedBoard);
      
      // If this space itself was blocked by the destroyed card, clear it
      if (updatedOpponentFlow[columnIndex].isBlocked) {
        const blockedBy = updatedOpponentFlow[columnIndex].blockedBy;
        if (blockedBy === targetCard.id) {
          updatedOpponentFlow[columnIndex].isBlocked = false;
          updatedOpponentFlow[columnIndex].blockedBy = null;
        }
      }

      syncGameState({
        ...gameState,
        board: updatedBoard,
        actionsUsed: {
          ...gameState.actionsUsed,
          attack: gameState.actionsUsed.attack + 1
        },
        actionsRemaining: gameState.actionsRemaining - 1
      });

      setAttackMode(false);
    }, 1000);
  };

  // Draw Action
  const handleDrawAction = () => {
    if (gameState.actionsUsed.draw >= 2 || gameState.actionsRemaining === 0) return;
    
    const currentPlayer = gameState.currentTurn;
    drawCard(currentPlayer);
    
    syncGameState({
      ...gameState,
      actionsUsed: {
        ...gameState.actionsUsed,
        draw: gameState.actionsUsed.draw + 1
      },
      actionsRemaining: gameState.actionsRemaining - 1
    });
  };

  // Gain Ore Action
  const handleGainOreAction = () => {
    if (gameState.actionsUsed.gainOre >= 2 || gameState.actionsRemaining === 0) return;
    
    const isPlayer = gameState.currentTurn === 'player1';
    
    syncGameState({
      ...gameState,
      board: {
        ...gameState.board,
        [isPlayer ? 'playerOre' : 'opponentOre']: 
          gameState.board[isPlayer ? 'playerOre' : 'opponentOre'] + 1
      },
      actionsUsed: {
        ...gameState.actionsUsed,
        gainOre: gameState.actionsUsed.gainOre + 1
      },
      actionsRemaining: gameState.actionsRemaining - 1
    });
  };

  // Spend Ore Action
  const handleSpendOreAction = () => {
    if (gameState.actionsUsed.spendOre >= 2 || gameState.actionsRemaining === 0) return;
    setShowOreMenu(true);
  };

  const handleOreAbilitySelect = (ability: string, cost: number) => {
    const isPlayer = gameState.currentTurn === 'player1';
    const currentOre = isPlayer ? gameState.board.playerOre : gameState.board.opponentOre;
    
    if (currentOre < cost) return; // Not enough ore
    
    // Use the new initiation handlers
    if (ability === 'move') startOreMove();
    else if (ability === 'return') startOreReturn();
    else if (ability === 'conflict') startOreConflict();
    else if (ability === 'reharmonize') startOreReharmonize();
    else if (ability === 'search') startOreSearch();
  };

  // Ore Ability: Move dragon (1 ore)
  const handleOreMove = (fromColumn: number, toColumn: number) => {
    const isPlayer = gameState.currentTurn === 'player1';
    const flow = isPlayer ? [...gameState.board.playerFlow] : [...gameState.board.opponentFlow];
    
    if (!flow[fromColumn].card || flow[toColumn].card || flow[toColumn].isBlocked) return;
    
    // Move the card
    const card = flow[fromColumn].card;
    flow[fromColumn].card = null;
    flow[toColumn].card = card;
    
    const newBoard = { ...gameState.board };
    if (isPlayer) {
      newBoard.playerFlow = flow;
      newBoard.playerOre -= 1;
    } else {
      newBoard.opponentFlow = flow;
      newBoard.opponentOre -= 1;
    }
    
    // Validate Earth blocks after movement
    validateEarthBlocks(newBoard);
    
    // Check for harmonization at new position
    const harmonizations = checkHarmonization(flow, toColumn, card!.type, isPlayer);
    
    setGameState({
      ...gameState,
      board: newBoard,
      actionsUsed: {
        ...gameState.actionsUsed,
        spendOre: gameState.actionsUsed.spendOre + 1
      },
      actionsRemaining: gameState.actionsRemaining - 1
    });
    
    if (harmonizations.length > 0) {
      processHarmonizationQueue(harmonizations);
    }
  };

  // Ore Ability: Return dragon to hand (1 ore)
  const handleOreReturn = (columnIndex: number) => {
    const isPlayer = gameState.currentTurn === 'player1';
    const flow = isPlayer ? [...gameState.board.playerFlow] : [...gameState.board.opponentFlow];
    const hand = isPlayer ? [...gameState.board.playerHand] : [...gameState.board.opponentHand];
    
    if (!flow[columnIndex].card) return;
    
    const card = flow[columnIndex].card!;
    flow[columnIndex].card = null;
    
    // Clear any blocks created by this card
    const tempBoard = { ...gameState.board };
    clearBlocksForCard(card.id, tempBoard);
    
    // If this space itself was blocked by this card, clear it
    if (flow[columnIndex].blockedBy === card.id) {
      flow[columnIndex].isBlocked = false;
      flow[columnIndex].blockedBy = null;
    }
    
    hand.push(card);
    
    const newBoard = { ...gameState.board };
    if (isPlayer) {
      newBoard.playerFlow = flow;
      newBoard.playerHand = hand;
      newBoard.playerOre -= 1;
    } else {
      newBoard.opponentFlow = flow;
      newBoard.opponentHand = hand;
      newBoard.opponentOre -= 1;
    }
    
    setGameState({
      ...gameState,
      board: newBoard,
      actionsUsed: {
        ...gameState.actionsUsed,
        spendOre: gameState.actionsUsed.spendOre + 1
      },
      actionsRemaining: gameState.actionsRemaining - 1
    });
  };

  // Ore Ability: Conflict/Attack anywhere (2 ore)
  const handleOreConflict = (attackerColumn: number, targetColumn: number) => {
    const isPlayer = gameState.currentTurn === 'player1';
    const attackerFlow = isPlayer ? gameState.board.playerFlow : gameState.board.opponentFlow;
    const targetFlow = isPlayer ? gameState.board.opponentFlow : gameState.board.playerFlow;
    
    const attackerCard = attackerFlow[attackerColumn].card;
    const targetCard = targetFlow[targetColumn].card;
    
    if (!attackerCard || !targetCard) return;
    if (COMBAT_RULES[attackerCard.type] !== targetCard.type) return;
    
    // Destroy target
    const newBoard = { ...gameState.board };
    const newTargetFlow = isPlayer ? [...newBoard.opponentFlow] : [...newBoard.playerFlow];
    
    newBoard.discardPile.push(targetCard);
    newTargetFlow[targetColumn].card = null;
    
    // Clear any blocks created by this card (important for Earth dragons)
    clearBlocksForCard(targetCard.id, newBoard);
    
    if (newTargetFlow[targetColumn].blockedBy === targetCard.id) {
      newTargetFlow[targetColumn].isBlocked = false;
      newTargetFlow[targetColumn].blockedBy = null;
    }
    
    if (isPlayer) {
      newBoard.opponentFlow = newTargetFlow;
      newBoard.playerOre -= 2;
    } else {
      newBoard.playerFlow = newTargetFlow;
      newBoard.opponentOre -= 2;
    }
    
    setGameState({
      ...gameState,
      board: newBoard,
      actionsUsed: {
        ...gameState.actionsUsed,
        spendOre: gameState.actionsUsed.spendOre + 1
      },
      actionsRemaining: gameState.actionsRemaining - 1
    });
  };

  // Ore Ability: Re-harmonize (3 ore)
  const handleOreReharmonize = (columnIndex: number) => {
    const isPlayer = gameState.currentTurn === 'player1';
    const flow = isPlayer ? gameState.board.playerFlow : gameState.board.opponentFlow;
    
    if (!flow[columnIndex].card) return;
    
    const card = flow[columnIndex].card!;
    
    // Check if card can be harmonized
    const canHarmonize = 
      (columnIndex > 0 && flow[columnIndex - 1].card && HARMONIZATION_RULES[card.type] === flow[columnIndex - 1].card!.type);
    
    if (!canHarmonize) return;
    
    // Deduct ore
    const newBoard = { ...gameState.board };
    if (isPlayer) {
      newBoard.playerOre -= 3;
    } else {
      newBoard.opponentOre -= 3;
    }
    
    setGameState({
      ...gameState,
      board: newBoard,
      actionsUsed: {
        ...gameState.actionsUsed,
        spendOre: gameState.actionsUsed.spendOre + 1
      },
      actionsRemaining: gameState.actionsRemaining - 1,
      pendingHarmonization: {
        cardId: card.id,
        dragonType: card.type,
        effect: DRAGON_ABILITIES[card.type],
        columnIndex
      }
    });
  };

  // Ore Ability: Search and add dragon from deck (4 ore)
  const handleOreSearch = (dragonType: DragonType, addToFlow: boolean, targetColumn?: number) => {
    const isPlayer = gameState.currentTurn === 'player1';
    const newBoard = { ...gameState.board };
    
    let found = false;
    const revealedCards: DragonCard[] = [];
    
    // Search through deck
    for (let i = 0; i < newBoard.deck.length; i++) {
      const card = newBoard.deck[i];
      if (card.type === dragonType) {
        found = true;
        newBoard.deck.splice(i, 1);
        
        if (addToFlow && targetColumn !== undefined) {
          const flow = isPlayer ? newBoard.playerFlow : newBoard.opponentFlow;
          if (!flow[targetColumn].card && !flow[targetColumn].isBlocked) {
            flow[targetColumn].card = card;
            
            // Check harmonization
            const harmonizations = checkHarmonization(flow, targetColumn, card.type, isPlayer);
            if (harmonizations.length > 0) {
              setTimeout(() => processHarmonizationQueue(harmonizations), 300);
            }
          }
        } else {
          const hand = isPlayer ? newBoard.playerHand : newBoard.opponentHand;
          hand.push(card);
        }
        break;
      } else {
        revealedCards.push(card);
      }
    }
    
    // If not found, shuffle discard into deck and cancel
    if (!found) {
      newBoard.deck = [...newBoard.deck, ...newBoard.discardPile];
      newBoard.discardPile = [];
      
      // Shuffle
      for (let i = newBoard.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newBoard.deck[i], newBoard.deck[j]] = [newBoard.deck[j], newBoard.deck[i]];
      }
      
      // Don't spend ore or action
      return;
    }
    
    // Move revealed cards to discard
    newBoard.discardPile.push(...revealedCards);
    
    if (isPlayer) {
      newBoard.playerOre -= 4;
    } else {
      newBoard.opponentOre -= 4;
    }
    
    setGameState({
      ...gameState,
      board: newBoard,
      actionsUsed: {
        ...gameState.actionsUsed,
        spendOre: gameState.actionsUsed.spendOre + 1
      },
      actionsRemaining: gameState.actionsRemaining - 1
    });
  };

  // Ore ability initiation handlers
  const startOreMove = () => {
    setOreAbilityMode('move');
    setShowOreMenu(false);
    setOreSelectedCard(null);
  };

  const startOreReturn = () => {
    setOreAbilityMode('return');
    setShowOreMenu(false);
  };

  const startOreConflict = () => {
    setOreAbilityMode('conflict');
    setShowOreMenu(false);
    setOreSelectedCard(null);
  };

  const startOreReharmonize = () => {
    setOreAbilityMode('reharmonize');
    setShowOreMenu(false);
  };

  const startOreSearch = () => {
    setOreAbilityMode('search');
    setShowOreMenu(false);
    setSearchDragonType(null);
    setSearchDestination(null);
  };

  const cancelOreAbility = () => {
    setOreAbilityMode(null);
    setOreSelectedCard(null);
    setSearchDragonType(null);
    setSearchDestination(null);
  };

  // Handle clicking on cards during ore abilities
  const handleOreCardClick = (card: DragonCard, location: 'playerFlow' | 'opponentFlow', columnIndex: number) => {
    if (!oreAbilityMode) return;

    if (oreAbilityMode === 'move') {
      if (!oreSelectedCard) {
        // Select source card from player's flow
        if (location === 'playerFlow') {
          setOreSelectedCard(card.id);
        }
      }
    } else if (oreAbilityMode === 'return') {
      // Click a card in player's flow to return it
      if (location === 'playerFlow') {
        const fromColumn = gameState.board.playerFlow.findIndex(pos => pos.card?.id === card.id);
        if (fromColumn !== -1) {
          handleOreReturn(fromColumn);
          cancelOreAbility();
        }
      }
    } else if (oreAbilityMode === 'conflict') {
      if (!oreSelectedCard) {
        // Select attacker from player's flow
        if (location === 'playerFlow') {
          setOreSelectedCard(card.id);
        }
      } else {
        // Select target (must be opponent's card)
        if (location === 'opponentFlow') {
          const attackerColumnIndex = gameState.board.playerFlow.findIndex(pos => pos.card?.id === oreSelectedCard);
          const attackerCard = gameState.board.playerFlow[attackerColumnIndex]?.card;
          if (attackerCard && COMBAT_RULES[attackerCard.type] === card.type) {
            handleOreConflict(attackerColumnIndex, columnIndex);
            cancelOreAbility();
          }
        }
      }
    } else if (oreAbilityMode === 'reharmonize') {
      // Click a harmonized card in player's flow
      if (location === 'playerFlow') {
        handleOreReharmonize(columnIndex);
        cancelOreAbility();
      }
    }
  };

  // Handle clicking on flow spaces during ore abilities
  const handleOreSpaceClick = (columnIndex: number) => {
    if (!oreAbilityMode) return;

    if (oreAbilityMode === 'move' && oreSelectedCard) {
      // Move selected card to this space
      const fromColumn = gameState.board.playerFlow.findIndex(pos => pos.card?.id === oreSelectedCard);
      if (fromColumn !== -1) {
        handleOreMove(fromColumn, columnIndex);
        cancelOreAbility();
      }
    } else if (oreAbilityMode === 'search' && searchDragonType && searchDestination === 'flow') {
      // Place searched card in this space
      handleOreSearch(searchDragonType, true, columnIndex);
      cancelOreAbility();
    }
  };

  // Harmonization ability handlers
  const handleFireHarmony = (targetColumnIndex: number) => {
    const isPlayer = gameState.currentTurn === 'player1';
    const targetFlow = isPlayer ? gameState.board.opponentFlow : gameState.board.playerFlow;
    const targetCard = targetFlow[targetColumnIndex].card;
    
    if (!targetCard) return;
    
    const newBoard = { ...gameState.board };
    const newTargetFlow = isPlayer ? [...newBoard.opponentFlow] : [...newBoard.playerFlow];
    
    // Destroy the target card
    newBoard.discardPile.push(targetCard);
    newTargetFlow[targetColumnIndex].card = null;
    
    // Clear any blocks created by this card (important for Earth dragons)
    clearBlocksForCard(targetCard.id, newBoard);
    
    // Remove block if the card was blocking this space
    if (newTargetFlow[targetColumnIndex].blockedBy === targetCard.id) {
      newTargetFlow[targetColumnIndex].isBlocked = false;
      newTargetFlow[targetColumnIndex].blockedBy = null;
    }
    
    if (isPlayer) {
      newBoard.opponentFlow = newTargetFlow;
    } else {
      newBoard.playerFlow = newTargetFlow;
    }
    
    syncGameState({
      ...gameState,
      board: newBoard,
      pendingHarmonization: null
    });
    
    setHarmonyAbilityMode(null);
    
    // Process next harmonization in queue
    if (harmonizationQueue.length > 0) {
      setTimeout(() => processHarmonizationQueue(harmonizationQueue), 300);
    }
  };

  const handleWaterHarmony = (firstFlow: 'player' | 'opponent', firstColumn: number, secondFlow: 'player' | 'opponent', secondColumn: number) => {
    const newBoard = { ...gameState.board };
    
    // Get the cards
    const firstCard = firstFlow === 'player' ? newBoard.playerFlow[firstColumn].card : newBoard.opponentFlow[firstColumn].card;
    const secondCard = secondFlow === 'player' ? newBoard.playerFlow[secondColumn].card : newBoard.opponentFlow[secondColumn].card;
    
    if (!firstCard || !secondCard) return;
    
    // Swap the cards
    if (firstFlow === 'player' && secondFlow === 'player') {
      // Both in player flow
      [newBoard.playerFlow[firstColumn].card, newBoard.playerFlow[secondColumn].card] = 
        [newBoard.playerFlow[secondColumn].card, newBoard.playerFlow[firstColumn].card];
    } else if (firstFlow === 'opponent' && secondFlow === 'opponent') {
      // Both in opponent flow
      [newBoard.opponentFlow[firstColumn].card, newBoard.opponentFlow[secondColumn].card] = 
        [newBoard.opponentFlow[secondColumn].card, newBoard.opponentFlow[firstColumn].card];
    } else {
      // One in each flow - swap between flows
      if (firstFlow === 'player') {
        [newBoard.playerFlow[firstColumn].card, newBoard.opponentFlow[secondColumn].card] = 
          [newBoard.opponentFlow[secondColumn].card, newBoard.playerFlow[firstColumn].card];
      } else {
        [newBoard.opponentFlow[firstColumn].card, newBoard.playerFlow[secondColumn].card] = 
          [newBoard.playerFlow[secondColumn].card, newBoard.opponentFlow[firstColumn].card];
      }
    }
    
    // Check for new harmonizations from moved cards
    const newHarmonizations: any[] = [];
    
    // Validate Earth blocks after swap (in case Earth dragon was moved)
    validateEarthBlocks(newBoard);
    
    // Check for win condition after swap
    const checkFlowForWin = (flow: typeof newBoard.playerFlow) => {
      const types = new Set<DragonType>();
      flow.forEach(pos => {
        if (pos.card) {
          types.add(pos.card.type);
        }
      });
      return types.size === 5;
    };
    
    const player1Wins = checkFlowForWin(newBoard.playerFlow);
    const player2Wins = checkFlowForWin(newBoard.opponentFlow);
    
    if (player1Wins || player2Wins) {
      // Someone won via the swap!
      syncGameState({
        ...gameState,
        phase: 'game-over',
        winner: player1Wins ? 'player1' : 'player2',
        board: newBoard,
        pendingHarmonization: null
      });
      
      setHarmonyAbilityMode(null);
      setWaterSelectedCard(null);
      setWaterSelectedCardFlow(null);
      setWaterSelectedCardColumn(null);
      return;
    }
    
    // Check harmonizations at both positions after swap
    if (firstFlow === 'player') {
      newHarmonizations.push(...checkHarmonization(newBoard.playerFlow, firstColumn, secondCard.type, true));
    } else {
      newHarmonizations.push(...checkHarmonization(newBoard.opponentFlow, firstColumn, secondCard.type, false));
    }
    
    if (secondFlow === 'player') {
      newHarmonizations.push(...checkHarmonization(newBoard.playerFlow, secondColumn, firstCard.type, true));
    } else {
      newHarmonizations.push(...checkHarmonization(newBoard.opponentFlow, secondColumn, firstCard.type, false));
    }
    
    syncGameState({
      ...gameState,
      board: newBoard,
      pendingHarmonization: null
    });
    
    setHarmonyAbilityMode(null);
    setWaterSelectedCard(null);
    setWaterSelectedCardFlow(null);
    setWaterSelectedCardColumn(null);
    
    // Process next harmonization in queue, then new harmonizations from the swap
    if (harmonizationQueue.length > 0) {
      setTimeout(() => processHarmonizationQueue(harmonizationQueue), 300);
    } else if (newHarmonizations.length > 0) {
      setTimeout(() => processHarmonizationQueue(newHarmonizations), 300);
    }
  };

  const handleEarthHarmony = (targetColumnIndex: number) => {
    const isPlayer = gameState.currentTurn === 'player1';
    const targetFlow = isPlayer ? gameState.board.opponentFlow : gameState.board.playerFlow;
    
    if (targetFlow[targetColumnIndex].isBlocked || targetFlow[targetColumnIndex].card) return;
    
    // Get the Earth dragon's card ID from pendingHarmonization
    const earthCardId = gameState.pendingHarmonization?.cardId;
    if (!earthCardId) return;
    
    const newBoard = { ...gameState.board };
    const newTargetFlow = isPlayer ? [...newBoard.opponentFlow] : [...newBoard.playerFlow];
    
    // Block the space with the Earth dragon's card ID
    newTargetFlow[targetColumnIndex].isBlocked = true;
    newTargetFlow[targetColumnIndex].blockedBy = earthCardId;
    
    if (isPlayer) {
      newBoard.opponentFlow = newTargetFlow;
    } else {
      newBoard.playerFlow = newTargetFlow;
    }
    
    syncGameState({
      ...gameState,
      board: newBoard,
      pendingHarmonization: null
    });
    
    setHarmonyAbilityMode(null);
    
    // Process next harmonization in queue
    if (harmonizationQueue.length > 0) {
      setTimeout(() => processHarmonizationQueue(harmonizationQueue), 300);
    }
  };

  // Function to clear blocks when Earth dragon is no longer valid
  const clearBlocksForCard = (cardId: string, board: GameBoard) => {
    // Clear any blocks created by this card
    board.playerFlow.forEach(pos => {
      if (pos.blockedBy === cardId) {
        pos.isBlocked = false;
        pos.blockedBy = null;
      }
    });
    board.opponentFlow.forEach(pos => {
      if (pos.blockedBy === cardId) {
        pos.isBlocked = false;
        pos.blockedBy = null;
      }
    });
  };

  // Function to validate all Earth dragon blocks
  const validateEarthBlocks = (board: GameBoard) => {
    // Check all blocks and verify the Earth dragon is still harmonized
    const validateFlow = (flow: typeof board.playerFlow, opponentFlow: typeof board.opponentFlow) => {
      flow.forEach((pos, index) => {
        if (pos.card && pos.card.type === 'earth') {
          const earthCardId = pos.card.id;
          
          // Check if Earth dragon is harmonized (has Fire dragon to its left)
          const isHarmonized = index > 0 && 
                               flow[index - 1].card && 
                               HARMONIZATION_RULES['earth'] === flow[index - 1].card.type;
          
          if (!isHarmonized) {
            // Earth is not harmonized, clear any blocks it created
            clearBlocksForCard(earthCardId, board);
          }
        }
      });
    };
    
    validateFlow(board.playerFlow, board.opponentFlow);
    validateFlow(board.opponentFlow, board.playerFlow);
  };

  // Show loading while waiting for game state (player2)
  if (!gameState) {
    return (
      <div className="dragonflow-game">
        <div className="dragonflow-game-background">
          <div className="dragon-particles"></div>
          <div className="flame-waves"></div>
        </div>
        <div className="dragonflow-rps-modal">
          <div className="dragonflow-rps-content">
            <h2>Waiting for game to start...</h2>
            <p>Connecting to opponent...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dragonflow-game">
      {/* Background */}
      <div className="dragonflow-game-background">
        <div className="dragon-particles"></div>
        <div className="flame-waves"></div>
      </div>

      {/* Back Button */}
      <button className="game-back-btn" onClick={handleBackToLobby}>
        ← Back to Lobby
      </button>

      {/* Choose Starter Phase */}
      {gameState.phase === 'choose-starter' && gameState.choosingPlayer === playerRole && (
        <div className="dragonflow-rps-modal">
          <div className="dragonflow-rps-content">
            <h2>Choose Turn Order</h2>
            <p>Do you want to go first or second?</p>
            <div className="starter-choices">
              <button onClick={() => handleStarterChoice(true)} className="starter-btn">
                Go First
              </button>
              <button onClick={() => handleStarterChoice(false)} className="starter-btn">
                Go Second
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState.phase === 'choose-starter' && gameState.choosingPlayer !== playerRole && (
        <div className="dragonflow-rps-modal">
          <div className="dragonflow-rps-content">
            <h2>Waiting...</h2>
            <p>Opponent is choosing who goes first...</p>
          </div>
        </div>
      )}

      {/* Game Over Phase */}
      {gameState.phase === 'game-over' && (
        <div className="dragonflow-game-over-modal">
          <div className="dragonflow-game-over-content">
            <h2>{gameState.winner === playerRole ? '🎉 Victory! 🎉' : '💔 Defeat 💔'}</h2>
            <p className="winner-announcement">
              {gameState.winner === 'player1' ? username : opponent.username} completed the Flow with all 5 Dragon Types!
            </p>
            <p className="game-over-message">
              {gameState.winner === playerRole ? 'You have mastered the harmony of dragons!' : 'Better luck next time!'}
            </p>
            <button onClick={handleBackToLobby} className="game-over-ok-btn">
              OK
            </button>
          </div>
        </div>
      )}

      {/* Main Game Board */}
      {gameState.phase === 'playing' && (
        <div className="game-board-container">
          {/* Left Sidebar */}
          <div className="left-sidebar">
            <div className={`turn-info ${isMyTurn() ? 'your-turn' : 'opponent-turn'}`}>
              <h3>{isMyTurn() ? '✨ Your Turn' : "⏳ Opponent's Turn"}</h3>
              <p>Actions: {gameState.actionsRemaining}/3</p>
              {!isMyTurn() && (
                <p className="waiting-message">Waiting for opponent...</p>
              )}
            </div>

            {/* Action Menu */}
            {isMyTurn() && !gameState.pendingHarmonization && (
              <div className="action-menu">
                <h4>Actions</h4>
                <button 
                  disabled={gameState.actionsUsed.summon >= 2 || gameState.actionsRemaining === 0}
                  className={`action-btn ${summonMode ? 'active' : ''}`}
                  onClick={handleSummonAction}
                >
                  Summon ({gameState.actionsUsed.summon}/2)
                </button>
                <button 
                  disabled={gameState.actionsUsed.attack >= 2 || gameState.actionsRemaining === 0}
                  className={`action-btn ${attackMode ? 'active' : ''}`}
                  onClick={handleAttackAction}
                >
                  Attack ({gameState.actionsUsed.attack}/2)
                </button>
                <button 
                  disabled={gameState.actionsUsed.draw >= 2 || gameState.actionsRemaining === 0}
                  className="action-btn"
                  onClick={handleDrawAction}
                >
                  Draw ({gameState.actionsUsed.draw}/2)
                </button>
                <button 
                  disabled={gameState.actionsUsed.gainOre >= 2 || gameState.actionsRemaining === 0}
                  className="action-btn"
                  onClick={handleGainOreAction}
                >
                  Gain Ore ({gameState.actionsUsed.gainOre}/2)
                </button>
                <button 
                  disabled={gameState.actionsUsed.spendOre >= 2 || gameState.actionsRemaining === 0}
                  className="action-btn"
                  onClick={handleSpendOreAction}
                >
                  Spend Ore ({gameState.actionsUsed.spendOre}/2)
                </button>
              </div>
            )}

            {/* Ore Spending Menu */}
            {showOreMenu && (
              <div className="ore-menu">
                <h4>Spend Ore</h4>
                <p className="current-ore">Available: {getMyOre()} ⚙️</p>
                <div className="ore-options">
                  <button 
                    className="ore-option-btn"
                    disabled={getMyOre() < 1}
                    onClick={() => handleOreAbilitySelect('move', 1)}
                  >
                    <span className="ore-cost">1 ⚙️</span>
                    <span>Move Dragon</span>
                  </button>
                  <button 
                    className="ore-option-btn"
                    disabled={getMyOre() < 1}
                    onClick={() => handleOreAbilitySelect('return', 1)}
                  >
                    <span className="ore-cost">1 ⚙️</span>
                    <span>Return to Hand</span>
                  </button>
                  <button 
                    className="ore-option-btn"
                    disabled={getMyOre() < 2}
                    onClick={() => handleOreAbilitySelect('conflict', 2)}
                  >
                    <span className="ore-cost">2 ⚙️</span>
                    <span>Attack Anywhere</span>
                  </button>
                  <button 
                    className="ore-option-btn"
                    disabled={getMyOre() < 3}
                    onClick={() => handleOreAbilitySelect('reharmonize', 3)}
                  >
                    <span className="ore-cost">3 ⚙️</span>
                    <span>Re-Harmonize</span>
                  </button>
                  <button 
                    className="ore-option-btn"
                    disabled={getMyOre() < 4}
                    onClick={() => handleOreAbilitySelect('search', 4)}
                  >
                    <span className="ore-cost">4 ⚙️</span>
                    <span>Search Deck</span>
                  </button>
                </div>
                <button className="ore-cancel-btn" onClick={() => setShowOreMenu(false)}>
                  Cancel
                </button>
              </div>
            )}

            {/* Harmonization Prompt */}
            {gameState.pendingHarmonization && !harmonyAbilityMode && gameState.pendingHarmonization.owner === playerRole && (
              <div className="harmonization-prompt">
                <h4>Harmonization!</h4>
                <p>{gameState.pendingHarmonization.dragonType.toUpperCase()} Dragon was harmonized</p>
                <p className="harmony-effect">{gameState.pendingHarmonization.effect}</p>
                <div className="harmony-buttons">
                  <button className="use-ability-btn" onClick={handleUseAbility}>Use Ability</button>
                  <button className="skip-ability-btn" onClick={handleSkipAbility}>Skip</button>
                </div>
              </div>
            )}

            {/* Harmonization Ability Prompts */}
            {harmonyAbilityMode === 'fire' && (
              <div className="harmonization-prompt">
                <h4>🔥 Fire Harmonization</h4>
                <p>Click an enemy dragon to destroy it</p>
                <button 
                  className="skip-ability-btn" 
                  onClick={() => {
                    setHarmonyAbilityMode(null);
                    setGameState({ ...gameState, pendingHarmonization: null });
                    if (harmonizationQueue.length > 0) {
                      setTimeout(() => processHarmonizationQueue(harmonizationQueue), 300);
                    }
                  }}
                >
                  Skip
                </button>
              </div>
            )}
            {harmonyAbilityMode === 'water' && !waterSelectedCard && (
              <div className="harmonization-prompt">
                <h4>💧 Water Harmonization</h4>
                <p>Click the first dragon to swap</p>
                <button 
                  className="skip-ability-btn" 
                  onClick={() => {
                    setHarmonyAbilityMode(null);
                    setWaterSelectedCard(null);
                    setGameState({ ...gameState, pendingHarmonization: null });
                    if (harmonizationQueue.length > 0) {
                      setTimeout(() => processHarmonizationQueue(harmonizationQueue), 300);
                    }
                  }}
                >
                  Skip
                </button>
              </div>
            )}
            {harmonyAbilityMode === 'water' && waterSelectedCard && (
              <div className="harmonization-prompt">
                <h4>💧 Water Harmonization</h4>
                <p>Click the second dragon to swap with the selected dragon</p>
                <button 
                  className="skip-ability-btn" 
                  onClick={() => {
                    setHarmonyAbilityMode(null);
                    setWaterSelectedCard(null);
                    setGameState({ ...gameState, pendingHarmonization: null });
                    if (harmonizationQueue.length > 0) {
                      setTimeout(() => processHarmonizationQueue(harmonizationQueue), 300);
                    }
                  }}
                >
                  Skip
                </button>
              </div>
            )}
            {harmonyAbilityMode === 'earth' && (
              <div className="harmonization-prompt">
                <h4>🪨 Earth Harmonization</h4>
                <p>Click an empty enemy space to block it with a rock</p>
                <button 
                  className="skip-ability-btn" 
                  onClick={() => {
                    setHarmonyAbilityMode(null);
                    setGameState({ ...gameState, pendingHarmonization: null });
                    if (harmonizationQueue.length > 0) {
                      setTimeout(() => processHarmonizationQueue(harmonizationQueue), 300);
                    }
                  }}
                >
                  Skip
                </button>
              </div>
            )}

            {/* Ore Ability Prompts */}
            {oreAbilityMode === 'move' && !oreSelectedCard && (
              <div className="ore-ability-prompt">
                <h4>Move Dragon (1 ⚙️)</h4>
                <p>Click a dragon in your flow to select it</p>
                <button className="ore-cancel-btn" onClick={cancelOreAbility}>Cancel</button>
              </div>
            )}
            {oreAbilityMode === 'move' && oreSelectedCard && (
              <div className="ore-ability-prompt">
                <h4>Move Dragon (1 ⚙️)</h4>
                <p>Click an empty space to move the dragon</p>
                <button className="ore-cancel-btn" onClick={cancelOreAbility}>Cancel</button>
              </div>
            )}
            {oreAbilityMode === 'return' && (
              <div className="ore-ability-prompt">
                <h4>Return to Hand (1 ⚙️)</h4>
                <p>Click a dragon in your flow to return it to your hand</p>
                <button className="ore-cancel-btn" onClick={cancelOreAbility}>Cancel</button>
              </div>
            )}
            {oreAbilityMode === 'conflict' && !oreSelectedCard && (
              <div className="ore-ability-prompt">
                <h4>Attack Anywhere (2 ⚙️)</h4>
                <p>Click your attacker dragon</p>
                <button className="ore-cancel-btn" onClick={cancelOreAbility}>Cancel</button>
              </div>
            )}
            {oreAbilityMode === 'conflict' && oreSelectedCard && (
              <div className="ore-ability-prompt">
                <h4>Attack Anywhere (2 ⚙️)</h4>
                <p>Click an enemy dragon to attack</p>
                <button className="ore-cancel-btn" onClick={cancelOreAbility}>Cancel</button>
              </div>
            )}
            {oreAbilityMode === 'reharmonize' && (
              <div className="ore-ability-prompt">
                <h4>Re-Harmonize (3 ⚙️)</h4>
                <p>Click a harmonized dragon to re-trigger its ability</p>
                <button className="ore-cancel-btn" onClick={cancelOreAbility}>Cancel</button>
              </div>
            )}
            {oreAbilityMode === 'search' && !searchDragonType && (
              <div className="ore-ability-prompt">
                <h4>Search Deck (4 ⚙️)</h4>
                <p>Select a dragon type:</p>
                <div className="dragon-type-selection">
                  {(['fire', 'water', 'earth', 'wood', 'metal'] as DragonType[]).map(type => (
                    <button 
                      key={type}
                      className="dragon-type-btn"
                      onClick={() => setSearchDragonType(type)}
                    >
                      <img src={`/dragonflow/${type}.jpg`} alt={type} />
                      {type.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button className="ore-cancel-btn" onClick={cancelOreAbility}>Cancel</button>
              </div>
            )}
            {oreAbilityMode === 'search' && searchDragonType && !searchDestination && (
              <div className="ore-ability-prompt">
                <h4>Search Deck (4 ⚙️)</h4>
                <p>Where to place {searchDragonType.toUpperCase()} dragon?</p>
                <div className="destination-selection">
                  <button 
                    className="destination-btn"
                    onClick={() => {
                      handleOreSearch(searchDragonType!, false);
                      cancelOreAbility();
                    }}
                  >
                    To Hand
                  </button>
                  <button 
                    className="destination-btn"
                    onClick={() => setSearchDestination('flow')}
                  >
                    To Flow
                  </button>
                </div>
                <button className="ore-cancel-btn" onClick={cancelOreAbility}>Cancel</button>
              </div>
            )}
            {oreAbilityMode === 'search' && searchDragonType && searchDestination === 'flow' && (
              <div className="ore-ability-prompt">
                <h4>Search Deck (4 ⚙️)</h4>
                <p>Click an empty space to place the dragon</p>
                <button className="ore-cancel-btn" onClick={cancelOreAbility}>Cancel</button>
              </div>
            )}

            <button 
              onClick={handleEndTurn}
              disabled={!isMyTurn() || gameState.pendingHarmonization !== null}
              className="end-turn-btn"
            >
              End Turn
            </button>
          </div>

          {/* Main Board */}
          <div className="main-board">
            {/* Opponent Ore */}
            <div className="ore-display opponent-ore">
              <img src="/dragonflow/ore.png" alt="Ore" className="ore-icon" />
              <span className="ore-count">{getOpponentOre()}</span>
            </div>

            {/* Opponent Hand */}
            <div className="opponent-hand">
              {getOpponentHand().map((card) => (
                <div key={card.id} className="card-back">
                  <img src={`/dragonflow/cardback.png`} alt="Card Back" />
                </div>
              ))}
            </div>

            {/* Opponent Flow */}
            <div className="flow opponent-flow">
              {getOpponentFlow().map((position, index) => (
                <div 
                  key={index} 
                  className={`flow-space ${position.isBlocked ? 'blocked' : ''} ${oreAbilityMode === 'conflict' && oreSelectedCard && position.card ? 'attackable' : ''} ${harmonyAbilityMode === 'earth' && !position.card && !position.isBlocked ? 'summonable' : ''}`}
                  onClick={() => {
                    if (harmonyAbilityMode === 'earth' && !position.card && !position.isBlocked) {
                      handleEarthHarmony(index);
                    }
                  }}
                >
                  {position.card && (
                    <div 
                      className={`dragon-card ${oreAbilityMode === 'conflict' && oreSelectedCard && position.card ? 'targetable' : ''} ${harmonyAbilityMode === 'fire' && position.card ? 'targetable' : ''} ${harmonyAbilityMode === 'water' && position.card ? (waterSelectedCard === position.card.id ? 'selected' : 'targetable') : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (harmonyAbilityMode === 'fire' && position.card) {
                          handleFireHarmony(index);
                        } else if (harmonyAbilityMode === 'water' && position.card) {
                          if (!waterSelectedCard) {
                            setWaterSelectedCard(position.card.id);
                            setWaterSelectedCardFlow('opponent');
                            setWaterSelectedCardColumn(index);
                          } else {
                            handleWaterHarmony(waterSelectedCardFlow!, waterSelectedCardColumn!, 'opponent', index);
                          }
                        } else if (position.card) {
                          handleOreCardClick(position.card, 'opponentFlow', index);
                        }
                      }}
                    >
                      <img 
                        src={`/dragonflow/${position.card.type}.jpg`} 
                        alt={position.card.type}
                      />
                    </div>
                  )}
                  {position.isBlocked && (
                    <div className="block-indicator">🪨</div>
                  )}
                </div>
              ))}
            </div>

            {/* Player Flow */}
            <div className="flow player-flow">
              {getMyFlow().map((position, index) => (
                <div 
                  key={index} 
                  className={`flow-space ${position.isBlocked ? 'blocked' : ''} ${summonMode && !position.card && !position.isBlocked ? 'summonable' : ''} ${attackMode && position.card ? 'attackable' : ''} ${(oreAbilityMode === 'move' || oreAbilityMode === 'search') && oreSelectedCard && !position.card && !position.isBlocked ? 'summonable' : ''} ${(oreAbilityMode === 'return' || oreAbilityMode === 'reharmonize' || (oreAbilityMode === 'move' && !oreSelectedCard) || (oreAbilityMode === 'conflict' && !oreSelectedCard)) && position.card ? 'selectable' : ''}`}
                  onClick={() => {
                    if (summonMode) {
                      handleFlowSpaceClick(index);
                    } else if (attackMode) {
                      handleAttackerSelect(index);
                    } else if ((oreAbilityMode === 'move' || oreAbilityMode === 'search') && oreSelectedCard) {
                      handleOreSpaceClick(index);
                    }
                  }}
                >
                  {position.card && (
                    <div 
                      className={`dragon-card ${oreSelectedCard === position.card.id ? 'selected' : ''} ${harmonyAbilityMode === 'water' && position.card ? (waterSelectedCard === position.card.id ? 'selected' : 'targetable') : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (harmonyAbilityMode === 'water' && position.card) {
                          if (!waterSelectedCard) {
                            setWaterSelectedCard(position.card.id);
                            setWaterSelectedCardFlow('player');
                            setWaterSelectedCardColumn(index);
                          } else {
                            handleWaterHarmony(waterSelectedCardFlow!, waterSelectedCardColumn!, 'player', index);
                          }
                        } else if (position.card) {
                          handleOreCardClick(position.card, 'playerFlow', index);
                        }
                      }}
                    >
                      <img 
                        src={`/dragonflow/${position.card.type}.jpg`} 
                        alt={position.card.type}
                      />
                    </div>
                  )}
                  {position.isBlocked && (
                    <div className="block-indicator">🪨</div>
                  )}
                </div>
              ))}
            </div>

            {/* Player Hand */}
            <div className={`player-hand ${getMyHand().length > 5 ? 'over-limit' : ''}`}>
              {getMyHand().length > 5 && (
                <div className="hand-limit-warning">
                  ⚠️ Hand limit exceeded! ({getMyHand().length}/5) - Discard down to 5 at end of turn
                </div>
              )}
              {getMyHand().map((card, index) => (
                <div 
                  key={card.id} 
                  className={`dragon-card ${gameState.selectedCard === card.id ? 'selected' : ''} ${index >= 5 ? 'will-discard' : ''} ${draggedCardIndex === index ? 'dragging' : ''}`}
                  onClick={() => handleCardSelect(card.id)}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  <img 
                    src={`/dragonflow/${card.type}.jpg`} 
                    alt={card.type}
                  />
                  {index >= 5 && <div className="discard-overlay">Will Discard</div>}
                </div>
              ))}
            </div>

            {/* Player Ore */}
            <div className="ore-display player-ore">
              <img src="/dragonflow/ore.png" alt="Ore" className="ore-icon" />
              <span className="ore-count">{getMyOre()}</span>
            </div>
          </div>

          {/* Right Side - Deck & Harmonization Reference */}
          <div className="right-sidebar">
            <div className="deck-area">
              <div className="deck-pile">
                <p>Deck: {gameState.board.deck.length}</p>
                <div className="deck-visual">
                  <img src={`/dragonflow/cardback.png`} alt="Deck" />
                </div>
              </div>
            </div>

            <div className="harmonization-reference">
              <img 
                src={`/dragonflow/harmonization.jpg`} 
                alt="Harmonization Reference"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DragonflowGame;






