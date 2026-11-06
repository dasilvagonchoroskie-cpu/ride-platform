'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.FM_DATA_DIR ? path.resolve(process.env.FM_DATA_DIR) : path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

const DB_PATH = process.env.FM_DB_PATH ? path.resolve(process.env.FM_DB_PATH) : path.join(DATA_DIR, 'crm.db');
const db = new Database(DB_PATH);
try { fs.chmodSync(DB_PATH, 0o600); } catch (err) { /* permissões podem ser geridas pelo volume */ }
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Migração simples e segura: campo novo em defs.js que ainda não existe na tabela vira coluna (TEXT, opcional).
// Só ACRESCENTA colunas; nunca apaga nem altera dados. Nomes vêm só de defs.js (lista fechada, sem entrada de usuário).
(function acrescentarColunas() {
  // Colunas de sistema (fora de defs.js).
  const usuarios = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  for (const [col, tipo] of [['totp_segredo', 'TEXT'], ['totp_pendente', 'TEXT'], ['totp_ativo', 'INTEGER NOT NULL DEFAULT 0'], ['totp_ultimo_passo', 'INTEGER NOT NULL DEFAULT 0']]) {
    if (!usuarios.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${tipo}`);
  }
  const { ENTITIES } = require('./defs');
  for (const def of Object.values(ENTITIES)) {
    if (!/^[a-z_]+$/.test(def.table)) continue;
    const existentes = new Set(db.prepare(`PRAGMA table_info(${def.table})`).all().map((c) => c.name));
    if (!existentes.size) continue;
    for (const f of def.fields) {
      if (existentes.has(f.key) || f.required || !/^[a-z_]+$/.test(f.key)) continue;
      db.exec(`ALTER TABLE ${def.table} ADD COLUMN ${f.key} TEXT`);
    }
  }
})();

const nowISO = () => new Date().toISOString();

/* ----------------------------- configurações ----------------------------- */
function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), nowISO());
}

const SETTINGS_DEFAULTS = {
  org_nome: 'Fortaleza Move',
  slogan: 'Seu caminho, sua viagem, sua segurança.',
  alerta_dias: '7',
  comissao_padrao: '10'
};

for (const [k, v] of Object.entries(SETTINGS_DEFAULTS)) {
  if (getSetting(k, null) === null) setSetting(k, v);
}

/* --------------------------- cenários financeiros -------------------------- */
const CUSTOS_PADRAO = [
  'Manutenção da plataforma',
  'Marketing e divulgação',
  'Suporte e atendimento',
  'Taxas de pagamento',
  'Outros custos'
];

if (getSetting('seed_cenarios', '0') !== '1') {
  const now = nowISO();
  const inserir = db.prepare(`
    INSERT INTO cenarios (nome, descricao, motoristas_ativos, corridas_motorista_dia, dias_operacao, valor_medio_corrida, comissao_pct, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const custo = db.prepare('INSERT INTO cenario_custos (cenario_id, descricao, valor, created_at) VALUES (?, ?, ?, ?)');

  const cenarios = [
    ['Conservador', 'Operação inicial, com base reduzida de motoristas.', 10, 8, 26, 18, 10],
    ['Intermediário', 'Cenário de referência para a operação em ritmo normal.', 30, 10, 26, 20, 10],
    ['Expansão', 'Operação ampliada, com frota maior e mais dias de operação.', 60, 12, 30, 22, 10]
  ];

  const tx = db.transaction(() => {
    for (const c of cenarios) {
      const info = inserir.run(c[0], c[1], c[2], c[3], c[4], c[5], c[6], now, now);
      for (const desc of CUSTOS_PADRAO) custo.run(info.lastInsertRowid, desc, 0, now);
    }
    setSetting('seed_cenarios', '1');
  });
  tx();
}

module.exports = { db, DB_PATH, DATA_DIR, ROOT, nowISO, getSetting, setSetting };
