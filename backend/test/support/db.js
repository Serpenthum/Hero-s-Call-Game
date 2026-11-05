// A real SQLite database in a throw-away directory, for reward/economy tests.
const fs = require('fs');
const os = require('os');
const path = require('path');

async function createTestDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heros-call-test-'));
  const Database = require('../../database');
  const { createCompatDb } = require('../../sql/compat');
  const { createNodeDriver } = require('../../sql/nodeDriver');
  const database = new Database(createCompatDb(createNodeDriver(path.join(dir, 'test.sqlite'))));

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
