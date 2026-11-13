'use strict';
// Simulação da migração numa CÓPIA em memória do banco: o arquivo original nunca é aberto para escrita.
// Devolve contagens antes/depois, o estado das migrações e o relatório de duplicados (sem telefones completos).
const Database = require('better-sqlite3');
const { migrar, estado, verificarIntegridade } = require('./index');
const { relatorioDuplicados } = require('../duplicados');

const TABELAS = ['motoristas', 'passageiros', 'parceiros', 'atendimentos', 'tarefas', 'interacoes', 'wa_contatos', 'wa_conversas', 'wa_mensagens', 'users', 'audit_log'];

function contar(db) {
  const out = {};
  for (const t of TABELAS) {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)) out[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  }
  return out;
}

// Impressão digital do conteúdo das tabelas existentes: prova que a migração não alterou nenhum registro antigo.
function digitalTabelas(db) {
  const crypto = require('crypto');
  const out = {};
  for (const t of Object.keys(contar(db))) {
    const h = crypto.createHash('sha256');
    for (const r of db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).iterate()) h.update(JSON.stringify(r));
    out[t] = h.digest('hex').slice(0, 16);
  }
  return out;
}

function simular(buffer, { log = { log() {} } } = {}) {
  // Cópia em memória: bancos em modo WAL não aceitam escrita depois de desserializados; os bytes 18–19 do cabeçalho
  // marcam o modo de diário e voltam para o tradicional (1) só NA CÓPIA.
  const copia = Buffer.from(buffer);
  if (copia.length > 20 && copia[18] === 2) { copia[18] = 1; copia[19] = 1; }
  const db = new Database(copia);
  db.pragma('foreign_keys = ON');
  const antes = { contagens: contar(db), digital: digitalTabelas(db), estado: estado(db), integridade: verificarIntegridade(db) };
  const duplicados = relatorioDuplicados(db);
  let resultado; let erro = null;
  try { resultado = migrar(db, { log }); } catch (e) { erro = e.message; }
  const depois = { contagens: contar(db), digital: digitalTabelas(db), estado: estado(db), integridade: verificarIntegridade(db) };
  const novas = {};
  for (const t of ['pessoas', 'empresas', 'vinculos']) {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)) novas[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  }
  const inalteradas = Object.keys(antes.digital).every((t) => antes.digital[t] === depois.digital[t]);
  db.close();
  return { antes, depois, novas, inalteradas, erro, aplicadas: resultado ? resultado.aplicadas : [], duplicados };
}

module.exports = { simular, contar, digitalTabelas };
