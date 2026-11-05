// sqlite3-style callback API over a synchronous driver:
//   { query(sql, params) -> { rows, lastID, changes }, execScript(sql) }
// No Node-only imports here: this file must bundle for Cloudflare Workers.
function createCompatDb(driver) {
  function exec(sql, params, cb, pick) {
    if (typeof params === 'function') {
      cb = params;
      params = [];
    }
    params = params || [];
    // Run now so statements execute in issue order; defer only the callback.
    let result = null;
    let error = null;
    try {
      result = driver.query(sql, params);
    } catch (err) {
      error = err;
    }
    if (typeof cb !== 'function') return;
    queueMicrotask(() => {
      if (error) cb.call({}, error);
      else pick(result, cb);
    });
  }

  return {
    run(sql, params, cb) {
      exec(sql, params, cb, (res, done) =>
        done.call({ lastID: res.lastID, changes: res.changes }, null));
    },
    get(sql, params, cb) {
      exec(sql, params, cb, (res, done) => done(null, res.rows[0]));
    },
    all(sql, params, cb) {
      exec(sql, params, cb, (res, done) => done(null, res.rows));
    },
    serialize(fn) {
      if (typeof fn === 'function') fn();
    },
    on() {},
    close(cb) {
      let error = null;
      try {
        if (typeof driver.close === 'function') driver.close();
      } catch (err) {
        error = err;
      }
      if (typeof cb === 'function') queueMicrotask(() => cb(error));
    },
  };
}

module.exports = { createCompatDb };
