const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use GAUNTLET_STARTER_HEROES from database module
const { GAUNTLET_STARTER_HEROES } = require('./database');
const starterHeroes = [...GAUNTLET_STARTER_HEROES];

console.log('Starter heroes:', starterHeroes);

// Connect to database
const dbPath = path.join(__dirname, 'data', 'game_database.sqlite');
const db = new sqlite3.Database(dbPath);

// Update Admin1, Admin2, and Admin3
const starterHeroesJSON = JSON.stringify(starterHeroes);

db.serialize(() => {
  db.run(
    'UPDATE users SET available_heroes = ? WHERE username = ?',
    [starterHeroesJSON, 'Admin1'],
    function(err) {
      if (err) {
        console.error('Error updating Admin1:', err);
      } else {
        console.log(`✅ Admin1 reset to ${starterHeroes.length} starter heroes`);
      }
    }
  );

  db.run(
    'UPDATE users SET available_heroes = ? WHERE username = ?',
    [starterHeroesJSON, 'Admin2'],
    function(err) {
      if (err) {
        console.error('Error updating Admin2:', err);
      } else {
        console.log(`✅ Admin2 reset to ${starterHeroes.length} starter heroes`);
      }
    }
  );

  db.run(
    'UPDATE users SET available_heroes = ? WHERE username = ?',
    [starterHeroesJSON, 'Admin3'],
    function(err) {
      if (err) {
        console.error('Error updating Admin3:', err);
      } else {
        console.log(`✅ Admin3 reset to ${starterHeroes.length} starter heroes`);
      }
    }
  );

  // Verify the changes
  setTimeout(() => {
    db.get('SELECT username, available_heroes FROM users WHERE username = ?', ['Admin1'], (err, row) => {
      if (err) {
        console.error('Error verifying Admin1:', err);
      } else if (row) {
        const heroes = JSON.parse(row.available_heroes);
        console.log(`\nAdmin1 now has ${heroes.length} heroes:`, heroes);
      }
    });

    db.get('SELECT username, available_heroes FROM users WHERE username = ?', ['Admin2'], (err, row) => {
      if (err) {
        console.error('Error verifying Admin2:', err);
      } else if (row) {
        const heroes = JSON.parse(row.available_heroes);
        console.log(`\nAdmin2 now has ${heroes.length} heroes:`, heroes);
      }
    });

    db.get('SELECT username, available_heroes FROM users WHERE username = ?', ['Admin3'], (err, row) => {
      if (err) {
        console.error('Error verifying Admin3:', err);
      } else if (row) {
        const heroes = JSON.parse(row.available_heroes);
        console.log(`\nAdmin3 now has ${heroes.length} heroes:`, heroes);
      }
      
      db.close(() => {
        console.log('\n✅ Database connection closed');
      });
    });
  }, 500);
});
