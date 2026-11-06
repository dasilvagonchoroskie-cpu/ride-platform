'use strict';
// Transcrição de mensagens de voz: conector, transcritor (Gemini/Groq) e o fluxo áudio → texto → IA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mensagemParaEvento } = require('../src/whatsapp/baileys-channel');
const { criarTranscritor } = require('../src/ia/transcricao');

const cofreCom = (chaves) => ({ ler: (p) => chaves[p] || '' });
function fetchSeq(respostas) {
  const chamadas = [];
  const f = async (url, init) => {
    chamadas.push({ url, init });
    const r = respostas.length > 1 ? respostas.shift() : respostas[0];
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  };
  f.chamadas = chamadas;
  return f;
}
const audio = Buffer.from('OggS-audio-de-teste');

test('mensagem de voz traz os dados do áudio (para transcrever depois)', () => {
  const agora = Math.floor(Date.now() / 1000);
  const evt = mensagemParaEvento({ key: { remoteJid: '5564999990000@s.whatsapp.net', id: 'A1', fromMe: false }, messageTimestamp: agora,
    message: { audioMessage: { ptt: true, mimetype: 'audio/ogg; codecs=opus', seconds: 12, fileLength: 20480 } } }, 'notify', agora);
  assert.equal(evt.tipo, 'audio');
  assert.equal(evt.texto, '[mensagem de voz]');
  assert.deepEqual(evt.midia, { tipo: 'audio', mime: 'audio/ogg', segundos: 12, bytes: 20480 });
  const texto = mensagemParaEvento({ key: { remoteJid: '5564999990000@s.whatsapp.net', id: 'A2' }, messageTimestamp: agora, message: { conversation: 'oi' } }, 'notify', agora);
  assert.equal(texto.midia, undefined);
});

test('Gemini: manda o áudio embutido, chave no cabeçalho (nunca na URL)', async () => {
  const f = fetchSeq([{ status: 200, body: { candidates: [{ content: { parts: [{ text: 'Fechado, pode cadastrar o lava-jato.' }] } }] } }]);
  const t = criarTranscritor({ cofre: cofreCom({ gemini: 'AIza-chave-gemini-000000000' }), obterModeloGemini: async () => 'gemini-3.5-flash-lite', fetchImpl: f });
  const r = await t.transcrever({ audio, mime: 'audio/ogg', segundos: 5 });
  assert.equal(r.texto, 'Fechado, pode cadastrar o lava-jato.');
  assert.equal(r.provedor, 'gemini');
  assert.match(f.chamadas[0].url, /models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.ok(!f.chamadas[0].url.includes('AIza'));
  assert.equal(f.chamadas[0].init.headers['x-goog-api-key'], 'AIza-chave-gemini-000000000');
  const corpo = JSON.parse(f.chamadas[0].init.body);
  assert.equal(corpo.contents[0].parts[1].inline_data.mime_type, 'audio/ogg');
  assert.equal(Buffer.from(corpo.contents[0].parts[1].inline_data.data, 'base64').toString(), 'OggS-audio-de-teste');
});

test('Gemini sem cota: cai para o Groq (Whisper), cada um com a própria chave', async () => {
  const f = fetchSeq([{ status: 429 }, { status: 200, body: { text: 'Bom dia, tudo certo.' } }]);
  const t = criarTranscritor({ cofre: cofreCom({ gemini: 'AIza-chave-gemini-000000000', groq: 'gsk_chave_groq_0000000000' }), obterModeloGemini: async () => 'g', fetchImpl: f });
  const r = await t.transcrever({ audio, mime: 'audio/ogg' });
  assert.equal(r.provedor, 'groq');
  assert.equal(f.chamadas[1].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(f.chamadas[1].init.headers.authorization, 'Bearer gsk_chave_groq_0000000000');
  assert.ok(f.chamadas[1].init.body instanceof FormData);
  assert.equal(f.chamadas[1].init.body.get('model'), 'whisper-large-v3');
});

test('limites: sem chave, áudio grande, longo ou formato estranho são recusados', async () => {
  const sem = criarTranscritor({ cofre: cofreCom({}), obterModeloGemini: async () => 'g', fetchImpl: fetchSeq([{ status: 200, body: {} }]) });
  await assert.rejects(sem.transcrever({ audio }), (e) => e.codigo === 'sem_chave');
  const t = criarTranscritor({ cofre: cofreCom({ gemini: 'AIza-x-00000000000000000' }), obterModeloGemini: async () => 'g', fetchImpl: fetchSeq([{ status: 200, body: {} }]) });
  await assert.rejects(t.transcrever({ audio: Buffer.alloc(16 * 1024 * 1024) }), /grande/);
  await assert.rejects(t.transcrever({ audio, segundos: 3600 }), /longo/);
  await assert.rejects(t.transcrever({ audio, mime: 'application/x-msdownload' }), /não suportado/);
});

test('fluxo: áudio do contato chega, vira texto e só então a IA é chamada (forçando nova análise)', async () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'schema.sql'), 'utf8'));
  const { createService } = require('../src/whatsapp/service');
  const { criarCanalFalso } = require('../src/whatsapp/fake-channel');
  const canal = criarCanalFalso({ conectado: true });
  const settings = { wa_ativo: '1' };
  const wa = createService({ db, getSetting: (k, d) => (k in settings ? settings[k] : d), setSetting: (k, v) => { settings[k] = v; },
    dataDir: '/tmp', log: { log() {}, error() {} }, pausaEntreEnvios: () => 0, criarCanal: () => canal });
  await wa.iniciar();
  const avisos = [];
  wa.definirGancho((conversaId, opcoes) => avisos.push({ conversaId, opcoes }));
  wa.definirTranscritor(async ({ mensagemId, midia }) => {
    const buf = await midia.baixar();
    assert.equal(buf.toString(), 'audio');
    wa.store.definirTranscricao(mensagemId, '[mensagem de voz] 🎤 fechado, pode cadastrar');
    return true;
  });
  canal.receber({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', nome: 'Eduardo', externoId: 'V1', texto: '[mensagem de voz]',
    tipo: 'audio', quando: new Date().toISOString(), deMim: false, midia: { tipo: 'audio', mime: 'audio/ogg', segundos: 4, baixar: async () => Buffer.from('audio') } });
  assert.equal(avisos.length, 0, 'a IA não é chamada antes do texto ficar pronto');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(avisos.length, 1);
  assert.deepEqual(avisos[0].opcoes, { forcar: true });
  const msg = db.prepare('SELECT texto FROM wa_mensagens WHERE externo_id = ?').get('V1');
  assert.match(msg.texto, /fechado, pode cadastrar/);
  const conv = db.prepare('SELECT ultima_mensagem FROM wa_conversas').get();
  assert.match(conv.ultima_mensagem, /fechado/);
  await wa.desligar();
});
