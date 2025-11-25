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
      "http://localhost:5174",
      "http://localhost:3000", 
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
      "https://heroescall.8363742.xyz"
    ],
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: [
    "http://localhost:5173", 
    "http://localhost:5174",
    "http://localhost:3000", 
    "http://127.0.0.1:5173", 
    "http://127.0.0.1:5174",
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

// Create admin accounts for testing
setTimeout(() => {
  database.createAdminAccounts();
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

// Admin auto-login endpoint - finds next available admin account
app.post('/api/admin-login', async (req, res) => {
  try {
    // Get all enabled heroes for admin accounts
    delete require.cache[require.resolve('./heros.json')];
    const allHeroes = require('./heros.json');
    const enabledHeroes = allHeroes.filter(hero => !hero.disabled).map(hero => hero.name);
    const heroesJson = JSON.stringify(enabledHeroes);

    // Find next available admin number by checking existing admins
    let adminNumber = 1;
    let adminFound = false;
    let user = null;
    
    // Try to find an admin that's not currently logged in
    while (!adminFound && adminNumber <= 100) { // Cap at 100 admins
      const adminUsername = `Admin${adminNumber}`;
      
      // Check if this admin exists
      const existingUser = await database.getUserByUsername(adminUsername);
      
      if (!existingUser) {
        // Admin doesn't exist, create it
        const hash = await bcrypt.hash('admin', 10);
        
        const userId = await new Promise((resolve, reject) => {
          database.db.run(
            'INSERT INTO users (username, password_hash, available_heroes, victory_points, favorite_heroes, best_gauntlet_trial, player_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [adminUsername, hash, heroesJson, 1000, '[]', 0, adminUsername],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });
        
        // Create player stats with level 10
        await new Promise((resolve, reject) => {
          database.db.run(
            'INSERT INTO player_stats (user_id, level, xp) VALUES (?, ?, ?)',
            [userId, 10, 1000],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        user = await database.getUserById(userId);
        console.log(`✅ Created and logging in as ${adminUsername}`);
        adminFound = true;
      } else {
        // Check if this admin is currently logged in
        const isLoggedIn = loggedInUsers.has(existingUser.id);
        
        if (!isLoggedIn) {
          // Admin exists and is not logged in, fetch full user data
          user = await database.getUserById(existingUser.id);
          console.log(`✅ Logging in as existing ${adminUsername}`);
          adminFound = true;
        } else {
          // This admin is logged in, try next number
          adminNumber++;
        }
      }
    }
    
    if (!user) {
      return res.status(500).json({ 
        success: false, 
        message: 'Could not create or find available admin account' 
      });
    }
    
    // Update last login
    await database.updateLastLogin(user.id);
    
    console.log('Admin user data being sent:', JSON.stringify({
      id: user.id,
      username: user.username,
      level: user.level,
      xp: user.xp,
      victory_points: user.victory_points,
      player_id: user.player_id
    }));
    
    res.json({ 
      success: true, 
      user: user,
      message: `Logged in as ${user.username}`
    });
  } catch (error) {
    console.error('Admin auto-login error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to auto-login as admin' 
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

// Shop API endpoints

// Get current shop rotation (6 heroes that refresh every 6 hours)
app.get('/api/shop/rotation', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }

    // Get user data to know which heroes they own
    const user = await database.getUserById(parseInt(userId));
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get all enabled heroes that the user doesn't own
    const enabledHeroes = heroes.filter(h => !h.disabled && !user.available_heroes.includes(h.name));
    
    // Calculate current rotation seed (changes every 15 minutes)
    const now = new Date();
    const rotationSeed = Math.floor(now.getTime() / (15 * 60 * 1000));
    
    // Shuffle unowned enabled heroes using the rotation seed
    const shuffled = [...enabledHeroes];
    let seed = rotationSeed;
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Take the first 6 heroes from the shuffled list (this is the rotation)
    const rotationHeroes = shuffled.slice(0, Math.min(6, shuffled.length));
    
    // All heroes in rotation are unowned
    const rotationWithStatus = rotationHeroes.map(hero => ({
      ...hero,
      owned: false
    }));

    res.json({ 
      success: true, 
      heroes: rotationWithStatus,
      rotationSeed 
    });
  } catch (error) {
    console.error('Get shop rotation error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to get shop rotation' 
    });
  }
});

app.post('/api/shop/purchase-hero', async (req, res) => {
  try {
    const { userId, heroName } = req.body;
    
    if (!userId || !heroName) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID and hero name are required' 
      });
    }

    // Get user data
    const user = await database.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if user has enough VP
    if (user.victory_points < 5) {
      return res.status(400).json({ success: false, message: 'Not enough Victory Points' });
    }

    // Check if hero is enabled
    const hero = heroes.find(h => h.name === heroName);
    if (!hero || hero.disabled) {
      return res.status(400).json({ success: false, message: 'Hero not available' });
    }

    // Check if user already owns the hero
    if (user.available_heroes.includes(heroName)) {
      return res.status(400).json({ success: false, message: 'Hero already owned' });
    }

    // Deduct VP and add hero
    const updatedHeroes = [...user.available_heroes, heroName];
    const newVP = user.victory_points - 5;

    await new Promise((resolve, reject) => {
      database.db.run(
        'UPDATE users SET available_heroes = ?, victory_points = ? WHERE id = ?',
        [JSON.stringify(updatedHeroes), newVP, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    console.log(`✅ User ${userId} purchased ${heroName} for 5 VP`);
    res.json({ 
      success: true, 
      message: `${heroName} purchased successfully!`,
      newVP,
      heroName,
      available_heroes: updatedHeroes,
      heroCount: updatedHeroes.length
    });
  } catch (error) {
    console.error('Purchase hero error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to purchase hero' 
    });
  }
});

app.post('/api/shop/purchase-pack', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required' 
      });
    }

    // Get user data
    const user = await database.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if user has enough VP
    if (user.victory_points < 12) {
      return res.status(400).json({ success: false, message: 'Not enough Victory Points' });
    }

    // Get all unowned enabled heroes
    const enabledHeroes = heroes.filter(h => !h.disabled);
    const unownedHeroes = enabledHeroes.filter(h => !user.available_heroes.includes(h.name));

    if (unownedHeroes.length === 0) {
      return res.status(400).json({ success: false, message: 'All heroes already owned' });
    }

    // Select 3 random heroes (or fewer if less than 3 remaining)
    const heroesToGive = Math.min(3, unownedHeroes.length);
    const shuffled = unownedHeroes.sort(() => Math.random() - 0.5);
    const selectedHeroes = shuffled.slice(0, heroesToGive);
    const heroNames = selectedHeroes.map(h => h.name);

    // Deduct VP and add heroes
    const updatedHeroes = [...user.available_heroes, ...heroNames];
    const newVP = user.victory_points - 12;

    await new Promise((resolve, reject) => {
      database.db.run(
        'UPDATE users SET available_heroes = ?, victory_points = ? WHERE id = ?',
        [JSON.stringify(updatedHeroes), newVP, userId],
        function(err) {
          if (err) {
            console.error('❌ Failed to update user after pack purchase:', err);
            reject(err);
          } else {
            console.log(`✅ Database updated: User ${userId} now has ${updatedHeroes.length} heroes, ${newVP} VP`);
            resolve();
          }
        }
      );
    });

    // Verify the update by reading back from database
    const verifyUser = await database.getUserById(userId);
    console.log(`✅ Verified user ${userId} heroes count: ${verifyUser.available_heroes.length}`);

    console.log(`✅ User ${userId} purchased pack for 12 VP, received: ${heroNames.join(', ')}`);
    res.json({ 
      success: true, 
      message: `Pack opened! Received ${heroesToGive} hero${heroesToGive > 1 ? 'es' : ''}`,
      newVP,
      heroesReceived: heroNames,
      available_heroes: updatedHeroes,
      heroCount: updatedHeroes.length
    });
  } catch (error) {
    console.error('Purchase pack error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to purchase pack' 
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
  // Handle tie games
  if (result.success && result.gameState && result.gameState.winner === 'TIE' && result.gameState.mode !== 'survival') {
    console.log(`🤝 TIE game (${result.gameState.mode})! Both players eliminated!`);
    
    try {
      const player1 = result.gameState.players[0];
      const player2 = result.gameState.players[1];
      
      const player1UserId = userSessions.get(player1.id);
      const player2UserId = userSessions.get(player2.id);
      
      // Ensure these are actual players, not spectators
      const player1IsSpectator = result.gameState.spectators?.some(s => s.socketId === player1.id);
      const player2IsSpectator = result.gameState.spectators?.some(s => s.socketId === player2.id);
      
      // Update stats for both players (no win/loss, just XP)
      if (player1UserId && !player1IsSpectator) {
        // Award small XP for tie
        const xpGain = 10; // Small XP for tie
        const player1XPUpdate = await database.updatePlayerXP(player1UserId, xpGain);
        
        // Track hero usage
        for (const hero of player1.team) {
          await database.updateHeroUsage(player1UserId, hero.name);
        }
        
        // Get updated user data
        const player1User = await database.getUserById(player1UserId);
        
        // Emit victory points update (1 point for tie)
        io.to(player1.id).emit('victory-points-update', {
          type: 'game_tie',
          pointsAwarded: 1,
          totalVictoryPoints: player1User.victory_points,
          gameMode: result.gameState.mode,
          message: `Tie game! You earned 1 victory point. Total: ${player1User.victory_points}`
        });
        
        // Emit XP update
        io.to(player1.id).emit('xp-update', {
          xpGained: player1XPUpdate.xpGained,
          newXP: player1XPUpdate.xp,
          newLevel: player1XPUpdate.level,
          leveledUp: player1XPUpdate.leveledUp,
          message: player1XPUpdate.leveledUp ? 
            `Level up! You're now level ${player1XPUpdate.level}! (+${player1XPUpdate.xpGained} XP from tie)` :
            `+${player1XPUpdate.xpGained} XP from tie! (${player1XPUpdate.xp} total)`
        });
      }
      
      if (player2UserId && !player2IsSpectator) {
        // Award small XP for tie
        const xpGain = 10; // Small XP for tie
        const player2XPUpdate = await database.updatePlayerXP(player2UserId, xpGain);
        
        // Track hero usage
        for (const hero of player2.team) {
          await database.updateHeroUsage(player2UserId, hero.name);
        }
        
        // Get updated user data
        const player2User = await database.getUserById(player2UserId);
        
        // Emit victory points update (1 point for tie)
        io.to(player2.id).emit('victory-points-update', {
          type: 'game_tie',
          pointsAwarded: 1,
          totalVictoryPoints: player2User.victory_points,
          gameMode: result.gameState.mode,
          message: `Tie game! You earned 1 victory point. Total: ${player2User.victory_points}`
        });
        
        // Emit XP update
        io.to(player2.id).emit('xp-update', {
          xpGained: player2XPUpdate.xpGained,
          newXP: player2XPUpdate.xp,
          newLevel: player2XPUpdate.level,
          leveledUp: player2XPUpdate.leveledUp,
          message: player2XPUpdate.leveledUp ? 
            `Level up! You're now level ${player2XPUpdate.level}! (+${player2XPUpdate.xpGained} XP from tie)` :
            `+${player2XPUpdate.xpGained} XP from tie! (${player2XPUpdate.xp} total)`
        });
      }
      
      console.log(`📡 Processed tie game for both players`);
    } catch (error) {
      console.error('❌ Error handling tie game:', error);
    }
    return;
  }
  
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
  
  // Handle tie games in survival mode
  if (result.success && result.gameState && result.gameState.winner === 'TIE' && result.gameState.mode === 'survival') {
    console.log('🤝 Survival TIE game! Both players lost all heroes!');
    
    const player1 = result.gameState.players[0];
    const player2 = result.gameState.players[1];
    
    // Get user IDs
    const player1UserId = userSessions.get(player1.id);
    const player2UserId = userSessions.get(player2.id);
    
    // For survival ties, both players get a loss (no heroes are banned, no wins incremented)
    const player1State = await gameManager.updateSurvivalLoss(player1.id, player1.team);
    const player2State = await gameManager.updateSurvivalLoss(player2.id, player2.team);
    
    console.log('🤝 Player 1 tie state:', player1State);
    console.log('🤝 Player 2 tie state:', player2State);
    
    // Get updated user data
    let player1VictoryPoints = null;
    let player2VictoryPoints = null;
    
    if (player1UserId) {
      const player1User = await database.getUserById(player1UserId);
      player1VictoryPoints = player1User.victory_points;
    }
    
    if (player2UserId) {
      const player2User = await database.getUserById(player2UserId);
      player2VictoryPoints = player2User.victory_points;
    }
    
    // Emit tie state updates to both players
    io.to(player1.id).emit('survival-state-update', {
      type: 'tie',
      state: player1State,
      runEnded: player1State.runEnded || false,
      victoryPoints: player1VictoryPoints,
      message: player1State.runEnded ? 
        `Run ended in a tie! You earned ${player1State.wins} victory points for your ${player1State.wins} wins.` :
        `Tie game! You now have ${player1State.wins} wins and ${player1State.losses} losses. No heroes banned.`
    });
    
    io.to(player2.id).emit('survival-state-update', {
      type: 'tie',
      state: player2State,
      runEnded: player2State.runEnded || false,
      victoryPoints: player2VictoryPoints,
      message: player2State.runEnded ? 
        `Run ended in a tie! You earned ${player2State.wins} victory points for your ${player2State.wins} wins.` :
        `Tie game! You now have ${player2State.wins} wins and ${player2State.losses} losses. No heroes banned.`
    });
    
    console.log('📡 Sent survival tie state updates to both players');
    return;
  }
  
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

// Helper function to check and handle Gauntlet game completion
async function checkGauntletGameCompletion(result) {
  console.log('🔍 Checking Gauntlet game completion. Result success:', result.success);
  console.log('🔍 Result gameState mode:', result.gameState?.mode);
  
  if (result.success && result.gameState && result.gameState.winner && result.gameState.mode === 'gauntlet') {
    console.log('🏆 Gauntlet game completed! Winner:', result.gameState.winner);
    
    // Find the winner and loser players
    const winnerPlayer = result.gameState.players.find(p => p.id === result.gameState.winner);
    const loserPlayer = result.gameState.players.find(p => p.id !== result.gameState.winner);
    
    if (winnerPlayer && loserPlayer) {
      try {
        // Process post-battle for winner
        const winnerResult = await gameManager.processGauntletPostBattle(
          winnerPlayer.id,
          true,
          winnerPlayer.team
        );

        // Process post-battle for loser
        const loserResult = await gameManager.processGauntletPostBattle(
          loserPlayer.id,
          false,
          loserPlayer.team
        );

        // Send updates to both players
        io.to(winnerPlayer.id).emit('gauntlet-battle-complete', {
          won: true,
          runEnded: winnerResult.runEnded,
          finalTrial: winnerResult.finalTrial,
          runState: winnerResult.runState,
          heroOffer: winnerResult.runEnded ? null : gameManager.generateGauntletHeroOffer(gameManager.gauntletRuns.get(winnerPlayer.id))
        });

        io.to(loserPlayer.id).emit('gauntlet-battle-complete', {
          won: false,
          runEnded: loserResult.runEnded,
          finalTrial: loserResult.finalTrial,
          runState: loserResult.runState,
          heroOffer: loserResult.runEnded ? null : gameManager.generateGauntletHeroOffer(gameManager.gauntletRuns.get(loserPlayer.id))
        });

        // If run ended, award rewards
        if (winnerResult.runEnded) {
          const rewards = await gameManager.calculateAndAwardGauntletRewards(winnerPlayer.id, winnerResult.finalTrial);
          const userId = userSessions.get(winnerPlayer.id);
          
          if (userId) {
            const user = await database.getUserById(userId);

            if (rewards.xp > 0) {
              const xpUpdate = await database.updatePlayerXP(userId, rewards.xp);
              
              io.to(winnerPlayer.id).emit('xp-update', {
                xpGained: xpUpdate.xpGained,
                newXP: xpUpdate.xp,
                newLevel: xpUpdate.level,
                leveledUp: xpUpdate.leveledUp,
                message: xpUpdate.leveledUp ?
                  `Level up! You're now level ${xpUpdate.level}! (+${xpUpdate.xpGained} XP from Gauntlet Trial ${winnerResult.finalTrial})` :
                  `+${xpUpdate.xpGained} XP from Gauntlet Trial ${winnerResult.finalTrial}! (${xpUpdate.xp} total)`
              });
            }

            if (rewards.victoryPoints > 0) {
              io.to(winnerPlayer.id).emit('victory-points-update', {
                type: 'gauntlet_complete',
                pointsAwarded: rewards.victoryPoints,
                totalVictoryPoints: user.victory_points,
                message: `Gauntlet complete! Earned ${rewards.victoryPoints} victory points!`
              });
            }
          }
        }

        if (loserResult.runEnded) {
          const rewards = await gameManager.calculateAndAwardGauntletRewards(loserPlayer.id, loserResult.finalTrial);
          const userId = userSessions.get(loserPlayer.id);
          
          if (userId) {
            const user = await database.getUserById(userId);

            if (rewards.xp > 0) {
              const xpUpdate = await database.updatePlayerXP(userId, rewards.xp);
              
              io.to(loserPlayer.id).emit('xp-update', {
                xpGained: xpUpdate.xpGained,
                newXP: xpUpdate.xp,
                newLevel: xpUpdate.level,
                leveledUp: xpUpdate.leveledUp,
                message: xpUpdate.leveledUp ?
                  `Level up! You're now level ${xpUpdate.level}! (+${xpUpdate.xpGained} XP from Gauntlet Trial ${loserResult.finalTrial})` :
                  `+${xpUpdate.xpGained} XP from Gauntlet Trial ${loserResult.finalTrial}! (${xpUpdate.xp} total)`
              });
            }

            if (rewards.victoryPoints > 0) {
              io.to(loserPlayer.id).emit('victory-points-update', {
                type: 'gauntlet_complete',
                pointsAwarded: rewards.victoryPoints,
                totalVictoryPoints: user.victory_points,
                message: `Gauntlet run ended at Trial ${loserResult.finalTrial}! Earned ${rewards.victoryPoints} victory points!`
              });
            }
          }
        }

        console.log(`✅ Gauntlet post-battle processing complete`);
      } catch (error) {
        console.error('❌ Error processing Gauntlet game completion:', error);
      }
    }
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
    
    const result = await gameManager.addPlayer(socket.id, playerData.name || 'Anonymous', mode, profileIcon, userId);
    
    if (result.success) {
      if (result.waiting) {
        // Player is in queue, waiting for opponent
        socket.emit('join-result', {
          success: true,
          waiting: true,
          mode
        });
        console.log(`⏳ ${playerData.name} is waiting in queue for ${mode} match`);
      } else if (result.gameReady) {
        // Match found! Both players join the game room
        const opponentSocketId = result.players.find(p => p.id !== socket.id)?.id;
        
        if (opponentSocketId) {
          // Have both players join the game room
          socket.join(result.gameId);
          io.sockets.sockets.get(opponentSocketId)?.join(result.gameId);
          
          console.log(`✅ Match found! ${playerData.name} matched with opponent`);
          
          // Notify each player individually with their own playerId
          socket.emit('join-result', {
            success: true,
            gameId: result.gameId,
            playerId: socket.id,
            players: result.players,
            gameReady: true,
            mode
          });
          
          io.to(opponentSocketId).emit('join-result', {
            success: true,
            gameId: result.gameId,
            playerId: opponentSocketId,
            players: result.players,
            gameReady: true,
            mode
          });
          
          // Start appropriate phase
          if (mode === 'random') {
            // Start random mode - skip draft and go to initiative
            const randomResult = await gameManager.startRandomMode(result.gameId);
            if (randomResult.success) {
              io.to(result.gameId).emit('game-start', {
                players: randomResult.players,
                gameState: randomResult.gameState
              });
            }
          } else {
            // Start draft mode - get full game state to include player draftCards
            const fullGameState = gameManager.getGameState(result.gameId);
            io.to(result.gameId).emit('game-start', {
              players: fullGameState ? fullGameState.players : result.players,
              draftCards: result.draftCards,
              gameState: fullGameState
            });
          }
        }
      }
    } else {
      socket.emit('join-result', result);
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
      if (result.waiting) {
        // Player is in queue, waiting for opponent
        socket.emit('join-result', {
          success: true,
          waiting: true,
          mode: 'survival'
        });
        console.log(`⏳ ${data.name} is waiting in queue for survival match`);
      } else if (result.gameReady) {
        // Match found! Both players join the game room
        const opponentSocketId = result.players.find(p => p.id !== socket.id)?.id;
        
        if (opponentSocketId) {
          // Have both players join the game room
          socket.join(result.gameId);
          io.sockets.sockets.get(opponentSocketId)?.join(result.gameId);
          
          console.log(`✅ Survival match found! ${data.name} matched with opponent`);
          
          // Notify each player individually with their own playerId
          socket.emit('join-result', {
            success: true,
            gameId: result.gameId,
            playerId: socket.id,
            players: result.players,
            gameReady: true,
            mode: 'survival'
          });
          
          io.to(opponentSocketId).emit('join-result', {
            success: true,
            gameId: result.gameId,
            playerId: opponentSocketId,
            players: result.players,
            gameReady: true,
            mode: 'survival'
          });
          
          // Start the survival battle immediately
          console.log('🎯 Two survival players matched! Starting battle...');
          const gameStart = gameManager.startSurvivalBattle(result.gameId);
          if (gameStart.success) {
            console.log('🚀 Starting survival battle immediately - skipping draft');
            io.to(result.gameId).emit('game-start', {
              players: gameStart.players,
              gameState: gameStart.gameState,
              initiative: gameStart.initiative
            });
            console.log(`📡 Sent game-start event to all players in room ${result.gameId}`);
          } else {
            console.error('❌ Failed to start survival battle:', gameStart.message);
          }
        }
      }
    } else {
      socket.emit('join-result', {
        success: false,
        message: result.message || result.error || 'Failed to join survival game'
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

    console.log(`🚫 Draft abandoned in game ${gameId} by player ${socket.id}`);

    // Notify the abandoning player (no message, just return to lobby)
    socket.emit('draft-abandoned', {
      message: '',
      isOpponent: false
    });

    // Notify opponent with modal
    game.players.forEach(player => {
      if (player.id !== socket.id) {
        io.to(player.id).emit('draft-abandoned', {
          message: 'Your opponent has abandoned the draft.',
          isOpponent: true
        });
      }
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
      
      // Handle game completion for all game modes
      if (result.gameState && result.gameState.mode === 'survival') {
        await checkSurvivalGameCompletion(result);
      } else if (result.gameState && result.gameState.mode === 'gauntlet') {
        await checkGauntletGameCompletion(result);
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
      
      // Handle game completion for all game modes
      if (result.gameState && result.gameState.mode === 'survival') {
        await checkSurvivalGameCompletion(result);
      } else if (result.gameState && result.gameState.mode === 'gauntlet') {
        await checkGauntletGameCompletion(result);
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
      
      // Handle game completion for all game modes
      if (result.gameState && result.gameState.mode === 'survival') {
        await checkSurvivalGameCompletion(result);
      } else if (result.gameState && result.gameState.mode === 'gauntlet') {
        await checkGauntletGameCompletion(result);
      } else {
        await handleRegularGameCompletion(result);
      }
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('end-turn', async () => {
    const result = gameManager.endTurn(socket.id);
    if (result.success) {
      io.to(result.gameId).emit('turn-ended', result);
      
      // Handle game completion for all game modes
      if (result.gameState && result.gameState.winner) {
        if (result.gameState.mode === 'survival') {
          await checkSurvivalGameCompletion(result);
        } else if (result.gameState.mode === 'gauntlet') {
          await checkGauntletGameCompletion(result);
        } else {
          await handleRegularGameCompletion(result);
        }
      }
    } else {
      socket.emit('error', { message: result.error });
    }
  });

  socket.on('activate-special', async (data) => {
    const result = gameManager.activateSpecial(socket.id);
    if (result.success) {
      io.to(result.gameId).emit('special-activated', result);
      
      // Handle game completion for all game modes
      if (result.gameState && result.gameState.mode === 'survival') {
        await checkSurvivalGameCompletion(result);
      } else if (result.gameState && result.gameState.mode === 'gauntlet') {
        await checkGauntletGameCompletion(result);
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
      
      // Handle game completion for all game modes
      if (result.gameState && result.gameState.mode === 'survival') {
        await checkSurvivalGameCompletion(result);
      } else if (result.gameState && result.gameState.mode === 'gauntlet') {
        await checkGauntletGameCompletion(result);
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

  // ==================== GAUNTLET MODE SOCKET EVENTS ====================

  socket.on('start-gauntlet-run', async (data) => {
    console.log('🎮 Player starting Gauntlet run:', data.name);
    
    // First check if there's a saved state
    const userId = userSessions.get(socket.id);
    if (userId) {
      const savedState = await database.loadGauntletState(userId);
      if (savedState.success && savedState.runState) {
        console.log('📂 Loading saved Gauntlet state for user', userId);
        socket.emit('gauntlet-run-started', {
          success: true,
          runState: savedState.runState
        });
        return;
      }
    }
    
    const result = await gameManager.initializeGauntletRun(socket.id, data.name);
    
    if (result.success) {
      socket.emit('gauntlet-run-started', {
        success: true,
        runState: result.runState
      });
      console.log(`✅ Gauntlet run initialized for ${data.name}`);
    } else {
      socket.emit('gauntlet-run-started', {
        success: false,
        error: result.error || 'Failed to start Gauntlet run'
      });
    }
  });

  socket.on('save-and-return-to-lobby', async (data) => {
    console.log('💾 Saving Gauntlet state and returning to lobby:', socket.id);
    
    const userId = userSessions.get(socket.id);
    if (userId && data.runState) {
      try {
        await database.saveGauntletState(userId, data.runState);
        socket.emit('save-success', { success: true });
      } catch (error) {
        console.error('❌ Error saving Gauntlet state:', error);
        socket.emit('save-success', { success: false, error: error.message });
      }
    }
  });

  socket.on('get-gauntlet-run-state', () => {
    const result = gameManager.getGauntletRunState(socket.id);
    socket.emit('gauntlet-run-state-response', result);
  });

  socket.on('gauntlet-shop-action', async (data) => {
    console.log('🛒 Gauntlet shop action:', data.action);
    
    const result = await gameManager.performGauntletShopAction(
      socket.id,
      data.action,
      data
    );
    
    socket.emit('gauntlet-shop-action-result', result);
  });

  socket.on('set-gauntlet-battle-team', (data) => {
    console.log('⚔️ Setting Gauntlet battle team:', data.teamIndices);
    
    const result = gameManager.setGauntletBattleTeam(socket.id, data.teamIndices);
    socket.emit('gauntlet-battle-team-set', result);
  });

  socket.on('queue-for-gauntlet-trial', () => {
    console.log('🎯 Queueing for Gauntlet trial:', socket.id);
    
    const result = gameManager.queueForGauntletTrial(socket.id);
    
    if (result.success && result.matched) {
      // Match found - emit to both players
      const gameId = result.gameId;
      io.to(gameId).emit('gauntlet-match-found', {
        gameId,
        players: result.players,
        initiative: result.initiative
      });
      
      // Start battle
      const game = gameManager.games.get(gameId);
      if (game) {
        io.to(gameId).emit('game-start', {
          players: result.players,
          gameState: game,
          initiative: result.initiative,
          mode: 'gauntlet'
        });
      }
    } else if (result.success && result.waiting) {
      socket.emit('gauntlet-queue-waiting', {
        message: result.message
      });
    } else {
      socket.emit('gauntlet-queue-failed', {
        error: result.error || 'Failed to queue'
      });
    }
  });

  socket.on('cancel-gauntlet-queue', () => {
    const result = gameManager.cancelGauntletQueue(socket.id);
    socket.emit('gauntlet-queue-cancelled', result);
  });

  socket.on('complete-gauntlet-hero-offer', async (data) => {
    console.log('🎁 Completing Gauntlet hero offer');
    
    const result = await gameManager.completeGauntletHeroOffer(
      socket.id,
      data.selectedHeroId,
      data.sacrificeIndex,
      data.useReroll
    );
    
    socket.emit('gauntlet-hero-offer-result', result);
  });

  socket.on('abandon-gauntlet-run', async () => {
    console.log('🚪 Player abandoning Gauntlet run:', socket.id);
    
    const result = await gameManager.abandonGauntletRun(socket.id);
    
    if (result.success) {
      // Clear saved state on abandon
      const userId = userSessions.get(socket.id);
      if (userId) {
        await database.clearGauntletState(userId);
      }
      
      // Send rewards update
      if (userId && result.rewards) {
        try {
          const user = await database.getUserById(userId);
          
          // Send XP update
          if (result.rewards.xp > 0) {
            const playerStats = await database.getPlayerStats(userId);
            socket.emit('xp-update', {
              xpGained: result.rewards.xp,
              newXP: playerStats.xp,
              newLevel: playerStats.level,
              leveledUp: false,
              message: `+${result.rewards.xp} XP from Gauntlet Trial ${result.finalTrial}!`
            });
          }
          
          // Send victory points update
          if (result.rewards.victoryPoints > 0) {
            socket.emit('victory-points-update', {
              type: 'gauntlet_complete',
              pointsAwarded: result.rewards.victoryPoints,
              totalVictoryPoints: user.victory_points,
              message: `Gauntlet complete! Earned ${result.rewards.victoryPoints} victory points for reaching Trial ${result.finalTrial}`
            });
          }
        } catch (error) {
          console.error('❌ Error sending Gauntlet rewards:', error);
        }
      }
      
      socket.emit('gauntlet-run-abandoned', {
        success: true,
        finalTrial: result.finalTrial,
        rewards: result.rewards
      });
    } else {
      socket.emit('gauntlet-run-abandoned', {
        success: false,
        error: result.error
      });
    }
  });

  // ==================== END GAUNTLET MODE SOCKET EVENTS ====================

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
    
    // Remove player from any matchmaking queues
    gameManager.cancelSearch(socket.id);
    gameManager.cancelSurvivalSearch(socket.id);
    
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

server.listen(PORT, async () => {
  console.log(`Hero's Call server running on port ${PORT}`);
  console.log('Server startup completed successfully');
  
  // Migrate existing admin accounts to have player_id
  try {
    const adminAccounts = ['Admin1', 'Admin2', 'Admin3'];
    for (const adminName of adminAccounts) {
      await new Promise((resolve, reject) => {
        database.db.run(
          'UPDATE users SET player_id = ? WHERE username = ? AND player_id IS NULL',
          [adminName, adminName],
          function(err) {
            if (err) {
              console.error(`Error updating player_id for ${adminName}:`, err);
              reject(err);
            } else if (this.changes > 0) {
              console.log(`✅ Updated player_id for ${adminName}`);
              resolve();
            } else {
              resolve();
            }
          }
        );
      });
    }
  } catch (error) {
    console.error('Error migrating admin accounts:', error);
  }
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
