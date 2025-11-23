const { v4: uuidv4 } = require('uuid');
const { 
  rollDice, 
  shuffleArray, 
  weightedShuffle,
  calculateDamage, 
  calculateAttackRoll, 
  rollDiceString,
  applyStatusEffect,
  hasSpecialEffect,
  processEndOfTurn,
  calculateEffectiveDefense
} = require('./utils');

class GameManager {
  constructor(heroes, database = null) {
    this.allHeroes = heroes; // Keep all heroes for reference
    this.heroes = heroes.filter(hero => !hero.disabled); // Only enabled heroes for gameplay
    this.games = new Map();
    this.playerGameMap = new Map(); // playerId -> gameId
    this.survivalStates = new Map(); // playerId -> survivalState (wins, losses, usedHeroes)
    this.gauntletRuns = new Map(); // playerId -> gauntletRun state
    this.gauntletQueues = new Map(); // bracket -> array of players waiting
    this.draftQueue = []; // Array of players waiting for draft/random mode
    this.survivalQueue = []; // Array of players waiting for survival mode
    this.database = database; // Database instance for victory points
    this.userSessions = new Map(); // playerId -> userId mapping for database operations
    
    console.log(`Loaded ${this.allHeroes.length} total heroes, ${this.heroes.length} enabled for gameplay`);
  }

  // Helper function to reset a hero to its original pristine state
  resetHeroToOriginalState(hero) {
    // Create a deep copy of the original hero to avoid any reference issues
    const resetHero = JSON.parse(JSON.stringify(hero));
    
    // Reset HP to maximum
    resetHero.currentHP = typeof resetHero.HP === 'string' ? parseInt(resetHero.HP) : resetHero.HP;
    resetHero.maxHP = resetHero.currentHP;
    
    // Clear all status effects
    resetHero.statusEffects = {
      poison: 0,
      taunt: null,
      inspiration: 0,
      silenced: false,
      untargetable: false,
      statModifiers: {},
      statModifierDurations: {},
      statModifierCasters: {},
      statModifierUnits: {},
      grantAdvantage: null,
      rideDownDebuff: null,
      beast_active: false,
      totem_count: 0,
      turret_count: 0,
      med_bot_count: 0
    };
    
    // Clear all passive buffs and modified display stats
    resetHero.passiveBuffs = [];
    resetHero.modifiedAccuracy = resetHero.Accuracy;
    resetHero.modifiedBasicAttack = resetHero.BasicAttack;
    resetHero.modifiedDefense = resetHero.Defense !== undefined ? resetHero.Defense : resetHero.AC;
    
    // Clear scaling buffs (Champion's Last Stand, etc.)
    delete resetHero.scalingBuffs;
    
    // Clear conditional effects and buffs
    delete resetHero.conditionalEffects;
    delete resetHero.conditionalBuffs;
    
    // Clear permanent modifications (Dragon Rider's Dismount, etc.)
    delete resetHero.permanentBuffs;
    delete resetHero.permanentDisables;
    
    // Reset companions/summons
    resetHero.companions = [];
    
    // Clear any battle-specific flags
    delete resetHero.diedFromBomberExplosion;
    delete resetHero.diedFromCounterAttack;
    delete resetHero.untargetableAttacker;
    delete resetHero.untargetableUntil;
    delete resetHero.untargetableDuration;
    
    console.log(`🔄 Reset ${resetHero.name} to pristine state: ${resetHero.currentHP}/${resetHero.HP} HP, cleared all effects`);
    
    return resetHero;
  }

  // Centralized initiative rolling with automatic reroll on ties
  rollInitiativeWithReroll(game) {
    let player1Roll = rollDice(20);
    let player2Roll = rollDice(20);
    let rerollCount = 0;
    
    // Keep rerolling while tied (max 10 attempts to prevent infinite loop)
    while (player1Roll === player2Roll && rerollCount < 10) {
      console.log(`🎲 Initiative tie! (${player1Roll} vs ${player2Roll}) Rerolling...`);
      player1Roll = rollDice(20);
      player2Roll = rollDice(20);
      rerollCount++;
    }
    
    // Store the final rolls
    game.players[0].initiativeRoll = player1Roll;
    game.players[1].initiativeRoll = player2Roll;
    
    console.log(`🎲 Final initiative rolls after ${rerollCount} reroll(s): Player 1: ${player1Roll}, Player 2: ${player2Roll}`);
    
    // Determine winner
    const winner = player1Roll > player2Roll ? game.players[0] : game.players[1];
    
    return {
      rolls: { player1: player1Roll, player2: player2Roll },
      winner: winner.id,
      needsChoice: true
    };
  }

  addPlayer(playerId, playerName, mode = 'draft', profileIcon = 'Sorcerer') {
    console.log(`🔍 Player ${playerName} joining ${mode} queue...`);
    
    // Check if already in queue
    if (this.draftQueue.some(p => p.playerId === playerId)) {
      console.log(`⚠️ Player ${playerId} already in draft queue`);
      return { success: false, error: 'Already in queue' };
    }

    // Check if there's someone waiting in the queue
    if (this.draftQueue.length > 0) {
      // Match with the first player in queue
      const opponent = this.draftQueue.shift();
      console.log(`✅ Matched ${playerName} with ${opponent.playerName} from queue!`);
      
      // Create a new game with both players
      const gameId = uuidv4();
      const game = this.createNewGame(gameId, mode);
      this.games.set(gameId, game);
      
      // Add both players to the game
      const player1 = {
        id: opponent.playerId,
        name: opponent.playerName,
        connected: true,
        team: [],
        draftCards: [],
        bannedCard: null,
        attackOrder: [],
        currentHeroIndex: 0,
        hasUsedAttack: false,
        hasUsedAbility: false,
        usedAbilities: [],
        selectedTarget: null,
        twinSpellUsed: false,
        oneTwoPunchUsed: false,
        monkAttacksRemaining: 1,
        oneTwoPunchAttacksRemaining: 0,
        profile_icon: opponent.profileIcon,
        monkDeflectUsed: false
      };
      
      const player2 = {
        id: playerId,
        name: playerName,
        connected: true,
        team: [],
        draftCards: [],
        bannedCard: null,
        attackOrder: [],
        currentHeroIndex: 0,
        hasUsedAttack: false,
        hasUsedAbility: false,
        usedAbilities: [],
        selectedTarget: null,
        twinSpellUsed: false,
        oneTwoPunchUsed: false,
        monkAttacksRemaining: 1,
        oneTwoPunchAttacksRemaining: 0,
        profile_icon: profileIcon,
        monkDeflectUsed: false
      };
      
      game.players.push(player1, player2);
      this.playerGameMap.set(opponent.playerId, gameId);
      this.playerGameMap.set(playerId, gameId);
      
      // Start draft phase immediately
      if (mode === 'draft') {
        this.startDraftPhase(game);
      }
      
      return {
        success: true,
        gameId,
        playerId,
        players: game.players.map(p => ({ id: p.id, name: p.name })),
        gameReady: true,
        draftCards: mode === 'draft' ? game.draftCards : null,
        mode
      };
    } else {
      // No one in queue, add this player to queue
      this.draftQueue.push({ playerId, playerName, mode, profileIcon });
      console.log(`⏳ ${playerName} added to ${mode} queue (waiting for opponent). Queue size: ${this.draftQueue.length}`);
      
      return {
        success: true,
        gameId: null,
        playerId,
        players: [],
        gameReady: false,
        waiting: true,
        mode
      };
    }
  }

  addPlayerToGame(gameId, playerId, playerName) {
    const game = this.games.get(gameId);
    
    if (!game) {
      return {
        success: false,
        error: 'Game not found'
      };
    }

    if (game.players.length >= 2) {
      return {
        success: false,
        error: 'Game is full'
      };
    }

    if (game.phase !== 'waiting') {
      return {
        success: false,
        error: 'Game has already started'
      };
    }

    // Add player to game
    const player = {
      id: playerId,
      name: playerName,
      connected: true,
      team: [],
      draftCards: [],
      bannedCard: null,
      attackOrder: [],
      currentHeroIndex: 0,
      hasUsedAttack: false,
      hasUsedAbility: false,
      usedAbilities: [],
      selectedTarget: null,
      twinSpellUsed: false,
      oneTwoPunchUsed: false,
      monkAttacksRemaining: 1, // Monk starts with 1 attack, ability grants +1 more (max 2 total)
      oneTwoPunchAttacksRemaining: 0, // Legacy field kept for compatibility
      monkDeflectUsed: false
    };

    game.players.push(player);
    this.playerGameMap.set(playerId, gameId);

    const gameReady = game.players.length === 2;
    if (gameReady && game.mode === 'draft') {
      this.startDraftPhase(game);
    }

    return {
      success: true,
      gameId,
      playerId,
      players: game.players.map(p => ({ id: p.id, name: p.name })),
      gameReady,
      draftCards: gameReady && game.mode === 'draft' ? game.draftCards : null,
      mode: game.mode
    };
  }

  createNewGame(gameId, mode = 'draft') {
    return {
      id: gameId,
      mode: mode, // 'draft' or 'random'
      phase: 'waiting', // waiting, draft, battle, ended
      players: [],
      spectators: [], // Array of { socketId, username, spectatingPlayerId }
      draftCards: null,
      currentDraftPhase: 0, // 0: ban, 1-3: pick rounds
      draftTurn: 0, // whose turn to draft
      currentTurn: 0, // whose turn in battle
      currentHeroTurn: 0, // which hero is acting
      winner: null,
      createdAt: Date.now(),
      roomName: null, // For friendly battles
      disconnectionTimers: new Map() // playerId -> { startTime, timeoutId, surrendered }
    };
  }

  // Survival mode methods
  addSurvivalPlayer(playerId, playerName, selectedTeam, profileIcon = 'Sorcerer') {
    console.log(`🔍 Player ${playerName} joining survival queue...`);
    
    // Check if already in queue
    if (this.survivalQueue.some(p => p.playerId === playerId)) {
      console.log(`⚠️ Player ${playerId} already in survival queue`);
      return { success: false, error: 'Already in queue' };
    }

    // Check if there's someone waiting in the queue
    if (this.survivalQueue.length > 0) {
      // Match with the first player in queue
      const opponent = this.survivalQueue.shift();
      console.log(`✅ Matched ${playerName} with ${opponent.playerName} from survival queue!`);
      
      // Create a new game with both players
      const gameId = uuidv4();
      const game = this.createNewGame(gameId, 'survival');
      this.games.set(gameId, game);
      
      // Reset and prepare teams for both players
      const player1Team = opponent.selectedTeam.map(hero => this.resetHeroToOriginalState(hero));
      const player2Team = selectedTeam.map(hero => this.resetHeroToOriginalState(hero));
      
      // Create both players
      const player1 = {
        id: opponent.playerId,
        name: opponent.playerName,
        connected: true,
        team: player1Team,
        draftCards: [],
        bannedCard: null,
        attackOrder: player1Team.map(h => h.name),
        currentHeroIndex: 0,
        hasUsedAttack: false,
        hasUsedAbility: false,
        usedAbilities: [],
        selectedTarget: null,
        twinSpellUsed: false,
        oneTwoPunchUsed: false,
        monkAttacksRemaining: 1,
        oneTwoPunchAttacksRemaining: 0,
        monkDeflectUsed: false,
        isSurvivalPlayer: true,
        profile_icon: opponent.profileIcon
      };
      
      const player2 = {
        id: playerId,
        name: playerName,
        connected: true,
        team: player2Team,
        draftCards: [],
        bannedCard: null,
        attackOrder: player2Team.map(h => h.name),
        currentHeroIndex: 0,
        hasUsedAttack: false,
        hasUsedAbility: false,
        usedAbilities: [],
        selectedTarget: null,
        twinSpellUsed: false,
        oneTwoPunchUsed: false,
        monkAttacksRemaining: 1,
        oneTwoPunchAttacksRemaining: 0,
        monkDeflectUsed: false,
        isSurvivalPlayer: true,
        profile_icon: profileIcon
      };
      
      game.players.push(player1, player2);
      this.playerGameMap.set(opponent.playerId, gameId);
      this.playerGameMap.set(playerId, gameId);
      
      console.log(`🏟️ Survival game created with both players ready`);
      console.log(`   - ${player1.name}: ${player1.team.map(h => h.name).join(', ')}`);
      console.log(`   - ${player2.name}: ${player2.team.map(h => h.name).join(', ')}`);
      
      return {
        success: true,
        gameId,
        playerId,
        players: game.players.map(p => ({ id: p.id, name: p.name })),
        gameReady: true,
        mode: 'survival'
      };
    } else {
      // No one in queue, add this player to queue
      this.survivalQueue.push({ playerId, playerName, selectedTeam, profileIcon });
      console.log(`⏳ ${playerName} added to survival queue (waiting for opponent). Queue size: ${this.survivalQueue.length}`);
      
      return {
        success: true,
        gameId: null,
        playerId,
        players: [],
        gameReady: false,
        waiting: true,
        mode: 'survival'
      };
    }
  }

  startSurvivalBattle(gameId) {
    const game = this.games.get(gameId);
    if (!game || game.players.length !== 2) {
      return { success: false, message: 'Game not ready' };
    }

    // Set up the game for immediate battle (skip draft phase)
    game.phase = 'initiative';
    
    // Make sure both players have their teams set up
    game.players.forEach(player => {
      if (player.team.length === 0) {
        // This shouldn't happen for survival players, but fallback to random team
        console.warn(`⚠️ Survival player ${player.name} has no team, assigning random team`);
        const randomTeam = this.getRandomTeam(3);
        player.team = randomTeam.map(hero => this.resetHeroToOriginalState(hero));
        player.attackOrder = player.team.map(h => h.name);
      }
      
      // Ensure all team heroes have proper setup for battle
      player.team.forEach(hero => {
        hero.currentHP = hero.currentHP || (typeof hero.HP === 'string' ? parseInt(hero.HP) : hero.HP);
        hero.maxHP = hero.currentHP;
      });
      
      console.log(`✅ Player ${player.name} team ready: ${player.team.map(h => h.name).join(', ')}`);
    });

    // Auto-roll initiative for both players using centralized function
    const initiativeData = this.rollInitiativeWithReroll(game);

    game.currentTurn = 0; // Will be set properly when turn order is chosen

    console.log(`🥊 Starting survival battle in game ${gameId}`);
    console.log(`Player 1 (${game.players[0].name}): ${game.players[0].team.map(h => h.name).join(', ')}`);
    console.log(`Player 2 (${game.players[1].name}): ${game.players[1].team.map(h => h.name).join(', ')}`);

    return {
      success: true,
      players: game.players,
      gameState: {
        id: gameId,
        phase: 'initiative',
        players: game.players,
        currentTurn: 0,
        currentHeroTurn: 0,
        activeHero: null,
        currentDraftPhase: 3, // Skip draft phases
        draftTurn: 0,
        winner: null
      },
      initiative: initiativeData
    };
  }

  cancelSurvivalSearch(playerId) {
    // Check if player is in queue
    const queueIndex = this.survivalQueue.findIndex(p => p.playerId === playerId);
    if (queueIndex !== -1) {
      this.survivalQueue.splice(queueIndex, 1);
      console.log(`❌ Player ${playerId} removed from survival queue`);
      return { success: true };
    }
    
    // Check if player is in a game
    const gameId = this.playerGameMap.get(playerId);
    if (!gameId) {
      return { success: false, message: 'No active search found' };
    }

    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    // Remove player from game
    game.players = game.players.filter(p => p.id !== playerId);
    this.playerGameMap.delete(playerId);

    // If no players left, delete the game
    if (game.players.length === 0) {
      this.games.delete(gameId);
    }

    console.log(`❌ Player ${playerId} cancelled survival search`);
    return { success: true };
  }

  cancelSearch(playerId) {
    // Check if player is in queue
    const queueIndex = this.draftQueue.findIndex(p => p.playerId === playerId);
    if (queueIndex !== -1) {
      this.draftQueue.splice(queueIndex, 1);
      console.log(`❌ Player ${playerId} removed from draft queue`);
      return { success: true };
    }
    
    // Check if player is in a game
    const gameId = this.playerGameMap.get(playerId);
    if (!gameId) {
      return { success: false, message: 'No active search found' };
    }

    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    // Only allow cancellation if game is still in waiting phase
    if (game.phase !== 'waiting') {
      return { success: false, message: 'Cannot cancel search - game already started' };
    }

    // Remove player from game
    game.players = game.players.filter(p => p.id !== playerId);
    this.playerGameMap.delete(playerId);

    // If no players left, delete the game
    if (game.players.length === 0) {
      this.games.delete(gameId);
    }

    console.log(`❌ Player ${playerId} cancelled ${game.mode} search`);
    return { success: true };
  }

  getRandomTeam(size = 3) {
    const availableHeroes = [...this.heroes];
    const shuffled = shuffleArray(availableHeroes);
    return shuffled.slice(0, size);
  }

  startDraftPhase(game) {
    game.phase = 'draft';
    game.currentDraftPhase = 0; // Ensure ban phase starts at 0
    game.draftTurn = 0;
    
    // Force include Paladin and Druid for testing
    const paladin = this.heroes.find(h => h.name === 'Paladin');
    const druid = this.heroes.find(h => h.name === 'Druid');
    const otherHeroes = this.heroes.filter(h => h.name !== 'Paladin' && h.name !== 'Druid');
    
    // Give each player 5 heroes with at least one of Paladin/Druid each
    const shuffledOtherHeroes = shuffleArray([...otherHeroes]);
    
    // Ensure we have enough heroes for the draft
    if (shuffledOtherHeroes.length < 8) {
      console.error('Not enough heroes for draft phase');
      return;
    }
    
    // Player 1 gets Paladin + 4 random others, Player 2 gets Druid + 4 random others
    game.players[0].draftCards = [paladin, ...shuffledOtherHeroes.slice(0, 4)];
    game.players[1].draftCards = [druid, ...shuffledOtherHeroes.slice(4, 8)];
    
    // Initialize team arrays if they don't exist
    game.players[0].team = game.players[0].team || [];
    game.players[1].team = game.players[1].team || [];
    
    game.draftCards = {
      player1: game.players[0].draftCards.map(h => h.name),
      player2: game.players[1].draftCards.map(h => h.name)
    };
    
    console.log('Draft started - Player 1 cards:', game.draftCards.player1);
    console.log('Draft started - Player 2 cards:', game.draftCards.player2);
  }

  startRandomMode(gameId) {
    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    // Randomly assign heroes with equal probability
    const shuffledHeroes = shuffleArray([...this.heroes]);
    
    // Select 6 heroes for both players (no additional shuffling needed)
    const selectedHeroes = shuffledHeroes.slice(0, 6);
    
    // Give each player 3 heroes - properly reset each hero
    game.players[0].team = selectedHeroes.slice(0, 3).map(hero => this.resetHeroToOriginalState(hero));
    game.players[1].team = selectedHeroes.slice(3, 6).map(hero => this.resetHeroToOriginalState(hero));

    // Set random attack order for each player
    game.players[0].attackOrder = game.players[0].team.map(h => h.name);
    game.players[1].attackOrder = game.players[1].team.map(h => h.name);

    // Auto-roll initiative for both players using centralized function
    const initiativeResult = this.rollInitiativeWithReroll(game);
    const firstPlayerIndex = game.players[0].initiativeRoll > game.players[1].initiativeRoll ? 0 : 1;

    // Set up battle phase directly
    game.phase = 'battle';

    // Initialize battle state for all heroes (they're already reset, just need IDs and player state)
    game.players.forEach((player, playerIndex) => {
      player.team.forEach((hero, heroIndex) => {
        hero.id = `${playerIndex}-${heroIndex}`;
        console.log(`🏥 Initialized ${hero.name}: HP = ${hero.HP} -> currentHP = ${hero.currentHP} (already reset)`);
      });
      player.currentHeroIndex = 0;
      player.hasUsedAttack = false;
      player.hasUsedAbility = false;
      player.usedAbilities = [];
      // Initialize Monk's attack count properly - only for the current active hero
      const currentHero = player.team[player.currentHeroIndex];
      player.monkAttacksRemaining = currentHero && currentHero.name === 'Monk' ? 1 : 0;
    });

    // Initialize new turn system  
    game.currentPlayerTurn = firstPlayerIndex; // Which player's turn it is
    game.playerHeroIndex = [0, 0]; // Which hero index for each player  
    game.currentTurn = firstPlayerIndex; // For compatibility

    console.log('🎲 startRandomMode - Initialized turn system: Player', firstPlayerIndex, 'goes first');

    // Apply passive effects from specials
    this.applyPassiveEffects(game);

    // Apply first player disadvantage - disable first hero's ability
    this.applyFirstPlayerDisadvantage(game, firstPlayerIndex);

    // Process turn start effects for the first hero to go (important for heroes like Plague Spreader)
    const firstPlayer = game.players[firstPlayerIndex];
    const firstHero = firstPlayer.team[0];
    this.processTurnStartEffects(game, firstHero, firstPlayer);

    console.log('Random mode started - Player 1 heroes:', game.players[0].team.map(h => h.name));
    console.log('Random mode started - Player 2 heroes:', game.players[1].team.map(h => h.name));
    console.log('Initiative rolls - Player 1:', player1Roll, 'Player 2:', player2Roll);
    console.log('First player:', firstPlayerIndex, 'Battle phase ready!');

    return {
      success: true,
      gameState: game,
      players: game.players.map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        initiativeRoll: p.initiativeRoll
      }))
    };
  }

  banCard(playerId, cardName) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    console.log(`🔍 Ban attempt - gameId: ${gameId}, game exists: ${!!game}`);
    if (game) {
      console.log(`   Phase: ${game.phase}, currentDraftPhase: ${game.currentDraftPhase}`);
    }
    
    if (!game || game.phase !== 'draft' || game.currentDraftPhase !== 0) {
      return { success: false, error: 'Invalid game state for banning' };
    }

    const player = game.players.find(p => p.id === playerId);
    if (!player || player.bannedCard) {
      return { success: false, error: 'Player already banned a card' };
    }

    // Remove card from player's draft cards
    player.draftCards = player.draftCards.filter(h => h.name !== cardName);
    player.bannedCard = cardName;

    // Check if both players have banned
    const allBanned = game.players.every(p => p.bannedCard);
    if (allBanned) {
      // Switch hands
      const temp = game.players[0].draftCards;
      game.players[0].draftCards = game.players[1].draftCards;
      game.players[1].draftCards = temp;
      
      // Update the global draftCards object
      game.draftCards = {
        player1: game.players[0].draftCards.map(h => h.name),
        player2: game.players[1].draftCards.map(h => h.name)
      };
      
      game.currentDraftPhase = 1;
      game.draftTurn = 0;
      
      console.log('Hands switched - Player 1 new cards:', game.draftCards.player1);
      console.log('Hands switched - Player 2 new cards:', game.draftCards.player2);
    }

    return {
      success: true,
      gameId,
      phase: game.currentDraftPhase,
      allBanned,
      draftCards: allBanned ? game.draftCards : null,
      currentDraftPhase: game.currentDraftPhase,
      draftTurn: game.draftTurn,
      gameState: this.getFullGameState(game)
    };
  }

  pickCard(playerId, cardName) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || game.phase !== 'draft' || game.currentDraftPhase === 0) {
      return { success: false, error: 'Invalid game state for picking' };
    }

    const player = game.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Check if player has already picked this round
    if (player.team.length >= game.currentDraftPhase) {
      return { success: false, error: 'Already picked this round' };
    }

    const hero = player.draftCards.find(h => h.name === cardName);
    
    if (!hero) {
      return { success: false, error: 'Hero not in your draft cards' };
    }

    // Add to team (reset to original state) and remove from draft cards
    player.team.push(this.resetHeroToOriginalState(hero));
    player.draftCards = player.draftCards.filter(h => h.name !== cardName);

    // Check if both players picked this round
    const bothPicked = game.players.every(p => p.team.length === game.currentDraftPhase);
    
    let newHands = null;
    if (bothPicked) {
      if (game.currentDraftPhase === 3) {
        // Draft complete - transition to setup phase for hero reordering
        game.phase = 'setup';
        console.log('Draft complete! Moving to Setup Phase for hero reordering...');
        
        // Initialize isReady flag for both players
        game.players.forEach(p => p.isReady = false);
      } else {
        // Switch hands and continue to next round
        const temp = game.players[0].draftCards;
        game.players[0].draftCards = game.players[1].draftCards;
        game.players[1].draftCards = temp;
        
        // Update global draftCards
        game.draftCards = {
          player1: game.players[0].draftCards.map(h => h.name),
          player2: game.players[1].draftCards.map(h => h.name)
        };
        
        game.currentDraftPhase++;
        game.draftTurn = 0;
        
        newHands = game.draftCards;
        console.log(`Round ${game.currentDraftPhase} - Hands switched`);
        console.log('Player 1 new cards:', newHands.player1);
        console.log('Player 2 new cards:', newHands.player2);
      }
    }

    // Check if initiative was just rolled
    let initiativeData = null;
    if (game.phase === 'initiative' && game.players.every(p => p.initiativeRoll !== undefined)) {
      const player1Roll = game.players[0].initiativeRoll;
      const player2Roll = game.players[1].initiativeRoll;
      
      if (player1Roll !== player2Roll) {
        const winner = player1Roll > player2Roll ? game.players[0] : game.players[1];
        initiativeData = {
          rolls: { player1: player1Roll, player2: player2Roll },
          winner: winner.id,
          needsChoice: true
        };
      } else {
        // Tie - reroll automatically
        game.players[0].initiativeRoll = rollDice(20);
        game.players[1].initiativeRoll = rollDice(20);
        console.log('Initiative tie! Rerolling...');
        const newPlayer1Roll = game.players[0].initiativeRoll;
        const newPlayer2Roll = game.players[1].initiativeRoll;
        const newWinner = newPlayer1Roll > newPlayer2Roll ? game.players[0] : game.players[1];
        initiativeData = {
          rolls: { player1: newPlayer1Roll, player2: newPlayer2Roll },
          winner: newWinner.id,
          needsChoice: true
        };
      }
    }

    return {
      success: true,
      gameId,
      currentDraftPhase: game.currentDraftPhase,
      draftComplete: game.phase === 'setup' || game.phase === 'initiative',
      teams: game.players.map(p => p.team.map(h => h.name)),
      draftCards: newHands,
      draftTurn: game.draftTurn,
      phase: game.phase,
      initiative: initiativeData,
      gameState: this.getFullGameState(game)
    };
  }

  setAttackOrder(playerId, heroOrder) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || game.phase !== 'setup') {
      return { success: false, error: 'Invalid game state for setting attack order' };
    }

    const player = game.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Reorder team based on heroOrder
    const orderedTeam = heroOrder.map(name => 
      player.team.find(h => h.name === name)
    ).filter(Boolean);

    if (orderedTeam.length !== 3) {
      return { success: false, error: 'Invalid hero order' };
    }

    player.team = orderedTeam;
    player.attackOrder = heroOrder;
    player.isReady = true; // Mark player as ready

    // Check if both players are ready
    const bothReady = game.players.every(p => p.isReady === true);
    
    let initiativeData = null;
    if (bothReady) {
      // Both players have set their order - transition to initiative phase
      game.phase = 'initiative';
      
      console.log('Both players ready! Auto-rolling initiative...');
      
      // Auto-roll initiative using centralized function
      initiativeData = this.rollInitiativeWithReroll(game);
    }

    return {
      success: true,
      gameId,
      bothReady,
      phase: game.phase,
      isReady: player.isReady,
      initiative: initiativeData,
      gameState: this.getFullGameState(game)
    };
  }

  rollInitiative(playerId) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || game.phase !== 'initiative') {
      return { success: false, error: 'Invalid game state for initiative' };
    }

    const player = game.players.find(p => p.id === playerId);
    if (!player || player.initiativeRoll !== undefined) {
      return { success: false, error: 'Player already rolled initiative' };
    }

    player.initiativeRoll = rollDice(20);

    const bothRolled = game.players.every(p => p.initiativeRoll !== undefined);
    if (bothRolled) {
      // Both players have rolled, check for ties and reroll if needed
      const initiativeData = this.rollInitiativeWithReroll(game);
      return {
        success: true,
        gameId,
        ...initiativeData
      };
    }

    return {
      success: true,
      gameId,
      waiting: true,
      roll: player.initiativeRoll
    };
  }

  chooseTurnOrder(playerId, goFirst) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || game.phase !== 'initiative') {
      return { success: false, error: 'Invalid game state' };
    }

    const playerIndex = game.players.findIndex(p => p.id === playerId);
    const firstPlayerIndex = goFirst ? playerIndex : 1 - playerIndex;
    
    game.phase = 'battle';

    // Initialize battle state for all heroes - reset them to pristine state
    game.players.forEach((player, playerIndex) => {
      // Reset all heroes to original state before battle starts
      player.team = player.team.map(hero => this.resetHeroToOriginalState(hero));
      
      player.team.forEach((hero, heroIndex) => {
        hero.id = `${playerIndex}-${heroIndex}`;
        console.log(`🏥 Initialized ${hero.name}: HP = ${hero.HP} -> currentHP = ${hero.currentHP} (reset for battle)`);
      });
      player.currentHeroIndex = 0;
      player.hasUsedAttack = false;
      player.hasUsedAbility = false;
      player.usedAbilities = [];
      // Initialize Monk's attack count properly - only for the current active hero
      const currentHero = player.team[player.currentHeroIndex];
      player.monkAttacksRemaining = currentHero && currentHero.name === 'Monk' ? 1 : 0;
    });

    // Initialize new turn system
    game.currentPlayerTurn = firstPlayerIndex; // Which player's turn it is
    game.playerHeroIndex = [0, 0]; // Which hero index for each player
    game.currentTurn = firstPlayerIndex; // For compatibility

    console.log('🎲 chooseTurnOrder - Initialized turn system: Player', firstPlayerIndex, 'goes first');

    // Apply passive effects from specials
    this.applyPassiveEffects(game);

    // Apply first player disadvantage - disable first hero's ability
    this.applyFirstPlayerDisadvantage(game, firstPlayerIndex);

    // Process turn start effects for the first hero to go (important for heroes like Plague Spreader)
    const firstPlayer = game.players[firstPlayerIndex];
    const firstHero = firstPlayer.team[0];
    this.processTurnStartEffects(game, firstHero, firstPlayer);

    return {
      success: true,
      gameId,
      currentTurn: game.currentTurn,
      gameState: this.getFullGameState(game)
    };
  }

  applyPassiveEffects(game) {
    // Clear existing passive buffs
    game.players.forEach(player => {
      player.team.forEach(hero => {
        hero.passiveBuffs = [];
        hero.modifiedAccuracy = hero.Accuracy;
        hero.modifiedBasicAttack = hero.BasicAttack;
        hero.modifiedDefense = hero.Defense !== undefined ? hero.Defense : hero.AC; // Reset Defense to base value
      });
    });

    // Apply passive effects from each hero's special abilities
    // Process in two passes: first regular buffs/debuffs, then Defense sharing effects
    
    // Pass 1: Apply regular stat modifiers and battle start buffs
    game.players.forEach(player => {
      player.team.forEach(sourceHero => {
        if (sourceHero.currentHP <= 0) return; // Dead heroes don't provide buffs (except permanent ones)
        
        // Handle Special being either an array or a single object
        const specials = Array.isArray(sourceHero.Special) ? sourceHero.Special : [sourceHero.Special];
        
        specials.forEach(special => {
          if (!special || !special.effects) return; // Skip if no special or no effects
          
          console.log(`🔍 Processing ${sourceHero.name}'s special: ${special.name} (category: ${special.category})`);
          
          special.effects.forEach(effect => {
            console.log(`  📝 Effect type: ${effect.type}, stat: ${effect.stat}, value: ${effect.value}, target: ${effect.target}`);
            
            if (effect.type === 'stat_modifier') {
              this.applyAuraEffect(game, sourceHero, special, effect);
            } else if (effect.type === 'apply_buff' && special.trigger === 'battle_start') {
              this.applyBattleStartBuff(game, sourceHero, special, effect);
            } else if (effect.type === 'apply_buff' && effect.aura === true && effect.effect !== 'set_defense_to_self') {
              // Handle regular aura buffs (excluding Defense sharing)
              this.applyAuraEffect(game, sourceHero, special, effect);
            } else if (effect.type === 'apply_debuff' && effect.aura === true) {
              this.applyAuraDebuff(game, sourceHero, special, effect);
            }
          });
        });
      });
    });

    // Update display stats after first pass to ensure modifiedDefense values are calculated
    game.players.forEach(player => {
      player.team.forEach(hero => {
        this.updateHeroDisplayStats(hero);
      });
    });

    // Pass 2: Apply Defense sharing effects (these need to happen after all Defense modifiers are applied)
    game.players.forEach(player => {
      player.team.forEach(sourceHero => {
        if (sourceHero.currentHP <= 0) return; // Dead heroes don't provide buffs
        
        const specials = Array.isArray(sourceHero.Special) ? sourceHero.Special : [sourceHero.Special];
        
        specials.forEach(special => {
          if (!special || !special.effects) return;
          
          special.effects.forEach(effect => {
            if (effect.type === 'apply_buff' && effect.aura === true && effect.effect === 'set_defense_to_self') {
              console.log(`🔍 Processing Defense sharing: ${sourceHero.name}'s ${special.name}`);
              this.applyAuraEffect(game, sourceHero, special, effect);
            }
          });
        });
      });
    });

    // Add status-based buffs (like Beast Active, Totem Count)
    game.players.forEach(player => {
      player.team.forEach(hero => {
        if (hero.currentHP <= 0) return; // Skip dead heroes
        
        // Add Beast Active buff
        if (hero.name === 'Beast Tamer' && hero.statusEffects && hero.statusEffects.beast_active) {
          if (!hero.passiveBuffs) hero.passiveBuffs = [];
          hero.passiveBuffs.push({
            name: 'Beast Active',
            sourceName: 'Beast Tamer',
            description: 'Beast is summoned and ready to command',
            type: 'status'
          });
        }
        
        // Add Totem Count buff
        if (hero.name === 'Shaman' && hero.statusEffects && hero.statusEffects.totem_count > 0) {
          if (!hero.passiveBuffs) hero.passiveBuffs = [];
          const totemCount = hero.statusEffects.totem_count;
          hero.passiveBuffs.push({
            name: `Totems (${totemCount})`,
            sourceName: 'Shaman',
            description: `${totemCount} Totem${totemCount > 1 ? 's' : ''} summoned - next ability deals ${totemCount}D4 damage`,
            type: 'status',
            value: totemCount
          });
        }

        // Add Turret Count buff for Engineer (handled in processEngineerAbility now)
        // Keeping this for backward compatibility in case turrets exist without immediate buff
        if (hero.name === 'Engineer' && hero.statusEffects && hero.statusEffects.turret_count > 0) {
          if (!hero.passiveBuffs) hero.passiveBuffs = [];
          
          // Check if turret buff already exists (added by processEngineerAbility)
          const existingTurretBuff = hero.passiveBuffs.find(buff => buff.name && buff.name.startsWith('Turrets'));
          if (!existingTurretBuff) {
            const turretCount = hero.statusEffects.turret_count;
            hero.passiveBuffs.push({
              name: `Turrets (${turretCount})`,
              sourceName: 'Engineer',
              description: `${turretCount} Mechanical Turret${turretCount > 1 ? 's' : ''} active - deal${turretCount === 1 ? 's' : ''} 1D4 damage per turret at end of turn`,
              type: 'status',
              value: turretCount
            });
          }
        }
        
        // Add Med Bot buff for Medic (backward compatibility)
        if (hero.name === 'Medic' && hero.statusEffects && hero.statusEffects.med_bot_count > 0) {
          if (!hero.passiveBuffs) hero.passiveBuffs = [];
          
          // Check if med bot buff already exists (added by processMedicAbility)
          const existingMedBotBuff = hero.passiveBuffs.find(buff => buff.name && buff.name.startsWith('Med Bots'));
          if (!existingMedBotBuff) {
            const medBotCount = hero.statusEffects.med_bot_count;
            hero.passiveBuffs.push({
              name: `Med Bots (${medBotCount})`,
              sourceName: 'Medic',
              description: `${medBotCount} med bot${medBotCount > 1 ? 's' : ''} active - heal${medBotCount === 1 ? 's' : ''} lowest HP ally ${medBotCount}D4 at end of turn`,
              type: 'status',
              value: medBotCount
            });
          }
        }
        
        // Add Arcane Shield available status for Wizard
        if (hero.name === 'Wizard' && hero.currentHP > 0) {
          // Initialize Arcane Shield status if not already set
          if (!hero.statusEffects) hero.statusEffects = {};
          if (!hero.statusEffects.arcaneShieldUsed) {
            hero.statusEffects.arcaneShieldAvailable = true;
          }
        }
      });
    });

    // Update display strings for modified stats
    game.players.forEach(player => {
      player.team.forEach(hero => {
        this.updateHeroDisplayStats(hero);
      });
    });
  }

  applyAuraEffect(game, sourceHero, special, effect) {
    const targets = this.getTargetsForEffect(game, sourceHero, effect.target);
    
    console.log(`✨ ${sourceHero.name}'s ${special.name} aura affecting ${targets.length} targets: ${targets.map(t => t.name).join(', ')}`);
    
    targets.forEach(target => {
      // Handle special effect types
      if (effect.effect === 'set_defense_to_self') {
        // Dual Defender's Defense sharing - copy the Dual Defender's CURRENT Defense (including any buffs) to the ally
        if (!target.originalDefense && !target.sharedDefense) {
          target.originalDefense = target.Defense !== undefined ? target.Defense : target.AC; // Store original Defense for restoration when Dual Defender dies
        }
        // Use the Dual Defender's current modified Defense (includes buffs from other sources like Shaman)
        const sourceDefense = sourceHero.modifiedDefense || sourceHero.Defense || sourceHero.AC;
        if (target.Defense !== undefined) {
          target.Defense = sourceDefense; // Set as new base Defense
        } else {
          target.AC = sourceDefense; // Fallback for legacy AC
        }
        target.modifiedDefense = sourceDefense; // Also update display (will be modified by other effects later)
        target.sharedDefense = {
          source: sourceHero.name,
          originalDefense: target.originalDefense,
          sharedValue: sourceDefense
        };
        
        // NOTE: Do NOT add a passive buff entry for defense sharing
        // The defense replacement is already handled in updateHeroDisplayStats by checking sharedDefense
        
        console.log(`🛡️ ${sourceHero.name}'s ${special.name}: ${target.name}'s base Defense changed from ${target.originalDefense} to ${sourceDefense} (copied from ${sourceHero.name}'s Defense)`);
        this.updateHeroDisplayStats(target);
      } else {
        // Regular aura buff
        if (!target.passiveBuffs) target.passiveBuffs = [];
        
        target.passiveBuffs.push({
          sourceHero: sourceHero.name,
          sourceName: special.name,
          stat: effect.stat,
          value: effect.value,
          permanent: false // Aura effects are not permanent
        });
        
        console.log(`  📈 Applied ${special.name} (+${effect.value} ${effect.stat}) to ${target.name}`);
      }
    });
  }

  applyBattleStartBuff(game, sourceHero, special, effect) {
    // Handle different target types for battle start buffs
    const targets = this.getTargetsForEffect(game, sourceHero, effect.target);

    if (targets.length > 0) {
      // Add comprehensive special log entry for battle start buff
      const battleStartLogEntry = this.createSpecialLogEntry(
        sourceHero, 
        special.name, 
        'activated at battle start', 
        null, // no attack roll for battle start buffs
        targets.map(target => ({
          type: 'apply_buff',
          target: target.name,
          effect: effect.effect,
          stat: effect.stat,
          value: effect.value,
          message: `grants ${effect.value > 0 ? '+' : ''}${effect.value} ${effect.stat || effect.effect} to ${target.name}`
        }))
      );
      
      // Add to battle log if it exists
      if (game && game.battleLog) {
        game.battleLog.push(battleStartLogEntry);
      }
    }

    targets.forEach(target => {
      if (!target.passiveBuffs) target.passiveBuffs = [];
      
      target.passiveBuffs.push({
        sourceHero: sourceHero.name,
        sourceName: special.name,
        stat: effect.effect === 'damage_modifier' ? 'damage' : effect.stat,
        value: effect.value,
        permanent: true // Battle start buffs are permanent
      });
    });
  }

  applyAuraDebuff(game, sourceHero, special, effect) {
    const targets = this.getTargetsForEffect(game, sourceHero, effect.target);
    
    console.log(`💀 ${sourceHero.name}'s ${special.name} aura debuffing ${targets.length} targets: ${targets.map(t => t.name).join(', ')}`);
    
    targets.forEach(target => {
      if (!target.passiveBuffs) target.passiveBuffs = [];
      
      // Apply debuff as a negative buff
      target.passiveBuffs.push({
        sourceHero: sourceHero.name,
        sourceName: special.name,
        stat: (effect.effect === 'defense_modifier' || effect.effect === 'ac_modifier') ? 'Defense' : effect.stat,
        value: effect.value, // Should be negative for debuffs
        permanent: false // Aura debuffs are not permanent
      });
      
      console.log(`  💀 Applied ${special.name} debuff (${effect.value} ${effect.effect}) to ${target.name}`);
    });
  }

  applyFirstPlayerDisadvantage(game, firstPlayerIndex) {
    const firstPlayer = game.players[firstPlayerIndex];
    const firstHero = firstPlayer.team[0]; // First hero in the team (leftmost position)
    
    console.log(`🚫 Applying First Pick Silence to ${firstHero.name} (first player's first hero)`);
    
    // Initialize status effects if they don't exist
    if (!firstHero.statusEffects) {
      firstHero.statusEffects = {};
    }
    
    // Apply the first pick silence debuff (using standard silence mechanism)
    firstHero.statusEffects.silenced = {
      active: true,
      duration: 1,
      source: "First Pick Disadvantage",
      description: "First Pick Silence",
      tooltip: "This hero's ability is disabled as a downside to starting first"
    };
    
    console.log(`✅ First Pick Silence applied to ${firstHero.name}`);
  }

  getTargetsForEffect(game, sourceHero, targetType) {
    const sourcePlayer = game.players.find(p => p.team.includes(sourceHero));
    if (!sourcePlayer) return [];

    switch (targetType) {
      case 'all_allies':
        // All allies includes the caster themselves
        return sourcePlayer.team;
      case 'other_allies':
        // Other allies excludes the caster
        return sourcePlayer.team.filter(h => h !== sourceHero);
      case 'adjacent_allies':
        // Find adjacent allies (heroes positioned next to the source hero)
        const sourceIndex = sourcePlayer.team.findIndex(h => h === sourceHero);
        const adjacentAllies = [];
        
        console.log(`🔗 ${sourceHero.name} at position ${sourceIndex} looking for adjacent allies`);
        
        // Left adjacent ally
        if (sourceIndex > 0) {
          const leftAlly = sourcePlayer.team[sourceIndex - 1];
          adjacentAllies.push(leftAlly);
          console.log(`  ⬅️ Left ally: ${leftAlly.name} at position ${sourceIndex - 1}`);
        }
        
        // Right adjacent ally
        if (sourceIndex < sourcePlayer.team.length - 1) {
          const rightAlly = sourcePlayer.team[sourceIndex + 1];
          adjacentAllies.push(rightAlly);
          console.log(`  ➡️ Right ally: ${rightAlly.name} at position ${sourceIndex + 1}`);
        }
        
        console.log(`🎯 ${sourceHero.name} will buff ${adjacentAllies.length} adjacent allies: ${adjacentAllies.map(a => a.name).join(', ')}`);
        
        return adjacentAllies;
      case 'ally_right':
        // Find the ally to the right of the source hero
        const sourceIndexRight = sourcePlayer.team.findIndex(h => h === sourceHero);
        if (sourceIndexRight < sourcePlayer.team.length - 1) {
          const rightAlly = sourcePlayer.team[sourceIndexRight + 1];
          console.log(`➡️ ${sourceHero.name}'s right ally: ${rightAlly.name}`);
          return [rightAlly];
        }
        return [];
      case 'lowest_health_enemy':
        // Find enemy with lowest current HP
        const opposingPlayer = game.players.find(p => !p.team.includes(sourceHero));
        if (!opposingPlayer) return [];
        const aliveEnemies = opposingPlayer.team.filter(h => h.currentHP > 0);
        if (aliveEnemies.length === 0) return [];
        const lowestHealthEnemy = aliveEnemies.reduce((lowest, current) => {
          return current.currentHP < lowest.currentHP ? current : lowest;
        });
        console.log(`🎯 Lowest health enemy: ${lowestHealthEnemy.name} (${lowestHealthEnemy.currentHP} HP)`);
        return [lowestHealthEnemy];
      case 'lowest_health_ally':
        // Find ally with lowest current HP percentage (excluding self)
        const aliveAllies = sourcePlayer.team.filter(h => h.currentHP > 0 && h !== sourceHero);
        if (aliveAllies.length === 0) return [];
        const lowestHealthAlly = aliveAllies.reduce((lowest, current) => {
          const currentHealthPercent = current.currentHP / current.HP;
          const lowestHealthPercent = lowest.currentHP / lowest.HP;
          return currentHealthPercent < lowestHealthPercent ? current : lowest;
        });
        console.log(`🎯 Lowest health ally: ${lowestHealthAlly.name} (${lowestHealthAlly.currentHP} HP)`);
        return [lowestHealthAlly];
      case 'all_enemies':
        // All enemies on the opposing team
        const opposingPlayerAll = game.players.find(p => !p.team.includes(sourceHero));
        return opposingPlayerAll ? opposingPlayerAll.team : [];
      case 'self':
        return [sourceHero];
      default:
        return [];
    }
  }

  updateHeroDisplayStats(hero) {
    // Reset to base values first
    hero.modifiedAccuracy = hero.Accuracy;
    hero.modifiedBasicAttack = hero.BasicAttack;
    
    // For Defense, handle shared defense correctly
    if (hero.sharedDefense) {
      // Hero has shared defense - use the shared value as the base, not the original
      hero.modifiedDefense = hero.sharedDefense.sharedValue;
    } else {
      // Normal case - use the hero's own Defense
      hero.modifiedDefense = hero.Defense !== undefined ? hero.Defense : hero.AC;
    }

    // Apply permanent stat modifiers first (like Dragon Rider's Dismount)
    if (hero.permanentBuffs) {
      Object.values(hero.permanentBuffs).forEach(buffArray => {
        if (Array.isArray(buffArray)) {
          buffArray.forEach(buff => {
            if (buff.stat === 'Defense') {
              hero.modifiedDefense += buff.value; // buff.value should be negative for debuffs
              console.log(`🔒 ${hero.name} permanent Defense: ${hero.Defense !== undefined ? hero.Defense : hero.AC} → ${hero.modifiedDefense} (${buff.source}: ${buff.value})`);
            }
          });
        }
      });
    }

    // Apply Defense stat modifiers (debuffs like Ranger's Piercing Shot)
    if (hero.statusEffects?.statModifiers?.Defense) {
      hero.modifiedDefense = hero.modifiedDefense + hero.statusEffects.statModifiers.Defense;
      console.log(`🛡️ ${hero.name} Defense: ${hero.modifiedDefense - hero.statusEffects.statModifiers.Defense} → ${hero.modifiedDefense} (debuff: ${hero.statusEffects.statModifiers.Defense})`);
    } else if (hero.statusEffects?.statModifiers?.AC) {
      hero.modifiedDefense = hero.modifiedDefense + hero.statusEffects.statModifiers.AC;
      console.log(`🛡️ ${hero.name} Defense: ${hero.modifiedDefense - hero.statusEffects.statModifiers.AC} → ${hero.modifiedDefense} (legacy AC debuff: ${hero.statusEffects.statModifiers.AC})`);
    }

    // Update Defense display for scaling buffs (Champion's Last Stand)
    if (hero.scalingBuffs && hero.scalingBuffs.defense) {
      hero.modifiedDefense = hero.modifiedDefense + hero.scalingBuffs.defense;
      console.log(`🛡️ ${hero.name} Defense scaling: ${hero.modifiedDefense - hero.scalingBuffs.defense} → ${hero.modifiedDefense} (scaling: +${hero.scalingBuffs.defense})`);
    } else if (hero.scalingBuffs && hero.scalingBuffs.defense) {
      hero.modifiedDefense = hero.modifiedDefense + hero.scalingBuffs.defense;
      console.log(`🛡️ ${hero.name} Defense scaling: ${hero.modifiedDefense - hero.scalingBuffs.defense} → ${hero.modifiedDefense} (scaling: +${hero.scalingBuffs.defense})`);
    }

    // Apply Wind Wall Defense bonus (Elementalist's special)
    if (hero.statusEffects?.windWallAC && hero.statusEffects.windWallAC.bonus > 0) {
      const windWallBonus = hero.statusEffects.windWallAC.bonus;
      hero.modifiedDefense += windWallBonus;
      console.log(`🌪️ ${hero.name} Defense from Wind Wall: ${hero.modifiedDefense - windWallBonus} → ${hero.modifiedDefense} (Wind Wall: +${windWallBonus})`);
    }

    // Update damage display for scaling buffs (Champion's Last Stand and Hoarder's Collect Weapons)
    // Parse and combine ALL dice properly
    const diceGroups = {};
    
    // Start by parsing the base attack dice
    const baseAttackString = hero.BasicAttack;
    if (baseAttackString && baseAttackString !== '—' && baseAttackString !== '-') {
      // Parse base attack - handle multiple dice groups like "1D6+1D4"
      const diceMatches = baseAttackString.matchAll(/(\d+)D(\d+)/gi);
      for (const match of diceMatches) {
        const count = parseInt(match[1]);
        const sides = match[2];
        if (!diceGroups[sides]) {
          diceGroups[sides] = 0;
        }
        diceGroups[sides] += count;
      }
    }
    
    // Add Champion's Last Stand scaling damage
    if (hero.scalingBuffs && hero.scalingBuffs.damage) {
      const scalingDamageBonus = hero.scalingBuffs.damage;
      if (!diceGroups['6']) {
        diceGroups['6'] = 0;
      }
      diceGroups['6'] += scalingDamageBonus;
      console.log(`🔥 ${hero.name} gained +${scalingDamageBonus}D6 from Last Stand`);
    }
    
    // Add Hoarder's collected dice
    if (hero.scalingBuffs && hero.scalingBuffs.collectedDice && hero.scalingBuffs.collectedDice.length > 0) {
      hero.scalingBuffs.collectedDice.forEach(collected => {
        const dice = collected.dice;
        // Parse each collected dice string - handle multiple dice groups
        const diceMatches = dice.matchAll(/(\d+)D(\d+)/gi);
        for (const match of diceMatches) {
          const count = parseInt(match[1]);
          const sides = match[2];
          if (!diceGroups[sides]) {
            diceGroups[sides] = 0;
          }
          diceGroups[sides] += count;
        }
      });
      console.log(`💰 ${hero.name} collected weapons: ${hero.scalingBuffs.collectedDice.length} sets of dice from fallen heroes`);
    }
    
    // Build the final grouped dice string
    if (Object.keys(diceGroups).length > 0) {
      const groupedDiceStrings = Object.keys(diceGroups)
        .sort((a, b) => parseInt(a) - parseInt(b)) // Sort by die size
        .map(sides => `${diceGroups[sides]}D${sides}`);
      
      hero.modifiedBasicAttack = groupedDiceStrings.join(' +');
      console.log(`⚔️ ${hero.name} total damage: ${hero.BasicAttack} → ${hero.modifiedBasicAttack}`);
    }

    // Apply Defense buffs/debuffs from passive effects (like Reaper's Aura of Dread)
    const defenseBuffs = hero.passiveBuffs?.filter(b => b.stat === 'Defense') || [];
    if (defenseBuffs.length > 0) {
      const totalDefenseModifier = defenseBuffs.reduce((sum, buff) => sum + buff.value, 0);
      hero.modifiedDefense += totalDefenseModifier;
      
      if (totalDefenseModifier < 0) {
        console.log(`💀 ${hero.name} Defense debuffed: ${hero.modifiedDefense - totalDefenseModifier} → ${hero.modifiedDefense} (debuffs: ${defenseBuffs.map(b => `${b.value} from ${b.sourceName}`).join(', ')})`);
      } else {
        console.log(`🛡️ ${hero.name} Defense buffed: ${hero.modifiedDefense - totalDefenseModifier} → ${hero.modifiedDefense} (buffs: ${defenseBuffs.map(b => `+${b.value} from ${b.sourceName}`).join(', ')})`);
      }
    }

    // If no other buffs, return early after Defense processing
    if (!hero.passiveBuffs || hero.passiveBuffs.length === 0) return;

    // Update accuracy display
    const accuracyBuffs = hero.passiveBuffs.filter(b => b.stat === 'accuracy');
    if (accuracyBuffs.length > 0) {
      const baseAccuracy = parseInt(hero.Accuracy.replace('+', ''));
      const totalAccuracyBonus = accuracyBuffs.reduce((sum, buff) => sum + buff.value, 0);
      hero.modifiedAccuracy = `+${baseAccuracy + totalAccuracyBonus}`;
      console.log(`📊 ${hero.name} accuracy: ${hero.Accuracy} → ${hero.modifiedAccuracy} (buffs: ${accuracyBuffs.map(b => `+${b.value} from ${b.sourceName}`).join(', ')})`);
    }

    // Update damage display (add to scaling if present)
    const damageBuffs = hero.passiveBuffs.filter(b => b.stat === 'damage');
    if (damageBuffs.length > 0) {
      const totalDamageBonus = damageBuffs.reduce((sum, buff) => sum + buff.value, 0);
      
      // If we already have scaling damage, combine them
      if (hero.scalingBuffs && hero.scalingBuffs.damage) {
        hero.modifiedBasicAttack = `${hero.BasicAttack} +${hero.scalingBuffs.damage}D6 +${totalDamageBonus}`;
      } else {
        hero.modifiedBasicAttack = `${hero.BasicAttack} +${totalDamageBonus}`;
      }
      console.log(`⚔️ ${hero.name} damage: ${hero.BasicAttack} → ${hero.modifiedBasicAttack} (buffs: ${damageBuffs.map(b => `+${b.value} from ${b.sourceName}`).join(', ')})`);
    }
  }

  // Helper method to check if a hero has a specific special effect
  hasSpecialEffect(hero, effectName) {
    if (!hero.Special) return false;
    
    const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
    
    return specials.some(special => {
      if (!special.effects) return false;
      return special.effects.some(effect => {
        switch (effectName) {
          case 'disable_basic_attack':
            return effect.type === 'disable_basic_attack';
          case 'use_twice_per_turn':
            return effect.type === 'modify_ability_usage' && effect.effect === 'use_twice_per_turn';
          case 'attack_twice':
            return effect.type === 'modify_attack_frequency' && effect.effect === 'attack_twice';
          default:
            return false;
        }
      });
    });
  }

  // Check if an attack should have advantage/disadvantage based on hero abilities and status effects
  hasAdvantageDisadvantage(attacker, target = null, isAbility = false, game = null, excludeAdvantageFrom = null) {
    let advantageCount = 0;
    let disadvantageCount = 0;
    const advantageReasons = [];
    const disadvantageReasons = [];

    // Handle Special being either an array or a single object
    const specials = Array.isArray(attacker.Special) ? attacker.Special : [attacker.Special];
    
    specials.forEach(special => {
      if (!special || !special.effects) return;
      
      // Skip conditional effects - they should only be processed in the conditional section
      if (special.condition) return;
      
      special.effects.forEach(effect => {
        // Persistent advantage (like Ranger's Eagle Eye)
        if (effect.type === 'grant_advantage') {
          // Skip effects that target others (like Timekeeper's Haste which targets adjacent_allies)
          if (effect.target && effect.target !== 'self' && effect.target !== 'self_only') {
            return;
          }
          // Check if this effect is restricted to attacks only
          if (effect.scope === 'attacks_only' && isAbility) {
            // This advantage only applies to attacks, not abilities
            return;
          }
          // Check if this effect is restricted to abilities only
          if (effect.scope === 'abilities_only' && !isAbility) {
            // This advantage only applies to abilities, not attacks
            return;
          }
          advantageCount++;
          advantageReasons.push(`${special.name} (persistent)`);
        }
        
        // Persistent disadvantage
        if (effect.type === 'grant_disadvantage') {
          // Skip effects that target others
          if (effect.target && effect.target !== 'self' && effect.target !== 'self_only') {
            return;
          }
          // Check if this effect is restricted to attacks only
          if (effect.scope === 'attacks_only' && isAbility) {
            // This disadvantage only applies to attacks, not abilities
            return;
          }
          // Check if this effect is restricted to abilities only
          if (effect.scope === 'abilities_only' && !isAbility) {
            // This disadvantage only applies to abilities, not attacks
            return;
          }
          disadvantageCount++;
          disadvantageReasons.push(`${special.name} (persistent)`);
        }
      });
    });

    // Conditional advantage based on hero state
    specials.forEach(special => {
      if (!special || !special.condition) return;
      
      // Fighter's Desperate Blows: Below 10 HP, ONLY attacks have advantage (not abilities)
      if (special.condition === 'self_hp_lt_10' && attacker.currentHP < 10) {
        special.effects.forEach(effect => {
          if (effect.type === 'grant_advantage') {
            // Check if this effect is restricted to attacks only
            if (effect.scope === 'attacks_only' && isAbility) {
              // This advantage only applies to attacks, not abilities
              return;
            }
            advantageCount++;
            advantageReasons.push(`${special.name} (low HP)`);
          }
          if (effect.type === 'grant_disadvantage') {
            // Check if this effect is restricted to attacks only
            if (effect.scope === 'attacks_only' && isAbility) {
              // This disadvantage only applies to attacks, not abilities
              return;
            }
            disadvantageCount++;
            disadvantageReasons.push(`${special.name} (low HP)`);
          }
        });
      }
      
      // Piercer's Armor Breaker: Against high Defense targets, gain advantage
      if ((special.condition === 'target_defense_gte_9' && target && calculateEffectiveDefense(target) >= 9) ||
          (special.condition === 'target_defense_gt_8' && target && calculateEffectiveDefense(target) > 8)) {
        special.effects.forEach(effect => {
          if (effect.type === 'grant_advantage') {
            advantageCount++;
            advantageReasons.push(`${special.name} (high AC target)`);
          }
          if (effect.type === 'grant_disadvantage') {
            disadvantageCount++;
            disadvantageReasons.push(`${special.name} (high AC target)`);
          }
        });
      }
    });

    // Beast Tamer's Pack Tactics: Attacks have advantage while the beast is summoned
    if (attacker.name === 'Beast Tamer' && attacker.statusEffects && attacker.statusEffects.beast_active) {
      advantageCount++;
      advantageReasons.push('Pack Tactics (beast active)');
    }

    // Check for temporary advantage from status effects (like Cleric's Guiding Bolt)
    if (target && target.statusEffects && target.statusEffects.grantAdvantage) {
      advantageCount++;
      advantageReasons.push(`Guiding Bolt effect (from ${target.statusEffects.grantAdvantage.source})`);
    }

    // Silencer's Anti-Magic Field: Enemies attacking Silencer have disadvantage on their ability rolls
    if (isAbility && target && target.name === 'Silencer' && target.currentHP > 0 && game) {
      // Check if attacker is an enemy of Silencer (not the same player)
      const silencerPlayer = game.players.find(p => p.team.some(h => h.name === 'Silencer'));
      const attackerPlayer = game.players.find(p => p.team.some(h => h.name === attacker.name));
      
      console.log(`🔍 Anti-Magic Field check: ${attacker.name} → ${target.name}`);
      console.log(`🔍 Silencer player: ${silencerPlayer?.id}, Attacker player: ${attackerPlayer?.id}`);
      console.log(`🔍 Same player? ${silencerPlayer === attackerPlayer}`);
      
      if (silencerPlayer && attackerPlayer && silencerPlayer !== attackerPlayer) {
        const silencerSpecial = Array.isArray(target.Special) ? target.Special : [target.Special];
        for (const special of silencerSpecial) {
          if (special && special.name === 'Anti-Magic Field') {
            console.log(`🔮 Anti-Magic Field activated: ${attacker.name} has disadvantage against ${target.name}`);
            disadvantageCount++;
            disadvantageReasons.push(`${target.name}'s Anti-Magic Field (enemy ability targeted at Silencer)`);
            break;
          }
        }
      } else {
        console.log(`🚫 Anti-Magic Field NOT activated: Same player or missing player data`);
      }
    }

    // Check for advantage from adjacent allies with team auras (like Timekeeper's Haste)
    if (game) {
      const attackerPlayer = game.players.find(p => p.team.some(h => h.name === attacker.name));
      if (attackerPlayer) {
        const attackerIndex = attackerPlayer.team.findIndex(h => h.name === attacker.name);
        
        // Check adjacent allies (left and right)
        const adjacentIndices = [attackerIndex - 1, attackerIndex + 1];
        adjacentIndices.forEach(index => {
          if (index >= 0 && index < attackerPlayer.team.length) {
            const adjacentAlly = attackerPlayer.team[index];
            if (adjacentAlly.currentHP > 0) {
              // Skip if this ally is explicitly excluded from granting advantage
              if (excludeAdvantageFrom && adjacentAlly.name === excludeAdvantageFrom.name) {
                return;
              }
              
              // Check if adjacent ally has team aura that grants advantage
              const allySpecials = Array.isArray(adjacentAlly.Special) ? adjacentAlly.Special : [adjacentAlly.Special];
              allySpecials.forEach(special => {
                if (special && special.category === 'team_aura' && special.effects) {
                  special.effects.forEach(effect => {
                    if (effect.type === 'grant_advantage' && effect.target === 'adjacent_allies') {
                      // Check if this effect is restricted to abilities only
                      if (effect.scope === 'abilities_only' && !isAbility) {
                        return;
                      }
                      advantageCount++;
                      advantageReasons.push(`${adjacentAlly.name}'s ${special.name} (adjacent ally)`);
                    }
                    if (effect.type === 'grant_disadvantage' && effect.target === 'adjacent_allies') {
                      // Check if this effect is restricted to abilities only
                      if (effect.scope === 'abilities_only' && !isAbility) {
                        return;
                      }
                      disadvantageCount++;
                      disadvantageReasons.push(`${adjacentAlly.name}'s ${special.name} (adjacent ally)`);
                    }
                  });
                }
              });
            }
          }
        });
      }
    }

    // Cavalier's Ride Down: All attacks (not abilities) against debuffed enemies have advantage
    if (!isAbility && target && target.statusEffects && target.statusEffects.rideDownDebuff) {
      advantageCount++;
      advantageReasons.push(`Cavalier's Ride Down (target debuffed)`);
    }

    // Calculate net advantage/disadvantage
    const netAdvantage = advantageCount - disadvantageCount;
    
    if (netAdvantage > 0) {
      console.log(`🎯 ${attacker.name} has advantage: ${advantageReasons.join(', ')} (${advantageCount} sources)`);
      if (disadvantageCount > 0) {
        console.log(`⚖️ Disadvantage sources cancelled: ${disadvantageReasons.join(', ')} (${disadvantageCount} sources)`);
      }
      return { advantage: true, disadvantage: false, advantageReasons, disadvantageReasons };
    } else if (netAdvantage < 0) {
      console.log(`🎯 ${attacker.name} has disadvantage: ${disadvantageReasons.join(', ')} (${disadvantageCount} sources)`);
      if (advantageCount > 0) {
        console.log(`⚖️ Advantage sources cancelled: ${advantageReasons.join(', ')} (${advantageCount} sources)`);
      }
      return { advantage: false, disadvantage: true, advantageReasons, disadvantageReasons };
    } else if (advantageCount > 0 && disadvantageCount > 0) {
      console.log(`⚖️ ${attacker.name} has equal advantage and disadvantage - they cancel out (${advantageCount} vs ${disadvantageCount})`);
      return { advantage: false, disadvantage: false, advantageReasons, disadvantageReasons };
    }

    return { advantage: false, disadvantage: false, advantageReasons, disadvantageReasons };
  }

  // Backward compatibility method
  hasAdvantage(attacker, target = null, isAbility = false, game = null, excludeAdvantageFrom = null) {
    const result = this.hasAdvantageDisadvantage(attacker, target, isAbility, game, excludeAdvantageFrom);
    return result.advantage;
  }

  // Check if an attack/ability should have disadvantage
  hasDisadvantage(attacker, target = null, isAbility = false, game = null, excludeAdvantageFrom = null) {
    const result = this.hasAdvantageDisadvantage(attacker, target, isAbility, game, excludeAdvantageFrom);
    return result.disadvantage;
  }

  // Consume advantage effects after an attack
  consumeAdvantageEffects(attacker, target) {
    if (target && target.statusEffects && target.statusEffects.grantAdvantage) {
      const effect = target.statusEffects.grantAdvantage;
      if (effect.duration_unit === 'attack') {
        console.log(`🎯 Consuming advantage effect on ${target.name} (from ${effect.source})`);
        delete target.statusEffects.grantAdvantage;
      }
    }
  }

  // Method to reapply passive effects when a hero dies (to remove non-permanent buffs)
  updatePassiveEffectsOnDeath(game, deadHero, killer = null, deathCause = 'damage') {
    console.log(`💀 ${deadHero.name} died, checking for death triggers and buffs to remove...`);
    
    // Safety check: Only process if the hero is actually dead and hasn't been processed yet
    if (deadHero.currentHP > 0) {
      console.log(`⚠️ ${deadHero.name} is not dead (${deadHero.currentHP} HP), skipping death processing`);
      return;
    }
    
    // Prevent processing the same death multiple times
    if (deadHero.deathProcessed) {
      console.log(`⚠️ ${deadHero.name}'s death already processed, skipping`);
      return;
    }
    deadHero.deathProcessed = true;
    
    // Check for Angel's Resurrection FIRST - before any death processing
    // Don't resurrect Angel itself, and exclude certain death causes
    if (deadHero.name !== 'Angel' && deathCause !== 'health_link_reflection') {
      const wasResurrected = this.processAngelResurrection(game, deadHero, killer);
      if (wasResurrected) {
        console.log(`👼 ${deadHero.name} was resurrected by Angel - aborting death processing`);
        deadHero.deathProcessed = false; // Reset flag since hero was resurrected
        return; // Hero was resurrected, don't process death
      }
    }
    
    // Reset totem count if Shaman dies
    if (deadHero.name === 'Shaman' && deadHero.statusEffects && deadHero.statusEffects.totem_count > 0) {
      console.log(`🏺 ${deadHero.name} died - all ${deadHero.statusEffects.totem_count} totems are destroyed`);
      deadHero.statusEffects.totem_count = 0;
    }

    // Reset turret count if Engineer dies
    if (deadHero.name === 'Engineer' && deadHero.statusEffects && deadHero.statusEffects.turret_count > 0) {
      console.log(`🔧 ${deadHero.name} died - all ${deadHero.statusEffects.turret_count} turrets are destroyed`);
      deadHero.statusEffects.turret_count = 0;
    }
    
    // Reset med bot count if Medic dies
    if (deadHero.name === 'Medic' && deadHero.statusEffects && deadHero.statusEffects.med_bot_count > 0) {
      console.log(`💉 ${deadHero.name} died - all ${deadHero.statusEffects.med_bot_count} med bots are destroyed`);
      deadHero.statusEffects.med_bot_count = 0;
    }
    
    // Check for death trigger effects (like Bomber's Self Destruct)
    if (deadHero.Special && killer && deathCause !== 'poison') {
      const specials = Array.isArray(deadHero.Special) ? deadHero.Special : [deadHero.Special];
      
      for (const special of specials) {
        if (special.trigger === 'on_death') {
          console.log(`💥 ${deadHero.name}'s ${special.name} activated on death!`);
          
          for (const effect of special.effects) {
            if (effect.type === 'damage' && effect.target === 'killer') {
              // Deal damage to the killer
              const { rollDiceString } = require('./utils');
              const damageRoll = rollDiceString(effect.value);
              const actualDamage = Math.max(0, damageRoll.total || 0);
              
              console.log(`💥 ${special.name}: ${deadHero.name} deals ${actualDamage} damage to ${killer.name} from beyond the grave!`);
              
              // Ensure currentHP is a number before calculation
              const currentHP = typeof killer.currentHP === 'number' ? killer.currentHP : 0;
              killer.currentHP = Math.max(0, currentHP - actualDamage);
              
              // Create simple comprehensive entry for death trigger
              const deathTriggerLogEntry = {
                type: 'special_comprehensive',
                caster: deadHero.name,
                specialName: special.name,
                target: killer.name,
                message: `${deadHero.name}'s ${special.name} activates`,
                hit: true,
                damage: actualDamage,
                damageRoll: damageRoll.rolls,
                isSpecial: true
              };
              
              // Add battle log entry for death trigger special
              if (!game.deathTriggerEffects) {
                game.deathTriggerEffects = [];
              }
              game.deathTriggerEffects.push(deathTriggerLogEntry);
              
              if (killer.currentHP <= 0) {
                console.log(`💀 ${killer.name} died from ${deadHero.name}'s ${special.name}!`);
                // Mark that this death was from Bomber explosion (so we don't auto-advance turn)
                killer.diedFromBomberExplosion = true;
                // Recursively handle killer's death (but prevent infinite loops)
                if (killer.name !== deadHero.name) {
                  this.updatePassiveEffectsOnDeath(game, killer, null, 'retaliation');
                }
              }
            }
          }
          break; // Only trigger once
        }
      }
    }
    
    // Find which team the dead hero was on
    let deadHeroTeam = null;
    game.players.forEach(player => {
      if (player.team.includes(deadHero)) {
        deadHeroTeam = player.team;
      }
    });

    if (deadHeroTeam) {
      // Check for Champion's Last Stand scaling
      deadHeroTeam.forEach(hero => {
        if (hero.currentHP > 0 && hero.Special && hero.name !== deadHero.name) {
          const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
          const lastStandSpecial = specials.find(special => 
            special.name === 'Last Stand' && special.scale_with === 'fallen_allies'
          );
          
          if (lastStandSpecial) {
            // Count fallen allies (excluding the champion itself)
            const fallenAllies = deadHeroTeam.filter(ally => ally.currentHP <= 0 && ally !== hero).length;
            
            console.log(`🔥 ${hero.name}'s Last Stand: ${fallenAllies} fallen allies`);
            
            // Initialize scaling buffs if not present
            if (!hero.scalingBuffs) {
              hero.scalingBuffs = {};
            }
            
            // Apply scaling buffs based on fallen allies
            for (const effect of lastStandSpecial.effects) {
              if (effect.type === 'stat_modifier' && effect.stat === 'Defense') {
                const defenseBonus = effect.value_per_stack * fallenAllies;
                hero.scalingBuffs.defense = defenseBonus;
                console.log(`  🛡️ ${hero.name} gains +${defenseBonus} Defense from Last Stand`);
              } else if (effect.type === 'damage_modifier') {
                const damageBonus = fallenAllies; // Each fallen ally adds 1D6
                hero.scalingBuffs.damage = damageBonus;
                console.log(`  ⚔️ ${hero.name} gains +${damageBonus}D6 damage from Last Stand`);
              }
            }
            
            // Update hero's display stats to show the new damage
            this.updateHeroDisplayStats(hero);
          }
        }
      });
      
      // Check for Hoarder's Collect Weapons - copy attack dice from any fallen hero (not just allies)
      console.log(`🔍 Checking for Hoarder in same team as ${deadHero.name}...`);
      deadHeroTeam.forEach(hero => {
        console.log(`  🔍 Checking ${hero.name}: alive=${hero.currentHP > 0}, isHoarder=${hero.name === 'Hoarder'}`);
        if (hero.currentHP > 0 && hero.name === 'Hoarder' && hero.Special) {
          const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
          const collectWeaponsSpecial = specials.find(special => 
            special.name === 'Collect Weapons' && special.trigger === 'on_any_death'
          );
          
          console.log(`  🔍 Hoarder found! Has Collect Weapons special: ${!!collectWeaponsSpecial}`);
          
          if (collectWeaponsSpecial && deadHero.name !== 'Hoarder') {
            // Skip heroes without basic attacks (like Assassin with '—')
            if (!deadHero.BasicAttack || deadHero.BasicAttack === '—' || deadHero.BasicAttack === '-') {
              console.log(`💰 ${hero.name}'s Collect Weapons: ${deadHero.name} has no basic attack to collect`);
              return;
            }
            
            console.log(`💰 ${hero.name}'s Collect Weapons: ${deadHero.name} has fallen!`);
            
            // Initialize scaling buffs if not present
            if (!hero.scalingBuffs) {
              hero.scalingBuffs = {};
            }
            if (!hero.scalingBuffs.collectedDice) {
              hero.scalingBuffs.collectedDice = [];
            }
            
            // Get the dead hero's current attack dice (including any buffs like Champion's stacks)
            let attackDice = deadHero.BasicAttack;
            
            // If the dead hero has scaling damage buffs (like Champion with Last Stand), include them
            if (deadHero.scalingBuffs && deadHero.scalingBuffs.damage) {
              const bonusDice = deadHero.scalingBuffs.damage;
              console.log(`  💎 ${deadHero.name} had +${bonusDice}D6 from scaling buffs - Hoarder copies all dice!`);
              // Add the bonus dice to the base attack
              attackDice = `${attackDice}+${bonusDice}D6`;
            }
            
            // Store the collected dice
            hero.scalingBuffs.collectedDice.push({
              from: deadHero.name,
              dice: attackDice,
              timestamp: Date.now()
            });
            
            console.log(`  ⚔️ ${hero.name} collects ${attackDice} from ${deadHero.name}! Total collected: ${hero.scalingBuffs.collectedDice.length}`);
            console.log(`  📋 Current collected dice:`, hero.scalingBuffs.collectedDice.map(c => `${c.dice} from ${c.from}`).join(', '));
            
            // Update hero's display stats to show the new damage
            this.updateHeroDisplayStats(hero);
          }
        }
      });
    }
    
    // Also check opponent's team for Hoarder (cross-team collection)
    console.log(`🔍 Checking for Hoarder in opponent's team for ${deadHero.name}'s death...`);
    game.players.forEach(player => {
      player.team.forEach(hero => {
        if (hero.currentHP > 0 && hero.name === 'Hoarder') {
          console.log(`  🔍 Found Hoarder in opponent team, checking if should collect from ${deadHero.name}...`);
          console.log(`    - Hoarder !== deadHero: ${hero !== deadHero}`);
          console.log(`    - Not in same team: ${!deadHeroTeam.includes(hero)}`);
        }
        if (hero.currentHP > 0 && hero.name === 'Hoarder' && hero.Special) {
          const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
          const collectWeaponsSpecial = specials.find(special => 
            special.name === 'Collect Weapons' && special.trigger === 'on_any_death'
          );
          
          if (collectWeaponsSpecial && deadHero.name !== 'Hoarder' && hero !== deadHero && !deadHeroTeam.includes(hero)) {
            // Skip heroes without basic attacks (like Assassin with '—')
            if (!deadHero.BasicAttack || deadHero.BasicAttack === '—' || deadHero.BasicAttack === '-') {
              console.log(`💰 ${hero.name}'s Collect Weapons: Enemy ${deadHero.name} has no basic attack to collect`);
              return;
            }
            
            console.log(`💰 ${hero.name}'s Collect Weapons: Enemy ${deadHero.name} has fallen!`);
            
            // Initialize scaling buffs if not present
            if (!hero.scalingBuffs) {
              hero.scalingBuffs = {};
            }
            if (!hero.scalingBuffs.collectedDice) {
              hero.scalingBuffs.collectedDice = [];
            }
            
            // Get the dead hero's current attack dice (including any buffs like Champion's stacks)
            let attackDice = deadHero.BasicAttack;
            
            // If the dead hero has scaling damage buffs (like Champion with Last Stand), include them
            if (deadHero.scalingBuffs && deadHero.scalingBuffs.damage) {
              const bonusDice = deadHero.scalingBuffs.damage;
              console.log(`  💎 ${deadHero.name} had +${bonusDice}D6 from scaling buffs - Hoarder copies all dice!`);
              // Add the bonus dice to the base attack
              attackDice = `${attackDice}+${bonusDice}D6`;
            }
            
            // Store the collected dice
            hero.scalingBuffs.collectedDice.push({
              from: deadHero.name,
              dice: attackDice,
              timestamp: Date.now()
            });
            
            console.log(`  ⚔️ ${hero.name} collects ${attackDice} from ${deadHero.name}! Total collected: ${hero.scalingBuffs.collectedDice.length}`);
            
            // Update hero's display stats to show the new damage
            this.updateHeroDisplayStats(hero);
          }
        }
      });
    });
    
    game.players.forEach(player => {
      player.team.forEach(hero => {
        if (hero.passiveBuffs) {
          const originalBuffCount = hero.passiveBuffs.length;
          
          // Remove non-permanent buffs from the dead hero
          hero.passiveBuffs = hero.passiveBuffs.filter(buff => {
            if (!buff.permanent && buff.sourceHero === deadHero.name) {
              console.log(`  🚫 Removing ${buff.sourceName} buff (${buff.stat} +${buff.value}) from ${hero.name}`);
              return false;
            }
            return true;
          });
          
          const removedBuffs = originalBuffCount - hero.passiveBuffs.length;
          if (removedBuffs > 0) {
            console.log(`  ✨ Updated ${hero.name}: removed ${removedBuffs} aura buffs from ${deadHero.name}`);
            // Recalculate modified stats after removing buffs
            this.updateHeroDisplayStats(hero);
          }
        }
        
        // Remove taunt effects applied by the dead hero
        if (hero.statusEffects?.taunt) {
          const taunt = hero.statusEffects.taunt;
          if (taunt.appliedBy === deadHero.name || taunt.source === deadHero.name) {
            console.log(`🚫 Removing taunt from ${hero.name} (applied by dead hero ${deadHero.name})`);
            delete hero.statusEffects.taunt;
          }
        }
        
        // Remove Cavalier's Ride Down debuff if the Cavalier died
        if (hero.statusEffects?.rideDownDebuff && hero.statusEffects.rideDownDebuff.source === deadHero.name) {
          console.log(`🚫 Removing Cavalier's Ride Down debuff from ${hero.name} (Cavalier ${deadHero.name} died)`);
          delete hero.statusEffects.rideDownDebuff;
        }
        
        // Remove Dual Defender's Defense sharing if the Dual Defender died
        if (deadHero.name === 'Dual Defender' && hero.sharedDefense && hero.sharedDefense.source === deadHero.name) {
          console.log(`🚫 Removing Dual Defender's Defense sharing from ${hero.name} (Dual Defender died) - restoring original Defense from ${hero.sharedDefense.sharedValue} back to ${hero.sharedDefense.originalDefense}`);
          // Restore the original base Defense
          if (hero.Defense !== undefined) {
            hero.Defense = hero.sharedDefense.originalDefense;
          } else {
            hero.AC = hero.sharedDefense.originalDefense; // Fallback for legacy AC field
          }
          hero.modifiedDefense = hero.sharedDefense.originalDefense; // Reset modified Defense to base
          
          // Remove the passive buff entry for visual display
          if (hero.passiveBuffs) {
            hero.passiveBuffs = hero.passiveBuffs.filter(buff => 
              !(buff.sourceHero === deadHero.name && buff.sourceName === 'Defend' && buff.stat === 'Defense')
            );
          }
          
          delete hero.sharedDefense;
          // Clean up any legacy properties - originalAC is not used anymore
          this.updateHeroDisplayStats(hero);
        }
      });
    });
  }

  basicAttack(playerId, targetId) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || game.phase !== 'battle') {
      return { success: false, error: 'Invalid game state for attack' };
    }

    const currentTurnInfo = this.getCurrentTurnInfo(game);
    if (!currentTurnInfo || currentTurnInfo.player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const player = currentTurnInfo.player;
    const currentHero = currentTurnInfo.hero;
    
    // For Monks, use their specific attack tracking system
    if (currentHero.name === 'Monk') {
      if (player.monkAttacksRemaining <= 0) {
        return { success: false, error: 'Cannot use basic attack - no attacks remaining' };
      }
    } else {
      // For non-Monk heroes, use standard attack tracking
      if (!currentHero || player.hasUsedAttack) {
        // Check if hero has extra attack per turn (like Berserker's Frenzy or Brawler's Iron Fists)
        const hasExtraAttack = this.hasConditionalEffect(currentHero, 'extra_attack_per_turn');
        const hasAttackTwice = this.hasSpecialEffect(currentHero, 'attack_twice');
        
        if (!hasExtraAttack && !hasAttackTwice) {
          return { success: false, error: 'Cannot use basic attack' };
        }
        // If hero has extra attack, allow the attack even if hasUsedAttack is true
      }
    }

    // Check if basic attack is disabled
    if (currentHero.BasicAttack === "—" || hasSpecialEffect(currentHero, 'disable_basic_attack')) {
      return { success: false, error: 'This hero cannot use basic attacks' };
    }

    // Check if hero is stunned (cannot attack on next turn)
    if (currentHero.statusEffects?.stun?.active) {
      return { success: false, error: 'This hero is stunned and cannot attack' };
    }

    // Check if attacks are disabled (Dual Defender's Stun effect)
    if (currentHero.statusEffects?.disableAttack?.active) {
      return { success: false, error: 'This hero cannot attack this turn' };
    }

    // Check if target is selected
    if (!player.selectedTarget) {
      return { success: false, error: 'Must select a target first' };
    }

    // Validate target against taunt restrictions
    const tauntValidation = this.validateTargetAgainstTaunt(currentHero, player.selectedTarget);
    if (!tauntValidation.valid) {
      return { success: false, error: tauntValidation.error };
    }

    // Find target
    const opponent = game.players[1 - currentTurnInfo.playerIndex];
    const target = opponent.team.find(h => h.name === player.selectedTarget);
    
    if (!target || target.currentHP <= 0) {
      return { success: false, error: 'Invalid target' };
    }

    // Check if the target is untargetable (but allow the original attacker)
    if (target.statusEffects?.untargetable) {
      // Allow the original attacker who triggered Vanish to still target
      if (target.statusEffects.untargetableAttacker !== currentHero.name) {
        return { success: false, error: 'Cannot target this hero - they are untargetable' };
      }
    }

    // Calculate attack
    const advantageDisadvantage = this.hasAdvantageDisadvantage(currentHero, target, false, game);
    const attackRoll = calculateAttackRoll(currentHero.modifiedAccuracy, advantageDisadvantage.advantage, advantageDisadvantage.disadvantage, currentHero);
    
    // Check for Ace's "Ace Up The Sleeve" - convert roll of 1 to auto-hit crit
    if (currentHero.name === 'Ace' && attackRoll.roll === 1) {
      console.log(`🃏 ${currentHero.name}'s Ace Up The Sleeve activated! Auto-hit critical!`);
      attackRoll.total = 999; // Guarantee hit
      attackRoll.displayTotal = 20; // Show as natural 20 for display purposes
      attackRoll.isCritical = true;
      attackRoll.crit = true;
    }
    
    const hit = attackRoll.total >= calculateEffectiveDefense(target);
    
    // Initialize statusEffects array early to collect all special effects
    let statusEffects = [];
    
    // Check for Monk's Deflect protection before damage is dealt
    let monkDeflected = false;
    let deflectCounterDamage = 0;
    let deflectingMonk = null;
    
    if (hit && game) {
      const targetPlayer = game.players.find(p => p.team.some(h => h.name === target.name));
      if (targetPlayer) {
        // Look for Monk ally who can deflect this attack
        const monk = targetPlayer.team.find(h => h.name === 'Monk' && h.currentHP > 0);
        // Monk cannot deflect attacks from itself
        if (monk && monk.name !== currentHero.name && attackRoll.total < calculateEffectiveDefense(monk) && !targetPlayer.monkDeflectUsed) {
          // Monk deflects the attack
          monkDeflected = true;
          deflectingMonk = monk;
          targetPlayer.monkDeflectUsed = true; // Mark deflect as used this round
          
          // Counter-attack the attacker using centralized damage application
          const counterDamageRoll = calculateDamage('1D6', false, false, monk);
          deflectCounterDamage = counterDamageRoll.total;
          
          // Use centralized damage application to trigger on_take_damage effects (like Shroomguard's Poison Aura)
          const onDamageTriggers = this.applyDamageToHero(game, currentHero, deflectCounterDamage, monk, 'Monk Deflect');
          
          console.log(`🛡️ ${monk.name} deflects attack on ${target.name} (${attackRoll.total} < ${calculateEffectiveDefense(monk)}) and counters for ${deflectCounterDamage} damage`);
          
          // Add comprehensive special log entry for Monk Deflect
          const deflectSpecialLogEntry = this.createSpecialLogEntry(
            monk, 
            'Deflect', 
            null, // No trigger context to avoid "Monk used Deflect" redundancy
            counterDamageRoll,
            [
              {
                type: 'damage',
                target: currentHero.name,
                damage: deflectCounterDamage,
                damageRoll: counterDamageRoll,
                newHP: currentHero.currentHP,
                maxHP: currentHero.HP
              },
              ...onDamageTriggers
            ]
          );
          statusEffects.push(deflectSpecialLogEntry);
          
          if (currentHero.currentHP <= 0 && !currentHero.statusEffects?.justResurrected) {
            this.updatePassiveEffectsOnDeath(game, currentHero, monk, 'counter_attack');
            // Mark that the attacker died from Monk Deflect so we can auto-advance turn
            currentHero.diedFromCounterAttack = true;
          }
        }
      }
    }
    
    // Consume advantage effects after the attack roll
    this.consumeAdvantageEffects(currentHero, target);
    
    let damage = 0;
    let damageRollResult = null;
    
    if (hit && !monkDeflected) {
      damageRollResult = calculateDamage(currentHero.BasicAttack, attackRoll.isCritical, false, currentHero, true);
      damage = damageRollResult.total;
      
      // Process damage reduction specials (like Wizard's Arcane Shield)
      const damageReductionResult = this.processDamageReductionSpecials(game, target, currentHero, damage);
      damage = damageReductionResult.finalDamage;
      statusEffects.push(...damageReductionResult.specialEffects);
      
      target.currentHP = Math.max(0, target.currentHP - damage);
      
      // Process Angel's Health Link reflection if target is Angel
      if (target.name === 'Angel' && damage > 0) {
        this.processHealthLinkReflection(game, target, damage);
      }
      
      // Check for Paladin Shield of Faith (basic attacks)
      this.checkPaladinShieldOfFaith(game, currentHero, target, damage);
      
      // Trigger after-damage effects (like Ninja's Vanish)
      const afterDamageSpecials = this.processAfterDamageEffects(game, target, currentHero, damage);
      statusEffects.push(...afterDamageSpecials);
      
      // Trigger on_take_damage effects (like Shroomguard's Poison Aura)
      const onTakeDamageSpecials = this.processOnTakeDamageEffects(game, target, currentHero, damage);
      statusEffects.push(...onTakeDamageSpecials);
      
      // Cavalier's Ride Down: Apply debuff to enemies hit by Cavalier (basic attacks and abilities)
      if (currentHero.name === 'Cavalier' && damage > 0) {
        if (!target.statusEffects) target.statusEffects = {};
        target.statusEffects.rideDownDebuff = {
          source: currentHero.name,
          maxHP: target.HP // Store original max HP to detect full healing
        };
        console.log(`🎯 ${target.name} debuffed by Cavalier's Ride Down (basic attack) - all attacks against them have advantage until healed to full HP`);
      }
      
      // Process hit-confirmed triggers (like Elementalist's Wind Wall)
      this.processHitConfirmedTriggers(game, currentHero, target, 'basic_attack');
      
      // Check HP-based conditions after taking damage
      this.checkHPConditions(game, target);
      
      // Check if target died (but only if not just resurrected)
      if (target.currentHP <= 0 && !target.statusEffects?.justResurrected) {
        statusEffects.push({ type: 'death', target: target.name });
        this.updatePassiveEffectsOnDeath(game, target, currentHero, 'damage');
      }
    } else {
      // Attack missed - check for counter-attack abilities like Warden's Shield Bash
      const counterAttackResults = this.processCounterAttacks(game, target, currentHero, 'on_miss_by_ac');
      if (counterAttackResults.length > 0) {
        statusEffects.push(...counterAttackResults);
      }
    }

    // Handle attack usage tracking
    if (currentHero.name === 'Monk') {
      // Monk logic: Track total attacks remaining (starts at 1, ability adds 1 more)
      player.monkAttacksRemaining--;
      console.log(`👊 Monk used basic attack. ${player.monkAttacksRemaining} attacks remaining this turn.`);
      
      // Don't set hasUsedAttack for Monks - they use their own tracking system
      // Only set it if they truly have no attacks left (shouldn't happen normally)
      if (player.monkAttacksRemaining <= 0) {
        player.hasUsedAttack = true;
      }
    } else {
      // Check if hero can attack multiple times (like Berserker's Frenzy or Brawler's Iron Fists)
      const hasExtraAttack = this.hasConditionalEffect(currentHero, 'extra_attack_per_turn');
      const hasAttackTwice = this.hasSpecialEffect(currentHero, 'attack_twice');
      
      if (hasExtraAttack || hasAttackTwice) {
        // For multiple attacks, track usage per attack
        if (!player.usedAttacks) player.usedAttacks = 0;
        player.usedAttacks++;
        
        // Allow up to 2 attacks for multiple attack heroes
        if (player.usedAttacks >= 2) {
          player.hasUsedAttack = true;
        }
      } else {
        // Normal heroes: one attack per turn
        player.hasUsedAttack = true;
      }
    }

    // Check win condition after target death
    const winner = this.checkWinCondition(game);
    if (winner) {
      game.phase = 'ended';
      game.winner = winner;
    }

    // Check if current hero died from recoil and auto-advance turn
    let autoAdvanced = false;
    if (currentHero.currentHP <= 0) {
      console.log(`💀 ${currentHero.name} died during their turn, auto-advancing to opponent`);
      const endTurnResult = this.endTurn(playerId);
      if (endTurnResult.success) {
        autoAdvanced = true;
      }
      // Clear death flags if they exist
      if (currentHero.diedFromBomberExplosion) {
        currentHero.diedFromBomberExplosion = false;
      }
      if (currentHero.diedFromCounterAttack) {
        currentHero.diedFromCounterAttack = false;
      }
    }

    // Get death trigger effects before returning
    const deathTriggerEffects = game.deathTriggerEffects || [];
    
    // Clear death trigger effects after capturing them
    if (game.deathTriggerEffects) {
      game.deathTriggerEffects = [];
    }

    return {
      success: true,
      gameId,
      hit,
      damage,
      attackRoll: attackRoll.roll,
      attackTotal: attackRoll.displayTotal || attackRoll.total,
      advantageInfo: attackRoll.advantageInfo,
      damageRoll: damageRollResult ? damageRollResult.rolls : undefined,
      damageTotal: damage,
      isCritical: attackRoll.isCritical,
      targetHP: target.currentHP,
      attacker: currentHero.name,
      target: target.name,
      statusEffects,
      autoAdvanced,
      winner: game.winner,
      gameState: this.getFullGameState(game),
      monkDeflected,
      deflectCounterDamage,
      deflectingMonk: deflectingMonk ? deflectingMonk.name : null,
      deathTriggerEffects
    };
  }

  useAbility(playerId, abilityIndex, targetId, allyTargetId = null) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || game.phase !== 'battle') {
      return { success: false, error: 'Invalid game state for ability' };
    }

    const currentTurnInfo = this.getCurrentTurnInfo(game);
    if (!currentTurnInfo || currentTurnInfo.player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const player = currentTurnInfo.player;
    const currentHero = currentTurnInfo.hero;
    
    if (!currentHero || !currentHero.Ability[abilityIndex]) {
      return { success: false, error: 'Invalid ability' };
    }

    // Check if hero can use abilities (not silenced or permanently disabled)
    if (currentHero.statusEffects?.silenced && 
        (currentHero.statusEffects.silenced === true || currentHero.statusEffects.silenced.active)) {
      return { success: false, error: 'Hero is silenced and cannot use abilities' };
    }

    // Check if abilities are permanently disabled (Dragon Rider's Dismount)
    if (currentHero.permanentDisables?.abilities) {
      return { success: false, error: 'This hero\'s abilities are permanently disabled' };
    }

    // Get the ability first
    const ability = currentHero.Ability[abilityIndex];
    
    // Check Hoarder's custom silence - prevent using abilities against Hoarder if debuffed
    if (currentHero.statusEffects?.cannotTargetWithAbility) {
      const debuff = currentHero.statusEffects.cannotTargetWithAbility;
      // Check if trying to target the Hoarder who applied the debuff
      const opponent = game.players[1 - currentTurnInfo.playerIndex];
      const targetHero = opponent.team.find(h => h.name === targetId) || 
                        player.team.find(h => h.name === targetId);
      
      if (targetHero && targetHero.name === debuff.owner) {
        return { success: false, error: `Cannot use abilities against ${debuff.owner} (Bribed)` };
      }
    }
    
    // Check if already used ability (unless hero can use multiple)
    const canUseTwice = hasSpecialEffect(currentHero, 'use_ability_twice') || 
                       hasSpecialEffect(currentHero, 'use_twice_per_turn') ||
                       (currentHero.name === 'Sorcerer' && player.twinSpellActive);
    
    // For heroes that can use abilities multiple times, track individual usage
    if (canUseTwice) {
      // Initialize usedAbilities if it doesn't exist (for backward compatibility)
      if (!player.usedAbilities) {
        player.usedAbilities = [];
      }
      
      if (currentHero.Ability && currentHero.Ability.length > 1) {
        // Heroes with multiple abilities (like Blood Hunter) - each ability once
        if (player.usedAbilities.includes(ability.name)) {
          return { success: false, error: `${ability.name} already used this turn` };
        }
      } else {
        // Heroes with single ability (like Assassin or Twin Spell Sorcerer) - same ability twice
        const usageCount = player.usedAbilities.filter(name => name === ability.name).length;
        const maxUses = (currentHero.name === 'Sorcerer' && player.twinSpellActive) ? 2 : 2;
        if (usageCount >= maxUses) {
          return { success: false, error: `${ability.name} already used ${maxUses === 2 ? 'twice' : 'maximum times'} this turn` };
        }
      }
    } else if (player.hasUsedAbility) {
      return { success: false, error: 'Already used ability this turn' };
    }

    // Check if target is selected
    if (!player.selectedTarget) {
      return { success: false, error: 'Must select a target first' };
    }

    // Validate target against taunt restrictions  
    const tauntValidation = this.validateTargetAgainstTaunt(currentHero, player.selectedTarget);
    if (!tauntValidation.valid) {
      return { success: false, error: tauntValidation.error };
    }
    const opponent = game.players[1 - currentTurnInfo.playerIndex];

    // Check if the selected target is still alive (for abilities that target enemies)
    const selectedTargetHero = opponent.team.find(h => h.name === player.selectedTarget) || 
                               player.team.find(h => h.name === player.selectedTarget);
    
    if (selectedTargetHero && selectedTargetHero.currentHP <= 0) {
      return { success: false, error: 'Cannot target dead heroes' };
    }

    // Check if the selected target is untargetable (but allow AOE abilities and the original attacker)
    const isAOEAbility = ability.target_type === 'all_enemies' || 
                        (ability.primary_effects && ability.primary_effects.some(effect => effect.target === 'all_enemies'));
    
    if (selectedTargetHero && selectedTargetHero.statusEffects?.untargetable && !isAOEAbility) {
      // Allow the original attacker who triggered Vanish to still target
      if (selectedTargetHero.statusEffects.untargetableAttacker !== currentHero.name) {
        return { success: false, error: 'Cannot target this hero - they are untargetable' };
      }
    }
    
    // Check if this is a multi-target ability (like cleave)
    const isMultiTargetAbility = ability.target_type === 'multi_target' || ability.category === 'multi_target_damage';
    
    let results = [];
    let targetName;
    
    if (isAOEAbility) {
      // For AOE abilities, process all enemy targets
      const allEnemyTargets = opponent.team.filter(h => h.currentHP > 0);
      
      if (allEnemyTargets.length === 0) {
        return { success: false, error: 'No valid targets available' };
      }
      
      targetName = 'All Enemies';
      
      // Process the ability for each enemy target
      for (const target of allEnemyTargets) {
        const targetResults = this.processAbilityEffects(ability, currentHero, target, player, opponent, game, null, null, null, null);
        results.push(...targetResults);
      }
    } else if (isMultiTargetAbility) {
      // For multi-target abilities like cleave, process each target individually with separate rolls
      let primaryTarget = opponent.team.find(h => h.name === player.selectedTarget);
      
      // If not found in opponent team, look in player's team (for healing abilities)
      if (!primaryTarget) {
        primaryTarget = player.team.find(h => h.name === player.selectedTarget);
      }
      
      if (!primaryTarget) {
        return { success: false, error: 'Selected target not found' };
      }

      targetName = `${primaryTarget.name} + Adjacent`;
      
      // Collect all targets for this multi-target ability
      const allTargets = [primaryTarget];
      
      console.log(`🎯 Multi-target ability ${ability.name}: Primary target is ${primaryTarget.name}`);
      
      // Check for adjacent targets based on the ability effects
      for (const effect of ability.primary_effects || []) {
        console.log(`🔍 Checking effect target: ${effect.target}`);
        if (effect.target === 'adjacent_enemy' || effect.target === 'adjacent_enemy_left' || effect.target === 'adjacent_enemy_right') {
          const adjacentTarget = this.resolveEffectTarget(effect, primaryTarget, currentHero, player, opponent, game, allyTargetId);
          console.log(`🎯 Adjacent target resolved: ${adjacentTarget ? adjacentTarget.name : 'null'}`);
          if (adjacentTarget && !allTargets.includes(adjacentTarget)) {
            allTargets.push(adjacentTarget);
            console.log(`✅ Added ${adjacentTarget.name} to targets list`);
          }
        }
      }
      
      console.log(`🎯 Final targets for ${ability.name}:`, allTargets.map(t => t.name));
      
      // Process each target individually with separate attack and damage rolls
      for (const target of allTargets) {
        const targetResults = this.processAbilityEffects(ability, currentHero, target, player, opponent, game, target, null, null, null);
        results.push(...targetResults);
      }
    } else {
      // Single target ability - use existing logic
      let target = opponent.team.find(h => h.name === player.selectedTarget);
      
      // If not found in opponent team, look in player's team (for healing abilities)
      if (!target) {
        target = player.team.find(h => h.name === player.selectedTarget);
      }
      
      if (!target) {
        return { success: false, error: 'Selected target not found' };
      }

      targetName = target.name;
      results = this.processAbilityEffects(ability, currentHero, target, player, opponent, game, null, allyTargetId, null, null);
    }
    
    // Track ability usage
    player.hasUsedAbility = true;
    
    // For heroes that can use abilities multiple times, track specific ability usage
    const hasMultipleAbilityUse = hasSpecialEffect(currentHero, 'use_ability_twice') || 
                                 hasSpecialEffect(currentHero, 'use_twice_per_turn') ||
                                 (currentHero.name === 'Sorcerer' && player.twinSpellActive);
    if (hasMultipleAbilityUse) {
      // Initialize usedAbilities if it doesn't exist (for backward compatibility)
      if (!player.usedAbilities) {
        player.usedAbilities = [];
      }
      player.usedAbilities.push(ability.name);
      
      // For heroes with single ability that can be used twice, don't mark hasUsedAbility as true
      // until they've used it twice
      if (currentHero.Ability && currentHero.Ability.length === 1) {
        const usageCount = player.usedAbilities.filter(name => name === ability.name).length;
        if (usageCount < 2) {
          player.hasUsedAbility = false; // Allow them to use it again
        }
        
        // Special handling for Sorcerer Twin Spell
        if (currentHero.name === 'Sorcerer' && player.twinSpellActive && usageCount >= 2) {
          player.twinSpellActive = false; // Clear the flag after second use
        }
      }
    }

    // Check win condition after any hero deaths from ability effects
    const winner = this.checkWinCondition(game);
    if (winner) {
      game.phase = 'ended';
      game.winner = winner;
    }

    // Check if current hero died from recoil and auto-advance turn
    let autoAdvanced = false;
    if (currentHero.currentHP <= 0) {
      console.log(`💀 ${currentHero.name} died during their turn, auto-advancing to opponent`);
      const endTurnResult = this.endTurn(playerId);
      if (endTurnResult.success) {
        autoAdvanced = true;
      }
      // Clear death flags if they exist
      if (currentHero.diedFromBomberExplosion) {
        currentHero.diedFromBomberExplosion = false;
      }
      if (currentHero.diedFromCounterAttack) {
        currentHero.diedFromCounterAttack = false;
      }
    }

    return {
      success: true,
      gameId,
      ability: ability.name,
      caster: currentHero.name,
      target: targetName,
      results,
      autoAdvanced,
      winner: game.winner,
      gameState: this.getFullGameState(game),
      deathTriggerEffects: game.deathTriggerEffects || []
    };
  }

  useTimekeeperSelectedAbility(playerId, timekeeperTargetId, allyTargetId, selectedAbilityIndex) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || game.phase !== 'battle') {
      return { success: false, error: 'Invalid game state for ability' };
    }

    const currentTurnInfo = this.getCurrentTurnInfo(game);
    if (!currentTurnInfo || currentTurnInfo.player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const player = currentTurnInfo.player;
    const timekeeper = currentTurnInfo.hero;
    
    if (!timekeeper || timekeeper.name !== 'Timekeeper') {
      return { success: false, error: 'Only Timekeeper can use this method' };
    }

    // Find the ally and enemy targets
    const allyToCommand = this.findHeroByName(game, allyTargetId);
    const primaryTarget = this.findHeroByName(game, timekeeperTargetId);
    
    if (!allyToCommand || !primaryTarget) {
      return { success: false, error: 'Invalid target selection' };
    }

    // Verify the ally has the selected ability
    if (!allyToCommand.Ability || !allyToCommand.Ability[selectedAbilityIndex]) {
      return { success: false, error: 'Invalid ability selection' };
    }

    const opponent = game.players.find(p => p.id !== playerId);
    const chronoShiftAbility = timekeeper.Ability.find(a => a.name === 'Chrono Shift');
    
    if (!chronoShiftAbility) {
      return { success: false, error: 'Timekeeper does not have Chrono Shift ability' };
    }

    // Process the Timekeeper ability with the selected ability index
    const results = this.processTimekeeperSelectedAbility(chronoShiftAbility, timekeeper, primaryTarget, player, opponent, game, allyToCommand, selectedAbilityIndex);
    
    player.hasUsedAbility = true;

    // Check win condition after any hero deaths from ability effects
    const winner = this.checkWinCondition(game);
    if (winner) {
      game.phase = 'ended';
      game.winner = winner;
    }

    return {
      success: true,
      gameId,
      ability: chronoShiftAbility.name,
      caster: timekeeper.name,
      target: primaryTarget.name,
      results,
      winner: game.winner,
      gameState: this.getFullGameState(game)
    };
  }

  // Centralized function to create comprehensive ability log entries
  createAbilityLogEntry(ability, caster, target, attackRoll, abilityHit, results, commandContext = null) {
    console.log(`🔍 Creating comprehensive log for ${caster.name} using ${ability.name}:`, {
      target: target?.name,
      attackRoll: attackRoll?.roll,
      abilityHit,
      resultsCount: results.length
    });
    let logMessage = `${caster.name} used ${ability.name}`;
    
    // Add target information
    if (target) {
      logMessage += ` on ${target.name}`;
    }
    
    // Add roll information for abilities that require attack rolls
    let rollInfo = null;
    if (attackRoll) {
      rollInfo = {
        attackRoll: attackRoll.roll,
        attackTotal: attackRoll.displayTotal || attackRoll.total,
        advantageInfo: attackRoll.advantageInfo,
        accuracy: caster.modifiedAccuracy,
        isTimekeeperCommand: attackRoll.isTimekeeperCommand || false,
        commandingHero: attackRoll.commandingHero || null
      };
    }
    
    // Determine hit/miss/crit status
    let hitStatus = '';
    if (attackRoll) {
      if (abilityHit) {
        hitStatus = attackRoll.isCritical ? 'CRITICAL HIT' : 'HIT';
      } else {
        hitStatus = 'MISS';
      }
    } else {
      // Auto-success abilities don't show hit/miss
      hitStatus = null;
    }
    
    // Collect all effects that occurred
    let effects = [];
    let totalDamage = 0;
    let totalHealing = 0;
    let statusEffectsApplied = [];
    
    for (const result of results) {
      if (result.target === target?.name || (!target && result.type !== 'ability_activation')) {
        switch (result.type) {
          case 'damage':
          case 'lifesteal_damage':
            if (result.hit && result.damage > 0) {
              totalDamage += result.damage;
            }
            break;
          case 'heal':
          case 'heal_to_full':
            if (result.hit && result.healing > 0) {
              totalHealing += result.healing;
            }
            break;
          case 'apply_buff':
          case 'apply_debuff':
            if (result.hit) {
              statusEffectsApplied.push({
                effect: result.effect,
                target: result.target || target?.name
              });
            }
            break;
        }
      }
    }
    
    // Build the complete message with effects (hit/miss/crit shown separately in UI)
    // Skip hitStatus as it's redundant with the colored text below
    
    // Add healing information (damage is shown separately in UI)
    if (totalHealing > 0) {
      logMessage += ` → healed ${totalHealing} HP`;
    }
    
    // Add status effects
    if (statusEffectsApplied.length > 0) {
      const effectTexts = statusEffectsApplied.map(se => {
        const targetText = se.target !== target?.name ? ` on ${se.target}` : '';
        return `applied ${se.effect}${targetText}`;
      });
      logMessage += ` and ${effectTexts.join(' and ')}`;
    }
    
    return {
      type: 'ability_comprehensive',
      caster: caster.name,
      abilityName: ability.name,
      target: target?.name || 'Multiple Targets',
      message: logMessage,
      hit: abilityHit !== false, // null for auto-success, true/false for attack rolls
      isCritical: attackRoll?.isCritical || false,
      damage: totalDamage > 0 ? totalDamage : undefined,
      healing: totalHealing > 0 ? totalHealing : undefined,
      statusEffects: statusEffectsApplied,
      ...rollInfo,
      isTimekeeperCommand: commandContext?.commandingHero ? true : false,
      commandingHero: commandContext?.commandingHero || null
    };
  }

  // Centralized function to create comprehensive special log entries
  createSpecialLogEntry(hero, specialName, triggerContext = null, attackRoll = null, results = []) {
    console.log(`🔍 Creating comprehensive special log for ${hero.name}'s ${specialName}:`, {
      triggerContext,
      attackRoll: attackRoll?.roll,
      resultsCount: results.length
    });
    
    // For reactive specials with trigger context, don't add "used" - the context will provide the action
    let logMessage = triggerContext ? `${hero.name}'s ${specialName}` : `${hero.name} used ${specialName}`;
    
    // Collect all effects that occurred
    let totalDamage = 0;
    let totalHealing = 0;
    let specialEffects = [];
    let damageTargets = [];
    let firstDamageValue = null; // For multi-target attacks that deal same damage to all
    
    for (const result of results) {
      switch (result.type) {
        case 'damage':
        case 'counter_attack':
          if (result.damage > 0) {
            totalDamage += result.damage;
            if (firstDamageValue === null) {
              firstDamageValue = result.damage;
            }
            if (result.target) {
              damageTargets.push(result.target);
            }
          }
          break;
        case 'heal':
          if (result.healing > 0) {
            totalHealing += result.healing;
          }
          break;
        case 'summon':
          specialEffects.push('summoned Beast');
          break;
        case 'status_effect':
          if (result.effect === 'untargetable') {
            specialEffects.push('became untargetable');
          } else if (result.effect === 'damage_stack') {
            specialEffects.push('gained damage stack');
          } else {
            specialEffects.push(`applied ${result.effect}`);
          }
          break;
      }
    }
    
    // Build the complete message with effects
    let effectsText = [];
    
    // Add damage text if it affected multiple targets or all heroes
    if (totalDamage > 0) {
      if (damageTargets.length > 2) {
        // Multi-target effect like Aura of Death (same damage to all)
        // Check if all targets took the same damage (indicating AoE with single roll)
        const allSameDamage = results.every(r => r.type === 'damage' && r.damage === firstDamageValue);
        if (allSameDamage) {
          effectsText.push(`dealt ${firstDamageValue} damage to all heroes`);
        } else {
          effectsText.push(`dealt damage to all heroes`);
        }
      } else if (damageTargets.length === 1) {
        // Single target
        effectsText.push(`dealt ${totalDamage} damage to ${damageTargets[0]}`);
      } else if (damageTargets.length > 1) {
        // Few targets
        effectsText.push(`dealt damage to ${damageTargets.join(', ')}`);
      }
    }
    
    // Don't add healing to effectsText - let the frontend display it to avoid redundancy
    // if (totalHealing > 0) {
    //   effectsText.push(`healed ${totalHealing} HP`);
    // }
    
    if (specialEffects.length > 0) {
      effectsText.push(...specialEffects);
    }
    
    // Add trigger context for reactive specials after the main message
    if (triggerContext) {
      if (triggerContext.deflectedAttack) {
        logMessage = `${hero.name}'s ${specialName} activated → deflected ${triggerContext.attacker}'s ${triggerContext.attackName}`;
        if (effectsText.length > 0) {
          logMessage += ` and ${effectsText.join(' and ')}`;
        }
      } else if (effectsText.length > 0) {
        logMessage += ` and ${effectsText.join(' and ')}`;
      }
    } else if (effectsText.length > 0) {
      logMessage += ` and ${effectsText.join(' and ')}`;
    }
    
    // Add roll information if applicable
    let rollInfo = null;
    if (attackRoll) {
      rollInfo = {
        attackRoll: attackRoll.roll,
        attackTotal: attackRoll.displayTotal || attackRoll.total,
        advantageInfo: attackRoll.advantageInfo,
        accuracy: attackRoll.accuracy || null
      };
    }
    
    return {
      type: 'special_comprehensive',
      caster: hero.name,
      specialName: specialName,
      target: triggerContext?.target || null,
      message: logMessage,
      hit: attackRoll ? true : null, // null for auto-success, true for attack rolls
      isCritical: attackRoll?.isCritical || false,
      damage: totalDamage > 0 ? totalDamage : undefined,
      healing: totalHealing > 0 ? totalHealing : undefined,
      specialEffects,
      triggerContext,
      ...rollInfo
    };
  }

  processAbilityEffects(ability, caster, primaryTarget, casterPlayer, opponent, game, specificTarget = null, allyTarget = null, excludeAdvantageFrom = null, commandContext = null) {
    const results = [];
    
    // Special handling for Beast Tamer conditional summoning/commanding
    if (caster.name === 'Beast Tamer' && ability.name === 'Call Beast / Command Attack') {
      return this.processBeastTamerAbility(ability, caster, primaryTarget, casterPlayer, opponent, game);
    }
    
    // Special handling for Engineer's Call Turret (summon turrets)
    if (caster.name === 'Engineer' && ability.name === 'Call Turret') {
      return this.processEngineerAbility(ability, caster, primaryTarget, casterPlayer, opponent, game);
    }

    // Special handling for Medic's Med Bots (summon med bots)
    if (caster.name === 'Medic' && ability.name === 'Med Bots') {
      return this.processMedicAbility(ability, caster, primaryTarget, casterPlayer, opponent, game);
    }

    // Special handling for Shaman's Elemental Strike (summon totems and deal damage per totem)
    if (caster.name === 'Shaman' && ability.name === 'Elemental Strike') {
      return this.processShamanAbility(ability, caster, primaryTarget, casterPlayer, opponent, game);
    }
    
    // Special handling for Timekeeper ally command ability
    if (caster.name === 'Timekeeper' && ability.name === 'Chrono Shift' && (!commandContext || !commandContext.preventRecursion)) {
      return this.processTimekeeperAbility(ability, caster, primaryTarget, casterPlayer, opponent, game, allyTarget);
    }
    
    // Special handling for Diplomat's Declare War (command adjacent allies to attack)
    if (caster.name === 'Diplomat' && ability.name === 'Declare War') {
      return this.processDiplomatAbility(ability, caster, primaryTarget, casterPlayer, opponent, game);
    }
    
    // Get all effects from both primary and secondary effects
    const allEffects = [
      ...(ability.primary_effects || []),
      ...(ability.secondary_effects || [])
    ];
    
    // Check if any effect grants advantage
    const hasAdvantage = allEffects.some(effect => effect.advantage === true);
    
    // Determine if this ability needs an attack roll
    // Self-healing and self-buff abilities don't need attack rolls
    const needsAttackRoll = ability.category !== 'heal_self' && 
                           ability.category !== 'apply_buff' && 
                           ability.target_type !== 'self_only' &&
                           allEffects.some(effect => 
                             effect.type === 'damage' || 
                             effect.type === 'lifesteal_damage' ||
                             (effect.type === 'apply_debuff' && effect.target !== 'self')
                           );
    
    let attackRoll = null;
    let abilityHit = true; // Default to true for abilities that don't need rolls
    
    // Use the specific target for attack roll calculations if provided, otherwise use primary target
    const targetForRoll = specificTarget || primaryTarget;
    
    if (needsAttackRoll) {
      // Check if this is a commanded ability from Timekeeper
      if (commandContext && commandContext.isCommandedByTimekeeper) {
        // Commanded abilities use the ally's own accuracy and roll normally
        const advantageDisadvantageForAbility = this.hasAdvantageDisadvantage(caster, targetForRoll, true, game, excludeAdvantageFrom);
        attackRoll = calculateAttackRoll(caster.modifiedAccuracy, advantageDisadvantageForAbility.advantage, advantageDisadvantageForAbility.disadvantage, caster);
        attackRoll.isTimekeeperCommand = true; // Flag to identify this as a Timekeeper commanded ability
        attackRoll.commandingHero = commandContext.commandingHero;
        
        // Check for Ace's "Ace Up The Sleeve" - convert roll of 1 to auto-hit crit
        if (caster.name === 'Ace' && attackRoll.roll === 1) {
          console.log(`🃏 ${caster.name}'s Ace Up The Sleeve activated on ${ability.name} (commanded by ${commandContext.commandingHero})! Auto-hit critical!`);
          attackRoll.total = 999; // Guarantee hit
          attackRoll.displayTotal = 20; // Show as natural 20 for display purposes
          attackRoll.isCritical = true;
          attackRoll.crit = true;
        }
        
        abilityHit = attackRoll.total >= calculateEffectiveDefense(targetForRoll);
        
        const rollText = attackRoll.advantageInfo 
          ? `${attackRoll.advantageInfo.roll1} and ${attackRoll.advantageInfo.roll2} (${attackRoll.advantageInfo.type}, chose ${attackRoll.advantageInfo.chosen})`
          : attackRoll.roll;
        console.log(`🎯 ${caster.name} uses ${ability.name} (commanded by ${commandContext.commandingHero}): Roll ${rollText}+${caster.modifiedAccuracy} = ${attackRoll.total} vs Defense ${calculateEffectiveDefense(targetForRoll)} → ${abilityHit ? 'HIT' : 'MISS'}${attackRoll.crit ? ' (CRITICAL!)' : ''}`);
      } else {
        // Normal ability roll calculation
        const advantageDisadvantageForAbility = this.hasAdvantageDisadvantage(caster, targetForRoll, true, game, excludeAdvantageFrom);
        attackRoll = calculateAttackRoll(caster.modifiedAccuracy, advantageDisadvantageForAbility.advantage, advantageDisadvantageForAbility.disadvantage, caster);
        
        // Check for Ace's "Ace Up The Sleeve" - convert roll of 1 to auto-hit crit
        if (caster.name === 'Ace' && attackRoll.roll === 1) {
          console.log(`🃏 ${caster.name}'s Ace Up The Sleeve activated on ${ability.name}! Auto-hit critical!`);
          attackRoll.total = 999; // Guarantee hit
          attackRoll.displayTotal = 20; // Show as natural 20 for display purposes
          attackRoll.isCritical = true;
          attackRoll.crit = true;
        }
        
        abilityHit = attackRoll.total >= calculateEffectiveDefense(targetForRoll);
        
        const rollText = attackRoll.advantageInfo 
          ? `${attackRoll.advantageInfo.roll1} and ${attackRoll.advantageInfo.roll2} (${attackRoll.advantageInfo.type}, chose ${attackRoll.advantageInfo.chosen})`
          : attackRoll.roll;
        console.log(`🎯 ${caster.name} uses ${ability.name}: Roll ${rollText}+${caster.modifiedAccuracy} = ${attackRoll.total} vs Defense ${calculateEffectiveDefense(targetForRoll)} → ${abilityHit ? 'HIT' : 'MISS'}${attackRoll.crit ? ' (CRITICAL!)' : ''}`);
      }
      
      // Check for Monk's Deflect protection before ability damage is dealt
      let monkDeflected = false;
      if (abilityHit && game && targetForRoll) {
        const targetPlayer = game.players.find(p => p.team.some(h => h.name === targetForRoll.name));
        if (targetPlayer) {
          // Look for Monk ally who can deflect this ability
          const monk = targetPlayer.team.find(h => h.name === 'Monk' && h.currentHP > 0);
          if (monk && attackRoll.total < calculateEffectiveDefense(monk) && !targetPlayer.monkDeflectUsed) {
            // Monk deflects the ability
            monkDeflected = true;
            abilityHit = false; // Prevent ability effects from happening
            targetPlayer.monkDeflectUsed = true; // Mark deflect as used this round
            
            // Counter-attack the caster using centralized damage application
            const counterDamageRoll = calculateDamage('1D6', false, false, monk);
            const counterDamage = counterDamageRoll.total;
            
            // Use centralized damage application to trigger on_take_damage effects (like Shroomguard's Poison Aura)
            const onDamageTriggers = this.applyDamageToHero(game, caster, counterDamage, monk, 'Monk Deflect');
            
            console.log(`🛡️ ${monk.name} deflects ability ${ability.name} on ${targetForRoll.name} (${attackRoll.total} < ${calculateEffectiveDefense(monk)}) and counters for ${counterDamage} damage`);
            
            // Add comprehensive special log entry for Monk deflect during ability
            const deflectSpecialLogEntry = this.createSpecialLogEntry(
              monk, 
              'Deflect', 
              null, // No trigger context to avoid "Monk used Deflect" redundancy
              counterDamageRoll,
              [
                {
                  type: 'damage',
                  target: caster.name,
                  damage: counterDamage,
                  damageRoll: counterDamageRoll,
                  newHP: caster.currentHP,
                  maxHP: caster.HP
                },
                ...onDamageTriggers
              ]
            );
            results.push(deflectSpecialLogEntry);
            
            if (caster.currentHP <= 0 && !caster.statusEffects?.justResurrected) {
              this.updatePassiveEffectsOnDeath(game, caster, monk, 'counter_attack');
            }
          }
        }
      }
      
      console.log(`🎯 Ability ${ability.name} by ${caster.name}: Roll ${attackRoll.roll}+${caster.modifiedAccuracy} = ${attackRoll.total} vs Defense ${calculateEffectiveDefense(targetForRoll)} → ${abilityHit ? 'HIT' : (monkDeflected ? 'DEFLECTED' : 'MISS')}`);
      
      // Consume advantage effects after the attack roll
      this.consumeAdvantageEffects(caster, targetForRoll);
    } else {
      console.log(`✨ Ability ${ability.name} by ${caster.name}: Auto-success (no attack roll needed)`);
    }
    
    // Process all effects based on whether the ability hit or missed
    const originalTarget = primaryTarget; // Store the original target for conditional effects
    
    for (const effect of allEffects) {
      // Resolve the correct target for this effect
      let target = this.resolveEffectTarget(effect, primaryTarget, caster, casterPlayer, opponent, game, allyTarget);
      if (!target) continue; // Skip if no valid target found
      
      // If we're processing for a specific target, only process effects that affect that target
      if (specificTarget && target !== specificTarget) continue;
      switch (effect.type) {
        case 'damage':
          if (abilityHit && target && target.currentHP > 0) {
            const damageRoll = calculateDamage(effect.value, attackRoll?.isCritical || false, false, caster);
            let damage = damageRoll.total;
            
            // Check for conditional additional damage (like Piercer's +1D6 vs AC > 8)
            if (effect.conditional_damage && 
                ((effect.condition === 'target_ac_gte_9' && calculateEffectiveDefense(target) >= 9) ||
                 (effect.condition === 'target_ac_gt_8' && calculateEffectiveDefense(target) > 8))) {
              const bonusDamageRoll = calculateDamage(effect.conditional_damage, attackRoll?.isCritical || false, false, caster);
              damage += bonusDamageRoll.total;
              const conditionText = effect.condition === 'target_ac_gt_8' ? 'AC > 8' : 'AC >= 9';
              console.log(`⚔️ Conditional damage bonus: +${bonusDamageRoll.total} (${conditionText})${attackRoll?.isCritical ? ' [CRIT]' : ''}`);
            }
            
            // Check for crit bonus damage (like Ace's Stacked Deck +1D6 on crit)
            if (attackRoll?.isCritical && ability.crit_bonus) {
              const critBonusDamageRoll = calculateDamage(ability.crit_bonus.value, true, false, caster);
              damage += critBonusDamageRoll.total;
              console.log(`🎲 Crit bonus damage: +${critBonusDamageRoll.total} [CRIT]`);
            }
            
            const oldHP = target.currentHP;
            
            // Process damage reduction specials (like Wizard's Arcane Shield)
            const damageReductionResult = this.processDamageReductionSpecials(game, target, caster, damage);
            damage = damageReductionResult.finalDamage;
            results.push(...damageReductionResult.specialEffects);
            
            target.currentHP = Math.max(0, target.currentHP - damage);
            
            // Process Angel's Health Link reflection if target is Angel
            if (target.name === 'Angel' && damage > 0) {
              this.processHealthLinkReflection(game, target, damage);
            }
            
            // Trigger after-damage effects (like Ninja's Vanish)
            const afterDamageSpecials = this.processAfterDamageEffects(game, target, caster, damage);
            results.push(...afterDamageSpecials);
            
            // Trigger on_take_damage effects (like Shroomguard's Poison Aura)
            const onTakeDamageSpecials = this.processOnTakeDamageEffects(game, target, caster, damage);
            results.push(...onTakeDamageSpecials);
            
            // Cavalier's Ride Down: Apply debuff to enemies hit by Cavalier
            if (caster.name === 'Cavalier' && damage > 0) {
              if (!target.statusEffects) target.statusEffects = {};
              target.statusEffects.rideDownDebuff = {
                source: caster.name,
                maxHP: target.HP // Store original max HP to detect full healing
              };
              console.log(`🎯 ${target.name} debuffed by Cavalier's Ride Down - all attacks against them have advantage until healed to full HP`);
            }
            
            // Check HP-based conditions after taking damage
            this.checkHPConditions(game, target);
            
            console.log(`⚔️ Damage to ${target.name}: ${damage} HP (${oldHP} → ${target.currentHP})`);
            
            // Check for Paladin's Shield of Faith - taunt enemies who damage adjacent allies
            this.checkPaladinShieldOfFaith(game, caster, target, damage);
            
            // Process hit-confirmed triggers (like Elementalist's Wind Wall)
            this.processHitConfirmedTriggers(game, caster, target, 'ability');
            
            if (target.currentHP <= 0 && !target.statusEffects?.justResurrected) {
              this.updatePassiveEffectsOnDeath(game, target, caster, 'damage');
            }
            
            results.push({
              type: 'damage',
              target: target.name,
              damage,
              hit: true,
              isCritical: attackRoll?.isCritical || false,
              damageRoll: damageRoll.rolls,
              damageTotal: damage,
              attackRoll: attackRoll?.roll || null,
              attackTotal: attackRoll?.displayTotal || attackRoll?.total || null,
              advantageInfo: attackRoll?.advantageInfo || null,
              isTimekeeperCommand: attackRoll?.isTimekeeperCommand || false,
              commandingHero: attackRoll?.commandingHero || null,
              targetHP: target.currentHP
            });
          } else {
            results.push({
              type: 'damage',
              target: target.name,
              damage: 0,
              hit: false,
              attackRoll: attackRoll.roll,
              attackTotal: attackRoll.displayTotal || attackRoll.total,
              advantageInfo: attackRoll.advantageInfo,
              isTimekeeperCommand: attackRoll.isTimekeeperCommand || false,
              commandingHero: attackRoll.commandingHero || null,
              targetHP: target.currentHP,
              damageRoll: [], // Add empty array for consistency
              damageTotal: 0
            });
          }
          break;

        case 'lifesteal_damage':
          if (abilityHit && target && target.currentHP > 0) {
            const damageRoll = calculateDamage(effect.value, attackRoll.isCritical, false, caster);
            let damage = damageRoll.total;
            
            // Process damage reduction specials (like Wizard's Arcane Shield)
            const damageReductionResult = this.processDamageReductionSpecials(game, target, caster, damage);
            damage = damageReductionResult.finalDamage;
            results.push(...damageReductionResult.specialEffects);
            
            target.currentHP = Math.max(0, target.currentHP - damage);
            
            // Process Angel's Health Link reflection if target is Angel
            if (target.name === 'Angel' && damage > 0) {
              this.processHealthLinkReflection(game, target, damage);
            }
            
            // Trigger after-damage effects (like Ninja's Vanish)
            const afterDamageSpecials = this.processAfterDamageEffects(game, target, caster, damage);
            results.push(...afterDamageSpecials);
            
            // Trigger on_take_damage effects (like Shroomguard's Poison Aura)
            const onTakeDamageSpecials = this.processOnTakeDamageEffects(game, target, caster, damage);
            results.push(...onTakeDamageSpecials);
            
            // Process hit-confirmed triggers (like Elementalist's Wind Wall)
            this.processHitConfirmedTriggers(game, caster, target, 'ability');
            
            // Check HP-based conditions after taking damage
            this.checkHPConditions(game, target);
            
            if (target.currentHP <= 0 && !target.statusEffects?.justResurrected) {
              this.updatePassiveEffectsOnDeath(game, target, caster, 'damage');
            }
            
            const healing = damage; // Heal for full damage amount, not half
            caster.currentHP = Math.min(caster.HP, caster.currentHP + healing);
            
            // Remove Cavalier's Ride Down debuff if healed to full HP
            if (caster.currentHP === caster.HP && caster.statusEffects && caster.statusEffects.rideDownDebuff) {
              delete caster.statusEffects.rideDownDebuff;
              console.log(`✨ ${caster.name} healed to full HP via lifesteal - Cavalier's Ride Down debuff removed`);
            }
            
            // Check HP-based conditions after lifesteal healing
            this.checkHPConditions(game, caster);
            
            results.push({
              type: 'lifesteal_damage',
              target: target.name,
              damage,
              healing,
              hit: true,
              isCritical: attackRoll.isCritical,
              damageRoll: damageRoll.rolls,
              damageTotal: damage,
              attackRoll: attackRoll.roll,
              attackTotal: attackRoll.displayTotal || attackRoll.total,
              advantageInfo: attackRoll.advantageInfo,
              targetHP: target.currentHP,
              casterHP: caster.currentHP
            });
          } else {
            results.push({
              type: 'lifesteal_damage',
              target: target.name,
              damage: 0,
              healing: 0,
              hit: false,
              attackRoll: attackRoll.roll,
              attackTotal: attackRoll.displayTotal || attackRoll.total,
              advantageInfo: attackRoll.advantageInfo,
              targetHP: target.currentHP,
              casterHP: caster.currentHP,
              damageRoll: [], // Add empty array for consistency
              damageTotal: 0
            });
          }
          break;

        case 'heal':
          // For abilities with attack rolls, healing only happens if the ability hit
          // For pure healing abilities (self-healing, etc.), they always work
          if ((abilityHit || !needsAttackRoll) && target && target.currentHP > 0) {
            const healRoll = rollDiceString(effect.value);
            const healing = healRoll.total;
            const oldHP = target.currentHP;
            target.currentHP = Math.min(target.HP, target.currentHP + healing);
            
            // Remove Cavalier's Ride Down debuff if healed to full HP
            if (target.currentHP === target.HP && target.statusEffects && target.statusEffects.rideDownDebuff) {
              delete target.statusEffects.rideDownDebuff;
              console.log(`✨ ${target.name} healed to full HP - Cavalier's Ride Down debuff removed`);
            }
            
            // Check HP-based conditions after healing
            this.checkHPConditions(game, target);
            
            console.log(`💚 Healing ${target.name}: ${healing} HP (${oldHP} → ${target.currentHP}) - ability ${abilityHit ? 'hit' : 'auto-success'}`);
            
            results.push({
              type: 'heal',
              target: target.name,
              healing,
              oldHP,
              newHP: target.currentHP,
              hit: abilityHit || !needsAttackRoll,
              healRoll: healRoll.rolls
            });
          } else if (needsAttackRoll && !abilityHit && target) {
            // Healing missed because the ability missed
            console.log(`❌ Healing missed on ${target.name} (ability missed)`);
            results.push({
              type: 'heal_missed',
              target: target.name,
              healing: 0,
              hit: false
            });
          }
          break;

        case 'heal_to_full':
          // Special healing that restores target to full HP (like Reaper's Soul Harvest)
          if ((abilityHit || !needsAttackRoll) && target && target.currentHP > 0) {
            let shouldHeal = true;
            
            // Check if there's a condition that needs to be met
            if (effect.condition === 'target_dies_from_damage') {
              // Check if the original target died from the damage effects of this ability
              const damageResult = results.find(r => 
                r.type === 'damage' && 
                r.target === originalTarget?.name && 
                r.hit === true &&
                r.damage > 0
              );
              
              // Target died if: damage was dealt, hit was successful, and target is now at 0 HP
              const targetDied = damageResult && originalTarget && originalTarget.currentHP <= 0;
              
              console.log(`🎯 Soul Harvest condition check: damageResult=${damageResult ? `${damageResult.damage} damage to ${damageResult.target}` : 'none'}, originalTarget HP=${originalTarget?.currentHP}, targetDied=${targetDied}`);
              
              shouldHeal = targetDied;
            }
            
            if (shouldHeal) {
              const oldHP = target.currentHP;
              const healing = target.HP - target.currentHP; // Calculate how much healing is needed
              target.currentHP = target.HP; // Heal to full HP
              
              // Remove Cavalier's Ride Down debuff if healed to full HP
              if (target.statusEffects && target.statusEffects.rideDownDebuff) {
                delete target.statusEffects.rideDownDebuff;
                console.log(`✨ ${target.name} healed to full HP - Cavalier's Ride Down debuff removed`);
              }
              
              // Check HP-based conditions after healing
              this.checkHPConditions(game, target);
              
              console.log(`💚 Heal to Full ${target.name}: ${healing} HP (${oldHP} → ${target.currentHP}) - ${effect.condition ? 'condition met' : 'ability hit'}`);
              
              results.push({
                type: 'heal_to_full',
                target: target.name,
                healing,
                oldHP,
                newHP: target.currentHP,
                hit: abilityHit || !needsAttackRoll,
                condition: effect.condition,
                conditionMet: shouldHeal
              });
            } else if (effect.condition) {
              console.log(`❌ ${target.name} heal to full - condition '${effect.condition}' not met`);
            }
          }
          break;

        case 'conditional_heal':
          // Conditional healing that checks a condition before determining heal amount
          // For abilities with attack rolls, healing only happens if the ability hit
          if ((abilityHit || !needsAttackRoll)) {
            let shouldHeal = true; // Always heal for conditional_heal, just choose the value
            let healValue = effect.value_false || '1D4'; // Default value
            let conditionMet = false;
            
            // Check different conditions
            if (effect.condition === 'self_hp_lt_11' && target && target.currentHP > 0 && target.currentHP < 11) {
              healValue = effect.value_true || '1D8';
              conditionMet = true;
            } else if (effect.condition === 'self_hp_lt_11' && target && target.currentHP > 0) {
              // Condition not met (HP >= 11), use value_false
              healValue = effect.value_false || '1D4';
              conditionMet = false;
            } else if (effect.condition === 'target_dies_from_damage') {
              // Check if the original target died from the damage effects of this ability
              // Find the damage result for the original target from this ability
              const damageResult = results.find(r => 
                r.type === 'damage' && 
                r.target === originalTarget?.name && 
                r.hit === true &&
                r.damage > 0
              );
              
              // Target died if: damage was dealt, hit was successful, and target is now at 0 HP
              const targetDied = damageResult && originalTarget && originalTarget.currentHP <= 0;
              
              console.log(`🎯 Soul Harvest condition check: damageResult=${damageResult ? `${damageResult.damage} damage to ${damageResult.target}` : 'none'}, originalTarget HP=${originalTarget?.currentHP}, targetDied=${targetDied}`);
              
              if (targetDied && target && target.currentHP > 0) {
                conditionMet = true;
                // Use heal_to_full for Soul Harvest when target dies
                if (effect.type === 'heal_to_full') {
                  const oldHP = target.currentHP;
                  const healing = target.HP - target.currentHP;
                  target.currentHP = target.HP;
                  
                  // Remove Cavalier's Ride Down debuff if healed to full HP
                  if (target.statusEffects && target.statusEffects.rideDownDebuff) {
                    delete target.statusEffects.rideDownDebuff;
                    console.log(`✨ ${target.name} healed to full HP - Cavalier's Ride Down debuff removed`);
                  }
                  
                  console.log(`💚 Soul Harvest Heal to Full ${target.name}: ${healing} HP (${oldHP} → ${target.currentHP}) - target died from damage`);
                  
                  results.push({
                    type: 'heal',
                    target: target.name,
                    healing,
                    oldHP,
                    newHP: target.currentHP,
                    hit: abilityHit || !needsAttackRoll,
                    condition: effect.condition,
                    conditionMet: true
                  });
                }
                shouldHeal = false; // Already handled heal_to_full above
              }
            }
            
            // Apply regular conditional healing if condition met and not already handled
            if (shouldHeal && target && target.currentHP > 0) {
              const healRoll = rollDiceString(healValue);
              const healing = healRoll.total;
              const oldHP = target.currentHP;
              target.currentHP = Math.min(target.HP, target.currentHP + healing);
              
              // Remove Cavalier's Ride Down debuff if healed to full HP
              if (target.currentHP === target.HP && target.statusEffects && target.statusEffects.rideDownDebuff) {
                delete target.statusEffects.rideDownDebuff;
                console.log(`✨ ${target.name} healed to full HP - Cavalier's Ride Down debuff removed`);
              }
              
              console.log(`💚 Conditional Healing ${target.name}: ${healing} HP (${oldHP} → ${target.currentHP}) - ability ${abilityHit ? 'hit' : 'auto-success'}`);
              
              results.push({
                type: 'heal',
                target: target.name,
                healing,
                oldHP,
                newHP: target.currentHP,
                hit: abilityHit || !needsAttackRoll,
                healRoll: healRoll.rolls,
                condition: effect.condition,
                conditionMet: conditionMet
              });
            }
          } else if (needsAttackRoll && !abilityHit && target) {
            // Conditional healing missed because the ability missed
            console.log(`❌ Conditional healing missed on ${target.name} (ability missed)`);
            results.push({
              type: 'heal_missed',
              target: target.name,
              healing: 0,
              hit: false,
              condition: effect.condition
            });
          }
          break;

        case 'apply_debuff':
          if (abilityHit && target && effect.effect) {
            console.log(`✅ Applying debuff ${effect.effect} to ${target.name} (ability hit)`);
            
            // Special handling for grant_advantage - mark target for next attack
            let effectValue = effect.stacks || effect.value || 1; // Initialize effectValue for all cases
            
            if (effect.effect === 'grant_advantage') {
              target.statusEffects.grantAdvantage = {
                duration: effect.duration || 1,
                duration_unit: effect.duration_unit || 'attack',
                source: caster.name
              };
              console.log(`🎯 ${target.name} marked for advantage on next attack (from ${caster.name})`);
            }
            // Special handling for taunt - need to pass caster's name
            else if (effect.effect === 'taunt' && effect.taunt_target === 'self') {
              effectValue = caster.name;
              applyStatusEffect(target, effect.effect, effectValue, effect.duration, null, caster.name);
            }
            // Special handling for stat_modifier - pass the stat and value
            else if (effect.effect === 'stat_modifier' && effect.stat) {
              applyStatusEffect(target, effect.effect, effectValue, effect.duration, effect.stat, caster.name, effect.duration_unit, ability.name);
            }
            // Special handling for poison with match_damage
            else if (effect.effect === 'poison' && effect.value === 'match_damage') {
              // Find the damage that was just dealt in the same ability
              let damageDealt = 0;
              for (const prevResult of results) {
                if (prevResult.type === 'damage' && prevResult.target === target.name && prevResult.hit) {
                  damageDealt = prevResult.damage;
                  break;
                }
              }
              console.log(`💀 Applying ${damageDealt} poison stacks to ${target.name} (matching damage dealt)`);
              applyStatusEffect(target, effect.effect, damageDealt, effect.duration);
            }
            // Special handling for Hoarder's custom silence - prevent abilities against owner
            else if (effect.effect === 'cannot_target_owner_with_ability') {
              target.statusEffects.cannotTargetWithAbility = {
                owner: effect.owner || caster.name,
                duration: effect.duration || 1,
                duration_unit: effect.duration_unit || 'caster_turn',
                source: caster.name
              };
              console.log(`🤐 ${target.name} cannot use abilities against ${effect.owner || caster.name} (Bribed until start of their next turn)`);
            }
            // Special handling for Angel's health_link
            else if (effect.effect === 'health_link') {
              target.statusEffects.health_link = {
                source: caster.name,
                duration: effect.duration || 999
              };
              console.log(`🔗 ${target.name} is linked to ${caster.name} via Health Link`);
            }
            else {
              applyStatusEffect(target, effect.effect, effectValue, effect.duration);
            }
            
            results.push({
              type: 'status_applied',
              target: target.name,
              effect: effect.effect,
              value: effectValue,
              duration: effect.duration,
              stat: effect.stat || null,
              hit: true
            });
          } else if (target && effect.effect) {
            console.log(`❌ NOT applying debuff ${effect.effect} to ${target.name} (ability missed)`);
            results.push({
              type: 'status_missed',
              target: target.name,
              effect: effect.effect,
              hit: false
            });
          }
          break;

        case 'apply_buff':
          if (abilityHit && target && effect.effect) {
            console.log(`✅ Applying buff ${effect.effect} to ${target.name} (ability hit)`);
            applyStatusEffect(target, effect.effect, effect.value || 1);
            results.push({
              type: 'status_applied',
              target: target.name,
              effect: effect.effect,
              value: effect.value || 1,
              hit: true
            });
          } else if (target && effect.effect) {
            console.log(`❌ NOT applying buff ${effect.effect} to ${target.name} (ability missed)`);
            results.push({
              type: 'status_missed',
              target: target.name,
              effect: effect.effect
            });
          }
          break;

        case 'remove_debuff':
          // Remove debuffs from target (like Shroomguard's poison cleanse)
          if (abilityHit && target && effect.effect) {
            const effectToRemove = effect.effect;
            const removeCount = effect.count; // 'all' or a number
            
            if (target.statusEffects && target.statusEffects[effectToRemove] !== undefined) {
              const oldValue = target.statusEffects[effectToRemove];
              
              if (removeCount === 'all') {
                target.statusEffects[effectToRemove] = 0;
                console.log(`🍄 Removed all ${effectToRemove} stacks from ${target.name} (was ${oldValue})`);
              } else {
                const removeAmount = parseInt(removeCount) || 0;
                target.statusEffects[effectToRemove] = Math.max(0, target.statusEffects[effectToRemove] - removeAmount);
                console.log(`🍄 Removed ${removeAmount} ${effectToRemove} stacks from ${target.name} (${oldValue} → ${target.statusEffects[effectToRemove]})`);
              }
              
              results.push({
                type: 'debuff_removed',
                target: target.name,
                effect: effectToRemove,
                oldValue: oldValue,
                newValue: target.statusEffects[effectToRemove],
                hit: true
              });
            } else {
              console.log(`🍄 ${target.name} has no ${effectToRemove} to remove`);
            }
          } else if (!target) {
            console.log(`🍄 No valid target found for debuff removal`);
          }
          break;

        case 'recoil_damage':
          if (abilityHit) {
            const recoilRoll = rollDiceString(effect.value);
            const recoilDamage = recoilRoll.total;
            caster.currentHP = Math.max(0, caster.currentHP - recoilDamage);
            
            // Check HP-based conditions after taking recoil damage
            this.checkHPConditions(game, caster);
            
            // Check if caster died from recoil
            if (caster.currentHP <= 0 && !caster.statusEffects?.justResurrected) {
              this.updatePassiveEffectsOnDeath(game, caster, null, 'recoil');
            }
            
            results.push({
              type: 'recoil_damage',
              target: caster.name,
              damage: recoilDamage,
              targetHP: caster.currentHP,
              hit: true
            });
          } else {
            results.push({
              type: 'recoil_damage',
              target: caster.name,
              damage: 0,
              hit: false,
              targetHP: caster.currentHP
            });
          }
          break;
          
        case 'extra_action':
          // This is now handled by the One-Two Punch system above
          console.log(`Extra action effect processed by One-Two Punch system`);
          break;

        // Add more effect types as needed
        default:
          console.log(`Unhandled effect type: ${effect.type}`);
      }
    }
    
    // Check for Twin Spell (Sorcerer's special ability)
    const specials = Array.isArray(caster.Special) ? caster.Special : [caster.Special];
    const hasTwinSpell = caster.Special && specials.some(special => 
      special && special.name === 'Twin Spell' && 
      special.trigger === 'on_ability_hit' &&
      special.effects && special.effects.some(effect => effect.type === 'conditional_repeat_cast')
    );
    
    // Check for Monk's One-Two Punch follow-up attacks
    const hasOneTwoPunch = caster.name === 'Monk' && ability.name === 'One-Two Punch' && abilityHit;
    
    // Check if ability hit and Twin Spell should trigger
    if (hasTwinSpell && abilityHit) {
      // Check if Twin Spell has been used this round
      if (!casterPlayer.twinSpellUsed) {
        console.log(`🔮 Twin Spell: ${caster.name}'s ability hit - can cast ability again!`);
        
        casterPlayer.twinSpellUsed = true; // Mark as used this round
        casterPlayer.twinSpellActive = true; // Grant extra ability use
        
        // Add comprehensive special log entry for Twin Spell
        const twinSpellLogEntry = this.createSpecialLogEntry(
          caster, 
          'Twin Spell', 
          `reactive to successful ability hit`, 
          null, // no attack roll for reactive abilities
          [{
            type: 'grant_extra_action',
            target: caster.name,
            effect: 'extra_ability_use',
            message: `grants an additional ability use`
          }]
        );
        results.push(twinSpellLogEntry);
      }
    }
    
    // Check for Monk's One-Two Punch follow-up basic attacks
    if (hasOneTwoPunch && !casterPlayer.oneTwoPunchUsed) {
      // Grant exactly 1 additional attack (so Monk has max 2 total attacks)
      casterPlayer.monkAttacksRemaining++;
      
      console.log(`👊 One-Two Punch: ${caster.name}'s ability hit - granting 1 additional attack! Total attacks remaining: ${casterPlayer.monkAttacksRemaining}`);
      
      casterPlayer.oneTwoPunchUsed = true; // Mark as used this round
      casterPlayer.oneTwoPunchAttacksRemaining = casterPlayer.monkAttacksRemaining; // Legacy field for compatibility
      
      // Add a special result indicating One-Two Punch activated
      results.push({
        type: 'one_two_punch_activated',
        caster: caster.name,
        ability: ability.name,
        hit: true,
        totalAttacksRemaining: casterPlayer.monkAttacksRemaining
      });
    }
    
    // Skip general comprehensive logging for heroes that handle their own logging
    const skipGeneralLogging = (caster.name === 'Engineer' && ability.name === 'Call Turret') ||
                              (caster.name === 'Medic' && ability.name === 'Med Bots') ||
                              (caster.name === 'Beast Tamer' && ability.name === 'Call Beast / Command Attack') ||
                              (caster.name === 'Shaman' && ability.name === 'Elemental Strike');
    
    let filteredResults;
    
    if (skipGeneralLogging) {
      // For special abilities that handle their own comprehensive logging, return results as-is
      filteredResults = results.filter(result => 
        result.type === 'special' ||
        result.type === 'special_comprehensive' ||
        result.type === 'twin_spell_activated' ||
        result.type === 'one_two_punch_activated' ||
        result.type === 'summon' ||
        result.type === 'damage' ||
        result.type === 'heal' ||
        result.type === 'lifesteal_healing' ||
        result.type === 'status_applied' ||
        result.type === 'attack_roll'
      );
    } else {
      // Add comprehensive ability log entry and filter out old-style entries to avoid duplicates
      const comprehensiveLogEntry = this.createAbilityLogEntry(ability, caster, primaryTarget, attackRoll, abilityHit, results, commandContext);
      
      // Filter results to only keep:
      // 1. The comprehensive entry
      // 2. Special comprehensive entries (from after-damage effects, Twin Spell, etc.)
      // 3. Essential system entries (like attack_roll, damage, heal, etc. for game state)
      filteredResults = results.filter(result => 
        result.type === 'special_comprehensive' ||
        result.type === 'twin_spell_activated' ||
        result.type === 'one_two_punch_activated' ||
        result.type === 'summon' ||
        result.type === 'damage' ||
        result.type === 'heal' ||
        result.type === 'lifesteal_healing' ||
        result.type === 'status_applied' ||
        result.type === 'attack_roll'
      );
      
      // Add comprehensive entry at the beginning
      filteredResults.unshift(comprehensiveLogEntry);
    }
    
    return filteredResults;
  }

  resolveEffectTarget(effect, primaryTarget, caster, casterPlayer, opponent, game, allyTarget = null) {
    // Determine target based on effect.target specification
    switch (effect.target) {
      case 'target':
      case 'any_enemy':
        return primaryTarget; // Use the selected enemy target
      
      case 'self':
        return caster; // Target the caster
      
      case 'ally':
      case 'lowest_health_ally':
        // For healing allies, we need to automatically select a valid ally
        // Find the ally with the lowest HP percentage (most in need of healing)
        const allies = casterPlayer.team.filter(hero => hero.currentHP > 0 && hero !== caster);
        if (allies.length === 0) {
          // If no other allies, heal the caster themselves
          return caster;
        }
        
        // Find the ally with the lowest HP percentage (most in need of healing)
        const allyToHeal = allies.reduce((lowest, current) => {
          const lowestPercent = lowest.currentHP / lowest.HP;
          const currentPercent = current.currentHP / current.HP;
          return currentPercent < lowestPercent ? current : lowest;
        });
        
        console.log(`🎯 Lowest health ally selected for healing: ${allyToHeal.name} (${allyToHeal.currentHP}/${allyToHeal.HP} HP)`);
        return allyToHeal;
      
      case 'selected_ally':
        // For player-selected ally healing (Paladin, Druid)
        if (allyTarget) {
          return casterPlayer.team.find(hero => hero.name === allyTarget);
        }
        // Fallback to caster if no ally selected
        return caster;
      
      case 'random_ally_with_poison':
        // For Shroomguard's poison cleanse - select random ally that has poison stacks
        const alliesWithPoison = casterPlayer.team.filter(hero => 
          hero.currentHP > 0 && 
          hero.statusEffects && 
          hero.statusEffects.poison > 0
        );
        
        if (alliesWithPoison.length === 0) {
          console.log(`🍄 No allies with poison stacks found for Shroomguard's cleanse`);
          return null; // No allies have poison
        }
        
        // Pick random ally with poison
        const randomIndex = Math.floor(Math.random() * alliesWithPoison.length);
        const allyToCleanse = alliesWithPoison[randomIndex];
        
        console.log(`🍄 Random ally with poison selected for cleansing: ${allyToCleanse.name} (${allyToCleanse.statusEffects.poison} poison stacks)`);
        return allyToCleanse;
      
      case 'all_enemies':
        return primaryTarget; // This will be processed differently in AOE logic
      
      case 'adjacent_enemy':
        // Legacy support - redirect to adjacent_enemy_left
        return this.resolveEffectTarget({ ...effect, target: 'adjacent_enemy_left' }, primaryTarget, caster, player, opponent, game, allyTargetId);
      
      case 'adjacent_enemy_left':
        // Find the enemy adjacent to the primary target (to the left only)
        const enemyTeamLeft = opponent.team.filter(hero => hero.currentHP > 0);
        const primaryTargetIndexLeft = enemyTeamLeft.findIndex(hero => hero.name === primaryTarget.name);
        
        if (primaryTargetIndexLeft === -1) return null;
        
        // Get adjacent enemy (to the left only, no wrapping)
        if (primaryTargetIndexLeft === 0) {
          return null; // No character to the left, no additional damage
        }
        const adjacentLeftIndex = primaryTargetIndexLeft - 1;
        const adjacentLeftEnemy = enemyTeamLeft[adjacentLeftIndex];
        
        // Don't target the same hero twice
        return adjacentLeftEnemy && adjacentLeftEnemy.name !== primaryTarget.name ? adjacentLeftEnemy : null;
      
      case 'enemy_right_of_target':
        // Find the enemy to the right of the primary target (for Elementalist's Thunderclap)
        const enemyTeamRight = opponent.team.filter(hero => hero.currentHP > 0);
        const primaryTargetIndexRight = enemyTeamRight.findIndex(hero => hero.name === primaryTarget.name);
        
        if (primaryTargetIndexRight === -1) return null;
        
        // Get enemy to the right (no wrapping)
        if (primaryTargetIndexRight >= enemyTeamRight.length - 1) {
          return null; // No character to the right
        }
        const rightIndex = primaryTargetIndexRight + 1;
        const rightEnemy = enemyTeamRight[rightIndex];
        
        // Don't target the same hero twice
        return rightEnemy && rightEnemy.name !== primaryTarget.name ? rightEnemy : null;
      
      case 'adjacent_enemy_right':
        // Find the enemy adjacent to the primary target (to the right only) - consistent with adjacent_enemy naming
        console.log(`🔍 Resolving adjacent_enemy_right for primary target: ${primaryTarget.name}`);
        const enemyTeamAdjacentRight = opponent.team.filter(hero => hero.currentHP > 0);
        console.log(`🔍 Alive enemy team:`, enemyTeamAdjacentRight.map(h => h.name));
        const primaryTargetIndexAdjacentRight = enemyTeamAdjacentRight.findIndex(hero => hero.name === primaryTarget.name);
        console.log(`🔍 Primary target index: ${primaryTargetIndexAdjacentRight}`);
        
        if (primaryTargetIndexAdjacentRight === -1) {
          console.log(`❌ Primary target not found in enemy team`);
          return null;
        }
        
        // Get adjacent enemy (to the right only, no wrapping)
        if (primaryTargetIndexAdjacentRight >= enemyTeamAdjacentRight.length - 1) {
          console.log(`❌ No character to the right (index ${primaryTargetIndexAdjacentRight} >= ${enemyTeamAdjacentRight.length - 1})`);
          return null; // No character to the right
        }
        const adjacentRightIndex = primaryTargetIndexAdjacentRight + 1;
        const adjacentRightEnemy = enemyTeamAdjacentRight[adjacentRightIndex];
        console.log(`✅ Found adjacent right enemy: ${adjacentRightEnemy ? adjacentRightEnemy.name : 'null'}`);
        
        // Don't target the same hero twice
        const result = adjacentRightEnemy && adjacentRightEnemy.name !== primaryTarget.name ? adjacentRightEnemy : null;
        console.log(`🎯 Final adjacent_enemy_right result: ${result ? result.name : 'null'}`);
        return result;
      
      default:
        console.warn(`Unknown effect target type: ${effect.target}`);
        return primaryTarget;
    }
  }
  
  processHitConfirmedTriggers(game, caster, target, actionType) {
    // Process triggers that activate when the caster successfully hits with an attack or ability
    if (!caster.Special) return;
    
    const specials = Array.isArray(caster.Special) ? caster.Special : [caster.Special];
    
    for (const special of specials) {
      if (special.trigger === 'on_self_hit_confirmed' && special.effects) {
        console.log(`⚡ ${caster.name}'s ${special.name} activated after successful ${actionType}!`);
        
        // Collect effects for comprehensive logging
        const specialEffects = [];
        
        for (const effect of special.effects) {
          if (effect.type === 'apply_buff' && effect.effect === 'ac_modifier' && effect.target === 'self') {
            // Apply AC buff to self (like Elementalist's Wind Wall)
            if (!caster.statusEffects) caster.statusEffects = {};
            
            // Track duration if specified
            const duration = effect.duration || 1;
            const durationUnit = effect.duration_unit || 'caster_turn';
            
            // Initialize or increment AC bonus
            if (!caster.statusEffects.windWallAC) {
              caster.statusEffects.windWallAC = {
                bonus: 0,
                duration: duration,
                durationUnit: durationUnit,
                source: caster.name
              };
            }
            
            // Add the AC bonus
            caster.statusEffects.windWallAC.bonus += effect.value;
            
            console.log(`🌪️ ${caster.name} gains +${effect.value} AC from ${special.name} (total: +${caster.statusEffects.windWallAC.bonus} AC)`);
            
            // Add to special effects for logging
            specialEffects.push({
              type: 'apply_buff',
              target: caster.name,
              effect: 'ac_modifier',
              value: effect.value,
              message: `gains +${effect.value} AC from successful ${actionType}`
            });
            
            // Update display stats
            this.updateHeroDisplayStats(caster);
          }
        }
        
        // Add comprehensive special log entry for hit confirmed trigger
        if (specialEffects.length > 0) {
          const hitConfirmedLogEntry = this.createSpecialLogEntry(
            caster, 
            special.name, 
            `reactive to successful ${actionType}`, 
            null, // no attack roll for reactive abilities
            specialEffects
          );
          
          // Add to battle log
          if (game && game.battleLog) {
            game.battleLog.push(hitConfirmedLogEntry);
          }
        }
      }
    }
  }

  processCasterDurationEffects(game, currentHero) {
    // Check if the current hero should lose untargetable status (Ninja's Vanish)
    if (currentHero.statusEffects?.untargetable && currentHero.statusEffects.untargetableUntil === currentHero.name) {
      console.log(`👻 ${currentHero.name}'s Vanish ends - no longer untargetable`);
      delete currentHero.statusEffects.untargetable;
      delete currentHero.statusEffects.untargetableAttacker;
      delete currentHero.statusEffects.untargetableUntil;
      delete currentHero.statusEffects.untargetableDuration;
    }

    // Check all heroes for stat modifiers that should expire when this caster's turn starts
    game.players.forEach(player => {
      player.team.forEach(hero => {
        if (hero.statusEffects?.statModifierCasters && hero.statusEffects?.statModifierUnits) {
          const expiredModifiers = [];
          
          Object.keys(hero.statusEffects.statModifierCasters).forEach(modifierKey => {
            const caster = hero.statusEffects.statModifierCasters[modifierKey];
            const durationUnit = hero.statusEffects.statModifierUnits[modifierKey];
            
            // Check if this modifier should expire when the caster's turn starts
            if (caster === currentHero.name && durationUnit === 'caster_turn') {
              const [stat] = modifierKey.split('_');
              
              // Remove the stat modifier
              if (hero.statusEffects.statModifiers?.[stat]) {
                console.log(`🔄 ${stat} modifier from ${caster} expired on ${hero.name}`);
                delete hero.statusEffects.statModifiers[stat];
              }
              
              // Clean up tracking data
              expiredModifiers.push(modifierKey);
            }
          });
          
          // Remove expired modifiers from tracking
          expiredModifiers.forEach(key => {
            delete hero.statusEffects.statModifierDurations[key];
            delete hero.statusEffects.statModifierCasters[key];
            delete hero.statusEffects.statModifierUnits[key];
          });
        }
      });
    });
  }

  // Check if a hero has a conditional effect that's currently active
  hasConditionalEffect(hero, effectType) {
    if (!hero || !hero.Special || !hero.conditionalEffects) return false;

    const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
    
    for (const special of specials) {
      // Check if this special is currently active
      if (hero.conditionalEffects[special.name] && special.effects) {
        for (const effect of special.effects) {
          if (effect.type === effectType) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Check if a hero has a passive modifier (like ignore_taunt)
  hasPassiveModifier(hero, modifierType) {
    if (!hero || !hero.Special) return false;

    const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
    
    for (const special of specials) {
      if (special.effects) {
        for (const effect of special.effects) {
          if (effect.type === 'passive_modifier' && effect.effect === modifierType) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Check if hero has a specific special effect
  hasSpecialEffect(hero, effectName) {
    if (!hero.Special) return false;
    
    // Handle both array and object formats
    const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
    
    return specials.some(special => 
      special.effects?.some(effect => 
        effect.effect === effectName || effect.type === effectName
      )
    );
  }

  // Helper method to check if hero has a special effect
  hasSpecialEffect(hero, effectType) {
    if (!hero.Special) return false;
    
    const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
    
    return specials.some(special => {
      if (!special.effects) return false;
      return special.effects.some(effect => effect.effect === effectType);
    });
  }

  processTurnStartEffects(game, hero, player) {
    // Clean up Wind Wall AC bonus at the start of Elementalist's turn
    if (hero.name === 'Elementalist' && hero.statusEffects?.windWallAC) {
      console.log(`🌪️ ${hero.name}'s Wind Wall AC bonus expires at turn start`);
      delete hero.statusEffects.windWallAC;
      this.updateHeroDisplayStats(hero);
    }
    
    // Clean up Hoarder's custom silence debuff at the start of Hoarder's turn
    if (hero.name === 'Hoarder') {
      game.players.forEach(p => {
        p.team.forEach(h => {
          if (h.statusEffects?.cannotTargetWithAbility && 
              h.statusEffects.cannotTargetWithAbility.owner === 'Hoarder') {
            console.log(`🤐 ${h.name} can now use abilities against Hoarder (Bribe expired)`);
            delete h.statusEffects.cannotTargetWithAbility;
          }
        });
      });
    }
    
    if (!hero || !hero.Special) return;
    
    const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
    
    for (const special of specials) {
      if (special.trigger === 'owner_turn_start') {
        console.log(`🌅 Turn start: ${hero.name}'s ${special.name} activating...`);
        
        for (const effect of special.effects) {
          if (effect.type === 'damage' && effect.target === 'all_others') {
            // Plague Spreader's Aura of Death
            const { rollDiceString } = require('./utils');
            const damageRoll = rollDiceString(effect.value);
            const damage = damageRoll.total;
            
            console.log(`💀 ${special.name}: Dealing ${damage} damage to all other heroes`);
            
            // Collect targets and their damage results for comprehensive logging
            const damageResults = [];
            
            // Deal damage to all other heroes (both teams, excluding the caster)
            game.players.forEach(otherPlayer => {
              otherPlayer.team.forEach(target => {
                if (target !== hero && target.currentHP > 0) {
                  const oldHP = target.currentHP;
                  
                  // Process damage reduction specials (like Wizard's Arcane Shield)
                  const damageReductionResult = this.processDamageReductionSpecials(game, target, hero, damage);
                  const finalDamage = damageReductionResult.finalDamage;
                  // Note: Special effects from damage reduction will be logged separately
                  
                  target.currentHP = Math.max(0, target.currentHP - finalDamage);
                  
                  // Trigger after-damage effects (like Ninja's Vanish)
                  const afterDamageSpecials = this.processAfterDamageEffects(game, target, hero, finalDamage);
                  if (afterDamageSpecials.length > 0) {
                    damageResults.push(...afterDamageSpecials);
                  }
                  
                  // Trigger on_take_damage effects (like Shroomguard's Poison Aura)
                  const onTakeDamageSpecials = this.processOnTakeDamageEffects(game, target, hero, finalDamage);
                  if (onTakeDamageSpecials.length > 0) {
                    damageResults.push(...onTakeDamageSpecials);
                  }
                  
                  console.log(`💀 ${target.name} takes ${finalDamage} damage from ${special.name}: ${oldHP} → ${target.currentHP} HP`);
                  
                  // Add to damage results for comprehensive logging
                  damageResults.push({
                    type: 'damage',
                    target: target.name,
                    damage: finalDamage,
                    damageRoll: damageRoll,
                    newHP: target.currentHP,
                    maxHP: target.HP,
                    message: `deals ${damage} damage to ${target.name}`
                  });
                  
                  // Check if target died
                  if (target.currentHP <= 0 && !target.statusEffects?.justResurrected) {
                    console.log(`💀 ${target.name} died from ${special.name}!`);
                    this.updatePassiveEffectsOnDeath(game, target, null, 'aura_damage');
                  }
                }
              });
            });
            
            // Add comprehensive special log entry for turn start effect
            if (damageResults.length > 0) {
              const turnStartLogEntry = this.createSpecialLogEntry(
                hero, 
                special.name, 
                { triggeredBy: 'turn start' }, // Multi-target ability
                null, // No attack roll for automatic damage
                damageResults
              );
              
              // Add to battle log (if we have a turn start effects system)
              if (!game.turnStartEffects) {
                game.turnStartEffects = [];
              }
              game.turnStartEffects.push(turnStartLogEntry);
            }
          }
        }
      }
    }
  }

  // Function to check and update HP-based conditional abilities
  checkHPConditions(game, hero) {
    if (!hero || !hero.Special || hero.currentHP <= 0) return;

    const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
    let conditionsChanged = false;

    for (const special of specials) {
      if (!special.condition) continue;

      const wasActive = hero.conditionalEffects?.[special.name] || false;
      let isActive = false;

      // Check different HP-based conditions
      if (special.condition === 'self_hp_lt_10') {
        isActive = hero.currentHP < 10;
      } else if (special.condition === 'self_hp_lt_11') {
        isActive = hero.currentHP < 11;
      } else if (special.condition === 'self_hp_lt_9') {
        isActive = hero.currentHP <= 8; // Dragon Rider dismounts at 8 HP or below
      } else if (special.condition === 'beast_active') {
        isActive = hero.statusEffects && hero.statusEffects.beast_active;
      } else if (special.condition === 'beast_inactive') {
        isActive = !hero.statusEffects || !hero.statusEffects.beast_active;
      }
      // Add more conditions as needed for other thresholds

      // If condition status changed, update the hero
      if (wasActive !== isActive) {
        conditionsChanged = true;
        
        if (!hero.conditionalEffects) {
          hero.conditionalEffects = {};
        }
        
        hero.conditionalEffects[special.name] = isActive;
        
        if (isActive) {
          console.log(`🎯 ${hero.name}'s ${special.name} activated (HP: ${hero.currentHP})`);
          
          // Apply conditional effects
          if (special.effects) {
            for (const effect of special.effects) {
              if (effect.type === 'stat_modifier' && effect.stat) {
                // Add stat modifier buffs
                if (!hero.conditionalBuffs) hero.conditionalBuffs = {};
                if (!hero.conditionalBuffs[special.name]) {
                  hero.conditionalBuffs[special.name] = [];
                }
                hero.conditionalBuffs[special.name].push({
                  stat: effect.stat,
                  value: effect.value,
                  source: special.name
                });
              } else if (effect.type === 'permanent_stat_modifier' && effect.stat) {
                // For Dragon Rider's permanent AC loss
                if (!hero.permanentBuffs) hero.permanentBuffs = {};
                if (!hero.permanentBuffs[special.name]) {
                  hero.permanentBuffs[special.name] = [];
                }
                hero.permanentBuffs[special.name].push({
                  stat: effect.stat,
                  value: effect.value,
                  source: special.name
                });
                console.log(`🔒 ${hero.name} permanently loses ${Math.abs(effect.value)} ${effect.stat} from ${special.name}`);
              } else if (effect.type === 'disable_ability' && effect.permanent) {
                // For Dragon Rider's permanent ability disable
                if (!hero.permanentDisables) hero.permanentDisables = {};
                hero.permanentDisables.abilities = true;
                console.log(`🚫 ${hero.name}'s abilities permanently disabled by ${special.name}`);
              }
            }
          }
        } else {
          // Check if this is a permanent condition that should never be reverted
          const isPermanentCondition = special.category === 'conditional_permanent' || 
                                     (special.name === 'Dismount' && hero.name === 'Dragon Rider');
          
          if (!isPermanentCondition) {
            console.log(`🎯 ${hero.name}'s ${special.name} deactivated (HP: ${hero.currentHP})`);
            
            // Remove conditional effects
            if (hero.conditionalBuffs && hero.conditionalBuffs[special.name]) {
              delete hero.conditionalBuffs[special.name];
            }
          } else {
            console.log(`🔒 ${hero.name}'s ${special.name} remains permanently active (cannot be restored by healing)`);
            // Keep the condition active even if HP is restored
            hero.conditionalEffects[special.name] = true;
          }
        }
      }
    }

    // If any conditions changed, update all passive effects in the game
    if (conditionsChanged) {
      this.applyPassiveEffects(game);
    }
  }

  // Get the next hero that should take a turn, maintaining player alternation
  getCurrentTurnInfo(game) {
    // First, check if we have a valid currentPlayerTurn - if not, initialize
    if (game.currentPlayerTurn === undefined) {
      game.currentPlayerTurn = 0; // Start with player 0
      game.playerHeroIndex = [0, 0]; // Track which absolute hero index for each player
    }
    
    // Find the current player's next available hero
    const currentPlayer = game.players[game.currentPlayerTurn];
    if (!currentPlayer || !currentPlayer.team) {
      return null;
    }
    
    // Check if current player has any alive heroes
    const hasAliveHeroes = currentPlayer.team.some(hero => {
      const hp = hero.currentHP !== undefined ? hero.currentHP : (typeof hero.HP === 'string' ? parseInt(hero.HP) : hero.HP);
      return hp > 0;
    });
    
    if (!hasAliveHeroes) {
      // Current player has no alive heroes, check win condition
      const winner = this.checkWinCondition(game);
      if (winner) {
        game.phase = 'ended';
        game.winner = winner;
      }
      return null;
    }
    
    // Find the next alive hero starting from the current hero index
    let attempts = 0;
    const maxAttempts = currentPlayer.team.length;
    
    while (attempts < maxAttempts) {
      // Ensure hero index stays within team bounds
      if (game.playerHeroIndex[game.currentPlayerTurn] >= currentPlayer.team.length) {
        game.playerHeroIndex[game.currentPlayerTurn] = 0;
      }
      
      const currentHeroIndex = game.playerHeroIndex[game.currentPlayerTurn];
      const currentHero = currentPlayer.team[currentHeroIndex];
      
      // Check if this hero is alive
      const hp = currentHero.currentHP !== undefined ? currentHero.currentHP : (typeof currentHero.HP === 'string' ? parseInt(currentHero.HP) : currentHero.HP);
      
      if (hp > 0) {
        // Found an alive hero
        console.log(`🎯 Current turn: Player ${game.currentPlayerTurn}, Hero ${currentHeroIndex} (${currentHero.name})`);
        
        return {
          playerIndex: game.currentPlayerTurn,
          heroIndex: currentHeroIndex,
          player: currentPlayer,
          hero: currentHero
        };
      }
      
      // This hero is dead, try the next one
      game.playerHeroIndex[game.currentPlayerTurn] = (game.playerHeroIndex[game.currentPlayerTurn] + 1) % currentPlayer.team.length;
      attempts++;
    }
    
    // Should never reach here if hasAliveHeroes was true, but handle it gracefully
    return null;
  }

  // Advance to the next player's turn (strict alternation)
  advanceToNextValidTurn(game) {
    // Initialize tracking if needed
    if (game.currentPlayerTurn === undefined) {
      game.currentPlayerTurn = 0;
      game.playerHeroIndex = [0, 0];
    }
    
    // Advance the current player's hero index to the next hero (using absolute team indices)
    const currentPlayer = game.players[game.currentPlayerTurn];
    if (currentPlayer && currentPlayer.team && currentPlayer.team.length > 0) {
      game.playerHeroIndex[game.currentPlayerTurn] = (game.playerHeroIndex[game.currentPlayerTurn] + 1) % currentPlayer.team.length;
    }
    
    // Clear resurrection animation flags from all heroes (one-time flag)
    game.players.forEach(player => {
      player.team.forEach(hero => {
        if (hero.resurrected) {
          delete hero.resurrected;
          console.log(`🧹 Cleared resurrection animation flag for ${hero.name}`);
        }
        // Clear the justResurrected flag that prevents infinite death loops
        if (hero.statusEffects?.justResurrected) {
          delete hero.statusEffects.justResurrected;
          console.log(`✨ Cleared resurrection protection flag for ${hero.name}`);
        }
      });
    });
    
    // Switch to the other player
    game.currentPlayerTurn = 1 - game.currentPlayerTurn;
    
    console.log(`🔄 Advanced turn: Now Player ${game.currentPlayerTurn}'s turn`);
    
    // Get the new turn info
    const nextTurnInfo = this.getCurrentTurnInfo(game);
    
    // Reset action flags for the new turn
    if (nextTurnInfo && nextTurnInfo.player) {
      nextTurnInfo.player.hasUsedAttack = false;
      nextTurnInfo.player.usedAttacks = 0;
      nextTurnInfo.player.hasUsedAbility = false;
      nextTurnInfo.player.twinSpellUsed = false;
      nextTurnInfo.player.twinSpellActive = false;
      nextTurnInfo.player.oneTwoPunchUsed = false;
      nextTurnInfo.player.oneTwoPunchAttacksRemaining = 0;
      nextTurnInfo.player.monkDeflectUsed = false;
      
      // Initialize or reset usedAbilities array
      if (!nextTurnInfo.player.usedAbilities) {
        nextTurnInfo.player.usedAbilities = [];
      } else {
        nextTurnInfo.player.usedAbilities = [];
      }
      
      nextTurnInfo.player.selectedTarget = null;
      
      console.log(`♻️ Reset action flags for player ${game.currentPlayerTurn}`);
    }
    
    // Reset Monk attack count for the new hero
    if (nextTurnInfo && nextTurnInfo.hero) {
      if (nextTurnInfo.hero.name === 'Monk') {
        nextTurnInfo.player.monkAttacksRemaining = 1;
        console.log(`👊 Reset Monk attacks to 1 for ${nextTurnInfo.hero.name}'s turn`);
      } else {
        nextTurnInfo.player.monkAttacksRemaining = 0;
      }
      
      // Process turn start effects for the new hero
      this.processTurnStartEffects(game, nextTurnInfo.hero, nextTurnInfo.player);
    }
    
    return nextTurnInfo;
  }

  // Legacy method - now delegates to the new system
  buildTurnOrder(game) {
    // This method is kept for compatibility but the new system doesn't use it
    const allAliveHeroes = [];
    
    game.players.forEach((player, playerIndex) => {
      const aliveHeroes = player.team
        .map((hero, heroIndex) => ({ hero, playerIndex, heroIndex }))
        .filter(h => {
          const hp = h.hero.currentHP !== undefined ? h.hero.currentHP : (typeof h.hero.HP === 'string' ? parseInt(h.hero.HP) : h.hero.HP);
          return hp > 0;
        });
      allAliveHeroes.push(...aliveHeroes);
    });
    
    return allAliveHeroes;
  }

  selectTarget(playerId, targetId) {
    console.log(`🎯 selectTarget called by player ${playerId} for target ${targetId}`);
    
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    console.log(`🎯 Player ${playerId} mapped to game ${gameId}`);
    console.log(`🎯 Game found: ${!!game}, Game phase: ${game?.phase}`);
    
    if (!game || game.phase !== 'battle') {
      console.log(`🎯 Invalid game state: game=${!!game}, phase=${game?.phase}`);
      return { success: false, error: 'Invalid game state for target selection' };
    }

    const currentTurnInfo = this.getCurrentTurnInfo(game);
    if (!currentTurnInfo || currentTurnInfo.player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Check if hero is taunted - if so, must target the taunting hero
    const currentHero = currentTurnInfo.hero;
    if (currentHero.statusEffects?.taunt?.target) {
      const tauntTarget = this.findHeroByName(game, currentHero.statusEffects.taunt.target);
      if (tauntTarget && tauntTarget.currentHP > 0) {
        currentTurnInfo.player.selectedTarget = tauntTarget.name;
        return {
          success: true,
          gameId,
          selectedTarget: tauntTarget.name,
          forced: true,
          message: `${currentHero.name} must attack ${tauntTarget.name} due to taunt!`,
          gameState: this.getFullGameState(game)
        };
      }
    }

    // Find the target hero
    const opponent = game.players[1 - currentTurnInfo.playerIndex];
    const target = opponent.team.find(h => (h.name === targetId || h.id === targetId) && h.currentHP > 0);
    
    if (!target) {
      return { success: false, error: 'Invalid target - hero not found or dead' };
    }

    // Set the selected target first
    currentTurnInfo.player.selectedTarget = target.name;
    
    // Check for Paladin's Shield of Faith special - triggers when opponent targets adjacent ally
    // (Removed from here - now handled at end of turn)
    
    return {
      success: true,
      gameId,
      selectedTarget: target.name,
      forced: false,
      gameState: this.getFullGameState(game)
    };
  }

  checkPaladinShieldOfFaith(game, attacker, damagedAlly, damage) {
    // Only proceed if damage was dealt by an enemy to an ally (not self-damage, recoil, etc.)
    if (!attacker || !damagedAlly || damage <= 0) return;
    
    console.log(`🛡️ Shield of Faith check: ${attacker.name} damaged ${damagedAlly.name} for ${damage} HP`);
    
    // Find which team the damaged ally belongs to
    let damagedAllyPlayerIndex = -1;
    let attackerPlayerIndex = -1;
    
    for (let i = 0; i < game.players.length; i++) {
      if (game.players[i].team.some(h => h.name === damagedAlly.name)) {
        damagedAllyPlayerIndex = i;
        console.log(`🛡️ ${damagedAlly.name} found on team ${i}`);
      }
      if (game.players[i].team.some(h => h.name === attacker.name)) {
        attackerPlayerIndex = i;
        console.log(`🛡️ ${attacker.name} found on team ${i}`);
      }
    }
    
    // Only trigger if attacker and damaged ally are on different teams (enemy damage)
    if (damagedAllyPlayerIndex === -1 || attackerPlayerIndex === -1 || 
        damagedAllyPlayerIndex === attackerPlayerIndex) {
      console.log(`🛡️ Shield of Faith: Not enemy damage - ally player ${damagedAllyPlayerIndex}, attacker player ${attackerPlayerIndex} - SKIPPING`);
      return;
    }
    
    const defendingPlayer = game.players[damagedAllyPlayerIndex];
    
    console.log(`🛡️ Shield of Faith: ${attacker.name} (P${attackerPlayerIndex}) damaged ${damagedAlly.name} (P${damagedAllyPlayerIndex}) for ${damage} HP`);
    
    // Find living Paladins with Shield of Faith on the damaged ally's team
    const paladins = defendingPlayer.team.filter(hero => {
      if (hero.name !== 'Paladin' || hero.currentHP <= 0) return false;
      
      const specials = Array.isArray(hero.Special) ? hero.Special : [hero.Special];
      return specials.some(special => special.name === 'Shield of Faith');
    });
    
    console.log(`🛡️ Found ${paladins.length} living Paladins with Shield of Faith on damaged ally's team`);
    
    if (paladins.length === 0) return;
    
    // Check if the damaged ally is adjacent to any Paladin
    for (const paladin of paladins) {
      const paladinIndex = defendingPlayer.team.indexOf(paladin);
      const allyIndex = defendingPlayer.team.indexOf(damagedAlly);
      
      console.log(`🛡️ ${paladin.name} at position ${paladinIndex}, ${damagedAlly.name} at position ${allyIndex}`);
      console.log(`🛡️ Distance: |${paladinIndex} - ${allyIndex}| = ${Math.abs(paladinIndex - allyIndex)}`);
      
      // Check if ally is adjacent to Paladin (index difference of 1)
      if (Math.abs(paladinIndex - allyIndex) === 1) {
        // Check if attacker is already taunted by this Paladin
        const currentTaunt = attacker.statusEffects?.taunt;
        if (currentTaunt && currentTaunt.target === paladin.name && currentTaunt.appliedBy === paladin.name) {
          console.log(`🛡️ ${attacker.name} is already taunted by ${paladin.name} - Shield of Faith will not trigger again`);
          break; // Skip queuing another taunt from the same Paladin
        }
        
        // Queue taunt to be applied at end of attacker's turn (not immediately)
        if (!game.pendingTaunts) {
          game.pendingTaunts = [];
        }
        
        // Remove any existing pending taunts for this attacker (new taunt replaces old)
        game.pendingTaunts = game.pendingTaunts.filter(pendingTaunt => pendingTaunt.target !== attacker.name);
        
        game.pendingTaunts.push({
          target: attacker.name,
          tauntTarget: paladin.name,
          duration: 1, // Lasts until end of attacker's NEXT turn (1 turn duration)
          appliedBy: paladin.name,
          source: 'Shield of Faith'
        });
        
        console.log(`🛡️ ${paladin.name}'s Shield of Faith queued! ${attacker.name} will be taunted at end of turn for damaging adjacent ally ${damagedAlly.name}`);
        
        // Only one Paladin can trigger per damage instance
        break;
      } else {
        console.log(`🛡️ ${paladin.name} is not adjacent to ${damagedAlly.name} - no taunt triggered`);
      }
    }
  }

  findHeroByName(game, heroName) {
    for (const player of game.players) {
      const hero = player.team.find(h => h.name === heroName);
      if (hero) return hero;
    }
    return null;
  }





  validateTargetAgainstTaunt(currentHero, selectedTarget) {
    // Check if hero can ignore taunts (like Barbarian's Break the Line)
    const canIgnoreTaunt = this.hasPassiveModifier(currentHero, 'ignore_taunt');
    
    // If hero is taunted and cannot ignore taunts, they must target the taunting hero
    if (currentHero.statusEffects?.taunt?.target && !canIgnoreTaunt) {
      const requiredTarget = currentHero.statusEffects.taunt.target;
      if (selectedTarget !== requiredTarget) {
        return {
          valid: false,
          error: `${currentHero.name} is taunted and must target ${requiredTarget}`
        };
      }
    }
    return { valid: true };
  }

  activateSpecial(playerId) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || game.phase !== 'battle') {
      return { success: false, error: 'Invalid game state for special activation' };
    }

    const currentTurnInfo = this.getCurrentTurnInfo(game);
    if (!currentTurnInfo || currentTurnInfo.player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const player = currentTurnInfo.player;
    const currentHero = currentTurnInfo.hero;
    
    if (!currentHero || !currentHero.Special) {
      return { success: false, error: 'Hero has no special ability' };
    }

    // Check if the special is an activated type
    const special = Array.isArray(currentHero.Special) 
      ? currentHero.Special.find(s => s.category === 'activated_aoe' || s.category === 'activated_aoe_heal')
      : (currentHero.Special.category === 'activated_aoe' || currentHero.Special.category === 'activated_aoe_heal' ? currentHero.Special : null);
    
    if (!special) {
      return { success: false, error: 'Special ability is not manually activatable' };
    }

    // Check if already used (at hero level, persists through resurrection)
    if (!currentHero.permanentDisables) {
      currentHero.permanentDisables = {};
    }
    
    if (currentHero.permanentDisables.special) {
      return { success: false, error: 'Special ability already used this battle' };
    }

    console.log(`💥 ${currentHero.name} activating ${special.name}!`);

    const opponent = game.players[1 - currentTurnInfo.playerIndex];
    const results = [];

    // Initialize battle log if it doesn't exist
    if (!game.battleLog) {
      game.battleLog = [];
    }

    // Process the special ability effects
    for (const effect of special.effects || []) {
      if (effect.type === 'damage' && effect.target === 'all_heroes') {
        // Mech's Self Destruct - deal damage to ALL heroes (both teams)
        const { rollDiceString } = require('./utils');
        
        console.log(`💥 ${special.name}: Rolling damage for all heroes`);
        
        // Don't add initial activation log - individual hits/misses will be logged
        
        // Deal damage to all heroes on both teams
        game.players.forEach((targetPlayer, playerIndex) => {
          targetPlayer.team.forEach(target => {
            if (target.currentHP > 0) {
              // Roll attack for this target (each hero gets their own attack roll)
              const advantageDisadvantage = this.hasAdvantageDisadvantage(currentHero, target, false, game);
              const attackRoll = calculateAttackRoll(currentHero.modifiedAccuracy, advantageDisadvantage.advantage, advantageDisadvantage.disadvantage, currentHero);
              const hit = attackRoll.total >= calculateEffectiveDefense(target);
              
              console.log(`💥 ${special.name} targeting ${target.name}: Roll ${attackRoll.roll}+${currentHero.modifiedAccuracy} = ${attackRoll.total} vs AC ${calculateEffectiveDefense(target)} → ${hit ? 'HIT' : 'MISS'}`);
              
              let finalDamage = 0;
              let damageRoll = null;
              
              if (hit) {
                damageRoll = rollDiceString(effect.value);
                const damage = damageRoll.total;
                const oldHP = target.currentHP;
                
                // Process damage reduction specials (like Wizard's Arcane Shield)
                const damageReductionResult = this.processDamageReductionSpecials(game, target, currentHero, damage);
                finalDamage = damageReductionResult.finalDamage;
                
                target.currentHP = Math.max(0, target.currentHP - finalDamage);
                
                // Trigger after-damage effects (like Ninja's Vanish)
                const afterDamageSpecials = this.processAfterDamageEffects(game, target, currentHero, finalDamage);
                // Note: These will be logged separately
                
                // Trigger on_take_damage effects (like Shroomguard's Poison Aura)
                const onTakeDamageSpecials = this.processOnTakeDamageEffects(game, target, currentHero, finalDamage);
                // Note: These will be logged separately via the processOnTakeDamageEffects function
                
                console.log(`💥 ${target.name} takes ${finalDamage} damage from ${special.name}: ${oldHP} → ${target.currentHP} HP`);
                
                // Add individual damage log entry for this hero
                game.battleLog.push({
                  type: 'damage',
                  source: currentHero.name,
                  target: target.name,
                  damage: finalDamage,
                  damageRoll: damageRoll,
                  attackRoll: attackRoll.roll,
                  attackTotal: attackRoll.total,
                  targetDefense: calculateEffectiveDefense(target),
                  accuracy: currentHero.modifiedAccuracy,
                  hit: true,
                  isCritical: attackRoll.isCritical || false,
                  newHP: target.currentHP,
                  maxHP: target.HP,
                  specialName: special.name,
                  isSpecial: true,
                  message: `${special.name} deals ${finalDamage} damage to ${target.name}`
                });
                
                results.push({
                  type: 'damage',
                  target: target.name,
                  damage: finalDamage,
                  damageRoll: damageRoll,
                  attackRoll: attackRoll.roll,
                  attackTotal: attackRoll.total,
                  newHP: target.currentHP,
                  maxHP: target.HP,
                  hit: true,
                  isCritical: attackRoll.isCritical || false,
                  message: `${special.name} deals ${finalDamage} damage to ${target.name}`
                });
                
                // Check if target died
                if (target.currentHP <= 0 && !target.statusEffects?.justResurrected) {
                  console.log(`💀 ${target.name} died from ${special.name}!`);
                  this.updatePassiveEffectsOnDeath(game, target, currentHero, 'special_damage');
                }
              } else {
                // Miss - add log entry
                console.log(`💥 ${special.name} missed ${target.name}`);
                
                game.battleLog.push({
                  type: 'miss',
                  source: currentHero.name,
                  target: target.name,
                  attackRoll: attackRoll.roll,
                  attackTotal: attackRoll.total,
                  targetDefense: calculateEffectiveDefense(target),
                  accuracy: currentHero.modifiedAccuracy,
                  hit: false,
                  specialName: special.name,
                  isSpecial: true,
                  message: `${special.name} missed ${target.name}`
                });
                
                results.push({
                  type: 'miss',
                  target: target.name,
                  attackRoll: attackRoll.roll,
                  attackTotal: attackRoll.total,
                  hit: false,
                  message: `${special.name} missed ${target.name}`
                });
              }
            }
          });
        });

        // If the special has a self-destruct cost, kill the caster
        if (effect.cost?.type === 'self_destruct') {
          console.log(`💥 ${currentHero.name} self-destructs!`);
          currentHero.currentHP = 0;
          
          this.updatePassiveEffectsOnDeath(game, currentHero, null, 'self_destruct');
        }
      } else if (effect.type === 'heal' && effect.target === 'all_heroes') {
        // Diplomat's Peace Treaty - heal ALL heroes (both teams)
        const { rollDiceString } = require('./utils');
        
        console.log(`🕊️ ${special.name}: Rolling healing for all heroes`);
        
        // Roll healing once for all heroes
        const healingRoll = rollDiceString(effect.value);
        const healingAmount = healingRoll.total;
        
        console.log(`🕊️ ${special.name} heals for ${healingAmount} HP`);
        
        // Heal all heroes on both teams
        game.players.forEach((targetPlayer, playerIndex) => {
          targetPlayer.team.forEach(target => {
            if (target.currentHP > 0) {
              const oldHP = target.currentHP;
              const missingHP = target.HP - target.currentHP;
              const actualHealing = Math.min(healingAmount, missingHP);
              target.currentHP = Math.min(target.HP, target.currentHP + healingAmount);
              
              console.log(`🕊️ ${target.name} healed for ${actualHealing} HP: ${oldHP} → ${target.currentHP}`);
              
              // Clear Cavalier's Ride Down debuff if healed to full HP
              if (target.currentHP === target.HP && target.statusEffects?.rideDownDebuff) {
                console.log(`✨ ${target.name} healed to full HP - removing Cavalier's Ride Down debuff`);
                delete target.statusEffects.rideDownDebuff;
              }
              
              results.push({
                type: 'heal',
                target: target.name,
                healing: actualHealing,
                newHP: target.currentHP,
                maxHP: target.HP,
                healingRoll: healingRoll,
                message: `${target.name} healed for ${actualHealing} HP`
              });
            }
          });
        });
        
        // Add comprehensive log entry for Peace Treaty
        game.battleLog.push({
          type: 'special_heal',
          source: currentHero.name,
          specialName: special.name,
          isSpecial: true,
          healing: healingAmount,
          healingRoll: healingRoll,
          message: `${currentHero.name} used ${special.name}`,
          summary: `All heroes were healed for ${healingAmount}`,
          timestamp: Date.now()
        });
      }
    }

    // Mark special as permanently used (persists through resurrection)
    currentHero.permanentDisables.special = true;
    player.hasUsedSpecial = true;

    // Check if the current hero died from self-destruct
    if (currentHero.currentHP === 0) {
      // Check for game over condition first
      const winner = this.checkWinCondition(game);
      if (winner) {
        game.phase = 'ended';
        game.winner = winner;
        return {
          success: true,
          gameId,
          results,
          gameState: this.getFullGameState(game)
        };
      }
      
      // Advance to next player's turn since current hero died
      const nextTurnInfo = this.advanceToNextValidTurn(game);
      if (nextTurnInfo) {
        game.currentTurn = nextTurnInfo.playerIndex;
      }
    } else {
      // Check for game over condition
      const winner = this.checkWinCondition(game);
      if (winner) {
        game.phase = 'ended';
        game.winner = winner;
      }
    }

    return {
      success: true,
      gameId,
      results,
      gameState: this.getFullGameState(game)
    };
  }

  endTurn(playerId) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || game.phase !== 'battle') {
      return { success: false, error: 'Invalid game state' };
    }

    const currentTurnInfo = this.getCurrentTurnInfo(game);
    if (!currentTurnInfo || currentTurnInfo.player.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    // Process end-of-turn effects for current hero
    const endTurnEffects = [];
    if (currentTurnInfo.hero) {
      const effects = processEndOfTurn(currentTurnInfo.hero);
      endTurnEffects.push(...effects);
      
      // Check if Shroomguard took poison damage and trigger Poison Aura
      const poisonDamageEffect = effects.find(e => e.type === 'poison_damage' && e.damage > 0);
      if (poisonDamageEffect && currentTurnInfo.hero.name === 'Shroomguard' && currentTurnInfo.hero.currentHP > 0) {
        console.log(`🍄 Shroomguard took ${poisonDamageEffect.damage} poison damage - triggering Poison Aura`);
        const poisonAuraEffects = this.processOnTakeDamageEffects(game, currentTurnInfo.hero, null, poisonDamageEffect.damage);
        endTurnEffects.push(...poisonAuraEffects);
      }
      
      // Check if hero died from poison and trigger death effects (Hoarder's Collect Weapons, remove passive effects, etc.)
      if (poisonDamageEffect && currentTurnInfo.hero.currentHP <= 0 && !currentTurnInfo.hero.statusEffects?.justResurrected) {
        console.log(`💀 ${currentTurnInfo.hero.name} died from poison damage`);
        this.updatePassiveEffectsOnDeath(game, currentTurnInfo.hero, null, 'poison');
      }
      
      // Druid Healing Word special: Heal lowest health ally at end of turn
      if (currentTurnInfo.hero.name === 'Druid' && currentTurnInfo.hero.currentHP > 0) {
        const druidSpecial = Array.isArray(currentTurnInfo.hero.Special) 
          ? currentTurnInfo.hero.Special.find(s => s.name === 'Healing Word' && s.trigger === 'end_of_turn')
          : (currentTurnInfo.hero.Special?.name === 'Healing Word' && currentTurnInfo.hero.Special?.trigger === 'end_of_turn' ? currentTurnInfo.hero.Special : null);
        
        if (druidSpecial) {
          // Debug logging
          console.log(`🌿 Druid Healing Word triggered for ${currentTurnInfo.hero.name}`);
          console.log(`🌿 Current player index: ${currentTurnInfo.playerIndex}`);
          console.log(`🌿 Current player team:`, currentTurnInfo.player.team.map(h => `${h.name}(${h.currentHP}/${h.HP})`));
          
          // Find lowest health ally (including Druid)
          const aliveAllies = currentTurnInfo.player.team.filter(hero => hero.currentHP > 0);
          console.log(`🌿 Alive allies:`, aliveAllies.map(h => `${h.name}(${h.currentHP}/${h.HP})`));
          
          if (aliveAllies.length > 0) {
            const lowestHealthAlly = aliveAllies.reduce((lowest, current) => {
              const currentHealthPercent = current.currentHP / current.HP;
              const lowestHealthPercent = lowest.currentHP / lowest.HP;
              return currentHealthPercent < lowestHealthPercent ? current : lowest;
            });
            
            console.log(`🌿 Lowest health ally found: ${lowestHealthAlly.name} (${lowestHealthAlly.currentHP}/${lowestHealthAlly.HP})`);
            
            // Only heal if not at full health
            if (lowestHealthAlly.currentHP < lowestHealthAlly.HP) {
              const { rollDiceString } = require('./utils');
              const healingRoll = rollDiceString('1D4');
              const healingAmount = healingRoll.total;
              const oldHP = lowestHealthAlly.currentHP;
              lowestHealthAlly.currentHP = Math.min(lowestHealthAlly.HP, lowestHealthAlly.currentHP + healingAmount);
              
              console.log(`🌿 ${currentTurnInfo.hero.name}'s Healing Word heals ${lowestHealthAlly.name} for ${healingAmount} HP (${oldHP} → ${lowestHealthAlly.currentHP})`);
              
              // Add comprehensive log entry for Healing Word with "used" in message
              const healingWordLogEntry = {
                type: 'healing_word',
                caster: currentTurnInfo.hero.name,
                target: lowestHealthAlly.name,
                healing: healingAmount,
                newHP: lowestHealthAlly.currentHP,
                maxHP: lowestHealthAlly.HP,
                message: `${currentTurnInfo.hero.name} used Healing Word and healed ${lowestHealthAlly.name} for ${healingAmount}`,
                timestamp: Date.now()
              };
              
              endTurnEffects.push(healingWordLogEntry);
            } else {
              console.log(`🌿 ${lowestHealthAlly.name} is already at full health, no healing needed`);
            }
          } else {
            console.log(`🌿 No alive allies found for healing`);
          }
        }
      }

      // Engineer Turret Damage: Deal damage to random enemies for each active turret at end of turn
      if (currentTurnInfo.hero.name === 'Engineer' && currentTurnInfo.hero.currentHP > 0 && 
          currentTurnInfo.hero.statusEffects && currentTurnInfo.hero.statusEffects.turret_count > 0) {
        
        const turretCount = currentTurnInfo.hero.statusEffects.turret_count;
        console.log(`🔧 ${currentTurnInfo.hero.name}'s ${turretCount} turret(s) activate at end of turn`);
        
        // Get all alive enemies
        const opponent = game.players.find(p => p.id !== currentTurnInfo.player.id);
        const aliveEnemies = opponent.team.filter(hero => hero.currentHP > 0);
        
        if (aliveEnemies.length > 0) {
          // Each turret deals 1D4 damage to a random enemy
          for (let i = 0; i < turretCount; i++) {
            const randomEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            const { rollDiceString } = require('./utils');
            const damageRoll = rollDiceString('1D4');
            const damageAmount = damageRoll.total;
            const oldHP = randomEnemy.currentHP;
            
            // Use centralized damage application (triggers Shroomguard's Poison Aura and Ninja's Vanish)
            const triggeredEffects = this.applyDamageToHero(game, randomEnemy, damageAmount, currentTurnInfo.hero, 'Engineer Turret');
            endTurnEffects.push(...triggeredEffects);
            
            // Simple turret attack log entry
            const turretAttackLogEntry = {
              type: 'turret_attack',
              caster: currentTurnInfo.hero.name,
              target: randomEnemy.name,
              damage: damageAmount,
              newHP: randomEnemy.currentHP,
              maxHP: randomEnemy.HP,
              message: `${currentTurnInfo.hero.name} used Deploy Turret - Turret attacked ${randomEnemy.name} for ${damageAmount} damage`,
              timestamp: Date.now()
            };
            
            endTurnEffects.push(turretAttackLogEntry);
          }
        } else {
          console.log(`🔧 No alive enemies found for turret damage`);
        }
      }

      // Medic Emergency Heal: Heal lowest health ally for 1D4 per med bot at end of turn
      if (currentTurnInfo.hero.name === 'Medic' && currentTurnInfo.hero.currentHP > 0 && 
          currentTurnInfo.hero.statusEffects && currentTurnInfo.hero.statusEffects.med_bot_count > 0) {
        
        const medBotCount = currentTurnInfo.hero.statusEffects.med_bot_count;
        console.log(`💉 ${currentTurnInfo.hero.name}'s ${medBotCount} med bot(s) activate Emergency Heal at end of turn`);
        
        // Get all damaged allies (including Medic themselves)
        const aliveAllies = currentTurnInfo.player.team.filter(hero => hero.currentHP > 0 && hero.currentHP < hero.HP);
        
        if (aliveAllies.length > 0) {
          // Find lowest health ally
          let lowestHealthAlly = aliveAllies[0];
          for (const ally of aliveAllies) {
            if (ally.currentHP < lowestHealthAlly.currentHP) {
              lowestHealthAlly = ally;
            }
          }
          
          // Heal 1D4 for each med bot
          const { rollDiceString } = require('./utils');
          let totalHealing = 0;
          const healRolls = [];
          
          for (let i = 0; i < medBotCount; i++) {
            const healRoll = rollDiceString('1D4');
            totalHealing += healRoll.total;
            healRolls.push(healRoll.total);
          }
          
          const oldHP = lowestHealthAlly.currentHP;
          lowestHealthAlly.currentHP = Math.min(lowestHealthAlly.currentHP + totalHealing, lowestHealthAlly.HP);
          const actualHealing = lowestHealthAlly.currentHP - oldHP;
          
          console.log(`💉 ${currentTurnInfo.hero.name} used Emergency Heal: Healed ${lowestHealthAlly.name} for ${actualHealing} HP (rolled ${healRolls.join(' + ')} = ${totalHealing})`);
          
          // Create heal log entry
          const emergencyHealLogEntry = {
            type: 'emergency_heal',
            caster: currentTurnInfo.hero.name,
            target: lowestHealthAlly.name,
            healing: actualHealing,
            totalRolled: totalHealing,
            medBotCount: medBotCount,
            newHP: lowestHealthAlly.currentHP,
            maxHP: lowestHealthAlly.HP,
            message: `${currentTurnInfo.hero.name} used Emergency Heal and healed ${lowestHealthAlly.name} for ${actualHealing}`,
            timestamp: Date.now()
          };
          
          endTurnEffects.push(emergencyHealLogEntry);
        } else {
          console.log(`💉 No damaged allies found for Emergency Heal`);
        }
      }
    }

    // Reset turn actions
    currentTurnInfo.player.hasUsedAttack = false;
    currentTurnInfo.player.usedAttacks = 0; // Reset attack counter for Berserker Frenzy
    currentTurnInfo.player.hasUsedAbility = false;
    currentTurnInfo.player.twinSpellUsed = false; // Reset Twin Spell usage for this player (legacy)
    currentTurnInfo.player.twinSpellActive = false; // Reset Twin Spell active state for this player
    currentTurnInfo.player.oneTwoPunchUsed = false; // Reset One-Two Punch usage for this player
    currentTurnInfo.player.monkAttacksRemaining = currentTurnInfo.hero.name === 'Monk' ? 1 : 0; // Reset Monk attack count
    currentTurnInfo.player.oneTwoPunchAttacksRemaining = 0; // Legacy field for compatibility
    currentTurnInfo.player.monkDeflectUsed = false; // Reset Monk Deflect usage for this player
    

    
    // Initialize usedAbilities if it doesn't exist (for backward compatibility)
    if (!currentTurnInfo.player.usedAbilities) {
      currentTurnInfo.player.usedAbilities = [];
    } else {
      currentTurnInfo.player.usedAbilities = [];
    }
    currentTurnInfo.player.selectedTarget = null; // Clear target selection

    // Remove first pick silence debuff at end of turn (first player disadvantage cleanup)
    if (currentTurnInfo.hero.statusEffects?.silenced && 
        currentTurnInfo.hero.statusEffects.silenced.source === "First Pick Disadvantage") {
      currentTurnInfo.hero.statusEffects.silenced = false;
      console.log(`🔇 First Pick Silence removed from ${currentTurnInfo.hero.name} at end of turn`);
    }

    // Apply queued taunts from Paladin Shield of Faith
    if (game.pendingTaunts && game.pendingTaunts.length > 0) {
      console.log(`🛡️ Applying ${game.pendingTaunts.length} queued taunts at end of ${currentTurnInfo.hero.name}'s turn`);
      
      for (const pendingTaunt of game.pendingTaunts) {
        const targetHero = this.findHeroByName(game, pendingTaunt.target);
        if (targetHero) {
          if (!targetHero.statusEffects) {
            targetHero.statusEffects = {};
          }
          
          // Check if hero is already taunted by someone else
          const existingTaunt = targetHero.statusEffects.taunt;
          let shouldLog = true;
          
          if (existingTaunt) {
            if (existingTaunt.appliedBy === pendingTaunt.appliedBy && existingTaunt.target === pendingTaunt.tauntTarget) {
              // Same Paladin trying to taunt again - don't log
              shouldLog = false;
              console.log(`🛡️ ${targetHero.name} already taunted by ${pendingTaunt.appliedBy} - no log entry added`);
            } else {
              // Different taunter - old taunt ends, new one begins
              console.log(`🛡️ ${targetHero.name}'s taunt by ${existingTaunt.appliedBy} ends, now taunted by ${pendingTaunt.appliedBy}`);
            }
          }
          
          targetHero.statusEffects.taunt = {
            target: pendingTaunt.tauntTarget,
            duration: pendingTaunt.duration,
            appliedBy: pendingTaunt.appliedBy,
            source: pendingTaunt.source
          };
          
          console.log(`🛡️ ${pendingTaunt.appliedBy}'s Shield of Faith applied! ${targetHero.name} is now taunted to target ${pendingTaunt.tauntTarget}`);
          
          // Add comprehensive special log entry for Shield of Faith taunt
          if (shouldLog) {
            const paladinHero = this.findHeroByName(game, pendingTaunt.appliedBy);
            const shieldOfFaithLogEntry = this.createSpecialLogEntry(
              paladinHero,
              'Shield of Faith', 
              null, 
              null,
              [{
                type: 'apply_debuff',
                target: targetHero.name,
                effect: 'taunt',
                tauntTarget: pendingTaunt.tauntTarget,
                message: `taunted ${targetHero.name}`
              }]
            );
            endTurnEffects.push(shieldOfFaithLogEntry);
          }
        }
      }
      
      // Clear the pending taunts
      game.pendingTaunts = [];
    }

    // Advance to next turn
    const nextTurnInfo = this.advanceToNextValidTurn(game);
    if (nextTurnInfo) {
      game.currentTurn = nextTurnInfo.playerIndex;
      
      // Check for caster-specific duration expiry when a new hero's turn starts
      this.processCasterDurationEffects(game, nextTurnInfo.hero);
    }
    
    // Check for win condition
    const winner = this.checkWinCondition(game);
    if (winner) {
      game.phase = 'ended';
      game.winner = winner;
    }

    // Include turn start effects and clear them after sending
    const turnStartEffects = game.turnStartEffects || [];
    game.turnStartEffects = []; // Clear for next turn
    
    return {
      success: true,
      gameId,
      currentTurn: game.currentTurn,
      endTurnEffects,
      turnStartEffects,
      winner: game.winner,
      gameState: this.getFullGameState(game)
    };
  }

  checkWinCondition(game) {
    // Don't check win condition during draft phase
    if (game.phase === 'draft') {
      return null;
    }
    
    // Check if both players have no heroes left (tie condition)
    const player1AliveHeroes = game.players[0].team.filter(h => h.currentHP > 0);
    const player2AliveHeroes = game.players[1].team.filter(h => h.currentHP > 0);
    
    if (player1AliveHeroes.length === 0 && player2AliveHeroes.length === 0) {
      console.log('🤝 TIE GAME! Both players have no heroes left!');
      
      // Award victory points for tie (async, but don't wait) - only for non-survival modes
      if (game.mode !== 'survival') {
        this.handleGameCompletion(game.id, null, 'tie').catch(error => {
          console.error('Error awarding victory points for tie:', error);
        });
      }
      
      return 'TIE';
    }
    
    for (let i = 0; i < game.players.length; i++) {
      const player = game.players[i];
      const aliveHeroes = player.team.filter(h => h.currentHP > 0);
      
      if (aliveHeroes.length === 0) {
        // This player has no heroes left, opponent wins
        const winnerId = game.players[1 - i].id;
        
        // Award victory points for game completion (async, but don't wait)
        this.handleGameCompletion(game.id, winnerId, 'victory').catch(error => {
          console.error('Error awarding victory points for game completion:', error);
        });
        
        return winnerId;
      }
    }
    return null;
  }

  surrenderGame(playerId) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    // Only allow surrender during battle phase
    if (game.phase !== 'battle') {
      return { success: false, error: 'Can only surrender during battle' };
    }

    // Find the surrendering player and opponent
    const surrenderingPlayerIndex = game.players.findIndex(p => p.id === playerId);
    if (surrenderingPlayerIndex === -1) {
      return { success: false, error: 'Player not found in game' };
    }

    const opponentIndex = 1 - surrenderingPlayerIndex;
    const opponentId = game.players[opponentIndex].id;

    // Set game as ended with opponent as winner
    game.phase = 'ended';
    game.winner = opponentId;

    console.log(`🏳️ Player ${playerId} surrendered! Opponent ${opponentId} wins by forfeit.`);

    // Award victory points for game completion (async, but don't wait)
    this.handleGameCompletion(gameId, opponentId, 'surrender').catch(error => {
      console.error('Error awarding victory points for surrender:', error);
    });

    return {
      success: true,
      gameId,
      winner: opponentId,
      surrenderedBy: playerId,
      gameState: this.getFullGameState(game)
    };
  }

  reconnectPlayer(socketId, gameId, playerName) {
    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    const player = game.players.find(p => p.name === playerName);
    if (!player) {
      return { success: false, error: 'Player not found in game' };
    }

    // Check if player already surrendered from disconnection timeout
    const oldPlayerId = game.players.find(p => p.name === playerName)?.id;
    if (oldPlayerId && game.disconnectionTimers && game.disconnectionTimers.has(oldPlayerId)) {
      const timerData = game.disconnectionTimers.get(oldPlayerId);
      if (timerData.surrendered) {
        return { success: false, error: 'You have already been surrendered due to disconnection' };
      }
    }

    // Update player connection
    const oldId = player.id;
    player.id = socketId;
    player.connected = true;
    this.playerGameMap.set(socketId, gameId);
    
    // Cancel disconnection countdown if it exists
    if (game.disconnectionTimers && game.disconnectionTimers.has(oldId)) {
      const timerData = game.disconnectionTimers.get(oldId);
      if (timerData.timeoutId) {
        clearTimeout(timerData.timeoutId);
      }
      game.disconnectionTimers.delete(oldId);
      console.log(`✅ Player ${playerName} reconnected - cancelled disconnection countdown`);
    }
    
    // Update the playerGameMap entry
    this.playerGameMap.delete(oldId);

    return {
      success: true,
      gameId,
      gameState: this.getFullGameState(game),
      reconnected: true
    };
  }

  handleDisconnect(playerId) {
    const gameId = this.playerGameMap.get(playerId);
    if (gameId) {
      const game = this.games.get(gameId);
      if (game) {
        const player = game.players.find(p => p.id === playerId);
        if (player) {
          player.connected = false;
          
          // Start disconnection countdown only if game is in battle phase
          if (game.phase === 'battle') {
            this.startDisconnectionCountdown(game, playerId);
          }
        }
      }
      this.playerGameMap.delete(playerId);
    }
  }

  autoDraft(playerId) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || (game.phase !== 'draft' && game.phase !== 'waiting')) {
      return { success: false, error: 'Invalid game state for auto-draft' };
    }

    // Get all available heroes (exclude banned ones)
    const bannedCards = game.players.map(p => p.bannedCard).filter(Boolean);
    const availableHeroes = this.heroes.filter(hero => !bannedCards.includes(hero.name));
    
    // Use regular shuffle for equal probability
    const shuffled = shuffle(availableHeroes);
    
    // Assign 3 random heroes to each player - properly reset each hero
    game.players[0].team = shuffled.slice(0, 3).map(hero => this.resetHeroToOriginalState(hero));
    game.players[1].team = shuffled.slice(3, 6).map(hero => this.resetHeroToOriginalState(hero));
    
    // Set default attack order (same as team order)
    game.players[0].attackOrder = game.players[0].team.map(h => h.name);
    game.players[1].attackOrder = game.players[1].team.map(h => h.name);
    
    // Skip to battle phase
    game.phase = 'initiative';
    game.currentDraftPhase = 3;
    
    console.log('Auto-draft completed:', {
      player1Team: game.players[0].team.map(h => h.name),
      player2Team: game.players[1].team.map(h => h.name)
    });
    
    return {
      success: true,
      gameId,
      gameState: this.getFullGameState(game),
      message: 'Auto-draft completed! Teams assigned randomly.'
    };
  }

  startDisconnectionCountdown(game, playerId) {
    if (!game.disconnectionTimers) {
      game.disconnectionTimers = new Map();
    }

    // Don't start a new countdown if one already exists
    if (game.disconnectionTimers.has(playerId)) {
      console.log(`⏱️ Disconnection countdown already active for player ${playerId}`);
      return;
    }

    const player = game.players.find(p => p.id === playerId);
    if (!player) return;

    console.log(`⏱️ Starting 30-second disconnection countdown for ${player.name}`);

    const startTime = Date.now();
    const timeoutId = setTimeout(() => {
      this.handleDisconnectionTimeout(game, playerId);
    }, 30000); // 30 seconds

    game.disconnectionTimers.set(playerId, {
      startTime,
      timeoutId,
      surrendered: false,
      playerName: player.name
    });

    // Notify the socket service that countdown has started (will be handled in server.js)
    if (this.io) {
      this.io.to(game.id).emit('disconnection-countdown-started', {
        playerId,
        playerName: player.name,
        remainingTime: 30
      });
    }
  }

  async handleDisconnectionTimeout(game, playerId) {
    const timerData = game.disconnectionTimers.get(playerId);
    if (!timerData) return;

    const player = game.players.find(p => p.id === playerId);
    if (!player) return;

    // Check if player reconnected (connected flag is true)
    if (player.connected) {
      console.log(`✅ Player ${player.name} reconnected before timeout - clearing countdown`);
      game.disconnectionTimers.delete(playerId);
      return;
    }

    console.log(`⏰ Disconnection timeout reached for ${player.name} - forcing surrender`);

    // Mark as surrendered to prevent reconnection
    timerData.surrendered = true;

    // Force surrender the disconnected player
    const opponentPlayer = game.players.find(p => p.id !== playerId);
    if (opponentPlayer) {
      game.phase = 'ended';
      game.winner = opponentPlayer.id;

      console.log(`🏆 ${opponentPlayer.name} wins by disconnection forfeit`);

      // Update database stats for disconnected player (loss)
      const disconnectedUserId = this.userSessions.get(playerId);
      if (disconnectedUserId && this.database) {
        try {
          await this.database.updatePlayerStats(disconnectedUserId, false, game.mode);
          console.log(`📊 Updated loss for disconnected player ${player.name} (userId: ${disconnectedUserId})`);
        } catch (error) {
          console.error(`❌ Error updating stats for disconnected player:`, error);
        }
      }

      // Update database stats for winner
      const winnerUserId = this.userSessions.get(opponentPlayer.id);
      if (winnerUserId && this.database) {
        try {
          await this.database.updatePlayerStats(winnerUserId, true, game.mode);
          console.log(`📊 Updated win for ${opponentPlayer.name} (userId: ${winnerUserId})`);
        } catch (error) {
          console.error(`❌ Error updating stats for winner:`, error);
        }
      }

      // Notify both players via socket service (will be handled in server.js)
      if (this.io) {
        this.io.to(game.id).emit('game-ended-by-disconnection', {
          winner: opponentPlayer.id,
          winnerName: opponentPlayer.name,
          disconnectedPlayer: playerId,
          disconnectedPlayerName: player.name,
          gameState: this.getFullGameState(game)
        });
      }
    }

    // Clean up the timer
    game.disconnectionTimers.delete(playerId);
  }

  getDisconnectionTimer(gameId, playerId) {
    const game = this.games.get(gameId);
    if (!game || !game.disconnectionTimers) return null;

    const timerData = game.disconnectionTimers.get(playerId);
    if (!timerData) return null;

    const elapsed = Date.now() - timerData.startTime;
    const remaining = Math.max(0, 30 - Math.floor(elapsed / 1000));

    return {
      playerId,
      playerName: timerData.playerName,
      remainingTime: remaining,
      surrendered: timerData.surrendered
    };
  }

  // Method to inject the io instance for socket communication
  setIo(io) {
    this.io = io;
  }

  getGameState(gameId) {
    const game = this.games.get(gameId);
    return game ? this.getFullGameState(game) : null;
  }

  isPlayerInActiveGame(playerId) {
    const gameId = this.playerGameMap.get(playerId);
    if (!gameId) return false;
    
    const game = this.games.get(gameId);
    if (!game) return false;
    
    // Player is in an active game if the game exists and is in a meaningful phase
    return game.phase !== 'waiting' && game.phase !== 'ended';
  }

  getFullGameState(game) {
    const currentTurnInfo = this.getCurrentTurnInfo(game);
    const expectedCurrentTurn = currentTurnInfo ? currentTurnInfo.playerIndex : 0;
    
    if (game.currentTurn !== expectedCurrentTurn) {
      console.log(`🚨 TURN MISMATCH: game.currentTurn=${game.currentTurn}, expected=${expectedCurrentTurn}, currentHeroTurn=${game.currentHeroTurn}`);
      if (currentTurnInfo) {
        console.log(`🚨 Current hero: ${currentTurnInfo.hero.name} (Player ${currentTurnInfo.playerIndex})`);
      }
      // Fix the mismatch
      game.currentTurn = expectedCurrentTurn;
    }
    
    return {
      id: game.id,
      mode: game.mode, // Include the game mode (survival, draft, random, etc.)
      phase: game.phase,
      players: game.players.map(p => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        team: p.team || [],
        draftCards: p.draftCards || [],
        currentHeroIndex: p.currentHeroIndex || 0,
        hasUsedAttack: p.hasUsedAttack || false,
        hasUsedAbility: p.hasUsedAbility || false,
        usedAbilities: p.usedAbilities || [],
        usedAttacks: p.usedAttacks || 0,
        selectedTarget: p.selectedTarget || null,
        bannedCard: p.bannedCard,
        attackOrder: p.attackOrder || [],
        initiativeRoll: p.initiativeRoll,
        monkAttacksRemaining: p.monkAttacksRemaining || 0,
        oneTwoPunchAttacksRemaining: p.oneTwoPunchAttacksRemaining || 0,
        profile_icon: p.profile_icon || 'Sorcerer',
        disconnectionTimer: game.disconnectionTimers ? this.getDisconnectionTimer(game.id, p.id) : null
      })),
      currentTurn: game.currentTurn,
      currentHeroTurn: game.currentHeroTurn || 0,
      activeHero: currentTurnInfo ? {
        name: currentTurnInfo.hero.name,
        playerIndex: currentTurnInfo.playerIndex,
        heroIndex: currentTurnInfo.heroIndex
      } : null,
      currentDraftPhase: game.currentDraftPhase || 0,
      draftTurn: game.draftTurn || 0,
      winner: game.winner,
      draftCards: game.draftCards,
      battleLog: game.battleLog || [] // Include battle log for spectators and reconnection
    };
  }

  processCounterAttacks(game, defender, attacker, trigger) {
    const results = [];
    
    // Check if the defender has any counter-attack abilities
    if (!defender.Special || defender.currentHP <= 0) return results;

    const specials = Array.isArray(defender.Special) ? defender.Special : [defender.Special];
    
    for (const special of specials) {
      if (special.trigger === trigger) {
        console.log(`🛡️ ${defender.name}'s ${special.name} activated! Counter-attacking ${attacker.name}`);
        
        for (const effect of special.effects) {
          if (effect.type === 'damage' && effect.target === 'attacker') {
            // Roll fixed damage (no attack roll needed for counter-attacks)
            const damageRoll = calculateDamage(effect.value, false, false, defender);
            const damage = damageRoll.total;
            
            const oldHP = attacker.currentHP;
            attacker.currentHP = Math.max(0, attacker.currentHP - damage);
            
            console.log(`⚔️ ${special.name}: ${defender.name} counter-attacked ${attacker.name} for ${damage} damage (${attacker.currentHP} HP remaining)`);
            
            // Add comprehensive special log entry for counter-attack  
            const counterAttackLogEntry = this.createSpecialLogEntry(
              defender, 
              special.name, 
              `reactive counter-attack when attacked`, 
              damageRoll,
              [{
                type: 'damage',
                target: attacker.name,
                damage: damage,
                damageRoll: damageRoll,
                newHP: attacker.currentHP,
                maxHP: attacker.HP
              }]
            );
            results.push(counterAttackLogEntry);
            
            // Check if the attacker died from counter-attack
            if (attacker.currentHP <= 0 && !attacker.statusEffects?.justResurrected) {
              this.updatePassiveEffectsOnDeath(game, attacker, defender, 'counter-attack');
              console.log(`💀 ${attacker.name} was killed by ${defender.name}'s counter-attack!`);
              results.push({
                type: 'death',
                target: attacker.name,
                cause: 'counter_attack'
              });
            }
          }
        }
        break; // Only trigger one counter-attack per miss
      }
    }
    
    return results;
  }

  processDamageReductionSpecials(game, target, attacker, damage) {
    // Check if target has any damage reduction/negation effects (like Wizard's Arcane Shield)
    if (!target.Special || target.currentHP <= 0 || damage <= 0) {
      return { finalDamage: damage, specialEffects: [] };
    }

    const specials = Array.isArray(target.Special) ? target.Special : [target.Special];
    const specialLogEntries = [];
    let finalDamage = damage;
    
    for (const special of specials) {
      // Check for Wizard's Arcane Shield
      if (special.trigger === 'on_take_damage_gt_5' && special.name === 'Arcane Shield') {
        // Check if damage is greater than 5 and shield hasn't been used
        if (damage > 5 && !target.statusEffects?.arcaneShieldUsed) {
          console.log(`🛡️ ${target.name}'s ${special.name} activated! Damage ${damage} reduced to 0`);
          
          // Mark shield as used for the battle
          if (!target.statusEffects) target.statusEffects = {};
          target.statusEffects.arcaneShieldUsed = true;
          
          // Remove the available status (hide the buff indicator)
          target.statusEffects.arcaneShieldAvailable = false;
          
          // Negate all damage
          finalDamage = 0;
          
          // Create comprehensive special log entry
          const specialLogEntry = this.createSpecialLogEntry(
            target, 
            special.name, 
            `defensive reaction to incoming damage of ${damage}`, 
            null, // no attack roll for defensive abilities
            [{
              type: 'negate_damage',
              target: target.name,
              originalDamage: damage,
              finalDamage: 0,
              message: `negates all damage with ${special.name}`
            }]
          );
          
          specialLogEntries.push(specialLogEntry);
          
          // Add to battle log
          if (game && game.battleLog) {
            game.battleLog.push(specialLogEntry);
          }
          
          break; // Only one damage reduction per attack
        }
      }
      
      // Check for Engineer's Protective Gear (turret sacrifice)
      if (special.trigger === 'on_take_damage' && special.name === 'Protective Gear') {
        // Check if Engineer has turrets to sacrifice
        const turretCount = target.statusEffects?.turret_count || 0;
        if (turretCount > 0) {
          console.log(`🔧 ${target.name}'s ${special.name} activated! Sacrificing turret to negate ${damage} damage`);
          
          // Sacrifice one turret
          target.statusEffects.turret_count = turretCount - 1;
          
          // Negate all damage
          finalDamage = 0;
          
          // Create clean log entry for turret sacrifice
          const protectiveGearLogEntry = {
            type: 'protective_gear',
            caster: target.name,
            target: attacker.name,
            message: `${target.name} sacrificed turret to negate ${attacker.name}'s damage`,
            isSpecial: true,
            timestamp: Date.now()
          };
          
          specialLogEntries.push(protectiveGearLogEntry);
          
          // Add to battle log
          if (game && game.battleLog) {
            game.battleLog.push(protectiveGearLogEntry);
          }
          
          break; // Only one damage reduction per attack
        }
      }
    }
    
    return { finalDamage, specialEffects: specialLogEntries };
  }

  processAfterDamageEffects(game, target, attacker, damage) {
    // Check if target has any after-damage effects (like Ninja's Vanish)
    if (!target.Special || target.currentHP <= 0 || damage <= 0) return [];

    const specials = Array.isArray(target.Special) ? target.Special : [target.Special];
    const specialLogEntries = [];
    
    for (const special of specials) {
      if (special.trigger === 'on_take_damage_after') {
        console.log(`✨ ${target.name}'s ${special.name} activated after taking ${damage} damage from ${attacker.name}`);
        console.log(`🔍 processAfterDamageEffects - target:`, target.name, `attacker:`, attacker.name);
        
        // Add comprehensive special log entry
        const specialLogEntry = this.createSpecialLogEntry(
          target, 
          special.name, 
          `defensive reaction to taking ${damage} damage from ${attacker.name}`, 
          null, // no attack roll for defensive abilities
          [{
            type: 'apply_buff',
            target: target.name,
            effect: 'untargetable',
            message: `becomes untargetable until their next turn`
          }]
        );
        
        console.log(`🔍 Created special log entry:`, { caster: specialLogEntry.caster, specialName: specialLogEntry.specialName, message: specialLogEntry.message });
        
        specialLogEntries.push(specialLogEntry);
        
        // Add to battle log
        if (game && game.battleLog) {
          game.battleLog.push(specialLogEntry);
        }
        
        for (const effect of special.effects) {
          if (effect.type === 'apply_buff' && effect.effect === 'untargetable') {
            // Apply untargetable status
            if (!target.statusEffects) {
              target.statusEffects = {};
            }
            
            target.statusEffects.untargetable = true;
            target.statusEffects.untargetableAttacker = attacker.name; // Store who can still target
            target.statusEffects.untargetableUntil = target.name; // Until this hero's turn starts
            console.log(`👻 ${target.name} becomes untargetable until their next turn (Vanish) - but ${attacker.name} can still target them`);
            
            // Set duration tracking
            if (effect.duration && effect.duration_unit === 'turn') {
              target.statusEffects.untargetableDuration = effect.duration;
            }
          }
        }
        break; // Only trigger once per damage instance
      }
    }
    
    return specialLogEntries;
  }

  processOnTakeDamageEffects(game, target, attacker, damage) {
    // Process on_take_damage triggers (like Shroomguard's Poison Aura)
    if (!target.Special || target.currentHP <= 0 || damage <= 0) return [];

    const specials = Array.isArray(target.Special) ? target.Special : [target.Special];
    const specialLogEntries = [];
    
    for (const special of specials) {
      if (special.trigger === 'on_take_damage' && special.name === 'Poison Aura') {
        console.log(`🍄 ${target.name}'s ${special.name} activated after taking ${damage} damage!`);
        
        // Collect all alive heroes from both teams
        const allHeroes = [];
        game.players.forEach(player => {
          player.team.forEach(hero => {
            if (hero.currentHP > 0) {
              allHeroes.push(hero);
            }
          });
        });
        
        // Apply poison to all alive heroes
        const poisonResults = [];
        allHeroes.forEach(hero => {
          if (!hero.statusEffects) {
            hero.statusEffects = {};
          }
          if (hero.statusEffects.poison === undefined) {
            hero.statusEffects.poison = 0;
          }
          
          // Skip if hero is immune to poison
          if (hero.Immunities && hero.Immunities.includes('poison')) {
            console.log(`🍄 ${hero.name} is immune to poison - skipping`);
            return;
          }
          
          hero.statusEffects.poison += 1;
          console.log(`🍄 ${hero.name} received 1 poison stack (total: ${hero.statusEffects.poison})`);
          
          poisonResults.push({
            type: 'apply_debuff',
            target: hero.name,
            effect: 'poison',
            value: 1,
            message: `receives 1 Poison stack`
          });
        });
        
        // Create comprehensive special log entry
        const specialLogEntry = this.createSpecialLogEntry(
          target, 
          special.name, 
          `reactive to taking damage`, 
          null, // no attack roll for reactive abilities
          poisonResults
        );
        
        // Override the message to match the requested format
        specialLogEntry.message = `${target.name}'s Poison Aura gave EVERYONE 1 Poison Stack`;
        
        specialLogEntries.push(specialLogEntry);
        
        // Add to battle log
        if (game && game.battleLog) {
          game.battleLog.push(specialLogEntry);
        }
        
        break; // Only trigger once per damage instance
      }
    }
    
    return specialLogEntries;
  }

  applyDamageToHero(game, target, damage, attacker = null, damageSource = 'unknown') {
    // Centralized function to apply damage and trigger all on-damage effects
    if (damage <= 0 || !target || target.currentHP <= 0) return [];
    
    const oldHP = target.currentHP;
    target.currentHP = Math.max(0, target.currentHP - damage);
    
    console.log(`💥 ${target.name} takes ${damage} damage from ${damageSource}: ${oldHP} → ${target.currentHP}`);
    
    const triggeredEffects = [];
    
    // Only trigger reactive effects if target is still alive after damage
    if (target.currentHP > 0) {
      // Trigger after-damage effects (like Ninja's Vanish) - but NOT for poison damage
      if (damageSource !== 'poison') {
        const afterDamageSpecials = this.processAfterDamageEffects(game, target, attacker, damage);
        triggeredEffects.push(...afterDamageSpecials);
      }
      
      // Trigger on_take_damage effects (like Shroomguard's Poison Aura) - for ALL damage types
      const onTakeDamageSpecials = this.processOnTakeDamageEffects(game, target, attacker, damage);
      triggeredEffects.push(...onTakeDamageSpecials);
    }
    
    return triggeredEffects;
  }

  processHealthLinkReflection(game, angel, actualDamageTaken) {
    // Find all enemies with health_link debuff
    if (!angel || !game || actualDamageTaken <= 0) return;

    console.log(`🔗 Angel (${angel.name}) took ${actualDamageTaken} damage - checking for Health Link targets`);

    const reflectionTargets = [];
    
    // Check all players and their teams for health_link debuff
    game.players.forEach(player => {
      player.team.forEach(hero => {
        if (hero.currentHP > 0 && hero.statusEffects?.health_link) {
          console.log(`🔗 Found Health Link target: ${hero.name}`);
          reflectionTargets.push(hero);
        }
      });
    });

    if (reflectionTargets.length === 0) {
      console.log(`🔗 No Health Link targets found`);
      return;
    }

    // Reflect damage to all linked targets
    reflectionTargets.forEach(target => {
      const oldHP = target.currentHP;
      
      // Use centralized damage application (triggers Shroomguard's Poison Aura and Ninja's Vanish)
      this.applyDamageToHero(game, target, actualDamageTaken, angel, 'Health Link reflection');
      
      console.log(`🔗 Health Link reflected ${actualDamageTaken} damage to ${target.name}: ${oldHP} → ${target.currentHP} HP`);
      
      // Remove the health_link debuff after reflection
      delete target.statusEffects.health_link;
      
      // Add to battle log
      if (game.battleLog) {
        game.battleLog.push({
          type: 'health_link_reflection',
          source: angel.name,
          target: target.name,
          damage: actualDamageTaken,
          newHP: target.currentHP,
          maxHP: target.HP,
          specialName: 'Health Link',
          isSpecial: true,
          message: `Health Link reflected ${actualDamageTaken} damage from ${angel.name} to ${target.name}`,
          timestamp: Date.now()
        });
      }
      
      // Check if target died from reflection
      if (target.currentHP <= 0 && !target.statusEffects?.justResurrected) {
        console.log(`💀 ${target.name} died from Health Link reflection`);
        this.updatePassiveEffectsOnDeath(game, target, angel, 'health_link_reflection');
      }
    });
  }

  processAngelResurrection(game, dyingHero, killer) {
    // Find Angel on the dying hero's team
    if (!dyingHero || !game) return false;

    // CRITICAL: Prevent resurrection if already resurrected this action
    if (dyingHero.statusEffects?.justResurrected) {
      console.log(`⚠️ ${dyingHero.name} already resurrected this turn - cannot resurrect again`);
      return false; // Return false to allow death processing (Angel can't resurrect twice)
    }

    // Find which player owns the dying hero
    let angelHero = null;
    let angelOwner = null;

    game.players.forEach(player => {
      player.team.forEach(hero => {
        // Check if this is Angel, is alive, on same team as dying hero, and hasn't used resurrect yet
        if (hero.name === 'Angel' && 
            hero.currentHP > 0 && 
            hero !== dyingHero &&
            player.team.includes(dyingHero) &&
            !hero.statusEffects?.resurrectUsed) {
          angelHero = hero;
          angelOwner = player;
        }
      });
    });

    if (!angelHero) {
      console.log(`👼 No Angel available to resurrect ${dyingHero.name}`);
      return false;
    }

    console.log(`👼 Angel found! Resurrecting ${dyingHero.name}...`);

    // Mark Angel's resurrect as used
    if (!angelHero.statusEffects) angelHero.statusEffects = {};
    angelHero.statusEffects.resurrectUsed = true;

    // Clear all status effects from the dying hero EXCEPT the resurrection flag
    dyingHero.statusEffects = {
      justResurrected: true // Flag to prevent infinite loop - persists until end of turn
    };

    // Resurrect at half health (rounded up)
    const halfHealth = Math.ceil(dyingHero.HP / 2);
    dyingHero.currentHP = halfHealth;

    console.log(`👼 ${dyingHero.name} resurrected at ${halfHealth} HP by Angel`);

    // Add resurrection animation flag
    dyingHero.resurrected = true;

    // Add to battle log - ensure it's visible
    const resurrectionEntry = {
      type: 'special_comprehensive',
      caster: angelHero.name,
      specialName: 'Resurrection',
      target: dyingHero.name,
      message: `${angelHero.name} used Resurrection and restored ${dyingHero.name} to ${halfHealth} HP`,
      hit: true,
      healing: halfHealth,
      newHP: dyingHero.currentHP,
      maxHP: dyingHero.HP,
      isSpecial: true,
      timestamp: Date.now()
    };
    
    if (!game.battleLog) {
      game.battleLog = [];
    }
    game.battleLog.push(resurrectionEntry);
    
    console.log(`📜 Added resurrection entry to battle log:`, resurrectionEntry);

    return true; // Resurrection successful, prevent death
  }

  processBeastTamerAbility(ability, caster, primaryTarget, casterPlayer, opponent, game) {
    const results = [];
    
    // Check if beast is active (status effect)
    const beastActive = caster.statusEffects && caster.statusEffects.beast_active;
    if (!beastActive) {
      // Summon beast
      if (!caster.statusEffects) caster.statusEffects = {};
      caster.statusEffects.beast_active = true;
      
      // Add comprehensive special log entry for beast summoning
      console.log('🔍 Beast Tamer debug - caster:', caster?.name, 'type:', typeof caster);
      const summonSpecialLogEntry = this.createSpecialLogEntry(
        caster, 
        'Call Beast', 
        null, // no trigger context for summoning
        null, // no attack roll for summoning
        [{
          type: 'summon',
          caster: caster.name,
          message: 'summons a Beast companion',
          beastSummoned: true
        }]
      );
      results.push(summonSpecialLogEntry);
    } else {
      // Command beast to attack
      const advantageDisadvantageForAbility = this.hasAdvantageDisadvantage(caster, primaryTarget, true, game);
      const attackRoll = calculateAttackRoll(caster.Accuracy, advantageDisadvantageForAbility.advantage, advantageDisadvantageForAbility.disadvantage, caster);
      const abilityHit = attackRoll.total >= calculateEffectiveDefense(primaryTarget);
      
      // Add comprehensive special log entry for beast command attack  
      console.log('🔍 Beast Tamer debug - caster:', caster?.name, 'type:', typeof caster);
      const damageAmount = Math.max(0, calculateDamage('2D8', attackRoll.isCritical, advantageDisadvantageForAbility.advantage, caster).total);
      const commandSpecialLogEntry = this.createSpecialLogEntry(
        caster, 
        'Command Beast', 
        { target: primaryTarget.name }, // Include target in trigger context
        attackRoll,
        abilityHit ? [{
          type: 'damage',
          target: primaryTarget.name,
          damage: damageAmount,
          damageRoll: calculateDamage('2D8', attackRoll.isCritical, advantageDisadvantageForAbility.advantage, caster),
          newHP: primaryTarget.currentHP - damageAmount,
          maxHP: primaryTarget.HP
        }] : []
      );
      results.push(commandSpecialLogEntry);
      
      results.push({
        type: 'attack_roll',
        caster: caster.name,
        target: primaryTarget.name,
        roll: attackRoll,
        accuracy: caster.Accuracy,
        targetAC: calculateEffectiveDefense(primaryTarget),
        hit: abilityHit,
        hasAdvantage: advantageDisadvantageForAbility.advantage,
        isCritical: attackRoll.isCritical
      });
      if (abilityHit) {
        const damage = calculateDamage('2D8', attackRoll.isCritical, advantageDisadvantageForAbility.advantage, caster);
        const actualDamage = Math.max(0, damage.total);
        primaryTarget.currentHP = Math.max(0, primaryTarget.currentHP - actualDamage);
        results.push({
          type: 'damage',
          caster: caster.name,
          target: primaryTarget.name,
          damage: actualDamage,
          damageRoll: damage,
          newHP: primaryTarget.currentHP,
          maxHP: primaryTarget.HP,
          message: `Beast deals ${actualDamage} damage to ${primaryTarget.name}!`
        });
      } else {
        results.push({
          type: 'miss',
          caster: caster.name,
          target: primaryTarget.name,
          message: `Beast's attack misses ${primaryTarget.name}!`
        });
      }
    }
    
    // Return only special comprehensive entries and essential system entries to avoid duplicates
    const filteredResults = results.filter(result => 
      result.type === 'special_comprehensive' ||
      result.type === 'attack_roll' ||
      result.type === 'damage' ||
      result.type === 'miss' ||
      result.type === 'summon'
    );
    
    return filteredResults;
  }

  processTimekeeperAbility(ability, caster, primaryTarget, casterPlayer, opponent, game, allyTarget) {
    const results = [];
    console.log(`🕐 Processing Timekeeper ability: ${ability.name}, allyTarget: ${allyTarget || 'none'}`);
    
    // Step 1: Timekeeper must first hit with Chrono Shift before commanding an ally
    // Use Timekeeper's modified accuracy to include the +2 accuracy bonus
    const advantageDisadvantageForAbility = this.hasAdvantageDisadvantage(caster, primaryTarget, true, game);
    const chronoShiftAttackRoll = calculateAttackRoll(caster.modifiedAccuracy, advantageDisadvantageForAbility.advantage, advantageDisadvantageForAbility.disadvantage, caster);
    const abilityHit = chronoShiftAttackRoll.total >= calculateEffectiveDefense(primaryTarget);
    
    const rollText = chronoShiftAttackRoll.advantageInfo 
      ? `${chronoShiftAttackRoll.advantageInfo.roll1} and ${chronoShiftAttackRoll.advantageInfo.roll2} (${chronoShiftAttackRoll.advantageInfo.type}, chose ${chronoShiftAttackRoll.advantageInfo.chosen})`
      : chronoShiftAttackRoll.roll;
    console.log(`🎯 Timekeeper Chrono Shift attack roll: ${rollText}+${caster.modifiedAccuracy} = ${chronoShiftAttackRoll.total} vs Defense ${calculateEffectiveDefense(primaryTarget)} → ${abilityHit ? 'HIT' : 'MISS'}`);
    
    // Create a single comprehensive log entry for Chrono Shift
    const chronoShiftLogEntry = this.createSpecialLogEntry(
      caster,
      ability.name,
      { target: primaryTarget.name, initialRoll: true },
      chronoShiftAttackRoll,
      [] // No effects yet, just the initial roll
    );
    results.push(chronoShiftLogEntry);
    
    // Step 2: Only proceed with ally command if Chrono Shift hit the target
    if (!abilityHit) {
      // Chrono Shift missed - no command happens
      return results;
    }
    
    // If no ally target specified yet, this is the initial roll - ally selection happens in frontend
    if (!allyTarget) {
      results.push({
        type: 'chrono_shift_hit',
        caster: caster.name,
        message: `${caster.name}'s ${ability.name} hit ${primaryTarget.name}! Now select an ally to command.`,
        target: primaryTarget.name,
        needsAllySelection: true
      });
      return results;
    }
    
    // Step 3: Execute ally's ability
    // Find the ally to command
    const allyToCommand = this.findHeroByName(game, allyTarget);
    
    if (!allyToCommand) {
      results.push({
        type: 'error',
        message: 'Invalid ally selection for Chrono Shift'
      });
      return results;
    }
    
    // Get the ally's abilities
    const allyAbilities = allyToCommand.Ability;
    if (!allyAbilities || allyAbilities.length === 0) {
      results.push({
        type: 'error',
        message: `${allyToCommand.name} has no abilities to copy`
      });
      return results;
    }

    // If the ally has multiple abilities, return them for selection
    if (allyAbilities.length > 1) {
      results.push({
        type: 'ability_selection_required',
        caster: caster.name,
        ally: allyToCommand.name,
        availableAbilities: allyAbilities.map((ability, index) => ({
          index: index,
          name: ability.name,
          description: ability.description,
          category: ability.category
        })),
        message: `${caster.name} commands ${allyToCommand.name}! Select which ability to use.`,
        timekeeperTarget: primaryTarget.name
      });
      return results;
    }

    // Single ability - use existing logic
    const allyAbility = allyAbilities[0];
    
    // Execute the ally's ability 
    // Check if the ally's ability is multi-target and handle accordingly
    const isAOEAbility = allyAbility.target_type === 'all_enemies' || 
                        (allyAbility.primary_effects && allyAbility.primary_effects.some(effect => effect.target === 'all_enemies'));
    const isMultiTargetAbility = allyAbility.target_type === 'multi_target' || allyAbility.category === 'multi_target_damage';
    
    // The ally automatically succeeds and inherits crit status from Timekeeper's roll
    const timekeeperCrit = chronoShiftAttackRoll.isCritical;
    
    // Prevent infinite recursion by blocking Timekeeper from commanding another Timekeeper
    if (allyToCommand.name === 'Timekeeper') {
      results.push({
        type: 'error',
        message: 'Timekeeper cannot command another Timekeeper to avoid paradoxes!'
      });
      return results;
    }
    
    // Create a special context for the commanded ability
    const commandContext = {
      isCommandedByTimekeeper: true,
      timekeeperCrit: timekeeperCrit,
      autoHit: true,
      commandingHero: caster.name,
      timekeeperAccuracy: caster.modifiedAccuracy, // Pass Timekeeper's current accuracy
      preventRecursion: true // Prevent further command abilities
    };
    
    let commandResults = [];
    
    if (isAOEAbility) {
      // For AOE abilities like Wizard's Fireball, target all enemies
      const allEnemyTargets = opponent.team.filter(h => h.currentHP > 0);
      
      if (allEnemyTargets.length === 0) {
        results.push({
          type: 'error',
          message: 'No valid targets for AOE ability'
        });
        return results;
      }
      
      console.log(`🌪️ ${allyToCommand.name} uses ${allyAbility.name} (commanded by ${caster.name}) against all enemies: ${allEnemyTargets.map(h => h.name).join(', ')}`);
      
      // Process the ability for each enemy target with Timekeeper's roll
      for (const target of allEnemyTargets) {
        const singleTargetResults = this.processAbilityEffects(allyAbility, allyToCommand, target, casterPlayer, opponent, game, null, null, caster, commandContext);
        commandResults.push(...singleTargetResults);
      }
    } else if (isMultiTargetAbility) {
      // For multi-target abilities like Fighter's Cleave, target primary + adjacent
      const allTargets = [primaryTarget];
      
      // Check for adjacent targets based on the ability effects
      for (const effect of allyAbility.primary_effects || []) {
        if (effect.target === 'adjacent_enemy') {
          const adjacentTarget = this.resolveEffectTarget(effect, primaryTarget, allyToCommand, casterPlayer, opponent, game, null);
          if (adjacentTarget && !allTargets.includes(adjacentTarget)) {
            allTargets.push(adjacentTarget);
          }
        }
      }
      
      console.log(`⚔️ ${allyToCommand.name} uses ${allyAbility.name} (commanded by ${caster.name}) against: ${allTargets.map(h => h.name).join(', ')}`);
      
      // Process each target with Timekeeper's roll
      for (const target of allTargets) {
        const singleTargetResults = this.processAbilityEffects(allyAbility, allyToCommand, target, casterPlayer, opponent, game, target, null, caster, commandContext);
        commandResults.push(...singleTargetResults);
      }
    } else {
      // Single target ability - use existing logic
      console.log(`🎯 ${allyToCommand.name} uses ${allyAbility.name} (commanded by ${caster.name}) against ${primaryTarget.name}`);
      commandResults = this.processAbilityEffects(allyAbility, allyToCommand, primaryTarget, casterPlayer, opponent, game, null, null, caster, commandContext);
    }
    
    // Modify the results to show they came from the ally but were commanded by Timekeeper
    commandResults.forEach(result => {
      if (result.caster === allyToCommand.name) {
        // Update the message to show it was commanded
        if (result.message) {
          result.message = result.message.replace(
            `${allyToCommand.name} used ${allyAbility.name}`,
            `${allyToCommand.name} used ${allyAbility.name} (Commanded by ${caster.name} - Auto-hit)`
          );
        }
        result.commandedBy = caster.name;
        result.wasCommanded = true;
      }
    });
    
    results.push(...commandResults);
    
    // Return filtered results to avoid duplicates (comprehensive logging handled by main processAbilityEffects)  
    const filteredResults = results.filter(result => 
      result.type === 'ability_comprehensive' ||
      result.type === 'attack_roll' ||
      result.type === 'ability_activation' ||
      result.type === 'ability_use' ||
      result.type === 'damage' ||
      result.type === 'heal' ||
      result.type === 'miss' ||
      result.type === 'error'
    );
    
    return filteredResults;
  }

  processTimekeeperSelectedAbility(ability, caster, primaryTarget, casterPlayer, opponent, game, allyToCommand, selectedAbilityIndex) {
    const results = [];
    console.log(`🕐 Processing Timekeeper selected ability: ${ability.name}, ally: ${allyToCommand.name}, selected ability index: ${selectedAbilityIndex}`);
    
    // Get the selected ability
    const selectedAbility = allyToCommand.Ability[selectedAbilityIndex];
    
    // Add the initial Timekeeper ability use message
    results.push({
      type: 'ability_use',
      message: `${caster.name} used Chrono Shift, causing ${allyToCommand.name} to use ${selectedAbility.name}!`,
      caster: caster.name,
      ally: allyToCommand.name,
      abilityName: selectedAbility.name
    });
    
    console.log(`🕐 ${caster.name} activates ${allyToCommand.name}'s ${selectedAbility.name} (ally will roll with their own accuracy)`);
    
    // Execute the selected ability - the ally uses their own accuracy and rolls normally
    const isAOEAbility = selectedAbility.target_type === 'all_enemies' || 
                        (selectedAbility.primary_effects && selectedAbility.primary_effects.some(effect => effect.target === 'all_enemies'));
    const isMultiTargetAbility = selectedAbility.target_type === 'multi_target' || selectedAbility.category === 'multi_target_damage';
    
    // Create a special context for the commanded ability
    // The ally uses their own stats and rolls normally
    const commandContext = {
      isCommandedByTimekeeper: true,
      commandingHero: caster.name,
      preventRecursion: true
    };
    
    let commandResults = [];
    
    if (isAOEAbility) {
      // For AOE abilities like Wizard's Fireball, target all enemies
      const allEnemyTargets = opponent.team.filter(h => h.currentHP > 0);
      
      if (allEnemyTargets.length === 0) {
        results.push({
          type: 'error',
          message: 'No valid targets for AOE ability'
        });
        return results;
      }
      
      console.log(`🌪️ ${allyToCommand.name} uses ${selectedAbility.name} (commanded by ${caster.name}) against all enemies: ${allEnemyTargets.map(h => h.name).join(', ')}`);
      
      // Process the ability for each enemy target with Timekeeper's roll
      for (const target of allEnemyTargets) {
        const singleTargetResults = this.processAbilityEffects(selectedAbility, allyToCommand, target, casterPlayer, opponent, game, null, null, caster, commandContext);
        commandResults.push(...singleTargetResults);
      }
    } else if (isMultiTargetAbility) {
      // For multi-target abilities like Fighter's Cleave, target primary + adjacent
      const allTargets = [primaryTarget];
      
      // Check for adjacent targets based on the ability effects
      for (const effect of selectedAbility.primary_effects || []) {
        if (effect.target === 'adjacent_enemy') {
          const adjacentTarget = this.resolveEffectTarget(effect, primaryTarget, allyToCommand, casterPlayer, opponent, game, null);
          if (adjacentTarget && !allTargets.includes(adjacentTarget)) {
            allTargets.push(adjacentTarget);
          }
        }
      }
      
      console.log(`⚔️ ${allyToCommand.name} uses ${selectedAbility.name} (commanded by ${caster.name}) against: ${allTargets.map(h => h.name).join(', ')}`);
      
      // Process each target with Timekeeper's roll
      for (const target of allTargets) {
        const singleTargetResults = this.processAbilityEffects(selectedAbility, allyToCommand, target, casterPlayer, opponent, game, target, null, caster, commandContext);
        commandResults.push(...singleTargetResults);
      }
    } else {
      // Single target ability - use existing logic
      console.log(`🎯 ${allyToCommand.name} uses ${selectedAbility.name} (commanded by ${caster.name}) against ${primaryTarget.name}`);
      commandResults = this.processAbilityEffects(selectedAbility, allyToCommand, primaryTarget, casterPlayer, opponent, game, null, null, null, commandContext);
    }
    
    // Filter command results to get comprehensive entries for the ally's ability
    const commandComprehensiveEntries = commandResults.filter(result => 
      result.type === 'ability_comprehensive'
    );
    
    // Create a comprehensive log entry for Timekeeper using Chrono Shift
    const chronoShiftEntry = {
      type: 'ability_comprehensive',
      caster: caster.name,
      abilityName: ability.name,
      target: '', // Don't show a target for Chrono Shift activation
      message: `${caster.name} used ${ability.name}`,
      hit: true, // Chrono Shift always succeeds
      isCritical: false
    };
    
    // Return Timekeeper's log first, then the ally's ability results
    const finalResults = [chronoShiftEntry, ...commandComprehensiveEntries];
    
    return finalResults;
  }

  processEngineerAbility(ability, caster, primaryTarget, casterPlayer, opponent, game) {
    console.log(`🔧 processEngineerAbility called: ${caster.name} uses ${ability.name}`);
    const results = [];
    
    // Initialize turret count if needed
    if (!caster.statusEffects) caster.statusEffects = {};
    if (!caster.statusEffects.turret_count) caster.statusEffects.turret_count = 0;

    // Initialize passiveBuffs for immediate visual display
    if (!caster.passiveBuffs) caster.passiveBuffs = [];

    // Determine if turret can be summoned (max 2)
    const canSummonTurret = caster.statusEffects.turret_count < 2;
    let effects = [];
    let summaryMessage = '';

    if (canSummonTurret) {
      caster.statusEffects.turret_count++;
      
      // Add/update immediate visual buff for turret count
      const existingTurretBuff = caster.passiveBuffs.find(buff => buff.name && buff.name.startsWith('Turrets'));
      if (existingTurretBuff) {
        // Update existing buff
        existingTurretBuff.name = `Turrets (${caster.statusEffects.turret_count})`;
        existingTurretBuff.description = `${caster.statusEffects.turret_count} mechanical turret${caster.statusEffects.turret_count > 1 ? 's' : ''} active - deal${caster.statusEffects.turret_count === 1 ? 's' : ''} 1D4 damage per turret at end of turn`;
        existingTurretBuff.value = caster.statusEffects.turret_count;
      } else {
        // Add new visual buff
        caster.passiveBuffs.push({
          name: `Turrets (${caster.statusEffects.turret_count})`,
          sourceName: 'Engineer',
          description: `${caster.statusEffects.turret_count} mechanical turret${caster.statusEffects.turret_count > 1 ? 's' : ''} active - deal${caster.statusEffects.turret_count === 1 ? 's' : ''} 1D4 damage per turret at end of turn`,
          type: 'status',
          value: caster.statusEffects.turret_count
        });
      }
      
      // Create comprehensive log entry
      summaryMessage = `Summoned mechanical turret (${caster.statusEffects.turret_count}/2)`;
      
      effects.push({
        type: 'summon',
        description: `Summoned turret ${caster.statusEffects.turret_count}`,
        details: `${caster.statusEffects.turret_count} mechanical turret${caster.statusEffects.turret_count > 1 ? 's' : ''} active`
      });
      
      // Add turret effect result for other systems
      results.push({
        type: 'summon',
        caster: caster.name,
        turretSummoned: true,
        turretCount: caster.statusEffects.turret_count
      });
    } else {
      summaryMessage = 'Maximum turrets already deployed (2/2)';
      
      effects.push({
        type: 'limit_reached',
        description: 'Cannot summon more turrets',
        details: 'Maximum of 2 turrets already active'
      });
    }

    // Create comprehensive log entry
    const comprehensiveLogEntry = {
      type: 'ability_comprehensive',
      caster: caster.name,
      ability: ability.name,
      target: null, // Self-targeting ability
      message: `${caster.name} used ${ability.name}`,
      summary: summaryMessage,
      effects: effects,
      hitStatus: null, // Auto-success ability
      rollInfo: null,
      timestamp: Date.now()
    };
    
    results.unshift(comprehensiveLogEntry);
    
    // Force immediate game state update via socket
    console.log(`🔧 Engineer ability used - forcing immediate socket update for turret buff visibility`);
    
    console.log(`🔧 processEngineerAbility returning ${results.length} results:`, results);
    return results;
  }

  processMedicAbility(ability, caster, primaryTarget, casterPlayer, opponent, game) {
    console.log(`💉 processMedicAbility called: ${caster.name} uses ${ability.name}`);
    const results = [];
    
    // Initialize med bot count if needed
    if (!caster.statusEffects) caster.statusEffects = {};
    if (!caster.statusEffects.med_bot_count) caster.statusEffects.med_bot_count = 0;

    // Initialize passiveBuffs for immediate visual display
    if (!caster.passiveBuffs) caster.passiveBuffs = [];

    // Determine if med bot can be summoned (max 3)
    const canSummonMedBot = caster.statusEffects.med_bot_count < 3;
    let effects = [];
    let summaryMessage = '';

    if (canSummonMedBot) {
      caster.statusEffects.med_bot_count++;
      
      // Add/update immediate visual buff for med bot count
      const existingMedBotBuff = caster.passiveBuffs.find(buff => buff.name && buff.name.startsWith('Med Bots'));
      if (existingMedBotBuff) {
        // Update existing buff
        existingMedBotBuff.name = `Med Bots (${caster.statusEffects.med_bot_count})`;
        existingMedBotBuff.description = `${caster.statusEffects.med_bot_count} med bot${caster.statusEffects.med_bot_count > 1 ? 's' : ''} active - heal${caster.statusEffects.med_bot_count === 1 ? 's' : ''} lowest HP ally ${caster.statusEffects.med_bot_count}D4 at end of turn`;
        existingMedBotBuff.value = caster.statusEffects.med_bot_count;
      } else {
        // Add new visual buff
        caster.passiveBuffs.push({
          name: `Med Bots (${caster.statusEffects.med_bot_count})`,
          sourceName: 'Medic',
          description: `${caster.statusEffects.med_bot_count} med bot${caster.statusEffects.med_bot_count > 1 ? 's' : ''} active - heal${caster.statusEffects.med_bot_count === 1 ? 's' : ''} lowest HP ally ${caster.statusEffects.med_bot_count}D4 at end of turn`,
          type: 'status',
          value: caster.statusEffects.med_bot_count
        });
      }
      
      // Create comprehensive log entry
      summaryMessage = `Summoned med bot (${caster.statusEffects.med_bot_count}/3)`;
      
      effects.push({
        type: 'summon',
        description: `Summoned med bot ${caster.statusEffects.med_bot_count}`,
        details: `${caster.statusEffects.med_bot_count} med bot${caster.statusEffects.med_bot_count > 1 ? 's' : ''} active`
      });
      
      // Add med bot effect result for other systems
      results.push({
        type: 'summon',
        caster: caster.name,
        medBotSummoned: true,
        medBotCount: caster.statusEffects.med_bot_count
      });
    } else {
      summaryMessage = 'Maximum med bots already deployed (3/3)';
      
      effects.push({
        type: 'limit_reached',
        description: 'Cannot summon more med bots',
        details: 'Maximum of 3 med bots already active'
      });
    }

    // Create comprehensive log entry
    const comprehensiveLogEntry = {
      type: 'ability_comprehensive',
      caster: caster.name,
      ability: ability.name,
      target: null, // Self-targeting ability
      message: `${caster.name} used ${ability.name}`,
      summary: summaryMessage,
      effects: effects,
      hitStatus: null, // Auto-success ability
      rollInfo: null,
      timestamp: Date.now()
    };
    
    results.unshift(comprehensiveLogEntry);
    
    // Force immediate game state update via socket
    console.log(`💉 Medic ability used - forcing immediate socket update for med bot buff visibility`);
    
    console.log(`💉 processMedicAbility returning ${results.length} results:`, results);
    return results;
  }

  processShamanAbility(ability, caster, primaryTarget, casterPlayer, opponent, game) {
    const results = [];
    
    // Initialize totem count if needed
    if (!caster.statusEffects) caster.statusEffects = {};
    if (!caster.statusEffects.totem_count) caster.statusEffects.totem_count = 0;
    
    // First, make the attack roll to see if ability hits
    const advantageDisadvantageForAbility = this.hasAdvantageDisadvantage(caster, primaryTarget, true, game);
    const attackRoll = calculateAttackRoll(caster.Accuracy, advantageDisadvantageForAbility.advantage, advantageDisadvantageForAbility.disadvantage, caster);
    const abilityHit = attackRoll.total >= calculateEffectiveDefense(primaryTarget);
    
    // Always show the attack roll
    results.push({
      type: 'attack_roll',
      caster: caster.name,
      target: primaryTarget.name,
      roll: attackRoll,
      accuracy: caster.Accuracy,
      targetAC: calculateEffectiveDefense(primaryTarget),
      hit: abilityHit,
      hasAdvantage: advantageDisadvantageForAbility.advantage,
      hasDisadvantage: advantageDisadvantageForAbility.disadvantage,
      isCritical: attackRoll.isCritical
    });
    
    if (abilityHit) {
      // Only summon totem and deal damage if ability hits
      
      // Summon a totem (max 3)
      if (caster.statusEffects.totem_count < 3) {
        caster.statusEffects.totem_count++;
        results.push({
          type: 'summon',
          caster: caster.name,
          message: `${caster.name} summons a Totem! (${caster.statusEffects.totem_count}/3)`,
          totemSummoned: true,
          totemCount: caster.statusEffects.totem_count
        });
      }
      
      // Deal 1D4 damage for each totem
      const totemCount = caster.statusEffects.totem_count;
      if (totemCount > 0) {
        // Roll 1D4 for each totem
        let totalDamage = 0;
        const damageRolls = [];
        for (let i = 0; i < totemCount; i++) {
          const damageRoll = calculateDamage('1D4', attackRoll.isCritical, advantageDisadvantageForAbility.advantage, caster);
          totalDamage += damageRoll.total;
          damageRolls.push(damageRoll);
        }
        
        const actualDamage = Math.max(0, totalDamage);
        
        // Use centralized damage application to trigger on_take_damage effects (like Shroomguard's Poison Aura)
        const onDamageTriggers = this.applyDamageToHero(game, primaryTarget, actualDamage, caster, 'Elemental Strike');
        
        results.push({
          type: 'damage',
          caster: caster.name,
          target: primaryTarget.name,
          damage: actualDamage,
          hit: true,
          damageRoll: { total: totalDamage, rolls: damageRolls },
          newHP: primaryTarget.currentHP,
          maxHP: primaryTarget.HP,
          message: `${caster.name}'s ${totemCount} Totem${totemCount > 1 ? 's' : ''} deal${totemCount === 1 ? 's' : ''} ${actualDamage} damage to ${primaryTarget.name}!`,
          totemCount: totemCount
        });
        
        // Add any on_take_damage trigger results (like Poison Aura)
        if (onDamageTriggers && onDamageTriggers.length > 0) {
          results.push(...onDamageTriggers);
        }
      }
    } else {
      results.push({
        type: 'miss',
        caster: caster.name,
        target: primaryTarget.name,
        message: `${caster.name}'s Elemental Strike misses ${primaryTarget.name}!`
      });
    }
    
    // Create comprehensive log entry for Shaman ability
    const comprehensiveLogEntry = this.createAbilityLogEntry(ability, caster, primaryTarget, attackRoll, abilityHit, results, null);
    
    // Return only essential system entries plus comprehensive entry
    const filteredResults = results.filter(result => 
      result.type === 'attack_roll' ||
      result.type === 'damage' ||
      result.type === 'miss' ||
      result.type === 'summon' ||
      result.type === 'status_applied'
    );
    
    // Add comprehensive entry at the beginning
    filteredResults.unshift(comprehensiveLogEntry);
    
    return filteredResults;
  }

  processDiplomatAbility(ability, caster, primaryTarget, casterPlayer, opponent, game) {
    const results = [];
    console.log(`🤝 processDiplomatAbility called: ${caster.name} uses ${ability.name} on ${primaryTarget.name}`);
    
    // Create initial comprehensive log entry for Diplomat using Declare War
    const declareWarEntry = {
      type: 'ability_comprehensive',
      caster: caster.name,
      abilityName: ability.name,
      target: primaryTarget.name,
      message: `${caster.name} used ${ability.name}`,
      hit: true,
      isCritical: false
    };
    results.push(declareWarEntry);
    
    // Find Diplomat's position in the team
    const diplomatIndex = casterPlayer.team.findIndex(h => h.name === caster.name);
    console.log(`🤝 Diplomat position: ${diplomatIndex}`);
    
    // Find adjacent allies (position ±1)
    const adjacentAllies = [];
    
    // Check left ally (index - 1)
    if (diplomatIndex > 0) {
      const leftAlly = casterPlayer.team[diplomatIndex - 1];
      if (leftAlly && leftAlly.currentHP > 0 && leftAlly.name !== caster.name) {
        adjacentAllies.push({ ally: leftAlly, position: 'left' });
        console.log(`🤝 Found left ally: ${leftAlly.name}`);
      }
    }
    
    // Check right ally (index + 1)
    if (diplomatIndex < casterPlayer.team.length - 1) {
      const rightAlly = casterPlayer.team[diplomatIndex + 1];
      if (rightAlly && rightAlly.currentHP > 0 && rightAlly.name !== caster.name) {
        adjacentAllies.push({ ally: rightAlly, position: 'right' });
        console.log(`🤝 Found right ally: ${rightAlly.name}`);
      }
    }
    
    console.log(`🤝 Total adjacent allies found: ${adjacentAllies.length}`);
    
    // If no adjacent allies, ability still succeeds but does nothing
    if (adjacentAllies.length === 0) {
      results.push({
        type: 'ability_effect',
        message: 'No adjacent allies to command',
        caster: caster.name
      });
      return results;
    }
    
    // Make each adjacent ally perform a basic attack on the primary target
    for (const { ally, position } of adjacentAllies) {
      console.log(`🤝 Commanding ${ally.name} (${position} of Diplomat) to attack ${primaryTarget.name}`);
      
      // Check if ally can attack (not stunned, has basic attack)
      if (ally.statusEffects?.disable_attack) {
        console.log(`❌ ${ally.name} cannot attack (stunned)`);
        results.push({
          type: 'attack_prevented',
          message: `${ally.name} is stunned and cannot attack`,
          attacker: ally.name
        });
        continue;
      }
      
      // Check if ally has a basic attack
      if (ally.BasicAttack === '—' || ally.BasicAttack === '-') {
        console.log(`❌ ${ally.name} has no basic attack`);
        results.push({
          type: 'attack_prevented',
          message: `${ally.name} has no basic attack`,
          attacker: ally.name
        });
        continue;
      }
      
      // Perform the attack using the ally's own accuracy
      const advantageDisadvantage = this.hasAdvantageDisadvantage(ally, primaryTarget, false, game);
      const attackRoll = calculateAttackRoll(ally.modifiedAccuracy, advantageDisadvantage.advantage, advantageDisadvantage.disadvantage, ally);
      const attackHit = attackRoll.total >= calculateEffectiveDefense(primaryTarget);
      
      const rollText = attackRoll.advantageInfo 
        ? `${attackRoll.advantageInfo.roll1} and ${attackRoll.advantageInfo.roll2} (${attackRoll.advantageInfo.type}, chose ${attackRoll.advantageInfo.chosen})`
        : attackRoll.roll;
      console.log(`⚔️ ${ally.name} attacks ${primaryTarget.name}: Roll ${rollText}+${ally.modifiedAccuracy} = ${attackRoll.total} vs Defense ${calculateEffectiveDefense(primaryTarget)} → ${attackHit ? 'HIT' : 'MISS'}${attackRoll.crit ? ' (CRITICAL!)' : ''}`);
      
      // Create attack result
      if (attackHit && primaryTarget.currentHP > 0) {
        // Calculate damage
        const damageRoll = calculateDamage(ally.BasicAttack, attackRoll.isCritical, false, ally);
        let damage = damageRoll.total;
        
        const oldHP = primaryTarget.currentHP;
        
        // Apply damage
        const onDamageTriggers = this.applyDamageToHero(game, primaryTarget, damage, ally, 'Basic Attack');
        
        console.log(`⚔️ ${ally.name} deals ${damage} damage to ${primaryTarget.name} (${oldHP} → ${primaryTarget.currentHP})`);
        
        // Check for on-attack special triggers (like Cavalier's Ride Down)
        if (ally.name === 'Cavalier' && damage > 0) {
          if (!primaryTarget.statusEffects) primaryTarget.statusEffects = {};
          primaryTarget.statusEffects.rideDownDebuff = {
            source: ally.name,
            maxHP: primaryTarget.HP
          };
          console.log(`🎯 ${primaryTarget.name} debuffed by Cavalier's Ride Down`);
        }
        
        // Process hit-confirmed triggers (like Elementalist's Wind Wall)
        this.processHitConfirmedTriggers(game, ally, primaryTarget, 'attack');
        
        // Check if target died
        if (primaryTarget.currentHP <= 0 && !primaryTarget.statusEffects?.justResurrected) {
          this.updatePassiveEffectsOnDeath(game, primaryTarget, ally, 'damage');
        }
        
        results.push({
          type: 'attack',
          attacker: ally.name,
          target: primaryTarget.name,
          damage: damage,
          hit: true,
          isCritical: attackRoll.isCritical,
          damageRoll: damageRoll.rolls,
          damageTotal: damage,
          attackRoll: attackRoll.roll,
          attackTotal: attackRoll.displayTotal || attackRoll.total,
          advantageInfo: attackRoll.advantageInfo,
          targetHP: primaryTarget.currentHP,
          commandedBy: caster.name
        });
        
        // Add any on_take_damage trigger results
        if (onDamageTriggers && onDamageTriggers.length > 0) {
          results.push(...onDamageTriggers);
        }
      } else {
        // Attack missed
        results.push({
          type: 'attack',
          attacker: ally.name,
          target: primaryTarget.name,
          damage: 0,
          hit: false,
          attackRoll: attackRoll.roll,
          attackTotal: attackRoll.displayTotal || attackRoll.total,
          advantageInfo: attackRoll.advantageInfo,
          targetHP: primaryTarget.currentHP,
          damageRoll: [],
          damageTotal: 0,
          commandedBy: caster.name
        });
        
        // Check for Shield Bash if attack missed by AC
        const targetPlayer = game.players.find(p => p.team.some(h => h.name === primaryTarget.name));
        if (targetPlayer) {
          const warden = targetPlayer.team.find(h => h.name === 'Warden' && h.currentHP > 0);
          if (warden && primaryTarget.name === warden.name && attackRoll.total < calculateEffectiveDefense(warden)) {
            // Warden's Shield Bash counter
            const counterDamageRoll = calculateDamage('1D6', false, false, warden);
            const counterDamage = counterDamageRoll.total;
            
            const onDamageTriggers = this.applyDamageToHero(game, ally, counterDamage, warden, 'Shield Bash');
            
            console.log(`🛡️ ${warden.name}'s Shield Bash counters ${ally.name} for ${counterDamage} damage`);
            
            const shieldBashEntry = this.createSpecialLogEntry(
              warden,
              'Shield Bash',
              { target: ally.name },
              counterDamageRoll,
              [
                {
                  type: 'damage',
                  target: ally.name,
                  damage: counterDamage,
                  damageRoll: counterDamageRoll,
                  newHP: ally.currentHP,
                  maxHP: ally.HP
                },
                ...onDamageTriggers
              ]
            );
            results.push(shieldBashEntry);
            
            if (ally.currentHP <= 0 && !ally.statusEffects?.justResurrected) {
              this.updatePassiveEffectsOnDeath(game, ally, warden, 'counter_attack');
            }
          }
        }
      }
      
      // Consume advantage effects after the attack
      this.consumeAdvantageEffects(ally, primaryTarget);
    }
    
    return results;
  }

  // Survival State Management Methods
  async getSurvivalState(playerId) {
    // Check if we have it in memory first
    if (this.survivalStates.has(playerId)) {
      return this.survivalStates.get(playerId);
    }

    // If not in memory, try to load from database
    const userId = this.userSessions.get(playerId);
    if (userId && this.database) {
      try {
        const user = await this.database.getUserById(userId);
        const state = {
          wins: user.survival_wins || 0,
          losses: user.survival_losses || 0,
          usedHeroes: user.survival_used_heroes || [],
          isActive: true
        };
        
        // Store in memory for future access
        this.survivalStates.set(playerId, state);
        console.log(`📥 Loaded survival state from database for player ${playerId}:`, state);
        return state;
      } catch (error) {
        console.error(`❌ Error loading survival state from database for player ${playerId}:`, error);
      }
    }

    // Fallback to default state if database load fails
    const defaultState = {
      wins: 0,
      losses: 0,
      usedHeroes: [],
      isActive: true
    };
    this.survivalStates.set(playerId, defaultState);
    return defaultState;
  }

  async updateSurvivalWin(playerId, teamHeroes) {
    const state = await this.getSurvivalState(playerId);
    const heroNames = teamHeroes.map(h => h.name);
    
    state.wins += 1;
    state.usedHeroes = [...new Set([...state.usedHeroes, ...heroNames])]; // Remove duplicates
    
    // Check if this win completes the perfect run (7 wins = victory)
    const runEnded = state.wins >= 7;
    
    if (runEnded) {
      console.log(`🏆 Perfect run achieved with 7 wins! Final: 7 wins, ${state.losses} losses`);
      
      // Reset the survival state for next run
      const resetState = {
        wins: 0,
        losses: 0,
        usedHeroes: [],
        isActive: true
      };
      
      // Update in memory
      this.survivalStates.set(playerId, resetState);
      
      // Save reset state to database
      const userId = this.userSessions.get(playerId);
      if (userId && this.database) {
        try {
          await this.database.updateSurvivalState(userId, 0, 0, []);
          console.log(`💾 Survival state reset in database for user ${userId} after perfect run`);
        } catch (error) {
          console.error(`❌ Error resetting survival state in database:`, error);
        }
      }
      
      // Return the final state with runEnded flag
      return { wins: 7, losses: state.losses, usedHeroes: state.usedHeroes, isActive: true, runEnded: true };
    }
    
    // Run continues - update state normally
    // Update in memory
    this.survivalStates.set(playerId, state);
    
    // Save to database
    const userId = this.userSessions.get(playerId);
    if (userId && this.database) {
      try {
        await this.database.updateSurvivalState(userId, state.wins, state.losses, state.usedHeroes);
        console.log(`💾 Survival win saved to database for user ${userId}`);
      } catch (error) {
        console.error(`❌ Error saving survival win to database for user ${userId}:`, error);
      }
    }
    
    console.log(`🏆 Survival win recorded for player ${playerId}: ${state.wins} wins, used heroes: ${state.usedHeroes.join(', ')}`);
    
    // Return current state without runEnded flag
    return { ...state, runEnded: false };
  }

  async updateSurvivalLoss(playerId, teamHeroes) {
    const state = await this.getSurvivalState(playerId);
    // NOTE: Heroes are NOT banned when losing - only winners ban their heroes
    
    const finalWins = state.wins; // Capture wins before updating
    
    state.losses += 1;
    // Do NOT add heroes to usedHeroes on loss - players can reuse heroes after losing
    
    // Check if this loss ends the run (3 or more losses = eliminated)
    const runEnded = state.losses >= 3;
    
    if (runEnded) {
      console.log(`💀 Run ended with 3 losses! Final: ${finalWins} wins, 3 losses`);
      
      // Award victory points and update stats BEFORE resetting
      await this.handleSurvivalRunEnd(playerId, finalWins).catch(error => {
        console.error('Error awarding survival victory points:', error);
      });
      
      // Reset the survival state for next run
      const resetState = {
        wins: 0,
        losses: 0,
        usedHeroes: [],
        isActive: true
      };
      
      // Update in memory
      this.survivalStates.set(playerId, resetState);
      
      // Save reset state to database
      const userId = this.userSessions.get(playerId);
      if (userId && this.database) {
        try {
          await this.database.updateSurvivalState(userId, 0, 0, []);
          console.log(`💾 Survival state reset in database for user ${userId} after run ended`);
        } catch (error) {
          console.error(`❌ Error resetting survival state in database:`, error);
        }
      }
      
      // Return the final state with runEnded flag
      return { wins: finalWins, losses: 3, usedHeroes: state.usedHeroes, isActive: true, runEnded: true };
    }
    
    // Run continues - update state normally
    // Update in memory
    this.survivalStates.set(playerId, state);
    
    // Save to database
    const userId = this.userSessions.get(playerId);
    if (userId && this.database) {
      try {
        await this.database.updateSurvivalState(userId, state.wins, state.losses, state.usedHeroes);
        console.log(`💾 Survival loss saved to database for user ${userId}`);
      } catch (error) {
        console.error(`❌ Error saving survival loss to database for user ${userId}:`, error);
      }
    }
    
    console.log(`💀 Survival loss recorded for player ${playerId}: ${state.wins} wins, ${state.losses} losses, used heroes remain: ${state.usedHeroes.join(', ')}`);
    
    // Return current state without runEnded flag
    return { ...state, runEnded: false };
  }

  async resetSurvivalState(playerId) {
    // Get current state to check for existing wins
    const currentState = await this.getSurvivalState(playerId);
    
    // Award victory points and update stats for any current wins before resetting
    let victoryPointsAwarded = 0;
    let survivalStatsUpdated = false;
    
    if (currentState.wins > 0) {
      console.log(`🏆 Player ${playerId} abandoning survival run with ${currentState.wins} wins - awarding victory points and updating stats`);
      
      // Award victory points
      const result = await this.handleSurvivalRunEnd(playerId, currentState.wins);
      victoryPointsAwarded = result.pointsAwarded || currentState.wins;
      
      // Update survival stats in database
      const userId = this.userSessions.get(playerId);
      if (userId && this.database) {
        try {
          const survivalStats = await this.database.updateSurvivalStats(userId, currentState.wins);
          console.log(`📊 Updated survival stats on abandon: ${currentState.wins} wins, highest: ${survivalStats.newHighest}`);
          survivalStatsUpdated = true;
        } catch (error) {
          console.error(`❌ Error updating survival stats on abandon for user ${userId}:`, error);
        }
      }
    }
    
    const state = {
      wins: 0,
      losses: 0,
      usedHeroes: [],
      isActive: true
    };
    
    // Update in memory
    this.survivalStates.set(playerId, state);
    
    // Reset in database
    const userId = this.userSessions.get(playerId);
    if (userId && this.database) {
      try {
        await this.database.resetSurvivalState(userId);
        console.log(`💾 Survival state reset in database for user ${userId}`);
      } catch (error) {
        console.error(`❌ Error resetting survival state in database for user ${userId}:`, error);
      }
    }
    
    console.log(`🔄 Survival state reset for player ${playerId}${victoryPointsAwarded > 0 ? ` (awarded ${victoryPointsAwarded} victory points${survivalStatsUpdated ? ', stats updated' : ''})` : ''}`);
    return { ...state, victoryPointsAwarded };
  }

  // Victory Points Management Methods
  setUserSession(playerId, userId) {
    this.userSessions.set(playerId, userId);
    console.log(`🔗 Mapped player ${playerId} to user ${userId} for victory points`);
  }

  async awardVictoryPoints(playerId, points, reason = 'game_win') {
    if (!this.database) {
      console.warn('⚠️ No database available for victory points');
      return { success: false, error: 'Database not available' };
    }

    const userId = this.userSessions.get(playerId);
    if (!userId) {
      console.warn(`⚠️ No user mapping found for player ${playerId}`);
      return { success: false, error: 'User not found' };
    }

    try {
      console.log(`🏆 Awarding ${points} victory points to user ${userId} (player ${playerId}) for ${reason}`);
      await this.database.updateUserVictoryPoints(userId, points);
      
      // Get updated user data to return current victory points
      const updatedUser = await this.database.getUserById(userId);
      
      return {
        success: true,
        pointsAwarded: points,
        totalVictoryPoints: updatedUser.victory_points,
        reason: reason
      };
    } catch (error) {
      console.error('❌ Error awarding victory points:', error);
      return { success: false, error: error.message };
    }
  }

  async handleGameCompletion(gameId, winnerId, reason = 'victory') {
    const game = this.games.get(gameId);
    if (!game) {
      console.warn(`⚠️ Game ${gameId} not found for victory point processing`);
      return { success: false, error: 'Game not found' };
    }

    console.log(`🎮 Processing game completion for game ${gameId}, winner: ${winnerId}, mode: ${game.mode}, reason: ${reason}`);

    // For survival mode, victory points are handled differently
    if (game.mode === 'survival') {
      console.log(`🏆 Survival mode detected - victory points will be handled when run ends, not per battle`);
      return { success: true, message: 'Survival mode - victory points handled on run end' };
    }

    // Handle tie games
    if (reason === 'tie') {
      console.log(`🤝 Tie game detected - awarding 1 victory point to each player`);
      
      // Award 1 victory point to each player
      const results = [];
      for (const player of game.players) {
        const result = await this.awardVictoryPoints(player.id, 1, `${game.mode}_mode_tie`);
        results.push(result);
        
        if (result.success) {
          console.log(`🏆 Awarded 1 victory point to player ${player.id} for tie`);
        } else {
          console.error(`❌ Failed to award tie victory points to player ${player.id}:`, result.error);
        }
      }
      
      return { 
        success: results.every(r => r.success),
        message: 'Tie - 1 victory point awarded to each player',
        results
      };
    }

    // For regular modes (draft/random), award 2 base VP + 1 per surviving hero
    const winner = game.players.find(p => p.id === winnerId);
    if (!winner) {
      console.error(`❌ Winner ${winnerId} not found in game players`);
      return { success: false, error: 'Winner not found' };
    }
    
    // Count surviving heroes (currentHP > 0)
    const survivingHeroes = winner.team.filter(hero => hero.currentHP > 0).length;
    const basePoints = 2;
    const bonusPoints = survivingHeroes;
    const totalPoints = basePoints + bonusPoints;
    
    console.log(`🏆 Draft mode victory: ${basePoints} base + ${bonusPoints} surviving heroes = ${totalPoints} VP`);
    
    const result = await this.awardVictoryPoints(winnerId, totalPoints, `${game.mode}_mode_${reason}`);
    
    if (result.success) {
      console.log(`🏆 Awarded ${totalPoints} victory points to winner ${winnerId} for ${game.mode} mode ${reason}`);
    } else {
      console.error(`❌ Failed to award victory points to winner ${winnerId}:`, result.error);
    }

    return result;
  }

  async handleSurvivalRunEnd(playerId, finalWins) {
    if (finalWins <= 0) {
      console.log(`💀 Player ${playerId} ended survival run with 0 wins - no victory points awarded`);
      return { success: true, pointsAwarded: 0, totalVictoryPoints: 0, message: 'No wins in run' };
    }

    // Victory points based on wins: 1→1, 2→2, 3→4, 4→6, 5→9, 6→12, 7→16
    const vpTable = {
      1: 1,
      2: 2,
      3: 4,
      4: 6,
      5: 9,
      6: 12,
      7: 16
    };
    
    const pointsToAward = vpTable[finalWins] || 0;
    
    console.log(`🏆 Player ${playerId} survival run ended with ${finalWins} wins - awarding ${pointsToAward} victory points`);
    
    const result = await this.awardVictoryPoints(playerId, pointsToAward, 'survival_run_completion');
    
    if (result.success) {
      console.log(`🏆 Successfully awarded ${pointsToAward} victory points to player ${playerId} for survival run`);
    } else {
      console.error(`❌ Failed to award survival victory points to player ${playerId}:`, result.error);
    }

    return result;
  }

  async returnToLobby(playerId) {
    console.log(`🏠 Processing return to lobby for player ${playerId}`);
    
    const gameId = this.playerGameMap.get(playerId);
    if (!gameId) {
      console.log(`📝 Player ${playerId} not in any game - returning success`);
      return { 
        success: true, 
        preservedSurvivalState: await this.getSurvivalState(playerId) 
      };
    }

    const game = this.games.get(gameId);
    if (!game) {
      console.log(`⚠️ Game ${gameId} not found for player ${playerId} - cleaning up mapping`);
      this.playerGameMap.delete(playerId);
      return { 
        success: true, 
        preservedSurvivalState: await this.getSurvivalState(playerId) 
      };
    }

    // Check if this is a survival mode game
    const isSurvivalMode = game.mode === 'survival';
    const player = game.players.find(p => p.id === playerId);
    
    if (isSurvivalMode && player) {
      console.log(`🏆 Survival mode return to lobby - preserving state for ${playerId}`);
      
      // If game is ongoing and not ended, treat as forfeit/loss
      if (game.phase !== 'ended' && game.winner === null) {
        console.log(`💀 Player ${playerId} forfeiting ongoing survival battle - recording as loss`);
        await this.updateSurvivalLoss(playerId, player.team);
      }
    }

    // Remove player from game
    game.players = game.players.filter(p => p.id !== playerId);
    this.playerGameMap.delete(playerId);

    // If no players left, delete the game
    if (game.players.length === 0) {
      this.games.delete(gameId);
      console.log(`🗑️ Deleted empty game ${gameId}`);
    }

    const preservedState = isSurvivalMode ? await this.getSurvivalState(playerId) : null;
    
    console.log(`✅ Player ${playerId} successfully returned to lobby${isSurvivalMode ? ' with survival state preserved' : ''}`);
    
    return { 
      success: true, 
      preservedSurvivalState: preservedState 
    };
  }

  // ==================== SPECTATOR METHODS ====================

  /**
   * Add a spectator to a game
   * @param {string} spectatorSocketId - The socket ID of the spectator
   * @param {string} spectatorUsername - The username of the spectator
   * @param {string} gameId - The game ID to spectate
   * @param {string} spectatingPlayerId - The player ID whose perspective to view
   * @returns {Object} - Result with success flag and game state or error message
   */
  addSpectator(spectatorSocketId, spectatorUsername, gameId, spectatingPlayerId) {
    const game = this.games.get(gameId);
    
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    // Check if game is in a spectatable phase (battle or ended, not draft/waiting)
    if (game.phase === 'draft' || game.phase === 'waiting' || game.phase === 'setup' || game.phase === 'initiative') {
      return { success: false, error: 'Cannot spectate games during draft phase' };
    }

    // Check spectator limit
    if (!game.spectators) {
      game.spectators = [];
    }

    if (game.spectators.length >= 20) {
      return { success: false, error: 'Spectator limit reached (20 max)' };
    }

    // Check if player being spectated exists in the game
    const playerExists = game.players.some(p => p.id === spectatingPlayerId);
    if (!playerExists) {
      return { success: false, error: 'Player not found in this game' };
    }

    // Check if already spectating
    const alreadySpectating = game.spectators.some(s => s.socketId === spectatorSocketId);
    if (alreadySpectating) {
      return { success: false, error: 'Already spectating this game' };
    }

    // Add spectator
    game.spectators.push({
      socketId: spectatorSocketId,
      username: spectatorUsername,
      spectatingPlayerId: spectatingPlayerId
    });

    console.log(`👁️ ${spectatorUsername} started spectating game ${gameId} (watching ${spectatingPlayerId}). Total spectators: ${game.spectators.length}`);

    return {
      success: true,
      gameId: gameId,
      gameState: this.getFullGameState(game),
      spectatingPlayerId: spectatingPlayerId,
      spectatorCount: game.spectators.length,
      spectatorList: game.spectators // Send full spectator objects with socketId, username, spectatingPlayerId
    };
  }

  /**
   * Remove a spectator from a game
   * @param {string} spectatorSocketId - The socket ID of the spectator to remove
   * @returns {Object} - Result with success flag
   */
  removeSpectator(spectatorSocketId) {
    // Find which game the spectator is in
    for (const [gameId, game] of this.games.entries()) {
      if (!game.spectators) continue;

      const spectatorIndex = game.spectators.findIndex(s => s.socketId === spectatorSocketId);
      if (spectatorIndex !== -1) {
        const spectator = game.spectators[spectatorIndex];
        game.spectators.splice(spectatorIndex, 1);
        
        console.log(`👁️ ${spectator.username} stopped spectating game ${gameId}. Remaining spectators: ${game.spectators.length}`);

        return {
          success: true,
          gameId: gameId,
          spectatorCount: game.spectators.length,
          spectatorList: game.spectators // Send full spectator objects
        };
      }
    }

    return { success: false, error: 'Not currently spectating any game' };
  }

  /**
   * Get list of all spectatable games
   * @returns {Array} - Array of spectatable game info
   */
  getSpectatableGames() {
    const spectatableGames = [];

    for (const [gameId, game] of this.games.entries()) {
      // Only include games that are in battle or ended phase (not draft/waiting)
      if (game.phase === 'battle' || game.phase === 'ended') {
        spectatableGames.push({
          gameId: gameId,
          mode: game.mode,
          phase: game.phase,
          roomName: game.roomName || null,
          players: game.players.map(p => ({
            id: p.id,
            name: p.name
          })),
          spectatorCount: game.spectators ? game.spectators.length : 0,
          maxSpectators: 20
        });
      }
    }

    return spectatableGames;
  }

  /**
   * Check if a player is currently in a spectatable game
   * @param {string} playerId - The player ID to check
   * @returns {Object|null} - Game info if player is in a spectatable game, null otherwise
   */
  getPlayerSpectatableGame(playerId) {
    const gameId = this.playerGameMap.get(playerId);
    if (!gameId) return null;

    const game = this.games.get(gameId);
    if (!game) return null;

    // Only return if game is spectatable (battle or ended phase)
    if (game.phase !== 'battle' && game.phase !== 'ended') {
      return null;
    }

    return {
      gameId: gameId,
      mode: game.mode,
      phase: game.phase,
      roomName: game.roomName || null,
      players: game.players.map(p => ({
        id: p.id,
        name: p.name
      })),
      spectatorCount: game.spectators ? game.spectators.length : 0,
      maxSpectators: 20
    };
  }

  /**
   * Get spectator count and list for a game
   * @param {string} gameId - The game ID
   * @returns {Object} - Spectator count and list
   */
  getSpectatorInfo(gameId) {
    const game = this.games.get(gameId);
    if (!game || !game.spectators) {
      return { count: 0, list: [] };
    }

    return {
      count: game.spectators.length,
      list: game.spectators.map(s => s.username)
    };
  }

  /**
   * Check if a socket is spectating
   * @param {string} socketId - The socket ID to check
   * @returns {Object|null} - Spectator info if spectating, null otherwise
   */
  isSpectating(socketId) {
    for (const [gameId, game] of this.games.entries()) {
      if (!game.spectators) continue;

      const spectator = game.spectators.find(s => s.socketId === socketId);
      if (spectator) {
        return {
          gameId: gameId,
          spectatingPlayerId: spectator.spectatingPlayerId,
          username: spectator.username
        };
      }
    }
    return null;
  }

  // =================================================================
  // GAUNTLET MODE METHODS
  // =================================================================

  /**
   * Get matchmaking bracket based on current trial
   */
  getGauntletBracket(currentTrial) {
    if (currentTrial === 1) return 'A';
    if (currentTrial >= 2 && currentTrial <= 4) return 'B';
    if (currentTrial >= 5 && currentTrial <= 7) return 'C';
    if (currentTrial >= 8 && currentTrial <= 10) return 'D';
    if (currentTrial >= 11 && currentTrial <= 13) return 'E';
    return 'A'; // Default to bracket A
  }

  /**
   * Initialize a new Gauntlet run for a player
   */
  async initializeGauntletRun(playerId, playerName) {
    const { GAUNTLET_STARTER_HEROES } = require('./database');
    
    // Get player's available heroes
    const userId = this.userSessions.get(playerId);
    let availableHeroes = [];
    
    if (userId && this.database) {
      try {
        const user = await this.database.getUserById(userId);
        availableHeroes = user.available_heroes || [];
      } catch (error) {
        console.error('Error getting user heroes:', error);
        availableHeroes = this.heroes.map(h => h.name);
      }
    } else {
      availableHeroes = this.heroes.map(h => h.name);
    }

    // Select 6 random starter heroes from the GAUNTLET_STARTER_HEROES list
    const starterPool = GAUNTLET_STARTER_HEROES.filter(name => 
      this.heroes.some(h => h.name === name && !h.disabled)
    );
    const shuffledStarters = shuffleArray([...starterPool]);
    const selectedStarterNames = shuffledStarters.slice(0, 6);

    // Create HeroInstances for the initial roster
    const initialRoster = selectedStarterNames.map(heroName => {
      const heroTemplate = this.heroes.find(h => h.name === heroName);
      if (!heroTemplate) return null;
      
      const heroInstance = this.resetHeroToOriginalState(heroTemplate);
      return {
        hero_id: heroTemplate.name,
        heroData: heroInstance,
        current_hp: heroInstance.currentHP,
        max_hp: heroInstance.HP,
        alive: true,
        temporary_resurrection_active: false
      };
    }).filter(Boolean);

    // Create the run state
    const runState = {
      playerId,
      playerName,
      current_trial: 1,
      roster: initialRoster, // Array of HeroInstances
      dead_hero_ids: new Set(),
      rerolls_remaining: 3,
      shop_actions_remaining: 1,
      battle_team_indices: [], // Will be set in preparation phase
      phase: 'preparation', // preparation, queueing, battle
      availableHeroPool: availableHeroes, // Expanded pool after initial 6
      isActive: true
    };

    this.gauntletRuns.set(playerId, runState);
    console.log(`🎮 Initialized Gauntlet run for ${playerName}: 6 starter heroes selected`);

    return {
      success: true,
      runState: this.serializeGauntletRunState(runState)
    };
  }

  /**
   * Serialize gauntlet run state for sending to client
   */
  serializeGauntletRunState(runState) {
    return {
      current_trial: runState.current_trial,
      roster: runState.roster.map(instance => ({
        hero_id: instance.hero_id,
        hero: instance.heroData,
        current_hp: instance.current_hp,
        max_hp: instance.max_hp,
        alive: instance.alive,
        temporary_resurrection_active: instance.temporary_resurrection_active
      })),
      dead_hero_ids: Array.from(runState.dead_hero_ids),
      rerolls_remaining: runState.rerolls_remaining,
      shop_actions_remaining: runState.shop_actions_remaining,
      battle_team_indices: runState.battle_team_indices,
      phase: runState.phase
    };
  }

  /**
   * Get current Gauntlet run state
   */
  getGauntletRunState(playerId) {
    const runState = this.gauntletRuns.get(playerId);
    if (!runState) {
      return { success: false, error: 'No active Gauntlet run' };
    }

    return {
      success: true,
      runState: this.serializeGauntletRunState(runState)
    };
  }

  /**
   * Perform a shop action in Gauntlet
   */
  async performGauntletShopAction(playerId, action, data) {
    const runState = this.gauntletRuns.get(playerId);
    if (!runState) {
      return { success: false, error: 'No active Gauntlet run' };
    }

    if (runState.shop_actions_remaining <= 0) {
      return { success: false, error: 'No shop actions remaining' };
    }

    let result = { success: false };

    switch (action) {
      case 'heal':
        result = this.gauntletShopHeal(runState, data.heroIndex);
        break;
      case 'temp_res':
        result = this.gauntletShopTempRes(runState, data.heroId);
        break;
      case 'buy_pack':
        result = await this.gauntletShopBuyPack(runState, data.selectedHeroId, data.sacrificeIndex, data.useReroll);
        break;
      case 'skip_trial':
        result = this.gauntletShopSkipTrial(runState);
        break;
      default:
        return { success: false, error: 'Invalid shop action' };
    }

    if (result.success) {
      runState.shop_actions_remaining = 0;
    }

    return {
      ...result,
      runState: this.serializeGauntletRunState(runState)
    };
  }

  gauntletShopHeal(runState, heroIndex) {
    if (heroIndex < 0 || heroIndex >= runState.roster.length) {
      return { success: false, error: 'Invalid hero index' };
    }

    const heroInstance = runState.roster[heroIndex];
    if (!heroInstance.alive) {
      return { success: false, error: 'Cannot heal a dead hero' };
    }

    heroInstance.current_hp = heroInstance.max_hp;
    heroInstance.heroData.currentHP = heroInstance.max_hp;

    console.log(`💚 Healed ${heroInstance.hero_id} to full HP (${heroInstance.max_hp})`);

    return {
      success: true,
      message: `${heroInstance.hero_id} healed to full HP!`
    };
  }

  gauntletShopTempRes(runState, heroId) {
    if (!runState.dead_hero_ids.has(heroId)) {
      return { success: false, error: 'Hero is not dead' };
    }

    // Find or recreate hero instance
    const heroTemplate = this.heroes.find(h => h.name === heroId);
    if (!heroTemplate) {
      return { success: false, error: 'Hero not found' };
    }

    const heroData = this.resetHeroToOriginalState(heroTemplate);
    const heroInstance = {
      hero_id: heroId,
      heroData: heroData,
      current_hp: heroData.currentHP,
      max_hp: heroData.HP,
      alive: true,
      temporary_resurrection_active: true
    };

    // Add back to roster
    runState.roster.push(heroInstance);

    console.log(`👻 Temporarily resurrected ${heroId}`);

    return {
      success: true,
      message: `${heroId} temporarily resurrected! (Will die after next battle)`
    };
  }

  async gauntletShopBuyPack(runState, selectedHeroId, sacrificeIndex, useReroll) {
    // If using a reroll, decrement rerolls
    if (useReroll) {
      if (runState.rerolls_remaining <= 0) {
        return { success: false, error: 'No rerolls remaining' };
      }
      runState.rerolls_remaining--;
      console.log(`🔄 Used reroll, ${runState.rerolls_remaining} remaining`);
    }

    // If no hero selected yet, generate offer
    if (!selectedHeroId) {
      const offer = this.generateGauntletHeroOffer(runState);
      return {
        success: true,
        action: 'show_offer',
        offer: offer,
        rerolls_remaining: runState.rerolls_remaining
      };
    }

    // Hero selected, process purchase
    const heroTemplate = this.heroes.find(h => h.name === selectedHeroId);
    if (!heroTemplate) {
      return { success: false, error: 'Hero not found' };
    }

    // Check if roster is full (need sacrifice)
    if (runState.roster.length >= 6) {
      if (sacrificeIndex === undefined || sacrificeIndex === null) {
        return {
          success: true,
          action: 'need_sacrifice',
          selectedHero: selectedHeroId
        };
      }

      // Validate sacrifice
      if (sacrificeIndex < 0 || sacrificeIndex >= runState.roster.length) {
        return { success: false, error: 'Invalid sacrifice index' };
      }

      const sacrificedHero = runState.roster[sacrificeIndex];
      if (!sacrificedHero.alive) {
        return { success: false, error: 'Cannot sacrifice a dead hero' };
      }

      // Remove sacrificed hero
      runState.roster.splice(sacrificeIndex, 1);
      runState.dead_hero_ids.add(sacrificedHero.hero_id);

      console.log(`🔥 Sacrificed ${sacrificedHero.hero_id} to make room for ${selectedHeroId}`);
    }

    // Add new hero
    const heroData = this.resetHeroToOriginalState(heroTemplate);
    const newInstance = {
      hero_id: selectedHeroId,
      heroData: heroData,
      current_hp: heroData.currentHP,
      max_hp: heroData.HP,
      alive: true,
      temporary_resurrection_active: false
    };

    runState.roster.push(newInstance);

    console.log(`✨ Added ${selectedHeroId} to roster`);

    return {
      success: true,
      message: `Added ${selectedHeroId} to your roster!`
    };
  }

  gauntletShopSkipTrial(runState) {
    // Skip not available after trial 10
    if (runState.current_trial >= 10) {
      return { success: false, error: 'Cannot skip trial after trial 10' };
    }

    runState.current_trial = Math.min(runState.current_trial + 1, 13);
    console.log(`⏭️ Skipped trial, now at trial ${runState.current_trial}`);

    return {
      success: true,
      message: `Skipped to Trial ${runState.current_trial}!`
    };
  }

  /**
   * Generate a 2-hero offer for Gauntlet
   */
  generateGauntletHeroOffer(runState) {
    // Build candidate pool: available heroes excluding dead ones
    const candidatePool = runState.availableHeroPool.filter(heroName => 
      !runState.dead_hero_ids.has(heroName) &&
      this.heroes.some(h => h.name === heroName && !h.disabled)
    );

    if (candidatePool.length < 2) {
      return null; // Not enough heroes
    }

    // Randomly select 2
    const shuffled = shuffleArray([...candidatePool]);
    const offer = shuffled.slice(0, 2).map(heroName => {
      const heroTemplate = this.heroes.find(h => h.name === heroName);
      return heroTemplate ? { name: heroName, data: heroTemplate } : null;
    }).filter(Boolean);

    return offer;
  }

  /**
   * Set battle team for next trial
   */
  setGauntletBattleTeam(playerId, teamIndices) {
    const runState = this.gauntletRuns.get(playerId);
    if (!runState) {
      return { success: false, error: 'No active Gauntlet run' };
    }

    // Validate team size
    if (teamIndices.length !== 3) {
      return { success: false, error: 'Team must have exactly 3 heroes' };
    }

    // Validate all heroes are alive or temp-resurrected
    for (const index of teamIndices) {
      if (index < 0 || index >= runState.roster.length) {
        return { success: false, error: 'Invalid hero index' };
      }

      const hero = runState.roster[index];
      if (!hero.alive && !hero.temporary_resurrection_active) {
        return { success: false, error: 'All team members must be alive' };
      }
    }

    runState.battle_team_indices = teamIndices;
    console.log(`⚔️ Set battle team: [${teamIndices.join(', ')}]`);

    return {
      success: true,
      runState: this.serializeGauntletRunState(runState)
    };
  }

  /**
   * Queue for Gauntlet trial matchmaking
   */
  queueForGauntletTrial(playerId) {
    const runState = this.gauntletRuns.get(playerId);
    if (!runState) {
      return { success: false, error: 'No active Gauntlet run' };
    }

    if (runState.battle_team_indices.length !== 3) {
      return { success: false, error: 'Must select battle team first' };
    }

    const bracket = this.getGauntletBracket(runState.current_trial);
    
    // Initialize queue for bracket if needed
    if (!this.gauntletQueues.has(bracket)) {
      this.gauntletQueues.set(bracket, []);
    }

    const queue = this.gauntletQueues.get(bracket);
    
    // Check if already in queue
    if (queue.some(p => p.playerId === playerId)) {
      return { success: false, error: 'Already in queue' };
    }

    // Add to queue
    queue.push({
      playerId,
      playerName: runState.playerName,
      currentTrial: runState.current_trial,
      bracket,
      timestamp: Date.now()
    });

    runState.phase = 'queueing';

    console.log(`🎯 ${runState.playerName} queued for Trial ${runState.current_trial} (Bracket ${bracket})`);

    // Try to match immediately
    return this.tryMatchGauntletPlayers(bracket);
  }

  /**
   * Try to match players in a Gauntlet bracket
   */
  tryMatchGauntletPlayers(bracket) {
    const queue = this.gauntletQueues.get(bracket);
    if (!queue || queue.length < 2) {
      return {
        success: true,
        waiting: true,
        message: 'Waiting for opponent...'
      };
    }

    // Match the first two players in queue
    const player1Data = queue.shift();
    const player2Data = queue.shift();

    const player1Run = this.gauntletRuns.get(player1Data.playerId);
    const player2Run = this.gauntletRuns.get(player2Data.playerId);

    if (!player1Run || !player2Run) {
      console.error('Error: Player run state not found');
      return { success: false, error: 'Player state not found' };
    }

    // Create game
    const gameId = uuidv4();
    const game = this.createNewGame(gameId, 'gauntlet');

    // Prepare teams from battle_team_indices
    const player1Team = player1Run.battle_team_indices.map(index => {
      const instance = player1Run.roster[index];
      return this.resetHeroToOriginalState(instance.heroData);
    });

    const player2Team = player2Run.battle_team_indices.map(index => {
      const instance = player2Run.roster[index];
      return this.resetHeroToOriginalState(instance.heroData);
    });

    // Create players
    const player1 = {
      id: player1Data.playerId,
      name: player1Data.playerName,
      connected: true,
      team: player1Team,
      attackOrder: player1Team.map(h => h.name),
      currentHeroIndex: 0,
      hasUsedAttack: false,
      hasUsedAbility: false,
      usedAbilities: [],
      selectedTarget: null,
      isGauntletPlayer: true,
      gauntletTrial: player1Run.current_trial
    };

    const player2 = {
      id: player2Data.playerId,
      name: player2Data.playerName,
      connected: true,
      team: player2Team,
      attackOrder: player2Team.map(h => h.name),
      currentHeroIndex: 0,
      hasUsedAttack: false,
      hasUsedAbility: false,
      usedAbilities: [],
      selectedTarget: null,
      isGauntletPlayer: true,
      gauntletTrial: player2Run.current_trial
    };

    game.players = [player1, player2];
    game.phase = 'initiative';

    this.games.set(gameId, game);
    this.playerGameMap.set(player1Data.playerId, gameId);
    this.playerGameMap.set(player2Data.playerId, gameId);

    player1Run.phase = 'battle';
    player2Run.phase = 'battle';

    console.log(`⚔️ Matched Gauntlet battle: ${player1Data.playerName} (Trial ${player1Run.current_trial}) vs ${player2Data.playerName} (Trial ${player2Run.current_trial})`);

    // Auto-roll initiative
    const initiative = this.autoRollGauntletInitiative(game);

    return {
      success: true,
      matched: true,
      gameId,
      players: [player1, player2],
      initiative
    };
  }

  /**
   * Auto-roll initiative for Gauntlet battle
   */
  autoRollGauntletInitiative(game) {
    let player1Roll = rollDice(20);
    let player2Roll = rollDice(20);

    // Handle ties
    let rerollCount = 0;
    while (player1Roll === player2Roll && rerollCount < 10) {
      player1Roll = rollDice(20);
      player2Roll = rollDice(20);
      rerollCount++;
    }

    game.players[0].initiativeRoll = player1Roll;
    game.players[1].initiativeRoll = player2Roll;

    const winner = player1Roll > player2Roll ? game.players[0] : game.players[1];

    return {
      rolls: { player1: player1Roll, player2: player2Roll },
      winner: winner.id,
      needsChoice: true
    };
  }

  /**
   * Cancel Gauntlet trial queue
   */
  cancelGauntletQueue(playerId) {
    const runState = this.gauntletRuns.get(playerId);
    if (!runState) {
      return { success: false, error: 'No active Gauntlet run' };
    }

    const bracket = this.getGauntletBracket(runState.current_trial);
    const queue = this.gauntletQueues.get(bracket);

    if (queue) {
      const index = queue.findIndex(p => p.playerId === playerId);
      if (index !== -1) {
        queue.splice(index, 1);
        console.log(`❌ Removed ${runState.playerName} from Gauntlet queue`);
      }
    }

    runState.phase = 'preparation';

    return {
      success: true,
      runState: this.serializeGauntletRunState(runState)
    };
  }

  /**
   * Process post-battle effects for Gauntlet
   */
  async processGauntletPostBattle(playerId, won, teamUsed) {
    const runState = this.gauntletRuns.get(playerId);
    if (!runState) {
      return { success: false, error: 'No active Gauntlet run' };
    }

    // Update trial number if won
    if (won) {
      runState.current_trial = Math.min(runState.current_trial + 1, 13);
      console.log(`🏆 ${runState.playerName} won! Advanced to Trial ${runState.current_trial}`);
    } else {
      console.log(`💔 ${runState.playerName} lost, staying at Trial ${runState.current_trial}`);
    }

    // Process hero deaths and temp resurrections
    for (const index of runState.battle_team_indices) {
      const instance = runState.roster[index];
      const usedHero = teamUsed.find(h => h.name === instance.hero_id);

      if (usedHero) {
        // Update HP
        instance.current_hp = usedHero.currentHP;
        instance.heroData.currentHP = usedHero.currentHP;

        // Check for death
        if (usedHero.currentHP <= 0) {
          instance.alive = false;
          runState.dead_hero_ids.add(instance.hero_id);
          console.log(`💀 ${instance.hero_id} died in battle`);
        }

        // Handle temp resurrection
        if (instance.temporary_resurrection_active) {
          instance.alive = false;
          instance.temporary_resurrection_active = false;
          runState.dead_hero_ids.add(instance.hero_id);
          console.log(`👻 ${instance.hero_id} returned to death after temp resurrection`);
          
          // Remove from roster
          const rosterIndex = runState.roster.findIndex(r => r.hero_id === instance.hero_id);
          if (rosterIndex !== -1) {
            runState.roster.splice(rosterIndex, 1);
          }
        }
      }
    }

    // Reset for next trial
    runState.shop_actions_remaining = 1;
    runState.battle_team_indices = [];
    runState.phase = 'hero_offer';

    // Check if run should end (fewer than 3 usable heroes)
    const usableHeroes = runState.roster.filter(h => h.alive || h.temporary_resurrection_active).length;
    const runEnded = usableHeroes < 3;

    if (runEnded) {
      console.log(`🏁 Gauntlet run ended for ${runState.playerName} at Trial ${runState.current_trial}`);
      return {
        success: true,
        runEnded: true,
        finalTrial: runState.current_trial
      };
    }

    return {
      success: true,
      runEnded: false,
      runState: this.serializeGauntletRunState(runState)
    };
  }

  /**
   * Complete hero offer phase
   */
  async completeGauntletHeroOffer(playerId, selectedHeroId, sacrificeIndex, useReroll) {
    const runState = this.gauntletRuns.get(playerId);
    if (!runState) {
      return { success: false, error: 'No active Gauntlet run' };
    }

    if (runState.phase !== 'hero_offer') {
      return { success: false, error: 'Not in hero offer phase' };
    }

    // Use the buy pack logic
    const result = await this.gauntletShopBuyPack(runState, selectedHeroId, sacrificeIndex, useReroll);

    if (result.success && result.action !== 'show_offer' && result.action !== 'need_sacrifice') {
      // Move to preparation phase
      runState.phase = 'preparation';
    }

    return {
      ...result,
      runState: this.serializeGauntletRunState(runState)
    };
  }

  /**
   * Abandon Gauntlet run
   */
  async abandonGauntletRun(playerId) {
    const runState = this.gauntletRuns.get(playerId);
    if (!runState) {
      return { success: false, error: 'No active Gauntlet run' };
    }

    const finalTrial = runState.current_trial;

    // Update best trial if needed
    const userId = this.userSessions.get(playerId);
    if (userId && this.database) {
      try {
        await this.database.updateBestGauntletTrial(userId, finalTrial);
      } catch (error) {
        console.error('Error updating best gauntlet trial:', error);
      }
    }

    // Calculate and award rewards
    const rewards = await this.calculateAndAwardGauntletRewards(playerId, finalTrial);

    // Clean up
    this.gauntletRuns.delete(playerId);

    // Remove from any queues
    for (const [bracket, queue] of this.gauntletQueues.entries()) {
      const index = queue.findIndex(p => p.playerId === playerId);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }

    console.log(`🚪 ${runState.playerName} abandoned Gauntlet run at Trial ${finalTrial}`);

    return {
      success: true,
      finalTrial,
      rewards
    };
  }

  /**
   * Calculate and award Gauntlet rewards
   */
  async calculateAndAwardGauntletRewards(playerId, trialReached) {
    if (!this.database) {
      return { xp: 0, victoryPoints: 0 };
    }

    const rewards = await this.database.calculateGauntletRewards(trialReached);
    const userId = this.userSessions.get(playerId);

    if (userId) {
      try {
        // Award XP
        if (rewards.xp > 0) {
          await this.database.updatePlayerXP(userId, rewards.xp);
        }

        // Award Victory Points
        if (rewards.victoryPoints > 0) {
          await this.database.updateUserVictoryPoints(userId, rewards.victoryPoints);
        }

        console.log(`🎁 Awarded rewards for Trial ${trialReached}: ${rewards.xp} XP, ${rewards.victoryPoints} VP`);
      } catch (error) {
        console.error('Error awarding Gauntlet rewards:', error);
      }
    }

    return rewards;
  }
}

module.exports = GameManager;
