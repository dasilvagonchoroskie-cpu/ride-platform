'use strict';
// 19/11/2026: mensagem de voz gravada no CRM (formato, conversão para OGG/Opus e envio pela fila como áudio).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { formatoDoAudio, converterParaOgg } = require('../src/whatsapp/audio');

test('formato do áudio pelos primeiros bytes: webm, ogg e mp4; o resto é recusado', () => {
  assert.equal(formatoDoAudio(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)])), 'webm');
  assert.equal(formatoDoAudio(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)])), 'ogg');
  assert.equal(formatoDoAudio(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(20)])), 'mp4');
  assert.equal(formatoDoAudio(Buffer.from('#EXTM3U\nhttp://exemplo/x.ts\n')), null, 'lista HLS não passa');
  assert.equal(formatoDoAudio(Buffer.from('<html>oi</html>....')), null);
  assert.equal(formatoDoAudio(Buffer.alloc(4)), null);
});

const temFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('converte WebM/Opus do navegador para OGG/Opus (mensagem de voz do WhatsApp)', { skip: temFfmpeg ? false : 'ffmpeg não instalado neste ambiente' }, async () => {
  const webm = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libopus', '-f', 'webm', 'pipe:1']).stdout;
  assert.equal(formatoDoAudio(webm), 'webm');
  const ogg = await converterParaOgg(webm);
  assert.equal(ogg.slice(0, 4).toString('latin1'), 'OggS');
  assert.ok(ogg.length > 500);
  await assert.rejects(converterParaOgg(Buffer.from('isto não é um áudio de verdade, só texto')), /não aceito/);
  // Cabeçalho de WebM com lixo depois: o ffmpeg falha e o erro volta (nada é enviado).
  await assert.rejects(converterParaOgg(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(400, 7)])));
});

test('fila: a mensagem de voz vai pelo canal como áudio, fica "enviada" e a conversa mostra "Mensagem de voz"', async () => {
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
  await canal.receber({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', nome: 'Cliente Fictício', externoId: 'C1', texto: 'Oi',
    tipo: 'text', quando: new Date().toISOString(), deMim: false });
  const conversaId = db.prepare('SELECT id FROM wa_conversas').get().id;
  const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(800, 3)]);
  assert.ok(wa.store.enfileirarAudio({ conversaId, usuarioId: null, dados: Buffer.alloc(0), segundos: 3 }).erro, 'áudio vazio é recusado');
  const r = wa.store.enfileirarAudio({ conversaId, usuarioId: null, dados: ogg, segundos: 3 });
  assert.ok(r.mensagem && r.mensagem.tipo === 'audio');
  await wa.processarFila();
  const enviado = canal.enviados.find((x) => x.audio);
  assert.ok(enviado, 'foi como áudio');
  assert.equal(enviado.segundos, 3);
  assert.equal(enviado.tamanho, ogg.length);
  const m = db.prepare('SELECT status, externo_id, texto FROM wa_mensagens WHERE id = ?').get(r.mensagem.id);
  assert.equal(m.status, 'enviada');
  assert.ok(m.externo_id);
  assert.equal(m.texto, '[mensagem de voz]');
  assert.equal(db.prepare('SELECT ultima_mensagem FROM wa_conversas WHERE id = ?').get(conversaId).ultima_mensagem, '🎤 Mensagem de voz');
  // A transcrição entra depois no texto da mensagem (para a IA ler o contexto).
  wa.store.definirTranscricao(r.mensagem.id, '[mensagem de voz] 🎤 Bom dia, já vou verificar.');
  assert.match(db.prepare('SELECT texto FROM wa_mensagens WHERE id = ?').get(r.mensagem.id).texto, /já vou verificar/);
  wa.desligar && await wa.desligar();
});
