'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/ia/central');
const { montarLista, mensagemParaEvento } = require('../src/whatsapp/baileys-channel');
const { escolherModelo, escolherLeve, criarProvedorOpenAI, PROVEDORES } = require('../src/ia/provider');

const modelo = (id) => C.MODELOS_PADRAO[id].texto.trim();
const settings = (o) => (k, p) => (k in o ? o[k] : p);

test('menu padrão vira lista com os mesmos números; texto comum ou menu editado seguem em texto', () => {
  const l = C.menuEmLista(`Olá!\n\n${modelo('menu')}`, modelo);
  assert.match(l.texto, /^Olá!\n\nToque em \*Menu\*/);
  assert.deepEqual(l.secoes.flatMap((s) => s.rows.map((r) => r.id)), ['1', '2', '3', '4', '5', '6']);
  for (const s of l.secoes) for (const r of s.rows) assert.ok(r.title.length <= 24, r.title);
  assert.equal(C.menuEmLista('Bom dia', modelo), null);
  assert.equal(C.menuEmLista('Menu do dono', () => 'Menu do dono'), null);
});

test('lista só sai quando ligada ou para o número de teste (com ou sem o 9º dígito)', () => {
  assert.equal(C.usarLista(settings({}), '5564999998888'), false);
  const t = settings({ wa_menu_lista: 'teste', wa_menu_lista_teste: '64999998888' });
  assert.equal(C.usarLista(t, '556499998888'), true);
  assert.equal(C.usarLista(t, '5564911112222'), false);
  assert.equal(C.usarLista(settings({ wa_menu_lista: 'ligado' }), ''), true);
  assert.throws(() => C.salvarMenuLista(() => {}, { modo: 'teste', teste: '' }));
});

test('toque na lista chega como o número da opção; a mensagem enviada leva a marcação exigida', () => {
  const ev = (message) => mensagemParaEvento({ key: { remoteJid: '5564999998888@s.whatsapp.net', id: 'A', fromMe: false }, message, messageTimestamp: Math.floor(Date.now() / 1000) }, 'notify');
  assert.equal(ev({ interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{"id":"4"}' } } }).texto, '4');
  assert.equal(ev({ listResponseMessage: { singleSelectReply: { selectedRowId: '2' } } }).texto, '2');
  const m = montarLista(C.menuEmLista(modelo('menu_comercio'), modelo));
  assert.equal(m.nos[0].tag, 'biz');
  assert.equal(JSON.parse(m.mensagem.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson).title, 'Menu');
});

test('modelo "omni" não derruba a escolha do Flash numerado', () => {
  const ids = ['gemini-omni-1.2-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  assert.equal(escolherModelo(ids), 'gemini-3.8-flash');
  assert.equal(escolherLeve(ids), 'gemini-3.5-flash-lite');
});

test('cota do Flash esgotada: responde com o Lite; análise já pede o Lite', async () => {
  const usados = [];
  const f = async (url, o) => {
    if (url.endsWith('/models')) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'gemini-3.8-flash' }, { id: 'gemini-3.5-flash-lite' }] }) };
    const m = JSON.parse(o.body).model; usados.push(m);
    if (m === 'gemini-3.8-flash') return { ok: false, status: 429, headers: { get: () => null } };
    return { ok: true, status: 200, json: async () => ({ model: m, choices: [{ message: { content: 'OK' } }] }) };
  };
  const p = criarProvedorOpenAI({ id: 'gemini', obterChave: () => 'chave-de-teste-exclusiva-001', obterModelo: () => '', urlBase: PROVEDORES.gemini.urlBase, fetchImpl: f, esperaRepetir: 0 });
  assert.equal((await p.completar({ system: 's', user: 'u' })).modelo, 'gemini-3.5-flash-lite');
  await p.completar({ system: 's', user: 'u', leve: true });
  assert.deepEqual(usados, ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-lite']);
});

test('fila de envio: lista só para o número de teste e, se a lista falhar, o menu sai em texto', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { createService } = require('../src/whatsapp/service');
  const { criarCanalFalso } = require('../src/whatsapp/fake-channel');
  const dir = os.tmpdir();
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'schema.sql'), 'utf8'));
  const cfg = { wa_ativo: '1', wa_menu_lista: 'teste', wa_menu_lista_teste: '64999998888' };
  const canal = criarCanalFalso({ conectado: true });
  const listas = [];
  let quebrar = false;
  canal.sendList = async (jid, lista) => { if (quebrar) throw new Error('recusada'); listas.push({ jid, lista }); return { externalId: `L${listas.length}` }; };
  const wa = createService({ db, getSetting: settings(cfg), setSetting: (k, v) => { cfg[k] = v; }, dataDir: dir, log: { log() {}, error() {} }, pausaEntreEnvios: () => 0, criarCanal: () => canal });
  await wa.iniciar();
  const central = C.criarCentral({ getSetting: settings(cfg), setSetting: () => {} });
  const conversa = (telefone) => wa.store.ingerir({ jid: `${telefone}@s.whatsapp.net`, telefone, nome: 'X', externoId: `in-${telefone}`, texto: 'oi', tipo: 'text', quando: new Date().toISOString(), deMim: false }).conversaId;
  const enviar = async (id, texto) => { wa.store.enfileirar({ conversaId: id, texto, usuarioId: null, origem: 'ia' }); await wa.processarFila(); };
  const doTeste = conversa('556499998888');
  const outro = conversa('5564911112222');
  for (const id of ['menu', 'menu_encomendas', 'menu_comercio']) await enviar(doTeste, central.texto(id));
  assert.equal(listas.length, 3);
  await enviar(outro, central.texto('menu'));
  assert.equal(canal.enviados.at(-1).texto, central.texto('menu'));
  quebrar = true;
  await enviar(doTeste, central.texto('menu'));
  assert.equal(canal.enviados.at(-1).texto, central.texto('menu'));
  await wa.desligar();
  db.close();
});
