'use strict';
// Cartões do painel abrem a lista já filtrada (13/11/2026): vários valores de situação separados por "|".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function montar() {
  process.env.FM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-cart-'));
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db } = require('../src/db');
  const entities = require('../src/entities');
  return { db, entities };
}

test('filtro de select aceita vários valores com "|" (parametrizado) e ignora o excesso', () => {
  const { entities } = montar();
  const def = entities.ENTITIES.motoristas;
  const um = entities.montarFiltro(def, { f_situacao: 'Novo interessado' });
  assert.ok(um.where.join(' ').includes('situacao = ?'));
  assert.deepEqual(um.params, ['Novo interessado']);

  const dois = entities.montarFiltro(def, { f_situacao: 'Novo interessado|Contratado' });
  assert.ok(dois.where.join(' ').includes('situacao IN (?,?)'));
  assert.deepEqual(dois.params, ['Novo interessado', 'Contratado']);

  const muitos = entities.montarFiltro(def, { f_situacao: Array.from({ length: 30 }, (_, i) => `S${i}`).join('|') });
  assert.equal(muitos.params.length, 12);

  // Injeção: o texto vai só como parâmetro, nunca no SQL.
  const mau = entities.montarFiltro(def, { f_situacao: "x' OR 1=1 --|y" });
  assert.ok(!mau.where.join(' ').includes('OR 1=1'));
});

test('listagem filtrada por duas situações devolve só essas', () => {
  const { db, entities } = montar();
  const def = entities.ENTITIES.motoristas;
  const sits = def.fields.find((f) => f.key === 'situacao').options;
  const [a, b, c] = sits;
  const ins = db.prepare(`INSERT INTO motoristas (nome, telefone, cidade, data_primeiro_contato, origem, situacao, created_at, updated_at) VALUES (?, ?, 'Fortaleza', '2026-11-13', 'WhatsApp', ?, datetime('now'), datetime('now'))`);
  ins.run('Fictício A', '85999990001', a);
  ins.run('Fictício B', '85999990002', b);
  ins.run('Fictício C', '85999990003', c);
  const r = entities.listEntity(def, { f_situacao: `${a}|${b}` });
  assert.equal(r.total, 2);
  const so = entities.listEntity(def, { f_situacao: c });
  assert.equal(so.total, 1);
});
