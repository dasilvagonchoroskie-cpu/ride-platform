const { DatabaseSync } = require('node:sqlite');
class Database {
  constructor(p) { this.d = new DatabaseSync(p); }
  pragma(s) { this.d.exec('PRAGMA ' + s); }
  exec(s) { this.d.exec(s); }
  prepare(sql) {
    const st = this.d.prepare(sql);
    return {
      get: (...a) => st.get(...a),
      all: (...a) => st.all(...a),
      run: (...a) => { const r = st.run(...a); return { changes: r.changes, lastInsertRowid: r.lastInsertRowid }; }
    };
  }
  transaction(fn) {
    const run = (begin) => (...a) => {
      this.d.exec(begin);
      try { const r = fn(...a); this.d.exec('COMMIT'); return r; } catch (e) { this.d.exec('ROLLBACK'); throw e; }
    };
    const w = run('BEGIN'); w.immediate = run('BEGIN IMMEDIATE'); return w;
  }
  close() { this.d.close(); }
}
module.exports = Database;
