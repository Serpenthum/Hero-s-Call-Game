console.log('Starting server initialization...');

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

console.log('Basic modules loaded successfully');

// Import game logic
console.log('Loading GameManager...');
const GameManager = require('./gameManager');
console.log('Loading utils...');
const { rollDice, shuffleArray } = require('./utils');
console.log('Loading Database...');
const Database = require('./database');
console.log('Game logic modules loaded successfully');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"], // Multiple possible dev server ports
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://localhost:4173"],
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Serve hero images
app.use('/hero-images', express.static(path.join(__dirname, '../frontend/hero-images')));

// Load heroes data dynamically to avoid caching issues
const getHeroes = () => {
  // Clear require cache for heroes.json to always get fresh data
  delete require.cache[require.resolve('./heros.json')];
  return require('./heros.json');
};

const heroes = getHeroes();

// Initialize database
const database = new Database();

// Refresh available heroes for all users to include newly enabled heroes like Engineer
setTimeout(() => {
  database.refreshAvailableHeroes();
}, 1000); // Small delay to ensure database tables are created first

// Session management for authentication
const userSessions = new Map(); // socketId -> userId
const loggedInUsers = new Map(); // userId -> socketId (to track who is logged in)

// Test endpoint first
app.get('/api/test', (req, res) => {
  console.log('Test API call received');
  res.json({ message: 'Server is working' });
});

// Authentication endpoints
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    if (username.length < 3) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username must be at least 3 characters long' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    const user = await database.createUser(username, password);
    res.json({ 
      success: true, 
      message: 'Account created successfully',
      user: {
        id: user.id,
        username: user.username,
        victory_points: user.victory_points,
        survival_wins: user.survival_wins,
        survival_losses: user.survival_losses,
        available_heroes: user.available_heroes
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message || 'Registration failed' 
    });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    const user = await database.authenticateUser(username, password);
    
    // Check if user is already logged in
    if (loggedInUsers.has(user.id)) {
      return res.status(409).json({
        success: false,
        message: 'This account is already logged in from another session. Please logout from the other session first.'
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        victory_points: user.victory_points,
        survival_wins: user.survival_wins,
        survival_losses: user.survival_losses,
        survival_used_heroes: user.survival_used_heroes,
        available_heroes: user.available_heroes
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ 
      success: false, 
      message: error.message || 'Login failed' 
    });
  }
});

app.post('/api/logout', (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }

    // Find and disconnect the user's socket
    const socketId = loggedInUsers.get(parseInt(userId));
    if (socketId) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect();
      }
      // Clean up session tracking
      loggedInUsers.delete(parseInt(userId));
      userSessions.delete(socketId);
      console.log('User manually logged out:', userId);
    }

    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Logout failed' 
    });
  }
});

app.get('/api/user/:userId', async (req, res) => {
  try {
    const user = await database.getUserById(parseInt(req.params.userId));
    res.json({ 
      success: true, 
      user: {
        id: user.id,
        username: user.username,
        victory_points: user.victory_points,
        survival_wins: user.survival_wins,
        survival_losses: user.survival_losses,
        survival_used_heroes: user.survival_used_heroes,
        available_heroes: user.available_heroes
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(404).json({ 
      success: false, 
      message: error.message || 'User not found' 
    });
  }
});

// API endpoint to get heroes data
app.get('/api/heroes', (req, res) => {
  try {
    console.log('API call received for /api/heroes');
    const userId = req.query.userId;
    const showAll = req.query.showAll === 'true'; // For collection page

    if (userId && !showAll) {
      // Return only user's available heroes
      database.getUserById(parseInt(userId))
        .then(user => {
          const userHeroes = heroes.filter(hero => 
            user.available_heroes.includes(hero.name) && !hero.disabled
          );
          console.log('Sending user heroes data:', userHeroes.length, 'heroes for user', userId);
          res.json(userHeroes);
        })
        .catch(error => {
          console.error('Error getting user heroes:', error);
          // Fallback to enabled heroes only
          const enabledHeroes = heroes.filter(hero => !hero.disabled);
          res.json(enabledHeroes);
        });
    } else if (showAll) {
      // For collection page - show all heroes including disabled ones
      console.log('Sending all heroes data (including disabled):', heroes.length, 'heroes');
      res.json(heroes);
    } else {
      // Default - return only enabled heroes for non-authenticated users
      const enabledHeroes = heroes.filter(hero => !hero.disabled);
      console.log('Sending enabled heroes data:', enabledHeroes.length, 'heroes');
      res.json(enabledHeroes);
    }
  } catch (error) {
    console.error('Error in /api/heroes endpoint:', error);
    res.status(500).json({ error: 'Failed to load heroes data' });
  }
});

const PORT = process.env.PORT || 3001;

// Game state management
const gameManager = new GameManager(heroes, database);

// Friendly rooms management
const friendlyRooms = new Map(); // roomName -> { gameId, creator, players, gameStarted }

// Helper function to check and handle regular game completion (draft/random modes)
async function handleRegularGameCompletion(result) {
  if (result.success && result.gameState && result.gameState.winner && result.gameState.mode !== 'survival') {
    console.log(`🏆 Regular game (${result.gameState.mode}) completed! Winner: ${result.gameState.winner}`);
    
    try {
      // Get updated victory points for the winner
      const winnerUserId = userSessions.get(result.gameState.winner);
      if (winnerUserId) {
        const winnerUser = await database.getUserById(winnerUserId);
        
        // Emit victory points update to the winner
        io.to(result.gameState.winner).emit('victory-points-update', {
          type: 'game_win',
          pointsAwarded: 1,
          totalVictoryPoints: winnerUser.victory_points,
          gameMode: result.gameState.mode,
          message: `Victory! You earned 1 victory point. Total: ${winnerUser.victory_points}`
        });
        
        console.log(`📡 Sent victory points update to winner ${result.gameState.winner}`);
      }
    } catch (error) {
      console.error('❌ Error sending victory points update for regular game:', error);
    }
  }
}

// Helper function to check and handle survival game completion
async function checkSurvivalGameCompletion(result) {
  console.log('🔍 Checking survival game completion. Result success:', result.success);
  console.log('🔍 Result gameState exists:', !!result.gameState);
  console.log('🔍 Result gameState winner:', result.gameState?.winner);
  console.log('🔍 Result gameState mode:', result.gameState?.mode);
  
  if (result.success && result.gameState && result.gameState.winner && result.gameState.mode === 'survival') {
    console.log('🏆 Survival game completed! Winner:', result.gameState.winner);
    
    // Find the winner and loser players
    const winnerPlayer = result.gameState.players.find(p => p.id === result.gameState.winner);
    const loserPlayer = result.gameState.players.find(p => p.id !== result.gameState.winner);
    
    console.log('🔍 Winner player found:', !!winnerPlayer, winnerPlayer?.name);
    console.log('🔍 Loser player found:', !!loserPlayer, loserPlayer?.name);
    
    if (winnerPlayer && loserPlayer) {
      // Update survival states
      const winnerState = gameManager.updateSurvivalWin(winnerPlayer.id, winnerPlayer.team);
      const loserState = gameManager.updateSurvivalLoss(loserPlayer.id, loserPlayer.team);
      
      console.log('🏆 Winner new state:', winnerState);
      console.log('💀 Loser new state:', loserState);
      
      // The victory points for the loser's run end are handled automatically by updateSurvivalLoss
      // Get updated user data to include victory points in the response
      try {
        // Get updated victory points for the loser (whose run just ended)
        const loserUserId = userSessions.get(loserPlayer.id);
        let loserVictoryPoints = null;
        if (loserUserId) {
          const loserUser = await database.getUserById(loserUserId);
          loserVictoryPoints = loserUser.victory_points;
        }
        
        // Emit survival state updates to both players
        io.to(winnerPlayer.id).emit('survival-state-update', {
          type: 'win',
          state: winnerState,
          message: `Victory! You now have ${winnerState.wins} wins and ${winnerState.losses} losses.`
        });
        
        io.to(loserPlayer.id).emit('survival-state-update', {
          type: 'loss', 
          state: loserState,
          victoryPoints: loserVictoryPoints,
          message: `Run ended! You earned ${loserState.wins} victory points for your ${loserState.wins} wins. Total losses: ${loserState.losses}.`
        });
        
        console.log('📡 Sent survival state updates to both players with victory points');
      } catch (error) {
        console.error('❌ Error getting updated victory points:', error);
        
        // Fall back to basic messages without victory points
        io.to(winnerPlayer.id).emit('survival-state-update', {
          type: 'win',
          state: winnerState,
          message: `Victory! You now have ${winnerState.wins} wins and ${winnerState.losses} losses.`
        });
        
        io.to(loserPlayer.id).emit('survival-state-update', {
          type: 'loss', 
          state: loserState,
          message: `Run ended! You now have ${loserState.wins} wins and ${loserState.losses} losses.`
        });
      }
    } else {
      console.log('❌ Could not find winner or loser player in game state');
    }
  } else {
    if (!result.success) console.log('🔍 Result not successful');
    if (!result.gameState) console.log('🔍 No gameState in result');
    if (!result.gameState?.winner) console.log('🔍 No winner in gameState');
    if (result.gameState?.mode !== 'survival') console.log('🔍 Game mode is not survival:', result.gameState?.mode);
  }
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Handle user authentication for socket connection
  socket.on('authenticate', (data) => {
    const { userId } = data;
    if (userId) {
      // Check if user is already connected from another socket
      if (loggedInUsers.has(userId)) {
        const existingSocketId = loggedInUsers.get(userId);
        const existingSocket = io.sockets.sockets.get(existingSocketId);
        
        // If the existing socket is still connected, reject the new authentication
        if (existingSocket && existingSocket.connected) {
          console.log('User', userId, 'attempted duplicate login - rejecting new session');
          socket.emit('authentication-failed', { 
            message: 'Account already logged in from another session. Please close the other session first.' 
          });
          socket.disconnect();
          return;
        } else {
          // Clean up stale session data if the socket is no longer connected
          console.log('Cleaning up stale session for user', userId);
          userSessions.delete(existingSocketId);
          loggedInUsers.delete(userId);
        }
      }
      
      // Set up new session
      userSessions.set(socket.id, userId);
      loggedInUsers.set(userId, socket.id);
      
      // Map user session for victory points in game manager
      gameManager.setUserSession(socket.id, userId);
      
      console.log('User authenticated:', userId, 'for socket:', socket.id);
      socket.emit('authentication-success', { userId });
    } else {
      socket.emit('authentication-failed', { message: 'Invalid user ID' });
    }
  });

  // Handle player joining game
  socket.on('join-game', (playerData) => {
    const mode = playerData.mode || 'draft';
    const result = gameManager.addPlayer(socket.id, playerData.name || 'Anonymous', mode);
    
    socket.emit('join-result', result);
    
    if (result.success) {
      socket.join(result.gameId);
      
      // If game is full, start appropriate phase
      if (result.gameReady) {
        if (mode === 'random') {
          // Start random mode - skip draft and go to initiative
          const randomResult = gameManager.startRandomMode(result.gameId);
          if (randomResult.success) {
            io.to(result.gameId).emit('game-start', {
              players: randomResult.players,
              gameState: randomResult.gameState
            });
          }
        } else {
          // Start draft mode
          io.to(result.gameId).emit('game-start', {
            players: result.players,
            draftCards: result.draftCards
          });
        }
      }
    }
  });

  // Handle survival mode matchmaking
  socket.on('join-survival-game', (data) => {
    console.log('Player joining survival game:', data.name, 'with team:', data.team.map(h => h.name));
    
    const result = gameManager.addSurvivalPlayer(socket.id, data.name, data.team);
    
    if (result.success) {
      socket.join(result.gameId);
      console.log(`🔗 Player ${data.name} joined socket room ${result.gameId}`);
      
      // Emit join result first
      socket.emit('join-result', {
        success: true,
        gameId: result.gameId,
        playerId: result.playerId,
        players: result.players,
        gameReady: result.gameReady,
        mode: 'survival'
      });
      console.log(`📤 Sent join-result to ${data.name}: gameReady=${result.gameReady}`);
      
      if (result.gameReady) {
        // Both players found, start the game immediately with predefined teams
        console.log('🎯 Two survival players matched! Starting battle...');
        const gameStart = gameManager.startSurvivalBattle(result.gameId);
        if (gameStart.success) {
          console.log('🚀 Starting survival battle immediately - skipping draft');
          // Emit to all players in the game room
          io.to(result.gameId).emit('game-start', {
            players: gameStart.players,
            gameState: gameStart.gameState,
            initiative: gameStart.initiative
          });
          console.log(`📡 Sent game-start event to all players in room ${result.gameId}`);
        } else {
          console.error('❌ Failed to start survival battle:', gameStart.message);
        }
      } else {
        // Still waiting for opponent
        console.log('⏳ Survival player waiting for opponent...');
      }
    } else {
      socket.emit('join-result', {
        success: false,
        message: result.message || 'Failed to join survival game'
      });
    }
  });

  // Handle survival search cancellation
  socket.on('cancel-survival-search', () => {
    const result = gameManager.cancelSurvivalSearch(socket.id);
    socket.emit('survival-search-cancelled', { success: result.success });
  });

  // Handle friendly battle room creation
  socket.on('create-friendly-room', (data) => {
    console.log('Creating friendly room:', data.roomName, 'by player:', data.playerName);
    
    // Check if room name already exists
    if (friendlyRooms.has(data.roomName)) {
      socket.emit('friendly-room-created', {
        success: false,
        message: 'Room name already exists. Please choose a different name.'
      });
      return;
    }

    // Create the game through GameManager with draft mode
    const result = gameManager.addPlayer(socket.id, data.playerName, 'draft');
    
    if (result.success) {
      // Store the friendly room information
      friendlyRooms.set(data.roomName, {
        gameId: result.gameId,
        creator: socket.id,
        players: [{ id: socket.id, name: data.playerName }],
        gameStarted: false
      });

      socket.join(result.gameId);
      
      socket.emit('friendly-room-created', {
        success: true,
        roomName: data.roomName,
        gameId: result.gameId,
        playerId: socket.id
      });
      
      console.log('Friendly room created:', data.roomName, 'gameId:', result.gameId);
    } else {
      socket.emit('friendly-room-created', {
        success: false,
        message: result.error || 'Failed to create room'
      });
    }
  });

  // Handle friendly battle room joining
  socket.on('join-friendly-room', (data) => {
    console.log('Joining friendly room:', data.roomName, 'by player:', data.playerName);
    
    // Check if room exists
    if (!friendlyRooms.has(data.roomName)) {
      socket.emit('friendly-room-joined', {
        success: false,
        message: 'Room not found. Please check the room name.'
      });
      return;
    }

    const room = friendlyRooms.get(data.roomName);
    
    // Check if room is already full or game has started
    if (room.players.length >= 2) {
      socket.emit('friendly-room-joined', {
        success: false,
        message: 'Room is full.'
      });
      return;
    }

    if (room.gameStarted) {
      socket.emit('friendly-room-joined', {
        success: false,
        message: 'Game has already started.'
      });
      return;
    }

    // Add player to the existing game
    const result = gameManager.addPlayerToGame(room.gameId, socket.id, data.playerName);
    
    if (result.success) {
      // Update room information
      room.players.push({ id: socket.id, name: data.playerName });
      
      socket.join(room.gameId);
      
      socket.emit('friendly-room-joined', {
        success: true,
        roomName: data.roomName,
        gameId: room.gameId,
        playerId: socket.id,
        players: result.players
      });

      // Start the draft phase since we now have 2 players
      if (result.gameReady) {
        room.gameStarted = true;
        io.to(room.gameId).emit('game-start', {
          players: result.players,
          draftCards: result.draftCards
        });
      }
      
      console.log('Player joined friendly room:', data.roomName, 'gameId:', room.gameId);
    } else {
      socket.emit('friendly-room-joined', {
        success: false,
        message: result.error || 'Failed to join room'
      });
    }
  });

  // Handle draft actions
  socket.on('ban-card', (data) => {
    console.log('Received ban-card from:', socket.id, 'card:', data.cardName);
    const result = gameManager.banCard(socket.id, data.cardName);
    if (result.success) {
      console.log('Sending ban-complete event:', result);
      io.to(result.gameId).emit('ban-complete', result);
    } else {
      console.log('Ban card error:', result.error);
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('pick-card', (data) => {
    const result = gameManager.pickCard(socket.id, data.cardName);
    if (result.success) {
      io.to(result.gameId).emit('pick-complete', result);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('set-attack-order', (data) => {
    const result = gameManager.setAttackOrder(socket.id, data.heroOrder);
    if (result.success) {
      io.to(result.gameId).emit('attack-order-set', result);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('auto-draft', () => {
    console.log('Auto-draft requested by:', socket.id);
    const result = gameManager.autoDraft(socket.id);
    if (result.success) {
      console.log('Auto-draft successful, emitting to game:', result.gameId);
      io.to(result.gameId).emit('auto-draft-complete', result);
    } else {
      console.log('Auto-draft error:', result.error);
      socket.emit('error', { message: result.error });
    }
  });

  // Handle battle actions
  socket.on('roll-initiative', () => {
    const result = gameManager.rollInitiative(socket.id);
    if (result.success) {
      io.to(result.gameId).emit('initiative-rolled', result);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('choose-turn-order', (data) => {
    const result = gameManager.chooseTurnOrder(socket.id, data.goFirst);
    if (result.success) {
      io.to(result.gameId).emit('battle-start', result);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('select-target', (data) => {
    console.log('🎯 Server received select-target:', data, 'from socket:', socket.id);
    const result = gameManager.selectTarget(socket.id, data.targetId);
    console.log('🎯 selectTarget result:', result);
    if (result.success) {
      io.to(result.gameId).emit('target-selected', result);
    } else {
      console.error('❌ Target selection failed:', result.error);
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('basic-attack', async (data) => {
    const result = gameManager.basicAttack(socket.id, data.targetId);
    if (result.success) {
      io.to(result.gameId).emit('attack-result', result);
      
      // Handle game completion for both regular and survival modes
      if (result.gameState && result.gameState.mode === 'survival') {
        await checkSurvivalGameCompletion(result);
      } else {
        await handleRegularGameCompletion(result);
      }
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('use-ability', async (data) => {
    const result = gameManager.useAbility(socket.id, data.abilityIndex, data.targetId, data.allyTargetId);
    if (result.success) {
      io.to(result.gameId).emit('ability-result', result);
      
      // Handle game completion for both regular and survival modes
      if (result.gameState && result.gameState.mode === 'survival') {
        await checkSurvivalGameCompletion(result);
      } else {
        await handleRegularGameCompletion(result);
      }
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('use-timekeeper-selected-ability', async (data) => {
    const result = gameManager.useTimekeeperSelectedAbility(socket.id, data.timekeeperTargetId, data.allyTargetId, data.selectedAbilityIndex);
    if (result.success) {
      io.to(result.gameId).emit('ability-result', result);
      
      // Handle game completion for both regular and survival modes
      if (result.gameState && result.gameState.mode === 'survival') {
        await checkSurvivalGameCompletion(result);
      } else {
        await handleRegularGameCompletion(result);
      }
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('end-turn', () => {
    const result = gameManager.endTurn(socket.id);
    if (result.success) {
      io.to(result.gameId).emit('turn-ended', result);
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('surrender-game', async () => {
    const result = gameManager.surrenderGame(socket.id);
    if (result.success) {
      io.to(result.gameId).emit('game-surrendered', result);
      
      // Handle game completion for both regular and survival modes
      if (result.gameState && result.gameState.mode === 'survival') {
        await checkSurvivalGameCompletion(result);
      } else {
        await handleRegularGameCompletion(result);
      }
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  // Handle reconnection
  socket.on('reconnect-game', (data) => {
    const result = gameManager.reconnectPlayer(socket.id, data.gameId, data.playerName);
    if (result.success) {
      socket.join(result.gameId);
      socket.emit('reconnect-success', result.gameState);
    } else {
      socket.emit('reconnect-failed', { message: result.error });
    }
  });

  // Handle survival state requests
  socket.on('get-survival-state', () => {
    const state = gameManager.getSurvivalState(socket.id);
    socket.emit('survival-state-response', { state });
  });

  socket.on('reset-survival-state', () => {
    const state = gameManager.resetSurvivalState(socket.id);
    socket.emit('survival-state-update', {
      type: 'reset',
      state,
      message: 'Survival run reset successfully!'
    });
  });

  socket.on('return-to-lobby', () => {
    console.log('🏠 Player returning to lobby:', socket.id);
    
    // Remove player from any active game but preserve survival state
    const result = gameManager.returnToLobby(socket.id);
    
    if (result.success) {
      socket.emit('returned-to-lobby', {
        success: true,
        preservedSurvivalState: result.preservedSurvivalState
      });
      console.log('✅ Player successfully returned to lobby with survival state preserved');
    } else {
      socket.emit('returned-to-lobby', {
        success: false,
        error: result.error || 'Failed to return to lobby'
      });
      console.log('❌ Failed to return player to lobby:', result.error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log('Player disconnected:', socket.id, 'Reason:', reason);
    gameManager.handleDisconnect(socket.id);
    
    // Clean up user session
    const userId = userSessions.get(socket.id);
    if (userId) {
      loggedInUsers.delete(userId);
      userSessions.delete(socket.id);
      console.log('User logged out:', userId);
    }
    
    // Clean up game manager user session mapping
    gameManager.userSessions.delete(socket.id);
    
    // Clean up friendly rooms
    for (const [roomName, room] of friendlyRooms.entries()) {
      if (room.creator === socket.id || room.players.some(p => p.id === socket.id)) {
        console.log('Cleaning up friendly room:', roomName);
        friendlyRooms.delete(roomName);
        break;
      }
    }
  });
});

// API endpoints
app.get('/api/game/:gameId', (req, res) => {
  const gameState = gameManager.getGameState(req.params.gameId);
  if (gameState) {
    res.json(gameState);
  } else {
    res.status(404).json({ error: 'Game not found' });
  }
});

server.listen(PORT, () => {
  console.log(`Hero's Call server running on port ${PORT}`);
  console.log('Server startup completed successfully');
});

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = { app, server, io };