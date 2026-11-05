'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const phone = require('../src/whatsapp/phone');
const { mensagemParaEvento, normalizarBiblioteca, resolverEntrada, carregarBiblioteca } = require('../src/whatsapp/baileys-channel');

const AGORA = 1_800_000_000;
const msg = (over = {}) => ({
  key: { remoteJid: '5585999990000@s.whatsapp.net', id: 'ABC1', fromMe: false },
  message: { conversation: 'Oi, quero ser motorista' },
  messageTimestamp: AGORA - 5,
  pushName: 'Maria',
  ...over
});

test('telefones: formatos diferentes do mesmo número geram a mesma chave (com e sem o 9)', () => {
  const k = phone.waKey('5585999990000');
  assert.equal(phone.crmKey('(85) 99999-0000'), k);
  assert.equal(phone.crmKey('+55 85 99999-0000'), k);
  assert.equal(phone.crmKey('85 9999-0000'), k);          // sem o 9
  assert.equal(phone.waKey('558599990000'), k);            // WhatsApp sem o 9
  assert.notEqual(phone.crmKey('(85) 99999-0001'), k);
  assert.equal(phone.waKey('13055551234'), '13055551234'); // internacional não é alterado
});

test('telefones: validação e exibição', () => {
  assert.equal(phone.isValidWaPhone('85 99999-0000'), true);
  assert.equal(phone.isValidWaPhone('123'), false);
  assert.equal(phone.toWaPhone('085999990000'), '5585999990000');
  assert.equal(phone.displayPhone('5585999990000'), '+55 (85) 99999-0000');
});

test('mensagem de texto vira evento do CRM', () => {
  const e = mensagemParaEvento(msg(), 'notify', AGORA);
  assert.equal(e.jid, '5585999990000@s.whatsapp.net');
  assert.equal(e.telefone, '5585999990000');
  assert.equal(e.nome, 'Maria');
  assert.equal(e.texto, 'Oi, quero ser motorista');
  assert.equal(e.tipo, 'text');
  assert.equal(e.deMim, false);
  assert.equal(e.externoId, 'ABC1');
  assert.equal(e.quando, new Date((AGORA - 5) * 1000).toISOString());
});

test('texto estendido, legendas e tipos de mídia', () => {
  assert.equal(mensagemParaEvento(msg({ message: { extendedTextMessage: { text: 'Link: x' } } }), 'notify', AGORA).texto, 'Link: x');
  assert.equal(mensagemParaEvento(msg({ message: { imageMessage: { caption: 'minha CNH' } } }), 'notify', AGORA).texto, '[imagem] minha CNH');
  assert.equal(mensagemParaEvento(msg({ message: { audioMessage: { ptt: true } } }), 'notify', AGORA).texto, '[mensagem de voz]');
  assert.equal(mensagemParaEvento(msg({ message: { documentMessage: { fileName: 'crlv.pdf' } } }), 'notify', AGORA).texto, '[documento] crlv.pdf');
  assert.equal(mensagemParaEvento(msg({ message: { stickerMessage: {} } }), 'notify', AGORA).tipo, 'sticker');
  assert.equal(mensagemParaEvento(msg({ message: { coisaNova: {} } }), 'notify', AGORA).texto, '[mensagem não suportada]');
});

test('mensagens embrulhadas (temporárias / visualização única) são desembrulhadas', () => {
  const e = mensagemParaEvento(msg({ message: { ephemeralMessage: { message: { conversation: 'some em 24h' } } } }), 'notify', AGORA);
  assert.equal(e.texto, 'some em 24h');
});

test('grupos, status, canais, reações e protocolo são ignorados', () => {
  for (const jid of ['120363@g.us', 'status@broadcast', '123@newsletter']) {
    assert.equal(mensagemParaEvento(msg({ key: { remoteJid: jid, id: 'X' } }), 'notify', AGORA), null, jid);
  }
  assert.equal(mensagemParaEvento(msg({ message: { reactionMessage: { text: '👍' } } }), 'notify', AGORA), null);
  assert.equal(mensagemParaEvento(msg({ message: { protocolMessage: {} } }), 'notify', AGORA), null);
  assert.equal(mensagemParaEvento(msg({ message: undefined }), 'notify', AGORA), null);
});

test('histórico: "append" antigo é descartado; "notify" atrasado (servidor fora do ar) é aceito', () => {
  const velha = msg({ messageTimestamp: AGORA - 3600 });
  assert.equal(mensagemParaEvento(velha, 'append', AGORA), null);
  assert.ok(mensagemParaEvento(velha, 'notify', AGORA));
  assert.ok(mensagemParaEvento(msg({ messageTimestamp: AGORA - 30 }), 'append', AGORA));
  assert.equal(mensagemParaEvento(msg({ messageTimestamp: AGORA - 8 * 86400 }), 'notify', AGORA), null);
});

test('mensagem enviada pelo próprio celular (fromMe) e timestamp em formato Long', () => {
  const e = mensagemParaEvento(msg({ key: { remoteJid: '5585999990000@s.whatsapp.net', id: 'M1', fromMe: true }, messageTimestamp: { low: AGORA - 2, high: 0 } }), 'notify', AGORA);
  assert.equal(e.deMim, true);
  assert.equal(e.nome, null);
  assert.equal(e.quando, new Date((AGORA - 2) * 1000).toISOString());
});

test('contato com identificador LID usa o telefone alternativo quando existir', () => {
  const e = mensagemParaEvento(msg({ key: { remoteJid: '1234@lid', remoteJidAlt: '5585999990000@s.whatsapp.net', id: 'L1' } }), 'notify', AGORA);
  assert.equal(e.jid, '1234@lid');
  assert.equal(e.telefone, '5585999990000');
  assert.equal(mensagemParaEvento(msg({ key: { remoteJid: '1234@lid', id: 'L2' } }), 'notify', AGORA).telefone, null);
});

test('normalizarBiblioteca aceita módulo ESM e CommonJS e rejeita formato inesperado', () => {
  const make = () => {};
  const auth = () => {};
  const esm = normalizarBiblioteca({ default: make, useMultiFileAuthState: auth, DisconnectReason: { loggedOut: 401 } });
  assert.equal(esm.makeWASocket, make);
  const cjs = normalizarBiblioteca({ default: { makeWASocket: make, useMultiFileAuthState: auth } });
  assert.equal(cjs.makeWASocket, make);
  assert.equal(cjs.DisconnectReason.loggedOut, 401);
  assert.throws(() => normalizarBiblioteca({ default: {} }), /formato inesperado/);
});

function pacoteFalso(dir, nome, arquivos, pkg) {
  const base = path.join(dir, 'node_modules', ...nome.split('/'));
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify({ name: nome, version: '0.0.0', ...pkg }));
  for (const [arq, conteudo] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(base, arq)), { recursive: true });
    fs.writeFileSync(path.join(base, arq), conteudo);
  }
}

test('carregarBiblioteca acha pacote ESM (exports.import) instalado em pasta separada', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walib-'));
  pacoteFalso(dir, '@whiskeysockets/baileys', {
    'lib/index.js': 'export default function makeWASocket(){ return "esm"; }\nexport const useMultiFileAuthState = async () => ({});\nexport const DisconnectReason = { loggedOut: 401 };\n'
  }, { type: 'module', exports: { '.': { import: './lib/index.js', types: './lib/index.d.ts' } } });
  const lib = await carregarBiblioteca(dir);
  assert.equal(lib.makeWASocket(), 'esm');
  assert.equal(typeof lib.useMultiFileAuthState, 'function');
  assert.equal(resolverEntrada(dir, '@whiskeysockets/baileys'), path.join(dir, 'node_modules/@whiskeysockets/baileys/lib/index.js'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('carregarBiblioteca acha pacote CommonJS (main) e o nome alternativo "baileys"', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walib-'));
  pacoteFalso(dir, 'baileys', {
    'index.js': 'module.exports = { makeWASocket: () => "cjs", useMultiFileAuthState: async () => ({}), DisconnectReason: { loggedOut: 401 } };\n'
  }, { main: 'index.js' });
  const lib = await carregarBiblioteca(dir);
  assert.equal(lib.makeWASocket(), 'cjs');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('carregarBiblioteca sem instalação dá uma mensagem clara', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walib-'));
  await assert.rejects(() => carregarBiblioteca(dir), /instalar-whatsapp/);
  fs.rmSync(dir, { recursive: true, force: true });
});
