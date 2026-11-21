// Driver over Durable Object SQL storage (SqlStorage). Cursors run lazily, so each
// statement's cursor is consumed with toArray() before last_insert_rowid()/changes() is read.
function createDoSqlDriver(sql) {
  return {
    query(text, params = []) {
      const rows = sql.exec(text, ...params).toArray();
      if (rows.length > 0 || /^\s*(SELECT|PRAGMA|WITH)\b/i.test(text)) {
        return { rows, lastID: 0, changes: 0 };
      }
      const info = sql.exec('SELECT last_insert_rowid() AS id, changes() AS n').one();
      return { rows: [], lastID: Number(info.id), changes: Number(info.n) };
    },
    execScript(script) {
      sql.exec(script);
    },
  };
}

module.exports = { createDoSqlDriver };
