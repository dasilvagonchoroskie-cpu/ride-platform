'use strict';
// Central de Atendimento Inteligente: saudação e menu, assuntos, transferência, espera, atendimento humano e modelos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { recebidosFalso, tipoDoTexto } = require('./apoio/recebidos-falso');

function montar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-central-'));
  process.env.FM_DATA_DIR = dir;
  process.env.IA_ATRASO_MS = '0';
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db, getSetting, setSetting, nowISO } = require('../src/db');
  const { todayISO } = require('../src/http');
  const entities = require('../src/entities');
  const { ENTITIES } = require('../src/defs');
  const { createStore } = require('../src/whatsapp/store');
  const { createIaService } = require('../src/ia/service');
  const waStore = createStore(db);
  const estado = { analise: { resumo: 'x', perfil: 'desconhecido', campos: {}, atendimento: { opcao: 'indefinido', transferir: false } }, redacao: { resposta: 'Certo! Posso ajudar com isso.' }, prompts: [] };
  const provider = {
    completar: async ({ system, user }) => {
      const redigir = /Central de Atendimento/.test(system);
      estado.prompts.push({ redigir, user });
      return { texto: JSON.stringify(redigir ? estado.redacao : estado.analise), modelo: 'falso', tokensEntrada: 1, tokensSaida: 1 };
    }
  };
  const cofre = { ler: () => 'chave-falsa-0000000000000', final4: () => '0000', origem: () => 'arquivo', salvar() {}, apagar() {} };
  const auditados = [];
  const ia = createIaService({ db, waStore, entities, ENTITIES, audit: (req, acao, t, id, det) => auditados.push({ acao, det }), getSetting, setSetting, cofre, provider, todayISO, nowISO, log: { log() {}, error() {} } });
  ia.definirRecebidos(recebidosFalso(db)); // SIMULAÇÃO do armazenamento (o real: test/wa-anexos.test.js)
  setSetting('ia_ativo', '1'); setSetting('ia_modo', 'automatico'); setSetting('ia_responder', '1');
  let n = 0;
  const receber = async (texto, extra = {}) => {
    n += 1;
    const r = waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', nome: 'Cliente', externoId: `E${n}`, texto, tipo: tipoDoTexto(texto), quando: new Date(Date.now() + n).toISOString(), deMim: false, ...extra });
    if (!extra.deMim) await ia.executarAutomatico(r.conversaId);
    return r;
  };
  const daIA = () => db.prepare("SELECT texto FROM wa_mensagens WHERE origem = 'ia' ORDER BY id").all().map((m) => m.texto);
  const conv = () => db.prepare('SELECT * FROM wa_conversas').get();
  return { db, ia, waStore, receber, daIA, conv, estado, auditados, setSetting };
}

test('primeiro contato: saudação + menu uma vez; número escolhe o assunto e a IA segue sem saudar de novo', async () => {
  const { receber, daIA, conv, estado } = montar();
  await receber('oi');
  let enviadas = daIA();
  assert.equal(enviadas.length, 1);
  assert.match(enviadas[0], /^Olá! Seja bem-vindo\(a\) à Fortaleza Move!/);
  assert.match(enviadas[0], /4\. Cadastro de motorista e veículo\./);
  assert.match(enviadas[0], /Digite o número da opção desejada\./);
  assert.ok(conv().saudado_em);

  await receber('4');
  enviadas = daIA();
  assert.equal(enviadas.length, 2);
  // 13/11: a opção escolhida recebe a abertura fixa da opção (Modelos), sem saudação repetida e sem menu.
  assert.match(enviadas[1], /^Ótimo! Para a avaliação do seu cadastro de motorista/);
  assert.equal(conv().atend_assunto, 'cadastro');

  await receber('Tenho carro próprio');
  enviadas = daIA();
  assert.equal(enviadas[2], 'Certo! Posso ajudar com isso.', 'depois da abertura, a IA redige seguindo o assunto');
  const ctx = estado.prompts.filter((p) => p.redigir).pop().user;
  assert.match(ctx, /Cadastro de motorista e veículo/);
  assert.match(ctx, /"ja_saudou":true/);

  await receber('menu');
  assert.match(daIA().pop(), /^Para direcionarmos seu atendimento/, 'cliente pode pedir o menu de novo');
});

test('primeira mensagem já com o assunto: saúda e responde direto (sem menu)', async () => {
  const { receber, daIA, conv, estado } = montar();
  estado.analise.atendimento = { opcao: 'clube', transferir: false };
  estado.redacao = { resposta: 'O Clube de Vantagens é para motoristas parceiros.' };
  await receber('quero saber do clube de vantagens');
  const [m] = daIA();
  assert.match(m, /^Olá! Seja bem-vindo/);
  assert.match(m, /Clube de Vantagens é para motoristas/);
  assert.doesNotMatch(m, /Digite o número/);
  assert.equal(conv().atend_assunto, 'clube');
});

test('pedido de atendente: transfere, registra o motivo, avisa a espera uma vez e depois fica quieta', async () => {
  const { receber, daIA, conv, db, auditados } = montar();
  await receber('oi');
  await receber('quero falar com um atendente');
  assert.equal(conv().atendimento, 'aguardando');
  assert.equal(conv().atend_motivo, 'O cliente pediu atendimento humano');
  assert.match(daIA().pop(), /^Sua solicitação foi encaminhada para nossa equipe/);
  assert.ok(auditados.some((a) => a.acao === 'wa_transferir'));
  assert.equal(db.prepare("SELECT tipo FROM wa_eventos ORDER BY id DESC").get().tipo, 'transferida');

  await receber('alô?');
  assert.match(daIA().pop(), /já está com a nossa equipe/, 'aviso de espera');
  const total = daIA().length;
  await receber('tem alguém aí?');
  assert.equal(daIA().length, total, 'aviso de espera não se repete');
});

test('IA sem informação ou assunto de valores: transfere com o motivo certo', async () => {
  const { receber, conv, estado } = montar();
  await receber('oi');
  estado.redacao = { resposta: '', transferir: true, motivo: 'valores' };
  await receber('quanto custa mandar uma caixa para Itumbiara?');
  assert.equal(conv().atendimento, 'aguardando');
  assert.equal(conv().atend_motivo, 'Negociação ou definição de valores');
});

test('humano assumiu: IA não responde; devolvida, volta a responder', async () => {
  const { receber, daIA, waStore, conv } = montar();
  const r = await receber('oi');
  waStore.mudarAtendimento(r.conversaId, 'humano', { detalhe: 'teste' });
  const antes = daIA().length;
  await receber('preciso de ajuda');
  assert.equal(daIA().length, antes, 'nenhuma resposta da IA com humano atendendo');
  waStore.mudarAtendimento(r.conversaId, 'ia', {});
  await receber('ainda preciso de ajuda');
  assert.equal(daIA().length, antes + 1);
  assert.equal(conv().atendimento, 'ia');
});

test('resposta pelo celular assume a conversa; eco da mensagem da IA não conta', async () => {
  const { receber, waStore, conv, db } = montar();
  const r = await receber('oi');
  const textoIA = db.prepare("SELECT texto FROM wa_mensagens WHERE origem = 'ia'").get().texto;
  waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', externoId: 'ECO1', texto: textoIA, tipo: 'text', quando: new Date().toISOString(), deMim: true });
  assert.equal(conv().atendimento, 'ia', 'eco do envio da IA não muda o estado');
  waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', externoId: 'CEL1', texto: 'Oi, aqui é o Evandro', tipo: 'text', quando: new Date().toISOString(), deMim: true });
  assert.equal(conv().atendimento, 'humano');
  void r;
});

test('concluído: cliente volta a escrever e a conversa reabre com a IA, sem saudar de novo no mesmo dia', async () => {
  const { receber, waStore, daIA, conv } = montar();
  const r = await receber('oi');
  waStore.mudarAtendimento(r.conversaId, 'concluido', {});
  assert.equal(conv().situacao, 'Resolvida');
  await receber('obrigado!');
  assert.equal(conv().atendimento, 'ia');
  assert.equal(conv().situacao, 'Aberta');
  assert.doesNotMatch(daIA().pop(), /bem-vindo/);
});

test('modelos editáveis: texto novo, modelo desativado e site oficial no encerramento', async () => {
  const { ia, receber, daIA } = montar();
  const c = ia.central;
  c.salvarModelos([{ id: 'saudacao', texto: 'Oi! Aqui é a Fortaleza Move.', ativo: true }, { id: 'menu', texto: 'x', ativo: false }]);
  assert.throws(() => c.salvarModelos([{ id: 'inventado', texto: 'x' }]), /desconhecido/);
  assert.throws(() => c.salvarSite('http://site.com'), /inválido/);
  assert.doesNotMatch(c.texto('encerramento'), /Acesse|\{site/, 'sem site configurado, o bloco do site some');
  c.salvarSite('https://fortalezamove.com.br');
  assert.match(c.texto('encerramento'), /Acesse: https:\/\/fortalezamove\.com\.br/);
  assert.match(c.texto('encerramento'), /^A Fortaleza Move agradece[\s\S]*Conte sempre com a Fortaleza Move!$/);
  await receber('oi');
  const [m] = daIA();
  assert.match(m, /^Oi! Aqui é a Fortaleza Move\./);
  assert.doesNotMatch(m, /Digite o número/, 'menu desativado não é enviado');
});

test('documento: confirma o recebimento uma vez e pede o que falta (sem dizer que foi analisado)', async () => {
  const { receber, daIA, conv, estado } = montar();
  await receber('oi');
  estado.analise = { resumo: 'cnh', perfil: 'motorista', campos: { cnh_categoria: 'B' }, atendimento: { opcao: 'cadastro', transferir: false } };
  await receber('[documento] 📎 Documento: CNH\nCategoria: B');
  const m = daIA().pop();
  // 12/11 noite: são 7 itens; pede 2 por vez e avisa quantos ainda faltam (nunca considera completo com menos de 7).
  assert.match(m, /^Recebemos o seu documento\. Obrigado! Agora, envie também o documento do veículo \(CRLV\) e um comprovante de residência \(conta de luz, água ou internet\)\. Depois disso, ainda faltarão 4 item\(ns\) da lista\.$/);
  assert.doesNotMatch(m, /aprovad|analisad/i);
  assert.equal(conv().atendimento, 'ia');
});

test('humano: volta sozinha para a IA depois do tempo sem resposta da equipe (0 = só pelo botão)', async () => {
  const { receber, daIA, waStore, conv, db, setSetting } = montar();
  const r = await receber('oi');
  // Equipe respondeu pelo celular há 40 min.
  const antiga = new Date(Date.now() - 40 * 60000).toISOString();
  waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', externoId: 'CEL1', texto: 'Oi, já te respondo', tipo: 'text', quando: antiga, deMim: true });
  assert.equal(conv().atendimento, 'humano');
  db.prepare('UPDATE wa_conversas SET atend_em = ? WHERE id = ?').run(antiga, r.conversaId);

  setSetting('ia_humano_pausa_min', '0');
  let antes = daIA().length;
  await receber('e aí?');
  assert.equal(daIA().length, antes, 'com 0, fica com a equipe');
  assert.equal(conv().atendimento, 'humano');

  setSetting('ia_humano_pausa_min', '60');
  await receber('alguém?');
  assert.equal(daIA().length, antes, '40 min < 60: ainda com a equipe');

  setSetting('ia_humano_pausa_min', '30');
  antes = daIA().length;
  await receber('preciso de ajuda com o cadastro');
  assert.equal(conv().atendimento, 'ia', '40 min > 30: voltou para a IA');
  assert.equal(daIA().length, antes + 1, 'e respondeu');
  assert.match(db.prepare("SELECT detalhe FROM wa_eventos WHERE tipo = 'devolvida' ORDER BY id DESC").get().detalhe, /após 30 min/);
});

test('humano: equipe respondeu agora há pouco → IA continua quieta', async () => {
  const { receber, daIA, waStore, conv } = montar();
  await receber('oi');
  waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', externoId: 'CEL2', texto: 'Oi! Sou o Evandro', tipo: 'text', quando: new Date().toISOString(), deMim: true });
  const antes = daIA().length;
  await receber('beleza');
  assert.equal(conv().atendimento, 'humano');
  assert.equal(daIA().length, antes);
});

test('devolvida pelo botão logo depois da resposta da equipe: a IA responde na hora (sem esperar 15 min)', async () => {
  const { receber, daIA, waStore, conv } = montar();
  const r = await receber('oi');
  waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', externoId: 'CEL3', texto: 'Oi, aqui é o Evandro', tipo: 'text', quando: new Date(Date.now() - 60000).toISOString(), deMim: true });
  assert.equal(conv().atendimento, 'humano');
  waStore.mudarAtendimento(r.conversaId, 'ia', { detalhe: 'botão' });
  const antes = daIA().length;
  await receber('quero me cadastrar como motorista');
  assert.equal(daIA().length, antes + 1);
});
