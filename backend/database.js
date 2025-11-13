const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    // Create database file in the backend directory
    const dbPath = path.join(__dirname, 'game_database.sqlite');
    
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.createTables();
      }
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

    this.db.run(createUsersTable, (err) => {
      if (err) {
        console.error('Error creating users table:', err.message);
      } else {
        console.log('Users table created or already exists');
        
        // Initialize available heroes for all users if they don't have any
        this.initializeAvailableHeroes();
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

    this.db.run(createPlayerStatsTable, (err) => {
      if (err) {
        console.error('Error creating player_stats table:', err.message);
      } else {
        console.log('Player stats table created or already exists');
      }
    });
  }

  async initializeAvailableHeroes() {
    try {
      // Get all enabled heroes from the heroes.json file
      delete require.cache[require.resolve('./heros.json')];
      const allHeroes = require('./heros.json');
      const enabledHeroes = allHeroes.filter(hero => !hero.disabled).map(hero => hero.name);
      const heroesJson = JSON.stringify(enabledHeroes);

      // Update all users who have empty available_heroes
      const updateQuery = `
        UPDATE users 
        SET available_heroes = ? 
        WHERE available_heroes = '[]' OR available_heroes IS NULL
      `;

      this.db.run(updateQuery, [heroesJson], (err) => {
        if (err) {
          console.error('Error initializing available heroes:', err.message);
        } else {
          console.log('Initialized available heroes for existing users');
        }
      });

      // Also refresh available heroes for all existing users to include newly enabled heroes
      this.refreshAvailableHeroes();
    } catch (error) {
      console.error('Error getting enabled heroes:', error);
    }
  }

  async refreshAvailableHeroes() {
    try {
      // Get all enabled heroes from the heroes.json file
      delete require.cache[require.resolve('./heros.json')];
      const allHeroes = require('./heros.json');
      const enabledHeroes = allHeroes.filter(hero => !hero.disabled).map(hero => hero.name);

      // Get all users and update their available heroes
      const getAllUsersQuery = 'SELECT id, available_heroes FROM users';
      
      this.db.all(getAllUsersQuery, [], (err, rows) => {
        if (err) {
          console.error('Error getting users for hero refresh:', err.message);
          return;
        }

        rows.forEach(row => {
          let currentHeroes = [];
          try {
            currentHeroes = JSON.parse(row.available_heroes || '[]');
          } catch (parseErr) {
            console.error('Error parsing available heroes for user', row.id, parseErr);
            currentHeroes = [];
          }

          // Add any newly enabled heroes that the user doesn't have
          const updatedHeroes = [...new Set([...currentHeroes, ...enabledHeroes])];
          
          // Only update if there are new heroes to add
          if (updatedHeroes.length > currentHeroes.length) {
            const heroesJson = JSON.stringify(updatedHeroes);
            const updateQuery = 'UPDATE users SET available_heroes = ? WHERE id = ?';
            
            this.db.run(updateQuery, [heroesJson, row.id], (updateErr) => {
              if (updateErr) {
                console.error('Error updating available heroes for user', row.id, updateErr.message);
              } else {
                const newHeroes = updatedHeroes.filter(hero => !currentHeroes.includes(hero));
                console.log(`✅ Added new heroes to user ${row.id}:`, newHeroes.join(', '));
              }
            });
          }
        });
      });
    } catch (error) {
      console.error('Error refreshing available heroes:', error);
    }
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

          // Get all enabled heroes for new user
          try {
            delete require.cache[require.resolve('./heros.json')];
            const allHeroes = require('./heros.json');
            const enabledHeroes = allHeroes.filter(hero => !hero.disabled).map(hero => hero.name);
            const heroesJson = JSON.stringify(enabledHeroes);

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
                available_heroes: enabledHeroes
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
        SELECT id, username, victory_points, survival_wins, 
               survival_losses, survival_used_heroes, available_heroes
        FROM users 
        WHERE id = ?
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
        
        try {
          survivalUsedHeroes = JSON.parse(row.survival_used_heroes || '[]');
          availableHeroes = JSON.parse(row.available_heroes || '[]');
        } catch (parseErr) {
          console.error('Error parsing user data:', parseErr);
        }

        resolve({
          id: row.id,
          username: row.username,
          victory_points: row.victory_points,
          survival_wins: row.survival_wins,
          survival_losses: row.survival_losses,
          survival_used_heroes: survivalUsedHeroes,
          available_heroes: availableHeroes
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
          const newXP = stats.xp + xpGain;
          const newLevel = this.calculateLevel(newXP);

          const query = `
            UPDATE player_stats 
            SET xp = ?, level = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE user_id = ?
          `;

          this.db.run(query, [newXP, newLevel, userId], function(err) {
            if (err) {
              reject(err);
              return;
            }

            resolve({
              ...stats,
              xp: newXP,
              level: newLevel,
              xpGained: xpGain,
              leveledUp: newLevel > stats.level
            });
          });
        })
        .catch(reject);
    });
  }

  calculateLevel(xp) {
    // Level progression: 100, 200, 300, ... up to level 10
    for (let level = 1; level <= 10; level++) {
      const xpRequired = level * 100;
      if (xp < xpRequired) {
        return level;
      }
    }
    return 10; // Max level
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
}

module.exports = Database;