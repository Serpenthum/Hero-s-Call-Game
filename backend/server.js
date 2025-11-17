console.log('Starting server initialization...');

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

console.log('Basic modules loaded successfully');

(async () => {


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
    origin: [
      "http://localhost:5173", 
      "http://localhost:3000", 
      "http://127.0.0.1:5173",
      "https://heroescall.8363742.xyz"
    ],
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: [
    "http://localhost:5173", 
    "http://localhost:3000", 
    "http://127.0.0.1:5173", 
    "http://localhost:4173",
    "https://heroescall.8363742.xyz"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Serve hero images
app.use('/hero-images', express.static(path.join(__dirname, '../frontend/hero-images')));

// Serve login images
app.use('/login-images', express.static(path.join(__dirname, '../frontend/public/login-images')));

// Load heroes data dynamically to avoid caching issues
const getHeroes = () => {
  // Clear require cache for heroes.json to always get fresh data
  delete require.cache[require.resolve('./heros.json')];
  return require('./heros.json');
};

const heroes = getHeroes();

// Initialize database
const database = new Database();
await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait a moment to ensure database is ready

// Refresh available heroes for all users to include newly enabled heroes like Engineer
setTimeout(() => {
  database.refreshAvailableHeroes();
}, 10000); // Small delay to ensure database tables are created first

// Session management for authentication
const userSessions = new Map(); // socketId -> userId
const loggedInUsers = new Map(); // userId -> socketId (to track who is logged in)
const onlinePlayersCache = new Map(); // socketId -> last request time (for rate limiting)

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
    
    // Get complete player stats
    const playerStats = await database.getPlayerStats(user.id);
    
    // Get favorite heroes
    const favoriteHeroes = await database.getFavoriteHeroes(user.id);
    
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
        available_heroes: user.available_heroes,
        favorite_heroes: favoriteHeroes,
        xp: playerStats.xp || 0,
        level: playerStats.level || 1,
        total_wins: playerStats.total_wins || 0,
        total_losses: playerStats.total_losses || 0,
        highest_survival_run: playerStats.highest_survival_run || 0
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

    // Delete all chat history for this user
    database.deleteAllUserMessages(parseInt(userId)).catch(err => {
      console.error('Error deleting user messages on logout:', err);
    });

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
    
    // Get player stats (XP, level, wins, losses, etc.)
    const playerStats = await database.getPlayerStats(user.id);
    
    res.json({ 
      success: true, 
      user: {
        id: user.id,
        username: user.username,
        victory_points: user.victory_points,
        survival_wins: user.survival_wins,
        survival_losses: user.survival_losses,
        survival_used_heroes: user.survival_used_heroes,
        available_heroes: user.available_heroes,
        xp: playerStats.xp,
        level: playerStats.level,
        total_wins: playerStats.total_wins,
        total_losses: playerStats.total_losses,
        highest_survival_run: playerStats.highest_survival_run
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

// API endpoint to get player stats
app.get('/api/player-stats/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const stats = await database.getPlayerStats(userId);
    res.json({ 
      success: true, 
      stats
    });
  } catch (error) {
    console.error('Get player stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to get player stats' 
    });
  }
});

// API endpoint to update profile icon
app.post('/api/update-profile-icon', async (req, res) => {
  try {
    const { userId, heroName } = req.body;
    
    if (!userId || !heroName) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID and hero name are required' 
      });
    }

    await database.updateProfileIcon(userId, heroName);
    res.json({ 
      success: true, 
      message: 'Profile icon updated successfully' 
    });
  } catch (error) {
    console.error('Update profile icon error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to update profile icon' 
    });
  }
});

// API endpoint to toggle favorite hero
app.post('/api/toggle-favorite-hero', async (req, res) => {
  try {
    const { userId, heroName } = req.body;
    
    if (!userId || !heroName) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID and hero name are required' 
      });
    }

    const result = await database.toggleFavoriteHero(userId, heroName);
    res.json(result);
  } catch (error) {
    console.error('Toggle favorite hero error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to toggle favorite hero' 
    });
  }
});

// API endpoint to get favorite heroes
app.get('/api/favorite-heroes/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }

    const favoriteHeroes = await database.getFavoriteHeroes(userId);
    res.json({ success: true, favoriteHeroes });
  } catch (error) {
    console.error('Get favorite heroes error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to get favorite heroes' 
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

// Inject the io instance into gameManager for disconnection countdown events
// This will be done after io is defined

// Friendly rooms management
const friendlyRooms = new Map(); // roomName -> { gameId, creator, players, gameStarted }

// Helper function to check and handle regular game completion (draft/random modes)
async function handleRegularGameCompletion(result) {
  if (result.success && result.gameState && result.gameState.winner && result.gameState.mode !== 'survival') {
    console.log(`🏆 Regular game (${result.gameState.mode}) completed! Winner: ${result.gameState.winner}`);
    
    try {
      // Find winner and loser players
      const winnerPlayer = result.gameState.players.find(p => p.id === result.gameState.winner);
      const loserPlayer = result.gameState.players.find(p => p.id !== result.gameState.winner);
      
      if (winnerPlayer && loserPlayer) {
        // Update stats for both players
        const winnerUserId = userSessions.get(winnerPlayer.id);
        const loserUserId = userSessions.get(loserPlayer.id);
        
        // Ensure these are actual players, not spectators
        const winnerIsSpectator = result.gameState.spectators?.some(s => s.socketId === winnerPlayer.id);
        const loserIsSpectator = result.gameState.spectators?.some(s => s.socketId === loserPlayer.id);
        
        if (winnerUserId && !winnerIsSpectator) {
          // Update winner stats and XP
          const winnerStatsUpdate = await database.updatePlayerStats(winnerUserId, true, result.gameState.mode);
          const winnerXPUpdate = await database.updatePlayerXP(winnerUserId, winnerStatsUpdate.xpGain);
          
          // Track hero usage for winner's team
          for (const hero of winnerPlayer.team) {
            await database.updateHeroUsage(winnerUserId, hero.name);
          }
          
          // Get updated victory points and user data
          const winnerUser = await database.getUserById(winnerUserId);
          
          // Emit victory points update to the winner
          io.to(result.gameState.winner).emit('victory-points-update', {
            type: 'game_win',
            pointsAwarded: 1,
            totalVictoryPoints: winnerUser.victory_points,
            gameMode: result.gameState.mode,
            message: `Victory! You earned 1 victory point. Total: ${winnerUser.victory_points}`
          });
          
          // Emit XP update to winner
          io.to(result.gameState.winner).emit('xp-update', {
            xpGained: winnerXPUpdate.xpGained,
            newXP: winnerXPUpdate.xp,
            newLevel: winnerXPUpdate.level,
            leveledUp: winnerXPUpdate.leveledUp,
            message: winnerXPUpdate.leveledUp ? 
              `Level up! You're now level ${winnerXPUpdate.level}! (+${winnerXPUpdate.xpGained} XP)` :
              `+${winnerXPUpdate.xpGained} XP! (${winnerXPUpdate.xp} total)`
          });
          
          console.log(`📡 Updated winner stats: +${winnerStatsUpdate.xpGain} XP, level ${winnerXPUpdate.level}`);
        }
        
        if (loserUserId && !loserIsSpectator) {
          // Update loser stats and XP
          const loserStatsUpdate = await database.updatePlayerStats(loserUserId, false, result.gameState.mode);
          const loserXPUpdate = await database.updatePlayerXP(loserUserId, loserStatsUpdate.xpGain);
          
          // Track hero usage for loser's team
          for (const hero of loserPlayer.team) {
            await database.updateHeroUsage(loserUserId, hero.name);
          }
          
          // Emit XP update to loser
          if (loserStatsUpdate.xpGain > 0) {
            io.to(loserPlayer.id).emit('xp-update', {
              xpGained: loserXPUpdate.xpGained,
              newXP: loserXPUpdate.xp,
              newLevel: loserXPUpdate.level,
              leveledUp: loserXPUpdate.leveledUp,
              message: loserXPUpdate.leveledUp ? 
                `Level up! You're now level ${loserXPUpdate.level}! (+${loserXPUpdate.xpGained} XP)` :
                `+${loserXPUpdate.xpGained} XP! (${loserXPUpdate.xp} total)`
            });
          }
          
          console.log(`📡 Updated loser stats: +${loserStatsUpdate.xpGain} XP, level ${loserXPUpdate.level}`);
        }
      }
    } catch (error) {
      console.error('❌ Error updating player stats for regular game:', error);
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
      // Update survival states (now async)
      const winnerState = await gameManager.updateSurvivalWin(winnerPlayer.id, winnerPlayer.team);
      const loserState = await gameManager.updateSurvivalLoss(loserPlayer.id, loserPlayer.team);
      
      console.log('🏆 Winner new state:', winnerState);
      console.log('💀 Loser new state:', loserState);
      
      // Update player stats for both players
      try {
        const winnerUserId = userSessions.get(winnerPlayer.id);
        const loserUserId = userSessions.get(loserPlayer.id);
        
        // Ensure these are actual players, not spectators
        const winnerIsSpectator = result.gameState.spectators?.some(s => s.socketId === winnerPlayer.id);
        const loserIsSpectator = result.gameState.spectators?.some(s => s.socketId === loserPlayer.id);
        
        // Track hero usage for both players
        if (winnerUserId && !winnerIsSpectator) {
          // Track hero usage
          for (const hero of winnerPlayer.team) {
            await database.updateHeroUsage(winnerUserId, hero.name);
          }
          
          // If winner reached 7 wins (run complete), update their survival stats
          if (winnerState.runEnded) {
            console.log(`🏆 Winner reached 7 wins - updating survival stats for user ${winnerUserId}`);
            const winnerSurvivalStats = await database.updateSurvivalStats(winnerUserId, winnerState.wins);
            
            // Update XP for the perfect survival run
            if (winnerSurvivalStats.xpGain > 0) {
              const xpUpdate = await database.updatePlayerXP(winnerUserId, winnerSurvivalStats.xpGain);
              
              // Emit XP update to winner
              io.to(winnerPlayer.id).emit('xp-update', {
                xpGained: xpUpdate.xpGained,
                newXP: xpUpdate.xp,
                newLevel: xpUpdate.level,
                leveledUp: xpUpdate.leveledUp,
                message: xpUpdate.leveledUp ? 
                  `Level up! You're now level ${xpUpdate.level}! (+${xpUpdate.xpGained} XP from perfect survival run!)` :
                  `+${xpUpdate.xpGained} XP from your perfect 7-win survival run! (${xpUpdate.xp} total)`
              });
            }
            
            console.log(`📡 Updated survival stats for winner: ${winnerState.wins} wins, +${winnerSurvivalStats.xpGain} XP, highest: ${winnerSurvivalStats.newHighest}`);
          }
        }
        
        if (loserUserId && !loserIsSpectator) {
          // Update survival stats for the loser (whose run just ended)
          const survivalStats = await database.updateSurvivalStats(loserUserId, loserState.wins);
          
          // Update XP for the survival run
          if (survivalStats.xpGain > 0) {
            const xpUpdate = await database.updatePlayerXP(loserUserId, survivalStats.xpGain);
            
            // Emit XP update to loser
            io.to(loserPlayer.id).emit('xp-update', {
              xpGained: xpUpdate.xpGained,
              newXP: xpUpdate.xp,
              newLevel: xpUpdate.level,
              leveledUp: xpUpdate.leveledUp,
              message: xpUpdate.leveledUp ? 
                `Level up! You're now level ${xpUpdate.level}! (+${xpUpdate.xpGained} XP from survival run)` :
                `+${xpUpdate.xpGained} XP from your ${loserState.wins}-win survival run! (${xpUpdate.xp} total)`
            });
          }
          
          // Track hero usage for loser's team
          for (const hero of loserPlayer.team) {
            await database.updateHeroUsage(loserUserId, hero.name);
          }
          
          console.log(`📡 Updated survival stats: ${loserState.wins} wins, +${survivalStats.xpGain} XP, highest: ${survivalStats.newHighest}`);
        }
        
        // Get updated victory points for both players
        let loserVictoryPoints = null;
        let winnerVictoryPoints = null;
        
        if (loserUserId) {
          const loserUser = await database.getUserById(loserUserId);
          loserVictoryPoints = loserUser.victory_points;
        }
        
        if (winnerUserId) {
          const winnerUser = await database.getUserById(winnerUserId);
          winnerVictoryPoints = winnerUser.victory_points;
        }
        
        // Emit survival state updates to both players
        io.to(winnerPlayer.id).emit('survival-state-update', {
          type: 'win',
          state: winnerState,
          runEnded: winnerState.runEnded || false,
          victoryPoints: winnerVictoryPoints,
          message: winnerState.runEnded ? 
            `Perfect run! You earned ${winnerState.wins} victory points for your 7 wins!` :
            `Victory! You now have ${winnerState.wins} wins and ${winnerState.losses} losses.`
        });
        
        io.to(loserPlayer.id).emit('survival-state-update', {
          type: 'loss', 
          state: loserState,
          runEnded: loserState.runEnded || false,
          victoryPoints: loserVictoryPoints,
          message: loserState.runEnded ? 
            `Run ended! You earned ${loserState.wins} victory points for your ${loserState.wins} wins.` :
            `Defeat! You now have ${loserState.wins} wins and ${loserState.losses} losses.`
        });
        
        console.log('📡 Sent survival state updates to both players with victory points');
      } catch (error) {
        console.error('❌ Error getting updated victory points:', error);
        
        // Fall back to basic messages without victory points
        io.to(winnerPlayer.id).emit('survival-state-update', {
          type: 'win',
          state: winnerState,
          runEnded: winnerState.runEnded || false,
          message: `Victory! You now have ${winnerState.wins} wins and ${winnerState.losses} losses.`
        });
        
        io.to(loserPlayer.id).emit('survival-state-update', {
          type: 'loss', 
          state: loserState,
          runEnded: loserState.runEnded || false,
          message: loserState.runEnded ? 
            `Run ended! You earned ${loserState.wins} victory points for your ${loserState.wins} wins.` :
            `Defeat! You now have ${loserState.wins} wins and ${loserState.losses} losses.`
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

// Inject io instance into gameManager for disconnection countdown events
gameManager.setIo(io);

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
        
        // If the existing socket is still connected, allow takeover but disconnect old session
        if (existingSocket && existingSocket.connected) {
          console.log('User', userId, 'logging in from new session - disconnecting old session');
          existingSocket.emit('force-logout', { 
            message: 'Your account has been logged in from another session.' 
          });
          existingSocket.disconnect();
          // Clean up old session
          userSessions.delete(existingSocketId);
          loggedInUsers.delete(userId);
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
  socket.on('join-game', async (playerData) => {
    const mode = playerData.mode || 'draft';
    console.log(`🎮 Server received join-game: name="${playerData.name}", mode="${mode}", socketId="${socket.id}"`);
    
    // Get user profile icon if user is authenticated
    let profileIcon = 'Sorcerer'; // Default profile icon
    const userId = userSessions.get(socket.id);
    if (userId) {
      try {
        const playerStats = await database.getPlayerStats(userId);
        if (playerStats && playerStats.profile_icon) {
          profileIcon = playerStats.profile_icon;
        }
      } catch (error) {
        console.log('Failed to fetch profile icon for user:', userId, error);
      }
    }
    
    const result = gameManager.addPlayer(socket.id, playerData.name || 'Anonymous', mode, profileIcon);
    
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
  socket.on('join-survival-game', async (data) => {
    console.log('Player joining survival game:', data.name, 'with team:', data.team.map(h => h.name));
    
    // Get user profile icon if user is authenticated
    let profileIcon = 'Sorcerer'; // Default profile icon
    const userId = userSessions.get(socket.id);
    if (userId) {
      try {
        const playerStats = await database.getPlayerStats(userId);
        if (playerStats && playerStats.profile_icon) {
          profileIcon = playerStats.profile_icon;
        }
      } catch (error) {
        console.log('Failed to fetch profile icon for survival user:', userId, error);
      }
    }
    
    const result = gameManager.addSurvivalPlayer(socket.id, data.name, data.team, profileIcon);
    
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

  // Handle general search cancellation (draft/random modes)
  socket.on('cancel-search', () => {
    const result = gameManager.cancelSearch(socket.id);
    socket.emit('search-cancelled', { success: result.success });
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
      // Store the room name in the game object for spectator visibility
      const game = gameManager.games.get(result.gameId);
      if (game) {
        game.roomName = data.roomName;
      }

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

  socket.on('abandon-draft', () => {
    const gameId = gameManager.playerGameMap.get(socket.id);
    if (!gameId) {
      socket.emit('abandon-draft-result', { success: false, message: 'No active game found' });
      return;
    }

    const game = gameManager.games.get(gameId);
    if (!game) {
      socket.emit('abandon-draft-result', { success: false, message: 'Game not found' });
      return;
    }

    // Only allow abandoning during draft or setup phase
    if (game.phase !== 'draft' && game.phase !== 'setup') {
      socket.emit('abandon-draft-result', { success: false, message: 'Can only abandon during draft phase' });
      return;
    }

    console.log(`🚫 Draft abandoned in game ${gameId}`);

    // Notify both players that draft was abandoned
    io.to(gameId).emit('draft-abandoned', {
      message: 'Draft has been abandoned. Returning to lobby...'
    });

    // Clean up the game
    game.players.forEach(player => {
      gameManager.playerGameMap.delete(player.id);
    });
    gameManager.games.delete(gameId);

    socket.emit('abandon-draft-result', { success: true });
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

  socket.on('activate-special', async (data) => {
    const result = gameManager.activateSpecial(socket.id);
    if (result.success) {
      io.to(result.gameId).emit('special-activated', result);
      
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
  socket.on('get-survival-state', async () => {
    const state = await gameManager.getSurvivalState(socket.id);
    socket.emit('survival-state-response', { state });
  });

  socket.on('reset-survival-state', async () => {
    const result = await gameManager.resetSurvivalState(socket.id);
    const victoryPointsAwarded = result.victoryPointsAwarded || 0;
    
    // Create appropriate message based on whether victory points were awarded
    let message = 'Survival run reset successfully!';
    if (victoryPointsAwarded > 0) {
      message = `Survival run abandoned! You earned ${victoryPointsAwarded} victory points for your wins.`;
      
      // Also send a victory points update with the new total
      const userId = userSessions.get(socket.id);
      if (userId) {
        try {
          const user = await database.getUserById(userId);
          socket.emit('victory-points-update', {
            type: 'survival_abandon',
            pointsAwarded: victoryPointsAwarded,
            totalVictoryPoints: user.victory_points,
            message: `Survival run abandoned! You earned ${victoryPointsAwarded} victory points. Total: ${user.victory_points}`
          });
        } catch (error) {
          console.error('❌ Error sending victory points update for survival abandon:', error);
        }
      }
    }
    
    socket.emit('survival-state-update', {
      type: 'reset',
      state: result,
      message,
      victoryPoints: victoryPointsAwarded
    });
  });

  socket.on('return-to-lobby', async () => {
    console.log('🏠 Player returning to lobby:', socket.id);
    
    // Remove player from any active game but preserve survival state
    const result = await gameManager.returnToLobby(socket.id);
    
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

  // Friends system socket events
  socket.on('get-online-players', async () => {
    try {
      const currentUserId = userSessions.get(socket.id);
      console.log('🟢 get-online-players request from socket:', socket.id, 'userId:', currentUserId);
      console.log('🟢 Current loggedInUsers:', Array.from(loggedInUsers.entries()));
      
      if (!currentUserId) {
        console.log('❌ User not authenticated for socket:', socket.id);
        socket.emit('online-players-response', { success: false, error: 'Not authenticated' });
        return;
      }

      // Rate limiting: allow one request per 2 seconds per socket
      const now = Date.now();
      const lastRequest = onlinePlayersCache.get(socket.id) || 0;
      if (now - lastRequest < 2000) {
        console.log('🟡 Rate limited get-online-players request from socket:', socket.id);
        socket.emit('online-players-response', { success: false, error: 'Rate limited. Please wait before requesting again.' });
        return;
      }
      onlinePlayersCache.set(socket.id, now);

      // Get list of online players
      const onlinePlayers = [];
      for (const [userId, socketId] of loggedInUsers.entries()) {
        if (userId !== currentUserId) {
          const user = await database.getUserById(userId);
          if (user) {
            onlinePlayers.push({
              id: user.id,
              username: user.username,
              isInGame: gameManager.isPlayerInActiveGame(socketId)
            });
          }
        }
      }

      console.log('🟢 Found online players:', onlinePlayers);

      // Get user's friends list
      const friends = await database.getFriends(currentUserId);
      const friendIds = friends.map(f => f.id);

      const response = {
        success: true,
        onlinePlayers,
        totalOnline: onlinePlayers.length + 1, // +1 for current user
        friendIds
      };
      
      console.log('🟢 Sending online-players-response:', response);
      socket.emit('online-players-response', response);
    } catch (error) {
      console.error('❌ Error getting online players:', error);
      socket.emit('online-players-response', { success: false, error: 'Failed to get online players' });
    }
  });

  socket.on('send-friend-request', async (data) => {
    try {
      const senderId = userSessions.get(socket.id);
      if (!senderId) {
        socket.emit('friend-request-response', { success: false, error: 'Not authenticated' });
        return;
      }

      const targetUser = await database.getUserByUsername(data.username);
      if (!targetUser) {
        socket.emit('friend-request-response', { success: false, error: 'User not found' });
        return;
      }

      const result = await database.sendFriendRequest(senderId, targetUser.id);
      socket.emit('friend-request-response', { success: true, message: 'Friend request sent!' });

      // Notify the target user if they're online
      const targetSocketId = loggedInUsers.get(targetUser.id);
      if (targetSocketId) {
        const sender = await database.getUserById(senderId);
        io.to(targetSocketId).emit('friend-request-received', {
          from: sender.username,
          fromId: senderId
        });
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      socket.emit('friend-request-response', { success: false, error: error.message });
    }
  });

  socket.on('respond-friend-request', async (data) => {
    try {
      const userId = userSessions.get(socket.id);
      if (!userId) {
        socket.emit('friend-response-result', { success: false, error: 'Not authenticated' });
        return;
      }

      if (data.accept) {
        await database.acceptFriendRequest(userId, data.requesterId);
        socket.emit('friend-response-result', { success: true, message: 'Friend request accepted!' });
        
        // Notify the requester if they're online
        const requesterSocketId = loggedInUsers.get(data.requesterId);
        if (requesterSocketId) {
          const user = await database.getUserById(userId);
          io.to(requesterSocketId).emit('friend-request-accepted', {
            from: user.username,
            fromId: userId
          });
        }
      } else {
        await database.rejectFriendRequest(userId, data.requesterId);
        socket.emit('friend-response-result', { success: true, message: 'Friend request rejected.' });
      }
    } catch (error) {
      console.error('Error responding to friend request:', error);
      socket.emit('friend-response-result', { success: false, error: error.message });
    }
  });

  socket.on('get-friend-requests', async () => {
    try {
      const userId = userSessions.get(socket.id);
      if (!userId) {
        socket.emit('friend-requests-response', { success: false, error: 'Not authenticated' });
        return;
      }

      const requests = await database.getFriendRequests(userId);
      socket.emit('friend-requests-response', { success: true, requests });
    } catch (error) {
      console.error('Error getting friend requests:', error);
      socket.emit('friend-requests-response', { success: false, error: 'Failed to get friend requests' });
    }
  });

  socket.on('remove-friend', async (data) => {
    try {
      const userId = userSessions.get(socket.id);
      if (!userId) {
        socket.emit('remove-friend-response', { success: false, error: 'Not authenticated' });
        return;
      }

      await database.removeFriend(userId, data.friendId);
      socket.emit('remove-friend-response', { success: true, message: 'Friend removed successfully' });
      
      // Notify the removed friend if they're online
      const friendSocketId = loggedInUsers.get(data.friendId);
      if (friendSocketId) {
        const user = await database.getUserById(userId);
        io.to(friendSocketId).emit('friend-removed', {
          from: user.username,
          fromId: userId
        });
      }
    } catch (error) {
      console.error('Error removing friend:', error);
      socket.emit('remove-friend-response', { success: false, error: error.message });
    }
  });

  socket.on('send-message', async (data) => {
    try {
      const senderId = userSessions.get(socket.id);
      if (!senderId) {
        socket.emit('message-response', { success: false, error: 'Not authenticated' });
        return;
      }

      const message = await database.sendMessage(senderId, data.targetUserId, data.message);
      const sender = await database.getUserById(senderId);
      
      socket.emit('message-response', { success: true, message });

      // Send message to target user if they're online
      const targetSocketId = loggedInUsers.get(data.targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('message-received', {
          ...message,
          sender_username: sender.username
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('message-response', { success: false, error: 'Failed to send message' });
    }
  });

  socket.on('get-messages', async (data) => {
    try {
      const userId = userSessions.get(socket.id);
      if (!userId) {
        socket.emit('messages-response', { success: false, error: 'Not authenticated' });
        return;
      }

      const messages = await database.getMessages(userId, data.targetUserId, data.limit || 50);
      socket.emit('messages-response', { success: true, messages });
    } catch (error) {
      console.error('Error getting messages:', error);
      socket.emit('messages-response', { success: false, error: 'Failed to get messages' });
    }
  });

  // ==================== SPECTATOR SOCKET EVENTS ====================

  socket.on('get-spectatable-games', () => {
    const spectatableGames = gameManager.getSpectatableGames();
    socket.emit('spectatable-games-list', { success: true, games: spectatableGames });
  });

  socket.on('check-player-spectatable', (data) => {
    // data.playerId is actually the user ID from the database
    // We need to find the socket ID for this user
    let targetSocketId = null;
    for (const [socketId, userId] of userSessions.entries()) {
      if (userId === parseInt(data.playerId)) {
        targetSocketId = socketId;
        break;
      }
    }

    if (!targetSocketId) {
      socket.emit('player-spectatable-result', { 
        success: true, 
        canSpectate: false 
      });
      return;
    }

    const gameInfo = gameManager.getPlayerSpectatableGame(targetSocketId);
    if (gameInfo) {
      socket.emit('player-spectatable-result', { 
        success: true, 
        canSpectate: true,
        gameInfo: {
          ...gameInfo,
          playerId: targetSocketId // Send the socket ID for spectating
        }
      });
    } else {
      socket.emit('player-spectatable-result', { 
        success: true, 
        canSpectate: false 
      });
    }
  });

  socket.on('spectate-game', async (data) => {
    try {
      const userId = userSessions.get(socket.id);
      if (!userId) {
        socket.emit('spectate-result', { success: false, error: 'Not authenticated' });
        return;
      }

      const user = await database.getUserById(userId);
      const result = gameManager.addSpectator(
        socket.id, 
        user.username, 
        data.gameId, 
        data.spectatingPlayerId
      );

      if (result.success) {
        // Join the socket room for this game
        socket.join(result.gameId);
        
        // Send the game state to the spectator
        socket.emit('spectate-result', {
          success: true,
          gameId: result.gameId,
          gameState: result.gameState,
          spectatingPlayerId: result.spectatingPlayerId
        });

        // Notify all players in the game about the new spectator
        io.to(result.gameId).emit('spectator-update', {
          type: 'joined',
          spectatorUsername: user.username,
          spectatorCount: result.spectatorCount,
          spectatorList: result.spectatorList
        });

        console.log(`👁️ ${user.username} is now spectating game ${result.gameId}`);
      } else {
        socket.emit('spectate-result', { success: false, error: result.error });
      }
    } catch (error) {
      console.error('Error spectating game:', error);
      socket.emit('spectate-result', { success: false, error: 'Failed to join as spectator' });
    }
  });

  socket.on('leave-spectate', () => {
    const result = gameManager.removeSpectator(socket.id);
    
    if (result.success) {
      // Leave the socket room
      socket.leave(result.gameId);
      
      // Notify the spectator
      socket.emit('spectate-left', { success: true });

      // Notify all players in the game about the spectator leaving
      io.to(result.gameId).emit('spectator-update', {
        type: 'left',
        spectatorCount: result.spectatorCount,
        spectatorList: result.spectatorList
      });

      console.log(`👁️ Spectator left game ${result.gameId}`);
    } else {
      socket.emit('spectate-left', { success: false, error: result.error });
    }
  });

  socket.on('get-spectator-info', (data) => {
    const info = gameManager.getSpectatorInfo(data.gameId);
    socket.emit('spectator-info-response', { success: true, ...info });
  });

  // ==================== END SPECTATOR SOCKET EVENTS ====================

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log('Player disconnected:', socket.id, 'Reason:', reason);
    
    // IMPORTANT: Spectators must never receive XP or victory points
    // Check if user was spectating and clean up (spectators are NOT in playerGameMap)
    const spectatorInfo = gameManager.isSpectating(socket.id);
    if (spectatorInfo) {
      const result = gameManager.removeSpectator(socket.id);
      if (result.success) {
        // Notify players in the game about spectator leaving
        io.to(result.gameId).emit('spectator-update', {
          type: 'left',
          spectatorCount: result.spectatorCount,
          spectatorList: result.spectatorList
        });
        console.log(`👁️ Spectator ${spectatorInfo.username} disconnected from game ${result.gameId}`);
      }
      // Important: Don't call handleDisconnect for spectators since they're not in playerGameMap
      // Continue to clean up user session below
    } else {
      // Only call handleDisconnect if they're not a spectator (i.e., they might be a player)
      gameManager.handleDisconnect(socket.id);
    }
    
    // Check if user was a player in a game and notify spectators
    const gameId = gameManager.playerGameMap.get(socket.id);
    if (gameId) {
      const game = gameManager.games.get(gameId);
      if (game && game.spectators && game.spectators.length > 0) {
        const disconnectedPlayer = game.players.find(p => p.id === socket.id);
        if (disconnectedPlayer) {
          // Notify all spectators that a player disconnected
          game.spectators.forEach(spectator => {
            io.to(spectator.socketId).emit('spectated-player-disconnected', {
              playerId: socket.id,
              playerName: disconnectedPlayer.name
            });
          });
          console.log(`👁️ Notified ${game.spectators.length} spectators about ${disconnectedPlayer.name}'s disconnection`);
        }
      }
    }
    
    // Clean up user session
    const userId = userSessions.get(socket.id);
    if (userId) {
      // Delete all chat history for this user
      database.deleteAllUserMessages(userId).catch(err => {
        console.error('Error deleting user messages on disconnect:', err);
      });
      
      loggedInUsers.delete(userId);
      userSessions.delete(socket.id);
      console.log('User logged out:', userId);
    }
    
    // Clean up rate limiting cache
    onlinePlayersCache.delete(socket.id);
    
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

})();
