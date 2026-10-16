// A real SQLite database in a throw-away directory, for reward/economy tests.
const fs = require('fs');
const os = require('os');
const path = require('path');

async function createTestDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heros-call-test-'));
  process.env.DATA_DIR = dir;
  const Database = require('../../database');
  const database = new Database();

  // Schema setup is asynchronous; wait until the last ALTER TABLE has added its column.
  for (let i = 0; i < 100; i++) {
    const ready = await new Promise(resolve => {
      if (!database.db) return resolve(false);
      database.db.all('PRAGMA table_info(users)', (err, cols) =>
        resolve(!err && cols.some(c => c.name === 'tutorial_completed')));
    });
    if (ready) break;
    await new Promise(r => setTimeout(r, 50));
  }

  const cleanup = async () => {
    await new Promise(resolve => database.db.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { database, cleanup, dir };
}

async function createUser(database, username, { heroes, victoryPoints = 0 } = {}) {
  const user = await database.createUser(username, 'password1');
  if (heroes) {
    await new Promise((resolve, reject) => database.db.run(
      'UPDATE users SET available_heroes = ? WHERE id = ?',
      [JSON.stringify(heroes), user.id], err => (err ? reject(err) : resolve())));
  }
  if (victoryPoints) await database.updateUserVictoryPoints(user.id, victoryPoints);
  await database.getPlayerStats(user.id); // creates the stats row
  return user.id;
}

module.exports = { createTestDatabase, createUser };
