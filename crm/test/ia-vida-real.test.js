'use strict';
// Reprodução do teste REAL do dono em 13/11/2026 (conversa do número da mãe, ligada a uma ficha de motorista, com histórico
// longo: pedidos de atendente, transferências, encerramentos). O modelo falso aqui se comporta como o Gemini real: se o
// texto que ele recebe tiver um pedido de atendente, ele manda transferir. Antes da correção, o histórico antigo fazia o novo
// atendimento ("Vim pelo site") cair direto na equipe. SIMULAÇÃO: não substitui o teste com o WhatsApp e o Gemini reais.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { recebidosFalso, tipoDoTexto } = require('./apoio/recebidos-falso');

function montar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-real-'));
  process.env.FM_DATA_DIR = dir;
  process.env.IA_ATRASO_MS = '0';
  process.env.IA_CONFIRMACAO_MS = '0';
  process.env.IA_REPETIR_MS = '0,0';
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db, getSetting, setSetting, nowISO } = require('../src/db');
  const { todayISO } = require('../src/http');
  const entities = require('../src/entities');
  const { ENTITIES } = require('../src/defs');
  const { createStore } = require('../src/whatsapp/store');
  const { createIaService } = require('../src/ia/service');
  const waStore = createStore(db);
  const vistos = [];
  const provider = {
    completar: async ({ system, user }) => {
      const redigir = /Central de Atendimento/.test(system);
      vistos.push({ redigir, user });
      if (redigir) return { texto: JSON.stringify({ resposta: 'Certo! Pode me contar mais, por favor?' }), modelo: 'falso' };
      // Como o modelo real: qualquer pedido de atendente no texto recebido → transferir.
      const pediu = /atendente|falar com (uma )?pessoa/i.test(user);
      return { texto: JSON.stringify({ resumo: 'x', perfil: 'motorista', campos: {}, atendimento: { opcao: 'cadastro', transferir: pediu, motivo_transferencia: pediu ? 'pediu_humano' : undefined } }), modelo: 'falso' };
    }
  };
  const cofre = { ler: () => 'chave-falsa-0000000000000', final4: () => '0000', origem: () => 'arquivo', salvar() {}, apagar() {} };
  const ia = createIaService({ db, waStore, entities, ENTITIES, audit: () => {}, getSetting, setSetting, cofre, provider, todayISO, nowISO, log: { log() {}, error() {} } });
  ia.definirRecebidos(recebidosFalso(db));
  setSetting('ia_ativo', '1'); setSetting('ia_modo', 'automatico'); setSetting('ia_responder', '1');
  const t = nowISO();
  db.prepare("INSERT INTO users (id, nome, email, senha_hash, role, created_at, updated_at) VALUES (1, 'Dono Fictício', 'dono@x.com', 'x', 'admin', ?, ?)").run(t, t);
  const motoristaId = db.prepare("INSERT INTO motoristas (nome, telefone, cidade, data_primeiro_contato, origem, situacao, created_at, updated_at) VALUES ('Fulano Fictício', '5564999990009', 'Goiatuba', '2026-11-12', 'WhatsApp', 'Novo interessado', ?, ?)").run(t, t).lastInsertRowid;
  let n = 0;
  const receber = async (texto, extra = {}) => {
    n += 1;
    const r = waStore.ingerir({ jid: '5564999990009@s.whatsapp.net', telefone: '5564999990009', nome: 'Fulano Fictício', externoId: `R${n}`, texto, tipo: tipoDoTexto(texto), quando: new Date(Date.now() + n).toISOString(), deMim: false, ...extra });
    if (n === 1) waStore.definirVinculo(waStore.obterConversa(r.conversaId).contato_id, 'motoristas', motoristaId);
    ia.registrarChegada(r.conversaId, r.mensagemId);
    await ia.executarAutomatico(r.conversaId);
    await new Promise((ok) => setTimeout(ok, 3));
    return r;
  };
  const daIA = () => db.prepare("SELECT texto FROM wa_mensagens WHERE origem = 'ia' AND tipo <> 'aviso' ORDER BY id").all().map((m) => m.texto);
  const conv = () => db.prepare('SELECT * FROM wa_conversas').get();
  const concluir = () => waStore.mudarAtendimento(conv().id, 'concluido', { usuarioId: 1 });
  return { receber, daIA, conv, concluir, vistos, db, waStore };
}

test('vida real: histórico antigo com "quero falar com um atendente" NÃO derruba o novo atendimento pelo site', async () => {
  const { receber, daIA, conv, concluir, vistos } = montar();
  await receber('Oi');
  await receber('quero falar com um atendente, por favor');
  assert.equal(conv().atendimento, 'aguardando', 'atendimento antigo: foi para a equipe');
  concluir();
  const antes = daIA().length;
  await receber('Olá! Vim pelo site da Fortaleza Move.');
  const nova = daIA().slice(antes);
  assert.equal(nova.length, 1, `uma resposta só: ${JSON.stringify(nova)}`);
  assert.match(nova[0], /^Olá! A Fortaleza Move agradece por entrar em contato conosco novamente/);
  assert.match(nova[0], /Para direcionarmos seu atendimento, escolha uma das opções/);
  assert.doesNotMatch(nova[0], /encaminhada para nossa equipe/);
  assert.equal(conv().atendimento, 'ia');
  const analise = vistos.filter((v) => !v.redigir).pop();
  if (analise) assert.doesNotMatch(analise.user, /atendente/, 'a análise do novo atendimento não recebe o histórico antigo');

  await receber('2');
  assert.match(daIA().pop(), /Sobre encomendas, escolha uma das opções/);
  await receber('1');
  assert.match(daIA().pop(), /^Certo! Para a coleta e entrega/);
  assert.equal(conv().atendimento, 'ia');
});

test('vida real: botão "Tenho um comércio" depois de atendimento transferido e concluído → saudação de retorno + abertura de comércio', async () => {
  const { receber, daIA, conv, concluir } = montar();
  await receber('Oi');
  await receber('preciso falar com um atendente');
  concluir();
  await receber('Olá! Tenho um comércio e quero entregas pela Fortaleza Move.');
  const r = daIA().pop();
  assert.match(r, /^Olá! A Fortaleza Move agradece por entrar em contato conosco novamente/);
  assert.match(r, /nome do estabelecimento/);
  assert.equal(conv().atendimento, 'ia');
  // clicou de novo no mesmo botão, sem concluir: novo atendimento de novo (não "já está com a equipe")
  await receber('Olá! Tenho um comércio e quero entregas pela Fortaleza Move.');
  assert.match(daIA().pop(), /nome do estabelecimento/);
});

test('vida real: transferida e AGUARDANDO a equipe; novo clique no site recomeça com menu (não o aviso de espera)', async () => {
  const { receber, daIA, conv } = montar();
  await receber('Oi');
  await receber('quero falar com atendente');
  assert.equal(conv().atendimento, 'aguardando');
  await receber('Olá! Vim pelo site da Fortaleza Move.');
  const r = daIA().pop();
  assert.match(r, /Para direcionarmos seu atendimento/);
  assert.doesNotMatch(r, /já está com a nossa equipe/);
});

test('vida real: no MEIO do atendimento, pedir atendente continua indo para a equipe', async () => {
  const { receber, conv, daIA } = montar();
  await receber('Olá! Vim pelo site da Fortaleza Move.');
  await receber('2');
  await receber('quero falar com uma pessoa de verdade');
  assert.equal(conv().atendimento, 'aguardando');
  assert.match(daIA().pop(), /encaminhada para nossa equipe/);
});
