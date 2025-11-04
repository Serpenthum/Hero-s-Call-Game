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

    this.db.run(createUsersTable, (err) => {
      if (err) {
        console.error('Error creating users table:', err.message);
      } else {
        console.log('Users table created or already exists');
        
        // Initialize available heroes for all users if they don't have any
        this.initializeAvailableHeroes();
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

      this.db.get(query, [username], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          reject(new Error('User not found'));
          return;
        }

        // Compare password
        bcrypt.compare(password, row.password_hash, (compareErr, isMatch) => {
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