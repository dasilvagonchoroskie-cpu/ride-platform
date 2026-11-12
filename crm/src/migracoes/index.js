'use strict';
// Migrações versionadas do banco (Etapa 2 em diante).
//
// Regras:
// - Cada migração tem número (versao), nome e uma função up(db). A lista é fechada e em ordem crescente.
// - Uma migração aplicada fica registrada em `schema_migracoes` com uma impressão digital (checksum) do código.
//   Se o código de uma migração JÁ APLICADA for alterado depois, o CRM recusa continuar (integridade).
// - Cada migração roda inteira dentro de UMA transação: se qualquer parte falhar (inclusive a verificação final),
//   o SQLite desfaz tudo e o banco fica exatamente como estava. Nada fica pela metade.
// - Antes e depois: PRAGMA integrity_check e foreign_key_check. Uma migração pode trazer a própria verificar(db).
// - Rodar duas vezes não faz nada na segunda (idempotente): só roda o que não está registrado.
// - Em produção só roda com FM_ETAPA2=1 (ver db.js) e depois de um retrato forçado do cofre.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LISTA = [
  require('./001_pessoas_empresas_vinculos'),
  require('./002_vincular_cadastros_existentes'),
  require('./003_entregadores')
];

const checksum = (m) => crypto.createHash('sha256').update(`${m.versao}|${m.nome}|${m.up.toString()}|${m.verificar ? m.verificar.toString() : ''}`).digest('hex');

function garantirTabela(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migracoes (
    versao INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    checksum TEXT NOT NULL,
    aplicada_em TEXT NOT NULL,
    duracao_ms INTEGER,
    resumo TEXT
  )`);
}

function validarLista(lista) {
  let anterior = 0;
  for (const m of lista) {
    if (!Number.isInteger(m.versao) || m.versao <= anterior) throw new Error(`Lista de migrações fora de ordem na versão ${m.versao}.`);
    if (typeof m.up !== 'function' || !m.nome) throw new Error(`Migração ${m.versao} incompleta.`);
    anterior = m.versao;
  }
}

/** Situação das migrações: o que foi aplicado, o que falta e se algum código aplicado foi alterado. */
function estado(db, lista = LISTA) {
  validarLista(lista);
  garantirTabela(db);
  const feitas = new Map(db.prepare('SELECT versao, nome, checksum, aplicada_em FROM schema_migracoes ORDER BY versao').all().map((r) => [r.versao, r]));
  const aplicadas = [];
  const pendentes = [];
  const alteradas = [];
  for (const m of lista) {
    const r = feitas.get(m.versao);
    if (!r) pendentes.push(m.versao);
    else {
      aplicadas.push(m.versao);
      if (r.checksum !== checksum(m)) alteradas.push(m.versao);
    }
  }
  const conhecidas = new Set(lista.map((m) => m.versao));
  const desconhecidas = [...feitas.keys()].filter((v) => !conhecidas.has(v));
  return { aplicadas, pendentes, alteradas, desconhecidas, versao_atual: aplicadas.length ? Math.max(...aplicadas) : 0 };
}

/** Integridade física (páginas do arquivo) e das chaves estrangeiras. */
function verificarIntegridade(db) {
  const problemas = [];
  const ic = db.prepare('PRAGMA integrity_check').all().map((r) => Object.values(r)[0]);
  if (!(ic.length === 1 && ic[0] === 'ok')) problemas.push(...ic.slice(0, 10).map((x) => `integridade: ${x}`));
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  if (fk.length) problemas.push(`chaves estrangeiras quebradas: ${fk.length} (ex.: ${fk[0].table}#${fk[0].rowid})`);
  return { ok: problemas.length === 0, problemas };
}

/**
 * Aplica as migrações pendentes. Lança erro (sem alterar o banco) se: a lista estiver errada, uma migração aplicada
 * tiver sido alterada, o banco já estiver com problema de integridade, ou qualquer migração/verificação falhar.
 * @param {object} opcoes.ate     aplica só até esta versão (inclusive)
 * @param {function} opcoes.antes chamado antes de cada migração (ex.: cópia de segurança)
 */
function migrar(db, { lista = LISTA, ate = Infinity, antes = null, log = console } = {}) {
  const st = estado(db, lista);
  if (st.alteradas.length) throw new Error(`Migração já aplicada foi alterada no código (versão ${st.alteradas.join(', ')}). Nada foi feito.`);
  if (st.desconhecidas.length) throw new Error(`O banco tem migração que este código não conhece (versão ${st.desconhecidas.join(', ')}): código mais antigo que o banco. Nada foi feito.`);
  const antesInt = verificarIntegridade(db);
  if (!antesInt.ok) throw new Error(`Banco com problema antes de migrar: ${antesInt.problemas.join('; ')}. Nada foi feito.`);

  const feitas = [];
  for (const m of lista) {
    if (!st.pendentes.includes(m.versao) || m.versao > ate) continue;
    if (antes) antes(m);
    const inicio = Date.now();
    let resumo = null;
    db.transaction(() => {
      resumo = m.up(db) || null;
      if (m.verificar) {
        const v = m.verificar(db);
        if (v && v.length) throw new Error(`verificação da migração ${m.versao} falhou: ${v.join('; ')}`);
      }
      const fk = db.prepare('PRAGMA foreign_key_check').all();
      if (fk.length) throw new Error(`migração ${m.versao} deixou ${fk.length} chave(s) estrangeira(s) quebrada(s)`);
      db.prepare('INSERT INTO schema_migracoes (versao, nome, checksum, aplicada_em, duracao_ms, resumo) VALUES (?, ?, ?, ?, ?, ?)')
        .run(m.versao, m.nome, checksum(m), new Date().toISOString(), Date.now() - inicio, resumo ? JSON.stringify(resumo) : null);
    })();
    feitas.push({ versao: m.versao, nome: m.nome, resumo });
    if (log && log.log) log.log(`[migração] ${m.versao} ${m.nome} aplicada${resumo ? ` ${JSON.stringify(resumo)}` : ''}`);
  }
  const depois = verificarIntegridade(db);
  if (!depois.ok) throw new Error(`Banco com problema depois de migrar: ${depois.problemas.join('; ')}`);
  return { aplicadas: feitas, estado: estado(db, lista) };
}

/** Cópia de segurança local do banco antes de migrar (pasta backups/, fora do retrato do cofre). */
function copiaDeSeguranca(db, dataDir, versao) {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const arq = path.join(dir, `pre-migracao-${versao}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  fs.writeFileSync(arq, db.serialize(), { mode: 0o600 });
  return arq;
}

/** Usado por db.js ao ligar (só com FM_ETAPA2=1): cópia de segurança antes de cada migração. */
function migrarAoLigar(db, dataDir, log = console) {
  const st = estado(db);
  if (!st.pendentes.length) return { aplicadas: [], estado: st };
  return migrar(db, { log, antes: (m) => log.log(`[migração] cópia de segurança antes da ${m.versao}: ${copiaDeSeguranca(db, dataDir, m.versao)}`) });
}

module.exports = { LISTA, estado, migrar, migrarAoLigar, verificarIntegridade, copiaDeSeguranca, checksum };
