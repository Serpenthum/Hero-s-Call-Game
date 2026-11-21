// Driver over node:sqlite (tests and local Node). The only file allowed to import node:sqlite.
const { DatabaseSync } = require('node:sqlite');

function createNodeDriver(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  return {
    query(sql, params = []) {
      const stmt = db.prepare(sql);
      if (stmt.columns().length > 0) {
        const rows = stmt.all(...params).map((row) => ({ ...row }));
        return { rows, lastID: 0, changes: 0 };
      }
      const info = stmt.run(...params);
      return { rows: [], lastID: Number(info.lastInsertRowid), changes: Number(info.changes) };
    },
    execScript(sql) {
      db.exec(sql);
    },
    close() {
      db.close();
    },
  };
}

module.exports = { createNodeDriver };
