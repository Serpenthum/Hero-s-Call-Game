const { v4: uuidv4 } = require('uuid');
const { 
  rollDice, 
  shuffleArray, 
  calculateDamage, 
  calculateAttackRoll, 
  rollDiceString,
  applyStatusEffect,
  hasSpecialEffect,
  processEndOfTurn
} = require('./utils');

class GameManager {
  constructor(heroes) {
    this.heroes = heroes;
    this.games = new Map();
    this.playerGameMap = new Map(); // playerId -> gameId
  }

  addPlayer(playerId, playerName, isRandomMode = false) {
    // Find or create a game for this player
    let gameId = null;
    let game = null;

    // Look for a game that needs players
    for (const [id, gameState] of this.games.entries()) {
      if (gameState.players.length < 2 && gameState.phase === 'waiting') {
        gameId = id;
        game = gameState;
        break;
      }
    }

    // Create new game if none found
    if (!game) {
      gameId = uuidv4();
      game = this.createNewGame(gameId);
      this.games.set(gameId, game);
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
      selectedTarget: null,
      wantsRandomMode: isRandomMode
    };

    game.players.push(player);
    this.playerGameMap.set(playerId, gameId);

    const gameReady = game.players.length === 2;
    if (gameReady) {
      // Check if both players want random mode
      const allWantRandom = game.players.every(p => p.wantsRandomMode);
      console.log('🎲 Game ready. Players want random:', game.players.map(p => ({ name: p.name, wantsRandom: p.wantsRandomMode })));
      
      if (allWantRandom) {
        console.log('🎲 Both players want random mode, triggering auto-draft...');
        // Auto-draft immediately
        const autoDraftResult = this.autoDraft(playerId);
        console.log('🎲 Auto-draft result:', { success: autoDraftResult.success, error: autoDraftResult.error });
        
        if (autoDraftResult.success) {
          return {
            success: true,
            gameId,
            playerId,
            players: game.players,
            gameReady,
            autoStarted: true,
            gameState: autoDraftResult.gameState
          };
        } else {
          console.log('❌ Auto-draft failed:', autoDraftResult.error);
          return { success: false, error: autoDraftResult.error };
        }
      } else {
        this.startDraftPhase(game);
      }
    }

    return {
      success: true,
      gameId,
      playerId,
      players: game.players.map(p => ({ id: p.id, name: p.name })),
      gameReady,
      draftCards: gameReady ? game.draftCards : null
    };
  }

  addRandomPlayer(playerId, playerName) {
    return this.addPlayer(playerId, playerName, true);
  }

  createNewGame(gameId) {
    return {
      id: gameId,
      phase: 'waiting', // waiting, draft, battle, ended
      players: [],
      draftCards: null,
      currentDraftPhase: 0, // 0: ban, 1-3: pick rounds
      draftTurn: 0, // whose turn to draft
      currentTurn: 0, // whose turn in battle
      currentHeroTurn: 0, // which hero is acting
      winner: null,
      createdAt: Date.now()
    };
  }

  startDraftPhase(game) {
    game.phase = 'draft';
    
    // Give each player 5 random heroes
    const shuffledHeroes = shuffleArray([...this.heroes]);
    
    // Ensure we have at least 10 heroes for the draft
    if (shuffledHeroes.length < 10) {
      console.error('Not enough heroes for draft phase');
      return;
    }
    
    game.players[0].draftCards = shuffledHeroes.slice(0, 5);
    game.players[1].draftCards = shuffledHeroes.slice(5, 10);
    
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

  banCard(playerId, cardName) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
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

    // Add to team and remove from draft cards
    player.team.push(hero);
    player.draftCards = player.draftCards.filter(h => h.name !== cardName);

    // Check if both players picked this round
    const bothPicked = game.players.every(p => p.team.length === game.currentDraftPhase);
    
    let newHands = null;
    if (bothPicked) {
      if (game.currentDraftPhase === 3) {
        // Draft complete - auto roll initiative
        game.phase = 'initiative';
        console.log('Draft complete! Auto-rolling initiative...');
        
        // Auto-roll initiative for both players
        const { rollDice } = require('./utils');
        game.players[0].initiativeRoll = rollDice(20);
        game.players[1].initiativeRoll = rollDice(20);
        
        console.log(`Initiative rolls: Player 1: ${game.players[0].initiativeRoll}, Player 2: ${game.players[1].initiativeRoll}`);
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

    // Check if both players set order
    const bothReady = game.players.every(p => p.attackOrder.length === 3);
    if (bothReady) {
      game.phase = 'initiative';
    }

    return {
      success: true,
      gameId,
      bothReady,
      phase: game.phase,
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
      const player1Roll = game.players[0].initiativeRoll;
      const player2Roll = game.players[1].initiativeRoll;
      
      if (player1Roll !== player2Roll) {
        const winner = player1Roll > player2Roll ? game.players[0] : game.players[1];
        return {
          success: true,
          gameId,
          rolls: { player1: player1Roll, player2: player2Roll },
          winner: winner.id,
          needsChoice: true
        };
      } else {
        // Tie, reroll
        game.players.forEach(p => p.initiativeRoll = undefined);
        return {
          success: true,
          gameId,
          rolls: { player1: player1Roll, player2: player2Roll },
          tie: true
        };
      }
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

    // Initialize battle state for all heroes
    game.players.forEach((player, playerIndex) => {
      player.team.forEach((hero, heroIndex) => {
        hero.id = `${playerIndex}-${heroIndex}`;
        hero.currentHP = hero.HP;
        hero.statusEffects = {
          poison: 0,
          taunt: null,
          inspiration: 0,
          silenced: false,
          untargetable: false
        };
      });
      player.currentHeroIndex = 0;
      player.hasUsedAttack = false;
      player.hasUsedAbility = false;
    });

    // Initialize turn system - determine first player based on choice
    // If firstPlayerIndex is 0, first turn goes to player 0's first hero (index 0 in turn order)
    // If firstPlayerIndex is 1, first turn goes to player 1's first hero (index 1 in turn order)
    const turnOrder = this.buildTurnOrder(game);
    game.currentHeroTurn = turnOrder.findIndex(turn => turn.playerIndex === firstPlayerIndex);
    if (game.currentHeroTurn === -1) game.currentHeroTurn = 0;
    
    // Set currentTurn to match the current hero's player
    const currentTurnInfo = this.getCurrentTurnInfo(game);
    game.currentTurn = currentTurnInfo ? currentTurnInfo.playerIndex : firstPlayerIndex;

    // Apply passive effects from specials
    this.applyPassiveEffects(game);

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
      });
    });

    // Apply passive effects from each hero's special abilities
    game.players.forEach(player => {
      player.team.forEach(sourceHero => {
        if (sourceHero.currentHP <= 0) return; // Dead heroes don't provide buffs (except permanent ones)
        
        if (sourceHero.Special) {
          const special = sourceHero.Special;
          
          // Handle different special categories
          switch (special.category) {
            case 'team_aura':
              // Team auras affect all allies
              special.effects.forEach(effect => {
                if (effect.type === 'stat_modifier') {
                  this.applyAuraEffect(game, sourceHero, special, effect);
                }
              });
              break;
              
            case 'conditional_aura':
              // Conditional auras need to be checked during combat
              break;
              
            case 'start_of_game':
              // Battle start effects
              special.effects.forEach(effect => {
                if (effect.type === 'apply_buff') {
                  this.applyBattleStartBuff(game, sourceHero, special, effect);
                }
              });
              break;
              
            case 'persistent':
            case 'permanent':
              // These are handled in combat calculations
              break;
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
    
    targets.forEach(target => {
      if (!target.passiveBuffs) target.passiveBuffs = [];
      
      target.passiveBuffs.push({
        sourceHero: sourceHero.name,
        sourceName: special.name,
        stat: effect.stat,
        value: effect.value,
        permanent: false // Aura effects are not permanent
      });
    });
  }

  applyBattleStartBuff(game, sourceHero, special, effect) {
    // For Warlock's Dark Pact - need to choose an ally (for now, choose first alive ally)
    const allies = game.players
      .find(p => p.team.includes(sourceHero))
      ?.team.filter(h => h !== sourceHero && h.currentHP > 0) || [];
    
    const chosenAlly = allies[0]; // Simple selection for now
    const targets = [sourceHero];
    if (chosenAlly) targets.push(chosenAlly);

    targets.forEach(target => {
      if (!target.passiveBuffs) target.passiveBuffs = [];
      
      target.passiveBuffs.push({
        sourceHero: sourceHero.name,
        sourceName: special.name,
        stat: 'damage',
        value: effect.value,
        permanent: true // Warlock buffs are permanent
      });
    });
  }

  getTargetsForEffect(game, sourceHero, targetType) {
    const sourcePlayer = game.players.find(p => p.team.includes(sourceHero));
    if (!sourcePlayer) return [];

    switch (targetType) {
      case 'all_allies':
        return sourcePlayer.team.filter(h => h !== sourceHero);
      case 'self':
        return [sourceHero];
      default:
        return [];
    }
  }

  updateHeroDisplayStats(hero) {
    if (!hero.passiveBuffs || hero.passiveBuffs.length === 0) return;

    // Update accuracy display
    const accuracyBuffs = hero.passiveBuffs.filter(b => b.stat === 'accuracy');
    if (accuracyBuffs.length > 0) {
      const baseAccuracy = parseInt(hero.Accuracy.replace('+', ''));
      const totalAccuracyBonus = accuracyBuffs.reduce((sum, buff) => sum + buff.value, 0);
      hero.modifiedAccuracy = `+${baseAccuracy + totalAccuracyBonus}`;
    }

    // Update damage display
    const damageBuffs = hero.passiveBuffs.filter(b => b.stat === 'damage');
    if (damageBuffs.length > 0) {
      const totalDamageBonus = damageBuffs.reduce((sum, buff) => sum + buff.value, 0);
      hero.modifiedBasicAttack = `${hero.BasicAttack} +${totalDamageBonus}`;
    }
  }

  // Method to reapply passive effects when a hero dies (to remove non-permanent buffs)
  updatePassiveEffectsOnDeath(game, deadHero) {
    game.players.forEach(player => {
      player.team.forEach(hero => {
        if (hero.passiveBuffs) {
          // Remove non-permanent buffs from the dead hero
          hero.passiveBuffs = hero.passiveBuffs.filter(buff => 
            buff.permanent || buff.sourceHero !== deadHero.name
          );
          // Update display stats
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
    
    if (!currentHero || player.hasUsedAttack) {
      return { success: false, error: 'Cannot use basic attack' };
    }

    // Check if target is selected
    if (!player.selectedTarget) {
      return { success: false, error: 'Must select a target first' };
    }

    // Find target
    const opponent = game.players[1 - currentTurnInfo.playerIndex];
    const target = opponent.team.find(h => h.name === player.selectedTarget);
    
    if (!target || target.currentHP <= 0) {
      return { success: false, error: 'Invalid target' };
    }

    // Calculate attack
    const attackRoll = calculateAttackRoll(currentHero.Accuracy);
    const hit = attackRoll.total >= target.AC;
    
    let damage = 0;
    let statusEffects = [];
    
    if (hit) {
      const damageRoll = calculateDamage(currentHero.BasicAttack, attackRoll.isCritical);
      damage = damageRoll.total;
      console.log(`[DEBUG] Basic Attack: ${currentHero.name} hits ${target.name} for ${damage} damage (${currentHero.BasicAttack})`);
      target.currentHP = Math.max(0, target.currentHP - damage);
      
      // Check if target died
      if (target.currentHP === 0) {
        statusEffects.push({ type: 'death', target: target.name });
        this.updatePassiveEffectsOnDeath(game, target);
      }
    } else {
      console.log(`[DEBUG] Basic Attack: ${currentHero.name} misses ${target.name} (rolled ${attackRoll.total} vs AC ${target.AC})`);
    }

    player.hasUsedAttack = true;

    return {
      success: true,
      gameId,
      hit,
      damage,
      attackRoll: attackRoll.roll,
      total: attackRoll.total,
      isCritical: attackRoll.isCritical,
      targetHP: target.currentHP,
      attacker: currentHero.name,
      target: target.name,
      statusEffects,
      gameState: this.getFullGameState(game)
    };
  }

  useAbility(playerId, abilityIndex, targetId) {
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

    // Check if hero can use abilities (not silenced)
    if (currentHero.statusEffects?.silenced) {
      return { success: false, error: 'Hero is silenced' };
    }

    // Check if already used ability (unless hero can use multiple)
    const canUseTwice = hasSpecialEffect(currentHero, 'use_ability_twice');
    if (player.hasUsedAbility && !canUseTwice) {
      return { success: false, error: 'Already used ability this turn' };
    }

    // Check if target is selected
    if (!player.selectedTarget) {
      return { success: false, error: 'Must select a target first' };
    }

    const ability = currentHero.Ability[abilityIndex];
    const opponent = game.players[1 - currentTurnInfo.playerIndex];
    
    // Use the selected target
    let target = opponent.team.find(h => h.name === player.selectedTarget);
    
    // If not found in opponent team, look in player's team (for healing abilities)
    if (!target) {
      target = player.team.find(h => h.name === player.selectedTarget);
    }
    
    if (!target) {
      return { success: false, error: 'Selected target not found' };
    }

    // Process ability effects
    const results = this.processAbilityEffects(ability, currentHero, target, player, opponent, game);
    
    player.hasUsedAbility = true;

    return {
      success: true,
      gameId,
      ability: ability.name,
      caster: currentHero.name,
      target: target?.name,
      results,
      gameState: this.getFullGameState(game)
    };
  }

  processAbilityEffects(ability, caster, target, casterPlayer, opponent, game) {
    const results = [];
    
    // For now, just handle basic damage abilities until we can properly categorize
    const effects = ability.primary_effects || ability.effects || [];
    
    for (const effect of effects) {
      if (effect.type === 'damage' && target && target.currentHP > 0) {
        const attackRoll = calculateAttackRoll(caster.Accuracy);
        const hit = attackRoll.total >= target.AC;
        
        if (hit) {
          const damageRoll = calculateDamage(effect.value, attackRoll.isCritical);
          const damage = damageRoll.total;
          console.log(`[DEBUG] Ability Damage: ${caster.name} hits ${target.name} for ${damage} damage (${effect.value})`);
          target.currentHP = Math.max(0, target.currentHP - damage);
          
          if (target.currentHP === 0) {
            this.updatePassiveEffectsOnDeath(game, target);
          }
          
          results.push({
            type: 'damage',
            target: target.name,
            damage,
            hit: true,
            isCritical: attackRoll.isCritical,
            roll: attackRoll.roll,
            total: attackRoll.total,
            targetHP: target.currentHP
          });
        } else {
          console.log(`[DEBUG] Ability Miss: ${caster.name} misses ${target.name} (rolled ${attackRoll.total} vs AC ${target.AC})`);
          results.push({
            type: 'damage',
            target: target.name,
            damage: 0,
            hit: false,
            roll: attackRoll.roll,
            total: attackRoll.total,
            targetHP: target.currentHP
          });
        }
      }
    }
    
    return results;
  }

  // Build a turn order from alive heroes in alternating pattern
              type: 'damage',
              target: target.name,
              damage,
              hit: true,
              isCritical: attackRoll.isCritical,
              roll: attackRoll.roll,
              total: attackRoll.total,
              targetHP: target.currentHP
            });
          }
        } else {
          results.push({
            type: effect.type,
            target: target.name,
            damage: 0,
            hit: false,
            roll: attackRoll.roll,
            total: attackRoll.total,
            targetHP: target.currentHP
          });
        }
      }
    }
    
    // Second pass: process other effects only if ability hit (for abilities with damage) 
    // or always apply for non-damage abilities
    const hasDamageEffect = ability.effects.some(e => e.type === 'damage' || e.type === 'lifesteal_damage');
    const shouldApplyOtherEffects = !hasDamageEffect || abilityHit;
    
    for (const effect of ability.effects) {
      switch (effect.type) {
        case 'damage':
        case 'lifesteal_damage':
          // Already processed in first pass
          break;

        case 'heal':
          if (target) {
            const healRoll = rollDiceString(effect.value);
            const healing = healRoll.total;
            const oldHP = target.currentHP;
            target.currentHP = Math.min(target.HP, target.currentHP + healing);
            
            results.push({
              type: 'heal',
              target: target.name,
              healing,
              oldHP,
              newHP: target.currentHP
            });
          }
          break;

        case 'apply_debuff':
          if (target && effect.effect && shouldApplyOtherEffects) {
            applyStatusEffect(target, effect.effect, effect.stacks || effect.value || 1);
            results.push({
              type: 'status_applied',
              target: target.name,
              effect: effect.effect,
              value: effect.stacks || effect.value || 1
            });
          } else if (target && effect.effect && !shouldApplyOtherEffects) {
            results.push({
              type: 'status_missed',
              target: target.name,
              effect: effect.effect
            });
          }
          break;

        case 'apply_buff':
          if (target && effect.effect && shouldApplyOtherEffects) {
            applyStatusEffect(target, effect.effect, effect.value || 1);
            results.push({
              type: 'status_applied',
              target: target.name,
              effect: effect.effect,
              value: effect.value || 1
            });
          } else if (target && effect.effect && !shouldApplyOtherEffects) {
            results.push({
              type: 'status_missed',
              target: target.name,
              effect: effect.effect
            });
          }
          break;

        case 'recoil_damage':
          const recoilRoll = rollDiceString(effect.value);
          const recoilDamage = recoilRoll.total;
          caster.currentHP = Math.max(0, caster.currentHP - recoilDamage);
          
          results.push({
            type: 'recoil_damage',
            target: caster.name,
            damage: recoilDamage,
            targetHP: caster.currentHP
          });
          break;



        // Add more effect types as needed
        default:
          console.log(`Unhandled effect type: ${effect.type}`);
      }
    }
    
    return results;
  }

  // Build a turn order from alive heroes in alternating pattern
  buildTurnOrder(game) {
    const player1AliveHeroes = game.players[0].team
      .map((hero, index) => ({ hero, playerIndex: 0, heroIndex: index }))
      .filter(h => h.hero.currentHP > 0);
    
    const player2AliveHeroes = game.players[1].team
      .map((hero, index) => ({ hero, playerIndex: 1, heroIndex: index }))
      .filter(h => h.hero.currentHP > 0);

    // Create alternating turn order: P1H1, P2H1, P1H2, P2H2, etc.
    const turnOrder = [];
    const maxHeroes = Math.max(player1AliveHeroes.length, player2AliveHeroes.length);
    
    for (let i = 0; i < maxHeroes; i++) {
      if (i < player1AliveHeroes.length) {
        turnOrder.push(player1AliveHeroes[i]);
      }
      if (i < player2AliveHeroes.length) {
        turnOrder.push(player2AliveHeroes[i]);
      }
    }
    
    return turnOrder;
  }

  // Calculate who should be taking their turn based on current turn index
  getCurrentTurnInfo(game) {
    const turnOrder = this.buildTurnOrder(game);
    
    if (turnOrder.length === 0) {
      return null; // No alive heroes
    }
    
    // Initialize currentHeroTurn if not set or invalid
    if (game.currentHeroTurn >= turnOrder.length || game.currentHeroTurn < 0) {
      game.currentHeroTurn = 0;
    }
    
    const currentTurn = turnOrder[game.currentHeroTurn];
    
    return {
      playerIndex: currentTurn.playerIndex,
      heroIndex: currentTurn.heroIndex,
      player: game.players[currentTurn.playerIndex],
      hero: currentTurn.hero
    };
  }
  
  advanceToNextValidTurn(game) {
    const turnOrder = this.buildTurnOrder(game);
    
    if (turnOrder.length === 0) {
      return null; // No alive heroes
    }
    
    // Advance to next turn, cycling back to 0 when reaching the end
    game.currentHeroTurn = (game.currentHeroTurn + 1) % turnOrder.length;
    
    const currentTurn = turnOrder[game.currentHeroTurn];
    
    return {
      playerIndex: currentTurn.playerIndex,
      heroIndex: currentTurn.heroIndex,
      player: game.players[currentTurn.playerIndex],  
      hero: currentTurn.hero
    };
  }

  selectTarget(playerId, targetId) {
    const gameId = this.playerGameMap.get(playerId);
    const game = this.games.get(gameId);
    
    if (!game || game.phase !== 'battle') {
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

    currentTurnInfo.player.selectedTarget = target.name;
    
    return {
      success: true,
      gameId,
      selectedTarget: target.name,
      forced: false,
      gameState: this.getFullGameState(game)
    };
  }

  findHeroByName(game, heroName) {
    for (const player of game.players) {
      const hero = player.team.find(h => h.name === heroName);
      if (hero) return hero;
    }
    return null;
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
    }

    // Reset turn actions
    currentTurnInfo.player.hasUsedAttack = false;
    currentTurnInfo.player.hasUsedAbility = false;
    currentTurnInfo.player.selectedTarget = null; // Clear target selection

    // Advance to next turn
    const nextTurnInfo = this.advanceToNextValidTurn(game);
    if (nextTurnInfo) {
      game.currentTurn = nextTurnInfo.playerIndex;
    }
    
    // Check for win condition
    const winner = this.checkWinCondition(game);
    if (winner) {
      game.phase = 'ended';
      game.winner = winner;
    }

    return {
      success: true,
      gameId,
      currentTurn: game.currentTurn,
      endTurnEffects,
      winner: game.winner,
      gameState: this.getFullGameState(game)
    };
  }

  checkWinCondition(game) {
    for (let i = 0; i < game.players.length; i++) {
      const player = game.players[i];
      const aliveHeroes = player.team.filter(h => h.currentHP > 0);
      
      if (aliveHeroes.length === 0) {
        // This player has no heroes left, opponent wins
        return game.players[1 - i].id;
      }
    }
    return null;
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

    // Update player connection
    player.id = socketId;
    player.connected = true;
    this.playerGameMap.set(socketId, gameId);

    return {
      success: true,
      gameId,
      gameState: this.getFullGameState(game)
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

    if (game.players.length !== 2) {
      return { success: false, error: 'Need exactly 2 players for auto-draft' };
    }

    // Get all available heroes (exclude banned ones)
    const bannedCards = game.players.map(p => p.bannedCard).filter(Boolean);
    const availableHeroes = this.heroes.filter(hero => !bannedCards.includes(hero.name));
    
    // Shuffle available heroes
    const shuffled = [...availableHeroes].sort(() => Math.random() - 0.5);
    
    // Assign 3 random heroes to each player
    game.players[0].team = shuffled.slice(0, 3).map(hero => ({ ...hero, currentHP: hero.HP }));
    game.players[1].team = shuffled.slice(3, 6).map(hero => ({ ...hero, currentHP: hero.HP }));
    
    // Set default attack order (same as team order)
    game.players[0].attackOrder = game.players[0].team.map(h => h.name);
    game.players[1].attackOrder = game.players[1].team.map(h => h.name);
    
    // Skip to initiative rolling phase
    game.phase = 'initiative';
    game.currentDraftPhase = 3;
    
    // Apply passive effects before initiative
    this.applyPassiveEffects(game);
    
    // Automatically roll initiative for both players
    const player1Roll = rollDice(20);
    const player2Roll = rollDice(20);
    
    game.players[0].initiativeRoll = player1Roll;
    game.players[1].initiativeRoll = player2Roll;
    
    console.log('Auto-draft completed:', {
      player1Team: game.players[0].team.map(h => h.name),
      player2Team: game.players[1].team.map(h => h.name),
      initiativeRolls: { player1: player1Roll, player2: player2Roll }
    });
    
    if (player1Roll !== player2Roll) {
      const winner = player1Roll > player2Roll ? game.players[0] : game.players[1];
      return {
        success: true,
        gameId,
        gameState: this.getFullGameState(game),
        message: 'Auto-draft completed! Teams assigned randomly.',
        initiativeRolled: true,
        rolls: { player1: player1Roll, player2: player2Roll },
        winner: winner.id,
        needsChoice: true
      };
    } else {
      // Handle tie - reroll until different
      while (game.players[0].initiativeRoll === game.players[1].initiativeRoll) {
        game.players[0].initiativeRoll = rollDice(20);
        game.players[1].initiativeRoll = rollDice(20);
      }
      
      const finalP1Roll = game.players[0].initiativeRoll;
      const finalP2Roll = game.players[1].initiativeRoll;
      const winner = finalP1Roll > finalP2Roll ? game.players[0] : game.players[1];
      
      return {
        success: true,
        gameId,
        gameState: this.getFullGameState(game),
        message: 'Auto-draft completed! Teams assigned randomly.',
        initiativeRolled: true,
        rolls: { player1: finalP1Roll, player2: finalP2Roll },
        winner: winner.id,
        needsChoice: true
      };
    }
  }

  getGameState(gameId) {
    const game = this.games.get(gameId);
    return game ? this.getFullGameState(game) : null;
  }

  getFullGameState(game) {
    return {
      id: game.id,
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
        selectedTarget: p.selectedTarget || null,
        bannedCard: p.bannedCard,
        attackOrder: p.attackOrder || [],
        initiativeRoll: p.initiativeRoll
      })),
      currentTurn: game.currentTurn || 0,
      currentHeroTurn: game.currentHeroTurn || 0,
      currentDraftPhase: game.currentDraftPhase || 0,
      draftTurn: game.draftTurn || 0,
      winner: game.winner,
      draftCards: game.draftCards
    };
  }
}

module.exports = GameManager;