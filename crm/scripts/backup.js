'use strict';
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR } = require('../src/db');

(async () => {
  try {
    const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(DATA_DIR, 'backups');
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(targetDir, `crm-${stamp}.db`);
    await db.backup(target);
    fs.chmodSync(target, 0o600);
    console.log(`Backup SQLite criado: ${target}`);
  } catch (err) {
    console.error('Falha ao criar backup:', err.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
