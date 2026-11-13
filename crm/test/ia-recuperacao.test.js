'use strict';
// Falha real de 12/11 (12:27): o provedor de IA devolveu 5xx, a falha só foi para o log e a conversa ficou "IA atendendo"
// sem resposta. Aqui: nova tentativa, transferência quando não dá, recuperação após reinício, idempotência e estado visível.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function montar({ repetir = '0,0' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-rec-'));
  process.env.FM_DATA_DIR = dir;
  process.env.IA_ATRASO_MS = '0';
  process.env.IA_REPETIR_MS = repetir;
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db, getSetting, setSetting, nowISO } = require('../src/db');
  const { todayISO } = require('../src/http');
  const entities = require('../src/entities');
  const { ENTITIES } = require('../src/defs');
  const { createStore } = require('../src/whatsapp/store');
  const { createIaService } = require('../src/ia/service');
  const { ErroIA } = require('../src/ia/provider');
  const waStore = createStore(db);
  // Roteiro de respostas do provedor: 'erro503' | 'timeout' | 'chave' | objeto (JSON de análise/resposta).
  const roteiro = [];
  const chamadas = [];
  const provider = { completar: async ({ system }) => {
    chamadas.push(system.slice(0, 30));
    const passo = roteiro.length > 1 ? roteiro.shift() : roteiro[0];
    if (passo === 'erro503') throw new ErroIA('indisponivel', 'O serviço de IA está indisponível agora. Tente de novo em instantes.', 503);
    if (passo === 'timeout') throw new ErroIA('timeout', 'A IA demorou demais para responder. Tente de novo.');
    if (passo === 'chave') throw new ErroIA('chave_invalida', 'A chave da IA foi recusada.', 401);
    return { texto: JSON.stringify(passo), modelo: 'falso', tokensEntrada: 1, tokensSaida: 1 };
  } };
  const cofre = { ler: () => 'chave-falsa-0000000000000', final4: () => '0000', origem: () => 'arquivo', salvar() {}, apagar() {} };
  const logs = [];
  const audits = [];
  const ia = createIaService({ db, waStore, entities, ENTITIES, audit: (req, a, e, id, d) => audits.push(d), getSetting, setSetting, cofre, provider, todayISO, nowISO, log: { log: (m) => logs.push(m), error: (m) => logs.push(m) } });
  setSetting('ia_ativo', '1'); setSetting('ia_modo', 'automatico'); setSetting('ia_responder', '1');
  let n = 0;
  const receber = (texto) => waStore.ingerir({ jid: '5585999990000@s.whatsapp.net', telefone: '5585999990000', nome: 'Cliente Fictício', externoId: `X${++n}`, texto, tipo: 'text', quando: new Date().toISOString(), deMim: false });
  const conv = (id) => db.prepare('SELECT * FROM wa_conversas WHERE id = ?').get(id);
  const saidasIA = () => db.prepare("SELECT texto FROM wa_mensagens WHERE origem = 'ia' ORDER BY id").all().map((m) => m.texto);
  const espere = (ms) => new Promise((ok) => setTimeout(ok, ms));
  return { db, ia, waStore, receber, conv, saidasIA, roteiro, chamadas, logs, audits, espere, setSetting };
}

const ANALISE = { resumo: 'quer saber mais', perfil: 'desconhecido', campos: {}, resposta_sugerida: '', proxima_acao: '', atendimento: { opcao: 'outros', transferir: false } };
const RESPOSTA = { resposta: 'A Fortaleza Move é uma plataforma de transporte e entregas. Posso ajudar com o cadastro?', transferir: false };

test('caso real: provedor fora do ar (503) na 1ª tentativa → tenta de novo e responde; estado visível', async () => {
  const { ia, receber, conv, saidasIA, roteiro, espere, logs } = montar({ repetir: '50,50' });
  // conversa já em andamento com a IA (saudada, assunto cadastro), como a do teste real.
  const r = receber('oi');
  roteiro.push(ANALISE, RESPOSTA);
  await ia.executarAutomatico(r.conversaId);
  const antes = saidasIA().length;
  receber('Olá! Quero saber mais sobre a Fortaleza Move.');
  roteiro.length = 0; roteiro.push('erro503', ANALISE, RESPOSTA);
  await ia.executarAutomatico(r.conversaId);
  let c = conv(r.conversaId);
  assert.equal(c.ia_estado, 'tentando', 'não desiste no primeiro erro');
  assert.equal(c.ia_erro, 'indisponivel');
  assert.equal(c.ia_tentativas, 1);
  assert.ok(c.ia_proxima, 'próxima tentativa marcada');
  await espere(300);
  c = conv(r.conversaId);
  assert.equal(c.ia_estado, 'respondida', JSON.stringify({ c, logs }));
  assert.equal(c.atendimento, 'ia');
  assert.equal(saidasIA().length, antes + 1, 'respondeu uma vez');
  assert.match(saidasIA().pop(), /plataforma de transporte/);
});

test('provedor continua fora do ar: esgota as tentativas e transfere para a equipe com aviso fixo (nada fica "IA atendendo")', async () => {
  const { ia, receber, conv, saidasIA, roteiro, espere, audits } = montar({ repetir: '20,20' });
  roteiro.push('erro503');
  const r = receber('Olá! Quero saber mais sobre a Fortaleza Move.');
  await ia.executarAutomatico(r.conversaId);
  await espere(250);
  const c = conv(r.conversaId);
  assert.equal(c.atendimento, 'aguardando', 'saiu de "IA atendendo"');
  assert.match(c.atend_motivo, /A IA não conseguiu responder/);
  assert.equal(c.ia_estado, 'transferida_falha');
  assert.equal(c.ia_erro, 'indisponivel');
  assert.equal(saidasIA().length, 1);
  assert.match(saidasIA()[0], /transferir|equipe|atendente/i, 'cliente recebe o modelo de transferência');
  assert.ok(audits.some((d) => /falha da IA \(indisponivel\)/.test(d)));
});

test('erro não passageiro (chave recusada): transfere na hora, sem tentar de novo', async () => {
  const { ia, receber, conv, roteiro, chamadas } = montar({ repetir: '20,20' });
  roteiro.push('chave');
  const r = receber('Como funciona a plataforma?');
  await ia.executarAutomatico(r.conversaId);
  assert.equal(chamadas.length, 1);
  assert.equal(conv(r.conversaId).atendimento, 'aguardando');
  assert.equal(conv(r.conversaId).ia_erro, 'chave_invalida');
});

test('reinício do servidor: mensagem que ficou sem tratamento é recuperada pela varredura; repetir a varredura não duplica', async () => {
  const { ia, receber, conv, saidasIA, roteiro, db } = montar();
  roteiro.push(ANALISE, RESPOSTA);
  // Mensagem chegou e o servidor caiu antes do temporizador da IA (nenhum executarAutomatico).
  const r = receber('Como faço para me cadastrar?');
  db.prepare("UPDATE wa_mensagens SET created_at = ? WHERE conversa_id = ?").run(new Date(Date.now() - 60000).toISOString(), r.conversaId);
  const achadas = ia.recuperarPendentes();
  assert.deepEqual(achadas, [r.conversaId]);
  await new Promise((ok) => setTimeout(ok, 50));
  assert.equal(conv(r.conversaId).ia_estado, 'respondida');
  assert.equal(saidasIA().length, 1);
  assert.deepEqual(ia.recuperarPendentes(), [], 'já respondida: nada a recuperar');
  await new Promise((ok) => setTimeout(ok, 30));
  assert.equal(saidasIA().length, 1, 'sem resposta duplicada');
});

test('tentativa marcada antes do reinício é retomada quando vence; mensagem antiga demais não é respondida', async () => {
  const { ia, receber, conv, saidasIA, roteiro, db } = montar();
  roteiro.push(ANALISE, RESPOSTA);
  const r = receber('Quais serviços estão disponíveis?');
  const ultId = db.prepare('SELECT MAX(id) id FROM wa_mensagens').get().id;
  db.prepare("UPDATE wa_mensagens SET created_at = ? WHERE conversa_id = ?").run(new Date(Date.now() - 120000).toISOString(), r.conversaId);
  db.prepare("UPDATE wa_conversas SET ia_estado = 'tentando', ia_msg_id = ?, ia_tentativas = 1, ia_proxima = ? WHERE id = ?").run(ultId, new Date(Date.now() - 1000).toISOString(), r.conversaId);
  assert.deepEqual(ia.recuperarPendentes(), [r.conversaId]);
  await new Promise((ok) => setTimeout(ok, 50));
  assert.equal(conv(r.conversaId).ia_estado, 'respondida');
  assert.equal(saidasIA().length, 1);
  // Mensagem de 2 dias atrás (servidor ficou fora muito tempo): não responde sozinha.
  const r2 = waStore2(db, 'Mensagem antiga');
  assert.deepEqual(ia.recuperarPendentes().filter((x) => x === r2), []);
});
function waStore2(db, texto) {
  const { createStore } = require('../src/whatsapp/store');
  const s = createStore(db);
  const r = s.ingerir({ jid: '5585988880000@s.whatsapp.net', telefone: '5585988880000', nome: 'Outro Fictício', externoId: 'ANTIGA1', texto, tipo: 'text', quando: new Date().toISOString(), deMim: false });
  db.prepare("UPDATE wa_mensagens SET created_at = ? WHERE conversa_id = ?").run(new Date(Date.now() - 48 * 3600 * 1000).toISOString(), r.conversaId);
  return r.conversaId;
}

test('humano assumiu: varredura e falhas não respondem nem transferem; webhook repetido não gera resposta nova', async () => {
  const { ia, waStore, receber, conv, saidasIA, roteiro, db } = montar();
  roteiro.push('erro503');
  const r = receber('Quero falar sobre entregas');
  waStore.mudarAtendimento(r.conversaId, 'humano', { usuarioId: null, detalhe: 'teste' });
  db.prepare("UPDATE wa_mensagens SET created_at = ? WHERE conversa_id = ?").run(new Date(Date.now() - 60000).toISOString(), r.conversaId);
  assert.deepEqual(ia.recuperarPendentes(), []);
  assert.equal(conv(r.conversaId).atendimento, 'humano');
  assert.equal(saidasIA().length, 0);
  // Mesmo id externo de novo (webhook/evento repetido): não entra duas vezes.
  const dup = waStore.ingerir({ jid: '5585999990000@s.whatsapp.net', telefone: '5585999990000', nome: 'Cliente Fictício', externoId: 'X1', texto: 'Quero falar sobre entregas', tipo: 'text', quando: new Date().toISOString(), deMim: false });
  assert.ok(!dup || !dup.inserido);
});

test('mensagem nova durante o processamento não se perde: é tratada logo depois', async () => {
  const { ia, receber, saidasIA, roteiro } = montar();
  const RESP2 = { resposta: 'O Clube de Vantagens é para motoristas parceiros. Quer saber como participar?', transferir: false };
  roteiro.push(ANALISE, RESPOSTA, ANALISE, RESP2);
  const r = receber('Como funciona o serviço de entregas?');
  const p1 = ia.executarAutomatico(r.conversaId);
  receber('E o Clube de Vantagens?');
  await ia.executarAutomatico(r.conversaId); // chega durante a 1ª: fica marcada para depois
  await p1;
  await new Promise((ok) => setTimeout(ok, 80));
  const s = saidasIA();
  assert.ok(s.some((t) => /Clube de Vantagens/.test(t)), 'a segunda pergunta foi respondida');
});

test('reprocessar pela tela: só com a conversa na IA e última mensagem do cliente', async () => {
  const { ia, receber, conv, roteiro, waStore } = montar({ repetir: '' });
  roteiro.push('timeout');
  const r = receber('Como funciona o cadastro de motorista?');
  // sem tentativas configuradas e resposta desligada: fica "falhou" visível
  require('../src/db').setSetting('ia_responder', '0');
  await ia.executarAutomatico(r.conversaId);
  assert.equal(conv(r.conversaId).ia_estado, 'falhou');
  require('../src/db').setSetting('ia_responder', '1');
  roteiro.length = 0; roteiro.push(ANALISE, RESPOSTA);
  const c = await ia.reprocessar(r.conversaId);
  assert.equal(c.ia_estado, 'respondida');
  await assert.rejects(ia.reprocessar(r.conversaId), /já foi respondida/);
  waStore.mudarAtendimento(r.conversaId, 'humano', {});
  receber('ainda estou aqui');
  await assert.rejects(ia.reprocessar(r.conversaId), /Devolva a conversa para a IA/);
});

test('perguntas gerais: o contexto da redação traz os serviços do menu oficial e as informações de TODOS os assuntos; sem informação, manda encaminhar', () => {
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const P = require('../src/ia/prompt');
  const perguntas = ['Quero saber mais sobre a Fortaleza Move.', 'Como funciona a plataforma?', 'Quais serviços estão disponíveis?', 'Como faço para me cadastrar?',
    'Como funciona o cadastro de motorista?', 'Como funciona o serviço de entregas?', 'Como funciona o Clube de Vantagens?'];
  const info = { geral: 'Plataforma de Fortaleza (texto fictício).', clube: 'Descontos em parceiros (texto fictício).', encomendas: 'Coleta e entrega na cidade (texto fictício).' };
  for (const q of perguntas) {
    const { system, user } = P.montarPromptResposta({ mensagens: [{ direcao: 'in', texto: q }], perfil: 'desconhecido', assunto: 'cadastro', informacoes: info, jaSaudou: true });
    const ctx = JSON.parse(user.split('\n')[1]);
    assert.deepEqual(ctx.servicos_da_plataforma, ['Atendimento ao passageiro', 'Encomendas (enviar ou receber)', 'Comércios', 'Cadastro de motorista e veículo', 'Clube de Vantagens para motoristas']);
    assert.match(ctx.informacoes_oficiais, /Plataforma de Fortaleza/);
    assert.match(ctx.informacoes_oficiais, /Clube de Vantagens para motoristas: Descontos/, `${q}: info do clube mesmo com assunto "cadastro"`);
    assert.match(ctx.informacoes_oficiais, /Encomendas \(enviar ou receber\): Coleta/);
    assert.match(system, /Nunca invente informação, valor, prazo/);
    assert.match(system, /NÃO tiver informação oficial suficiente/);
    assert.ok(user.includes(q.slice(0, 20)), 'pergunta do cliente vai cercada na conversa');
  }
  const vazio = JSON.parse(P.montarPromptResposta({ mensagens: [{ direcao: 'in', texto: 'oi' }], perfil: 'desconhecido', assunto: null, informacoes: {} }).user.split('\n')[1]);
  assert.equal(vazio.informacoes_oficiais, 'nenhuma cadastrada');
});
