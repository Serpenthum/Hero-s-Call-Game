const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    // Create database file in a persistent data directory
    const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    const dbPath = path.join(dataDir, 'game_database.sqlite');
    
    console.log('Attempting to connect to database at:', dbPath);
    
    this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        console.error('Database path was:', dbPath);
      } else {
        console.log('Connected to SQLite database at:', dbPath);
        // Use serialize to ensure operations run sequentially
          this.createTables();
  
      }
    });
    
    this.db.on('error', (err) => {
      console.error('Database error event:', err);
    });
  }

  createTables() {
    
    // Users table
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        victory_points INTEGER DEFAULT 0,
        survival_wins INTEGER DEFAULT 0,
        survival_losses INTEGER DEFAULT 0,
        survival_used_heroes TEXT DEFAULT '[]',
        available_heroes TEXT DEFAULT '[]',
        best_gauntlet_trial INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Friends table
    const createFriendsTable = `
      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (friend_id) REFERENCES users (id),
        UNIQUE(user_id, friend_id)
      )
    `;

    // Messages table for private messaging
    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users (id),
        FOREIGN KEY (receiver_id) REFERENCES users (id)
      )
    `;

    // Gauntlet save states table
    const createGauntletSaveStatesTable = `
      CREATE TABLE IF NOT EXISTS gauntlet_save_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        current_trial INTEGER NOT NULL,
        rerolls_remaining INTEGER NOT NULL,
        shop_actions_remaining INTEGER NOT NULL,
        roster TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;

    this.db.run(createUsersTable, (err) => {
      console.log('CREATE TABLE callback executed');
      if (err) {
        console.error('Error creating users table:', err.message);
        console.error('Full error:', err);
      } else {
        console.log('Users table created or already exists');
        console.log('Database initialization complete');
      }
    });

    this.db.run(createFriendsTable, (err) => {
      if (err) {
        console.error('Error creating friends table:', err.message);
      } else {
        console.log('Friends table created or already exists');
      }
    });

    // Player stats table for XP, levels, and game statistics
    const createPlayerStatsTable = `
      CREATE TABLE IF NOT EXISTS player_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        total_wins INTEGER DEFAULT 0,
        total_losses INTEGER DEFAULT 0,
        favorite_hero TEXT DEFAULT NULL,
        hero_usage_count TEXT DEFAULT '{}',
        highest_survival_run INTEGER DEFAULT 0,
        profile_icon TEXT DEFAULT 'Sorcerer',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;

    this.db.run(createMessagesTable, (err) => {
      if (err) {
        console.error('Error creating messages table:', err.message);
      } else {
        console.log('Messages table created or already exists');
      }
    });

    this.db.run(createGauntletSaveStatesTable, (err) => {
      if (err) {
        console.error('Error creating gauntlet_save_states table:', err.message);
      } else {
        console.log('Gauntlet save states table created or already exists');
      }
    });

    this.db.run(createGauntletSaveStatesTable, (err) => {
      if (err) {
        console.error('Error creating gauntlet_save_states table:', err.message);
      } else {
        console.log('Gauntlet save states table created or already exists');
      }
    });

    this.db.run(createPlayerStatsTable, (err) => {
      if (err) {
        console.error('Error creating player_stats table:', err.message);
      } else {
        console.log('Player stats table created or already exists');
      }
    });

    // Add favorite_heroes column to users table if it doesn't exist
    this.db.run(`ALTER TABLE users ADD COLUMN favorite_heroes TEXT DEFAULT '[]'`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Error adding favorite_heroes column:', err.message);
      } else if (!err) {
        console.log('Added favorite_heroes column to users table');
      }
    });

    // Add best_gauntlet_trial column to users table if it doesn't exist
    this.db.run(`ALTER TABLE users ADD COLUMN best_gauntlet_trial INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Error adding best_gauntlet_trial column:', err.message);
      } else if (!err) {
        console.log('Added best_gauntlet_trial column to users table');
      }
    });

    // Add player_id column to users table if it doesn't exist
    this.db.run(`ALTER TABLE users ADD COLUMN player_id TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('Error adding player_id column:', err.message);
      } else if (!err) {
        console.log('Added player_id column to users table');
      }
    });
  }

  // DISABLED: No longer automatically giving all heroes to users
  // Heroes must now be purchased in the shop
  async initializeAvailableHeroes() {
    console.log('⚠️ Hero auto-initialization disabled - heroes must be purchased in shop');
    // No longer automatically giving all heroes to users
    return;
  }

  // DISABLED: No longer automatically refreshing heroes
  async refreshAvailableHeroes() {
    console.log('⚠️ Hero auto-refresh disabled - heroes must be purchased in shop');
    // No longer automatically adding newly enabled heroes
    return;
  }

  // User authentication methods
  async createUser(username, password) {
    return new Promise((resolve, reject) => {
      // First check if username already exists
      this.db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          reject(new Error('Username already exists'));
          return;
        }

        // Hash the password
        bcrypt.hash(password, 10, (hashErr, hash) => {
          if (hashErr) {
            reject(hashErr);
            return;
          }

          // Get starter heroes for new user (same as Gauntlet starter heroes)
          try {
            const { GAUNTLET_STARTER_HEROES } = require('./database');
            const starterHeroes = [...GAUNTLET_STARTER_HEROES];
            const heroesJson = JSON.stringify(starterHeroes);

            // Insert new user
            const insertQuery = `
              INSERT INTO users (username, password_hash, available_heroes)
              VALUES (?, ?, ?)
            `;

            this.db.run(insertQuery, [username, hash, heroesJson], function(insertErr) {
              if (insertErr) {
                reject(insertErr);
                return;
              }

              resolve({
                id: this.lastID,
                username: username,
                victory_points: 0,
                survival_wins: 0,
                survival_losses: 0,
                survival_used_heroes: [],
                available_heroes: starterHeroes
              });
            });
          } catch (heroErr) {
            reject(new Error('Error loading heroes data'));
          }
        });
      });
    });
  }

  async authenticateUser(username, password) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, username, password_hash, victory_points, survival_wins, 
               survival_losses, survival_used_heroes, available_heroes
        FROM users 
        WHERE username = ?
      `;

      this.db.get(query, [username], async (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          reject(new Error('User not found'));
          return;
        }

        // Compare password
        bcrypt.compare(password, row.password_hash, async (compareErr, isMatch) => {
          if (compareErr) {
            reject(compareErr);
            return;
          }

          if (!isMatch) {
            reject(new Error('Invalid password'));
            return;
          }

          // Update last login
          this.db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);

          // Parse JSON fields
          let survivalUsedHeroes = [];
          let availableHeroes = [];
          
          try {
            survivalUsedHeroes = JSON.parse(row.survival_used_heroes || '[]');
            availableHeroes = JSON.parse(row.available_heroes || '[]');
          } catch (parseErr) {
            console.error('Error parsing user data:', parseErr);
          }

          // Get player stats (XP and level)
          try {
            const playerStats = await this.getPlayerStats(row.id);
            
            resolve({
              id: row.id,
              username: row.username,
              victory_points: row.victory_points,
              survival_wins: row.survival_wins,
              survival_losses: row.survival_losses,
              survival_used_heroes: survivalUsedHeroes,
              available_heroes: availableHeroes,
              xp: playerStats.xp,
              level: playerStats.level
            });
          } catch (statsErr) {
            console.error('Error fetching player stats:', statsErr);
            // Still resolve with user data, just without XP/level
            resolve({
              id: row.id,
              username: row.username,
              victory_points: row.victory_points,
              survival_wins: row.survival_wins,
              survival_losses: row.survival_losses,
              survival_used_heroes: survivalUsedHeroes,
              available_heroes: availableHeroes,
              xp: 0,
              level: 1
            });
          }
        });
      });
    });
  }

  async getUserById(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          u.id, u.username, u.victory_points, u.survival_wins, 
          u.survival_losses, u.survival_used_heroes, u.available_heroes,
          u.favorite_heroes, u.best_gauntlet_trial, u.player_id,
          ps.level, ps.xp
        FROM users u
        LEFT JOIN player_stats ps ON u.id = ps.user_id
        WHERE u.id = ?
      `;

      this.db.get(query, [userId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          reject(new Error('User not found'));
          return;
        }

        // Parse JSON fields
        let survivalUsedHeroes = [];
        let availableHeroes = [];
        let favoriteHeroes = [];
        
        try {
          survivalUsedHeroes = JSON.parse(row.survival_used_heroes || '[]');
          availableHeroes = JSON.parse(row.available_heroes || '[]');
          favoriteHeroes = JSON.parse(row.favorite_heroes || '[]');
        } catch (parseErr) {
          console.error('Error parsing user data:', parseErr);
        }

        resolve({
          id: row.id,
          username: row.username,
          victory_points: row.victory_points || 0,
          survival_wins: row.survival_wins || 0,
          survival_losses: row.survival_losses || 0,
          survival_used_heroes: survivalUsedHeroes,
          available_heroes: availableHeroes,
          favorite_heroes: favoriteHeroes,
          xp: row.xp || 0,
          level: row.level || 1,
          best_gauntlet_trial: row.best_gauntlet_trial || 0,
          player_id: row.player_id || null
        });
      });
    });
  }

  async updateUserVictoryPoints(userId, points) {
    return new Promise((resolve, reject) => {
      const query = 'UPDATE users SET victory_points = victory_points + ? WHERE id = ?';
      
      this.db.run(query, [points, userId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  async updateSurvivalState(userId, wins, losses, usedHeroes) {
    return new Promise((resolve, reject) => {
      const usedHeroesJson = JSON.stringify(usedHeroes);
      const query = `
        UPDATE users 
        SET survival_wins = ?, survival_losses = ?, survival_used_heroes = ?
        WHERE id = ?
      `;
      
      this.db.run(query, [wins, losses, usedHeroesJson, userId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  async resetSurvivalState(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE users 
        SET survival_wins = 0, survival_losses = 0, survival_used_heroes = '[]'
        WHERE id = ?
      `;
      
      this.db.run(query, [userId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  async updateLastLogin(userId) {
    return new Promise((resolve, reject) => {
      const query = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?';
      this.db.run(query, [userId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  async addHeroToUser(userId, heroName) {
    return new Promise((resolve, reject) => {
      this.getUserById(userId)
        .then(user => {
          if (!user.available_heroes.includes(heroName)) {
            const updatedHeroes = [...user.available_heroes, heroName];
            const heroesJson = JSON.stringify(updatedHeroes);
            
            const query = 'UPDATE users SET available_heroes = ? WHERE id = ?';
            this.db.run(query, [heroesJson, userId], function(err) {
              if (err) {
                reject(err);
                return;
              }
              resolve(updatedHeroes);
            });
          } else {
            resolve(user.available_heroes);
          }
        })
        .catch(reject);
    });
  }

  // Friends system methods
  async sendFriendRequest(userId, friendId) {
    return new Promise((resolve, reject) => {
      // Check if users exist
      if (userId === friendId) {
        reject(new Error('Cannot add yourself as a friend'));
        return;
      }

      // Check if friendship already exists (either direction)
      const checkQuery = `
        SELECT * FROM friends 
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `;

      this.db.get(checkQuery, [userId, friendId, friendId, userId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          if (row.status === 'accepted') {
            reject(new Error('Already friends'));
          } else if (row.status === 'pending') {
            reject(new Error('Friend request already sent'));
          }
          return;
        }

        // Insert new friend request
        const insertQuery = `
          INSERT INTO friends (user_id, friend_id, status)
          VALUES (?, ?, 'pending')
        `;

        this.db.run(insertQuery, [userId, friendId], function(insertErr) {
          if (insertErr) {
            reject(insertErr);
            return;
          }
          resolve({ success: true, requestId: this.lastID });
        });
      });
    });
  }

  async acceptFriendRequest(userId, requesterId) {
    return new Promise((resolve, reject) => {
      // Update the friend request to accepted
      const updateQuery = `
        UPDATE friends 
        SET status = 'accepted' 
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
      `;

      this.db.run(updateQuery, [requesterId, userId], function(err) {
        if (err) {
          reject(err);
          return;
        }

        if (this.changes === 0) {
          reject(new Error('Friend request not found'));
          return;
        }

        resolve({ success: true });
      });
    });
  }

  async rejectFriendRequest(userId, requesterId) {
    return new Promise((resolve, reject) => {
      const deleteQuery = `
        DELETE FROM friends 
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
      `;

      this.db.run(deleteQuery, [requesterId, userId], function(err) {
        if (err) {
          reject(err);
          return;
        }

        if (this.changes === 0) {
          reject(new Error('Friend request not found'));
          return;
        }

        resolve({ success: true });
      });
    });
  }

  async getFriends(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT u.id, u.username, f.status, f.user_id as requester_id
        FROM friends f
        JOIN users u ON (
          CASE 
            WHEN f.user_id = ? THEN u.id = f.friend_id
            ELSE u.id = f.user_id
          END
        )
        WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
      `;

      this.db.all(query, [userId, userId, userId], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  async getFriendRequests(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT u.id, u.username, f.created_at
        FROM friends f
        JOIN users u ON u.id = f.user_id
        WHERE f.friend_id = ? AND f.status = 'pending'
      `;

      this.db.all(query, [userId], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  async getUserByUsername(username) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT id, username FROM users WHERE username = ?';
      
      this.db.get(query, [username], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  }

  async removeFriend(userId, friendId) {
    return new Promise((resolve, reject) => {
      // Remove friendship from both directions
      const deleteQuery = `
        DELETE FROM friends 
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `;

      this.db.run(deleteQuery, [userId, friendId, friendId, userId], function(err) {
        if (err) {
          reject(err);
          return;
        }

        if (this.changes === 0) {
          reject(new Error('No friendship found to remove'));
          return;
        }

        resolve({ message: 'Friend removed successfully' });
      });
    });
  }

  // Messaging system methods
  async sendMessage(senderId, receiverId, message) {
    return new Promise((resolve, reject) => {
      const insertQuery = `
        INSERT INTO messages (sender_id, receiver_id, message)
        VALUES (?, ?, ?)
      `;

      this.db.run(insertQuery, [senderId, receiverId, message], function(err) {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          id: this.lastID,
          sender_id: senderId,
          receiver_id: receiverId,
          message: message,
          created_at: new Date().toISOString()
        });
      });
    });
  }

  async getMessages(userId1, userId2, limit = 50) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT m.*, s.username as sender_username, r.username as receiver_username
        FROM messages m
        JOIN users s ON s.id = m.sender_id
        JOIN users r ON r.id = m.receiver_id
        WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
        ORDER BY m.created_at DESC
        LIMIT ?
      `;

      this.db.all(query, [userId1, userId2, userId2, userId1, limit], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        // Reverse to show oldest first
        resolve(rows.reverse());
      });
    });
  }

  // Delete all messages for a user (when they logout/disconnect)
  deleteAllUserMessages(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        DELETE FROM messages 
        WHERE sender_id = ? OR receiver_id = ?
      `;

      this.db.run(query, [userId, userId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        console.log(`Deleted ${this.changes} messages for user ${userId}`);
        resolve(this.changes);
      });
    });
  }

  // Player Stats Methods
  async getPlayerStats(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM player_stats WHERE user_id = ?
      `;

      this.db.get(query, [userId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          // Create default stats for new user
          this.createPlayerStats(userId)
            .then(stats => resolve(stats))
            .catch(error => reject(error));
        } else {
          // Parse hero usage count JSON
          try {
            row.hero_usage_count = JSON.parse(row.hero_usage_count || '{}');
          } catch (e) {
            row.hero_usage_count = {};
          }
          resolve(row);
        }
      });
    });
  }

  async createPlayerStats(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO player_stats (user_id, level, xp, total_wins, total_losses, hero_usage_count, highest_survival_run, profile_icon)
        VALUES (?, 1, 0, 0, 0, '{}', 0, 'Sorcerer')
      `;

      this.db.run(query, [userId], function(err) {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          id: this.lastID,
          user_id: userId,
          level: 1,
          xp: 0,
          total_wins: 0,
          total_losses: 0,
          favorite_hero: null,
          hero_usage_count: {},
          highest_survival_run: 0,
          profile_icon: 'Sorcerer'
        });
      });
    });
  }

  async updatePlayerXP(userId, xpGain) {
    return new Promise((resolve, reject) => {
      // First get current stats
      this.getPlayerStats(userId)
        .then(stats => {
          let currentXP = stats.xp + xpGain;
          let currentLevel = stats.level;
          let levelsGained = 0;
          
          // Keep leveling up while player has enough XP
          while (currentLevel < 20) {
            const xpRequired = this.getXPRequiredForLevel(currentLevel);
            if (currentXP >= xpRequired) {
              currentXP -= xpRequired;
              currentLevel++;
              levelsGained++;
            } else {
              break;
            }
          }
          
          // Cap XP at max for level 20
          if (currentLevel >= 20) {
            currentXP = Math.min(currentXP, this.getXPRequiredForLevel(19));
          }

          const query = `
            UPDATE player_stats 
            SET xp = ?, level = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE user_id = ?
          `;

          this.db.run(query, [currentXP, currentLevel, userId], (err) => {
            if (err) {
              reject(err);
              return;
            }

            // Award 12 VP per level gained
            if (levelsGained > 0) {
              const vpGained = levelsGained * 12;
              this.updateUserVictoryPoints(userId, vpGained)
                .then(() => {
                  resolve({
                    ...stats,
                    xp: currentXP,
                    level: currentLevel,
                    xpGained: xpGain,
                    leveledUp: levelsGained > 0,
                    levelsGained,
                    vpGained
                  });
                })
                .catch(reject);
            } else {
              resolve({
                ...stats,
                xp: currentXP,
                level: currentLevel,
                xpGained: xpGain,
                leveledUp: false,
                levelsGained: 0,
                vpGained: 0
              });
            }
          });
        })
        .catch(reject);
    });
  }

  calculateLevel(xp) {
    // XP progression: 25, 50, 75, 100, 125, 150... (+25 per level)
    // Level 1: 0-24 XP (need 25 to level up)
    // Level 2: 0-49 XP (need 50 to level up)
    // Level 3: 0-74 XP (need 75 to level up)
    // etc.
    // Max level is 20
    
    if (xp < 25) return 1;
    if (xp < 50) return 2;
    if (xp < 75) return 3;
    if (xp < 100) return 4;
    if (xp < 125) return 5;
    if (xp < 150) return 6;
    if (xp < 175) return 7;
    if (xp < 200) return 8;
    if (xp < 225) return 9;
    if (xp < 250) return 10;
    if (xp < 275) return 11;
    if (xp < 300) return 12;
    if (xp < 325) return 13;
    if (xp < 350) return 14;
    if (xp < 375) return 15;
    if (xp < 400) return 16;
    if (xp < 425) return 17;
    if (xp < 450) return 18;
    if (xp < 475) return 19;
    return 20; // Max level (475+ XP)
  }

  getXPRequiredForLevel(level) {
    // Returns XP required to reach next level
    // Level 1->2: 25, 2->3: 50, 3->4: 75, etc.
    if (level >= 20) return 0; // Max level reached
    return level * 25;
  }

  async checkAndLevelUpPlayer(userId) {
    // Check if player has excess XP and level them up with carryover
    return new Promise((resolve, reject) => {
      this.getPlayerStats(userId)
        .then(stats => {
          let currentXP = stats.xp;
          let currentLevel = stats.level;
          let leveledUp = false;
          let levelsGained = 0;
          
          // Keep leveling up until XP is below required amount
          while (currentLevel < 20) {
            const xpRequired = this.getXPRequiredForLevel(currentLevel);
            if (currentXP >= xpRequired) {
              currentXP -= xpRequired;
              currentLevel++;
              levelsGained++;
              leveledUp = true;
              console.log(`🎉 Player ${userId} leveled up to ${currentLevel}! Remaining XP: ${currentXP}`);
            } else {
              break;
            }
          }
          
          // Cap XP at max for level 20
          if (currentLevel >= 20) {
            currentXP = Math.min(currentXP, this.getXPRequiredForLevel(19));
          }
          
          if (leveledUp) {
            // Award 12 VP per level gained
            const vpGained = levelsGained * 12;
            
            // Update database with new level, remaining XP, and VP
            const updateQuery = `
              UPDATE player_stats 
              SET xp = ?, level = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE user_id = ?
            `;
            
            this.db.run(updateQuery, [currentXP, currentLevel, userId], (err) => {
              if (err) {
                reject(err);
                return;
              }
              
              // Award Victory Points
              this.updateUserVictoryPoints(userId, vpGained)
                .then(() => {
                  resolve({
                    ...stats,
                    xp: currentXP,
                    level: currentLevel,
                    leveledUp: true,
                    oldLevel: stats.level,
                    levelsGained,
                    vpGained
                  });
                })
                .catch(reject);
            });
          } else {
            resolve({ ...stats, leveledUp: false });
          }
        })
        .catch(reject);
    });
  }

  async updatePlayerStats(userId, isWin, gameMode) {
    return new Promise((resolve, reject) => {
      const winInc = isWin ? 1 : 0;
      const lossInc = isWin ? 0 : 1;

      const query = `
        UPDATE player_stats 
        SET total_wins = total_wins + ?, total_losses = total_losses + ?, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ?
      `;

      this.db.run(query, [winInc, lossInc, userId], function(err) {
        if (err) {
          reject(err);
          return;
        }

        // Calculate XP gain based on game mode and result
        let xpGain = 0;
        if (gameMode === 'draft') {
          xpGain = isWin ? 10 : 3;
        } else if (gameMode === 'random') {
          xpGain = isWin ? 5 : 1;
        }

        // Update XP if there's a gain
        if (xpGain > 0) {
          resolve({ winsAdded: winInc, lossesAdded: lossInc, xpGain });
        } else {
          resolve({ winsAdded: winInc, lossesAdded: lossInc, xpGain: 0 });
        }
      });
    });
  }

  async updateSurvivalStats(userId, wins) {
    return new Promise((resolve, reject) => {
      // Calculate XP based on survival wins
      const survivalXP = {
        1: 5, 2: 10, 3: 17, 4: 26, 5: 37, 6: 50, 7: 80
      };
      const xpGain = survivalXP[wins] || 0;

      // Get current highest survival run
      this.getPlayerStats(userId)
        .then(stats => {
          const newHighest = Math.max(stats.highest_survival_run, wins);
          
          const query = `
            UPDATE player_stats 
            SET highest_survival_run = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE user_id = ?
          `;

          this.db.run(query, [newHighest, userId], function(err) {
            if (err) {
              reject(err);
              return;
            }

            resolve({ 
              xpGain, 
              newHighest,
              highestUpdated: newHighest > stats.highest_survival_run 
            });
          });
        })
        .catch(reject);
    });
  }

  async updateHeroUsage(userId, heroName) {
    return new Promise((resolve, reject) => {
      this.getPlayerStats(userId)
        .then(stats => {
          const usageCount = stats.hero_usage_count || {};
          usageCount[heroName] = (usageCount[heroName] || 0) + 1;

          // Find most used hero
          let favoriteHero = null;
          let maxCount = 0;
          for (const [hero, count] of Object.entries(usageCount)) {
            if (count > maxCount) {
              maxCount = count;
              favoriteHero = hero;
            }
          }

          const query = `
            UPDATE player_stats 
            SET hero_usage_count = ?, favorite_hero = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE user_id = ?
          `;

          this.db.run(query, [JSON.stringify(usageCount), favoriteHero, userId], function(err) {
            if (err) {
              reject(err);
              return;
            }

            resolve({ favoriteHero, usageCount });
          });
        })
        .catch(reject);
    });
  }

  async updateProfileIcon(userId, heroName) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE player_stats 
        SET profile_icon = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ?
      `;

      this.db.run(query, [heroName, userId], function(err) {
        if (err) {
          reject(err);
          return;
        }

        resolve({ success: true });
      });
    });
  }

  async toggleFavoriteHero(userId, heroName) {
    return new Promise((resolve, reject) => {
      // First get current favorite heroes
      const getQuery = `SELECT favorite_heroes FROM users WHERE id = ?`;
      
      this.db.get(getQuery, [userId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          reject(new Error('User not found'));
          return;
        }

        let favoriteHeroes = [];
        try {
          favoriteHeroes = JSON.parse(row.favorite_heroes || '[]');
        } catch (e) {
          favoriteHeroes = [];
        }

        // Toggle hero in favorites
        const index = favoriteHeroes.indexOf(heroName);
        let isFavorited = false;
        
        if (index > -1) {
          // Remove from favorites
          favoriteHeroes.splice(index, 1);
          isFavorited = false;
        } else {
          // Add to favorites
          favoriteHeroes.push(heroName);
          isFavorited = true;
        }

        // Update database
        const updateQuery = `UPDATE users SET favorite_heroes = ? WHERE id = ?`;
        
        this.db.run(updateQuery, [JSON.stringify(favoriteHeroes), userId], function(err) {
          if (err) {
            reject(err);
            return;
          }

          resolve({ 
            success: true, 
            favoriteHeroes, 
            isFavorited,
            heroName 
          });
        });
      });
    });
  }

  async getFavoriteHeroes(userId) {
    return new Promise((resolve, reject) => {
      const query = `SELECT favorite_heroes FROM users WHERE id = ?`;
      
      this.db.get(query, [userId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          resolve([]);
          return;
        }

        try {
          const favoriteHeroes = JSON.parse(row.favorite_heroes || '[]');
          resolve(favoriteHeroes);
        } catch (e) {
          resolve([]);
        }
      });
    });
  }

  // Gauntlet methods
  async updateBestGauntletTrial(userId, trialReached) {
    return new Promise((resolve, reject) => {
      // First get current best
      const getQuery = `SELECT best_gauntlet_trial FROM users WHERE id = ?`;
      
      this.db.get(getQuery, [userId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        const currentBest = row?.best_gauntlet_trial || 0;
        const newBest = Math.max(currentBest, trialReached);

        // Only update if new best is higher
        if (newBest > currentBest) {
          const updateQuery = `UPDATE users SET best_gauntlet_trial = ? WHERE id = ?`;
          
          this.db.run(updateQuery, [newBest, userId], function(err) {
            if (err) {
              reject(err);
              return;
            }

            resolve({ 
              previousBest: currentBest,
              newBest: newBest,
              improved: true
            });
          });
        } else {
          resolve({
            previousBest: currentBest,
            newBest: currentBest,
            improved: false
          });
        }
      });
    });
  }

  async calculateGauntletRewards(trialReached) {
    // XP rewards based on trial reached
    const xpRewards = {
      1: 5, 2: 10, 3: 15, 4: 20, 5: 25,
      6: 30, 7: 40, 8: 50, 9: 65, 10: 80,
      11: 100, 12: 125, 13: 150
    };

    // Victory points rewards based on trial reached
    const vpRewards = {
      1: 1, 2: 1, 3: 2, 4: 2, 5: 3,
      6: 3, 7: 4, 8: 5, 9: 6, 10: 8,
      11: 10, 12: 12, 13: 15
    };

    return {
      xp: xpRewards[trialReached] || 0,
      victoryPoints: vpRewards[trialReached] || 0
    };
  }

  async saveGauntletState(userId, runState) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR REPLACE INTO gauntlet_save_states 
        (user_id, current_trial, rerolls_remaining, shop_actions_remaining, roster, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      const rosterJson = JSON.stringify(runState.roster);
      
      this.db.run(query, [userId, runState.current_trial, runState.rerolls_remaining, runState.shop_actions_remaining, rosterJson], (err) => {
        if (err) {
          console.error('Error saving gauntlet state:', err.message);
          reject(err);
        } else {
          console.log(`✅ Saved gauntlet state for user ${userId}`);
          resolve({ success: true });
        }
      });
    });
  }

  async loadGauntletState(userId) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM gauntlet_save_states WHERE user_id = ?`;
      
      this.db.get(query, [userId], (err, row) => {
        if (err) {
          console.error('Error loading gauntlet state:', err.message);
          reject(err);
        } else if (row) {
          console.log(`✅ Loaded gauntlet state for user ${userId}`);
          resolve({
            success: true,
            runState: {
              current_trial: row.current_trial,
              rerolls_remaining: row.rerolls_remaining,
              shop_actions_remaining: row.shop_actions_remaining,
              roster: JSON.parse(row.roster)
            }
          });
        } else {
          resolve({ success: false, message: 'No saved state found' });
        }
      });
    });
  }

  async clearGauntletState(userId) {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM gauntlet_save_states WHERE user_id = ?`;
      
      this.db.run(query, [userId], (err) => {
        if (err) {
          console.error('Error clearing gauntlet state:', err.message);
          reject(err);
        } else {
          console.log(`✅ Cleared gauntlet state for user ${userId}`);
          resolve({ success: true });
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }

  // Auto-create admin accounts for testing
  async createAdminAccounts() {
    const adminAccounts = ['Admin1', 'Admin2', 'Admin3'];
    const adminPassword = 'admin';
    
    try {
      // Get all enabled heroes
      delete require.cache[require.resolve('./heros.json')];
      const allHeroes = require('./heros.json');
      const enabledHeroes = allHeroes.filter(hero => !hero.disabled).map(hero => hero.name);
      const heroesJson = JSON.stringify(enabledHeroes);
      
      for (const adminName of adminAccounts) {
        // Check if admin already exists
        const existingAdmin = await new Promise((resolve, reject) => {
          this.db.get('SELECT id FROM users WHERE username = ?', [adminName], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        
        if (existingAdmin) {
          console.log(`ℹ️ Admin account ${adminName} already exists`);
          continue;
        }
        
        // Create admin account
        const hash = await bcrypt.hash(adminPassword, 10);
        
        const userId = await new Promise((resolve, reject) => {
          this.db.run(
            'INSERT INTO users (username, password_hash, available_heroes, victory_points, favorite_heroes, best_gauntlet_trial, player_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [adminName, hash, heroesJson, 1000, '[]', 0, adminName], // Give 1000 VP to admins
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });
        
        // Create player stats with level 10
        await new Promise((resolve, reject) => {
          this.db.run(
            'INSERT INTO player_stats (user_id, level, xp) VALUES (?, ?, ?)',
            [userId, 10, 1000],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        console.log(`✅ Created admin account: ${adminName} (Level 10, all heroes unlocked)`);
      }
    } catch (error) {
      console.error('Error creating admin accounts:', error);
    }
  }
}

// Starter heroes for Gauntlet mode
const GAUNTLET_STARTER_HEROES = [
  'Assassin', 'Barbarian', 'Cleric', 'Druid', 'Fighter',
  'Monk', 'Paladin', 'Ranger', 'Sorcerer', 'Wizard'
];

module.exports = Database;
module.exports.GAUNTLET_STARTER_HEROES = GAUNTLET_STARTER_HEROES;
