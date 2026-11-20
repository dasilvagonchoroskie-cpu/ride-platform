'use strict';
// Respostas aprendidas (19/11/2026): registrar lacuna, sugerir a resposta da equipe, aprovar e virar ativa.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { criarAprendizado } = require('../src/ia/aprendizado');

function montar() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE wa_mensagens (id INTEGER PRIMARY KEY, conversa_id INT, direcao TEXT, origem TEXT, tipo TEXT, texto TEXT, created_at TEXT)');
  return { db, ap: criarAprendizado(db) };
}

test('aprendizado: registra a lacuna, sugere a resposta da equipe, aprova e vira ativa', () => {
  const { db, ap } = montar();
  const id = ap.registrarLacuna({ conversaId: 1, contatoId: 9, pergunta: 'precisa pagar taxa para cadastrar o comércio?' });
  assert.ok(id);
  assert.equal(ap.registrarLacuna({ conversaId: 1, contatoId: 9, pergunta: 'precisa pagar taxa para cadastrar o comércio?' }), null, 'não duplica pendente igual');
  assert.equal(ap.contarPendentes(), 1);
  db.prepare("INSERT INTO wa_mensagens (conversa_id, direcao, origem, tipo, texto, created_at) VALUES (1,'out','crm','text','[mensagem de voz] 🎤 Não paga nada, é grátis.', ?)")
    .run(new Date(Date.now() + 1000).toISOString());
  const { pendentes } = ap.listar();
  assert.equal(pendentes.length, 1);
  assert.match(pendentes[0].resposta, /grátis/, 'sugere a resposta da equipe (áudio transcrito, sem o rótulo)');
  const r = ap.decidir(id, { acao: 'aprovar', pergunta: pendentes[0].pergunta, resposta: 'O cadastro do comércio é gratuito.', usuarioId: 1 });
  assert.ok(r.ok);
  assert.equal(ap.contarPendentes(), 0);
  const ativ = ap.ativas();
  assert.equal(ativ.length, 1);
  assert.equal(ativ[0].resposta, 'O cadastro do comércio é gratuito.');
});

test('aprendizado: aprovar sem resposta é recusado; descartar tira da lista', () => {
  const { ap } = montar();
  const id = ap.registrarLacuna({ conversaId: 2, contatoId: 1, pergunta: 'vocês atendem em qual cidade?' });
  assert.equal(ap.decidir(id, { acao: 'aprovar', resposta: '   ' }).status, 422);
  assert.ok(ap.decidir(id, { acao: 'descartar' }).ok);
  assert.equal(ap.contarPendentes(), 0);
  assert.equal(ap.listar().pendentes.length, 0);
});
