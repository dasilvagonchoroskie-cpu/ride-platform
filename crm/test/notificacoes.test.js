'use strict';
// Notificações: tipos (mensagem, IA, transferência), feed, push com prioridade, limite por conversa e segurança.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const esperar = () => new Promise((r) => setTimeout(r, 20));
const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };

function montar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-notif-'));
  process.env.FM_DATA_DIR = dir;
  process.env.IA_ATRASO_MS = '0';
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db, getSetting, setSetting, nowISO } = require('../src/db');
  const { todayISO } = require('../src/http');
  const entities = require('../src/entities');
  const { ENTITIES } = require('../src/defs');
  const { createStore } = require('../src/whatsapp/store');
  const { createIaService } = require('../src/ia/service');
  const { createNotificacoes } = require('../src/notificacoes');
  const waStore = createStore(db);
  const enviados = [];
  const webpush = {
    generateVAPIDKeys: () => ({ publicKey: 'PUB', privateKey: 'PRIV' }),
    sendNotification: async (sub, corpo, opcoes) => { enviados.push({ sub, corpo: JSON.parse(corpo), opcoes }); if (sub.endpoint.includes('morto')) throw Object.assign(new Error('gone'), { statusCode: 410 }); }
  };
  const notif = createNotificacoes({ db, dataDir: dir, waStore, webpush, publicUrl: 'https://crm.exemplo', log: { error() {} } });
  const provider = { completar: async ({ system }) => ({ texto: JSON.stringify(/Central de Atendimento/.test(system) ? { resposta: 'Posso ajudar!' } : { resumo: 'x', perfil: 'desconhecido', campos: {}, atendimento: { opcao: 'indefinido', transferir: false } }), modelo: 'f', tokensEntrada: 1, tokensSaida: 1 }) };
  const cofre = { ler: () => 'chave-falsa-0000000000000', final4: () => '0000', origem: () => 'arquivo', salvar() {}, apagar() {} };
  const ia = createIaService({ db, waStore, entities, ENTITIES, audit() {}, getSetting, setSetting, cofre, provider, todayISO, nowISO, log: { log() {}, error() {} } });
  setSetting('ia_ativo', '1'); setSetting('ia_modo', 'automatico'); setSetting('ia_responder', '1');
  const uid = Number(db.prepare("INSERT INTO users (nome, email, senha_hash, role, ativo, created_at, updated_at) VALUES ('Evandro', 'e@x.com', 'x', 'admin', 1, ?, ?)").run(nowISO(), nowISO()).lastInsertRowid);
  let n = 0;
  const receber = async (texto) => {
    n += 1;
    const r = waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', nome: 'Maria', externoId: `N${n}`, texto, tipo: 'text', quando: new Date(Date.now() + n).toISOString(), deMim: false });
    await ia.executarAutomatico(r.conversaId);
    await esperar();
    return r;
  };
  return { db, notif, enviados, receber, uid, dir };
}

test('mensagem nova e IA respondendo: feed + push com prioridades diferentes; IA silenciosa', async () => {
  const { notif, enviados, receber, uid } = montar();
  assert.equal(notif.inscrever(uid, { subscription: SUB }).ok, true);
  await receber('oi');
  const { itens } = notif.feed(0);
  assert.deepEqual(itens.map((i) => i.tipo), ['mensagem', 'ia']);
  assert.match(itens[0].titulo, /^💬 Maria/);
  assert.match(itens[1].titulo, /^🤖 IA respondeu Maria/);
  assert.equal(enviados.length, 2);
  assert.equal(enviados[0].opcoes.urgency, 'normal');
  assert.equal(enviados[1].opcoes.urgency, 'low');
  assert.match(enviados[0].corpo.url, /^https:\/\/crm\.exemplo\/#\/conversas\?c=\d+$/);
  assert.equal(enviados[0].corpo.tipo, 'mensagem');
});

test('transferência para a equipe: notificação urgente com o motivo, sempre enviada', async () => {
  const { notif, enviados, receber, uid } = montar();
  notif.inscrever(uid, { subscription: SUB });
  await receber('oi');
  await receber('quero falar com um atendente');
  const t = notif.feed(0).itens.find((i) => i.tipo === 'transferencia');
  assert.ok(t, 'gera aviso de transferência');
  assert.match(t.titulo, /^🚨 Precisa de você: Maria/);
  assert.match(t.corpo, /Motivo: O cliente pediu atendimento humano/);
  const p = enviados.find((e) => e.corpo.tipo === 'transferencia');
  assert.equal(p.opcoes.urgency, 'high');
  assert.equal(p.opcoes.TTL, 86400);
});

test('mesma conversa: no máximo 1 push de mensagem por minuto (o feed recebe todas)', async () => {
  const { notif, enviados, receber, uid } = montar();
  notif.inscrever(uid, { subscription: SUB, tipos: { ia: false } });
  await receber('oi');
  await receber('tudo bem?');
  await receber('alô');
  assert.equal(notif.feed(0).itens.filter((i) => i.tipo === 'mensagem').length, 3);
  assert.equal(enviados.filter((e) => e.corpo.tipo === 'mensagem').length, 1);
  assert.equal(enviados.filter((e) => e.corpo.tipo === 'ia').length, 0, 'tipo desligado no aparelho não recebe');
});

test('segurança: só serviços de push conhecidos (sem SSRF), chaves validadas, aparelho morto removido', async () => {
  const { notif, receber, uid, db } = montar();
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://evil.com/fcm.googleapis.com', 'https://fcm.googleapis.com:8443/x', 'https://169.254.169.254/latest']) {
    assert.ok(notif.inscrever(uid, { subscription: { ...SUB, endpoint } }).erro, endpoint);
  }
  assert.ok(notif.inscrever(uid, { subscription: { ...SUB, keys: { p256dh: 'x', auth: 'y' } } }).erro);
  assert.equal(notif.inscrever(uid, { subscription: { ...SUB, endpoint: 'https://fcm.googleapis.com/fcm/send/morto' } }).ok, true);
  await receber('oi');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_inscricoes').get().n, 0, '410 apaga a inscrição');
});

test('feed sem "desde" devolve só o último id (não toca avisos antigos ao abrir o app)', async () => {
  const { notif, receber } = montar();
  await receber('oi');
  const f = notif.feed();
  assert.equal(f.itens.length, 0);
  assert.ok(f.ultimo >= 2);
  assert.equal(notif.feed(f.ultimo).itens.length, 0);
});

test('renovação da inscrição (ao abrir o app ou troca pelo serviço de push) mantém as escolhas do aparelho', () => {
  const { notif, uid, db } = montar();
  notif.inscrever(uid, { subscription: SUB, tipos: { ia: false, mensagem: true, transferencia: true } });
  // Mesmo endereço, sem tipos: não volta a ligar a IA que estava desligada.
  assert.equal(notif.inscrever(uid, { subscription: SUB, renovar: true }).ok, true);
  let linha = db.prepare('SELECT * FROM push_inscricoes WHERE endpoint = ?').get(SUB.endpoint);
  assert.equal(linha.avisar_ia, 0);
  assert.equal(linha.avisar_transferencia, 1);
  // Endereço novo no lugar do antigo: herda as escolhas e o antigo sai.
  const nova = { ...SUB, endpoint: 'https://fcm.googleapis.com/fcm/send/novo999' };
  assert.equal(notif.inscrever(uid, { subscription: nova, renovar: true, anterior: SUB.endpoint }).ok, true);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM push_inscricoes WHERE endpoint = ?').get(SUB.endpoint).c, 0);
  linha = db.prepare('SELECT * FROM push_inscricoes WHERE endpoint = ?').get(nova.endpoint);
  assert.equal(linha.avisar_ia, 0);
  assert.equal(linha.user_id, uid);
});
