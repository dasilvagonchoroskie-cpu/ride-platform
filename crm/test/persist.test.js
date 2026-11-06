'use strict';
// Cofre de dados (retratos criptografados de data/) com um cofre falso em memória.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const KEY = crypto.randomBytes(32).toString('hex');

function cofreFalso() {
  const estado = { dados: null, versao: 0, dono: null, chamadas: [] };
  const f = async (url, init) => {
    const fn = url.split('/rpc/')[1];
    const b = JSON.parse(init.body);
    estado.chamadas.push({ fn, url, headers: init.headers });
    const resp = (status, obj) => ({ ok: status === 200, status, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
    if (b.p_token !== 'token-certo') return resp(400, '{"message":"negado"}');
    if (fn === 'crm_snapshot_assumir') { estado.dono = b.p_dono; return resp(200, { dados: estado.dados, versao: estado.versao }); }
    if (fn === 'crm_snapshot_gravar') {
      if (b.p_dono !== estado.dono) return resp(400, '{"message":"outro_dono"}');
      estado.dados = b.p_dados; estado.versao++; return resp(200, { versao: estado.versao });
    }
    return resp(404, '');
  };
  return { estado, f };
}

function ambiente(dir, extra = {}) {
  Object.assign(process.env, { FM_DATA_DIR: dir, SNAPSHOT_URL: 'https://cofre.exemplo.supabase.co', SNAPSHOT_ANON: 'sb_publishable_x', SNAPSHOT_TOKEN: 'token-certo', SNAPSHOT_KEY: KEY, ...extra });
  delete process.env.FM_DB_PATH;
}
const novoPersist = () => { delete require.cache[require.resolve('../src/persist')]; return require('../src/persist'); };
const silencioso = { log() {}, error() {} };

test('cifrar/decifrar: ida e volta, e retrato adulterado é recusado', () => {
  const p = novoPersist();
  const k = Buffer.from(KEY, 'hex');
  const c = p.cifrar(Buffer.from('dados pessoais'), k);
  assert.equal(p.decifrar(c, k).toString(), 'dados pessoais');
  const b = Buffer.from(c, 'base64'); b[b.length - 1] ^= 1;
  assert.throws(() => p.decifrar(b.toString('base64'), k));
  assert.throws(() => p.decifrar(c, crypto.randomBytes(32)));
});

test('caminhos do retrato nunca escapam de data/', () => {
  const p = novoPersist();
  for (const r of ['../x', '/etc/passwd', 'a/../../b', 'wa-lib/x.js', 'crm.db', 'a\\b', '']) assert.equal(p.relSeguro(r), false, r);
  assert.ok(p.relSeguro('wa-auth/creds.json'));
  assert.ok(p.relSeguro('ia-key-gemini'));
});

test('cofre fora do ar: não sobe vazio (fail-closed)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cofre-'));
  ambiente(dir, { SNAPSHOT_TOKEN: 'token-errado' });
  const p = novoPersist();
  const { f } = cofreFalso();
  await assert.rejects(p.restaurar({ fetchImpl: f, log: silencioso }), /não vai subir vazio/);
});

test('retrato completo: grava, "reinicia" com disco vazio e restaura banco + arquivos', async () => {
  const Database = require('better-sqlite3');
  const cofre = cofreFalso();
  const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'cofre-'));
  ambiente(dir1);
  let p = novoPersist();
  const r1 = await p.restaurar({ fetchImpl: cofre.f, log: silencioso });
  assert.equal(r1.novo, true);
  const db1 = new Database(path.join(dir1, 'crm.db'));
  db1.pragma('journal_mode = WAL');
  db1.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('motorista Ana')");
  fs.mkdirSync(path.join(dir1, 'wa-auth'));
  fs.writeFileSync(path.join(dir1, 'wa-auth', 'creds.json'), '{"x":1}');
  fs.writeFileSync(path.join(dir1, 'ia-key-gemini'), 'chave-secreta-gemini-000000');
  fs.mkdirSync(path.join(dir1, 'wa-lib')); fs.writeFileSync(path.join(dir1, 'wa-lib', 'grande.js'), 'x');
  const c1 = p.iniciar({ db: db1, log: silencioso });
  await c1.parar();
  db1.close();
  assert.equal(cofre.estado.versao, 1);
  assert.ok(!cofre.estado.dados.includes('motorista'), 'o cofre só guarda texto cifrado');
  assert.ok(!Buffer.from(cofre.estado.dados, 'base64').toString('latin1').includes('chave-secreta'));

  // "Reinício": disco novo, vazio.
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cofre-'));
  ambiente(dir2);
  p = novoPersist();
  const r2 = await p.restaurar({ fetchImpl: cofre.f, log: silencioso });
  assert.equal(r2.novo, false);
  const db2 = new Database(path.join(dir2, 'crm.db'));
  assert.equal(db2.prepare('SELECT v FROM t').get().v, 'motorista Ana');
  assert.equal(fs.readFileSync(path.join(dir2, 'wa-auth', 'creds.json'), 'utf8'), '{"x":1}');
  assert.equal(fs.readFileSync(path.join(dir2, 'ia-key-gemini'), 'utf8'), 'chave-secreta-gemini-000000');
  assert.ok(!fs.existsSync(path.join(dir2, 'wa-lib')), 'a biblioteca do WhatsApp não vai no retrato');
  db2.close();
});

test('processo antigo (deploy) não grava por cima do novo', async () => {
  const Database = require('better-sqlite3');
  const cofre = cofreFalso();
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'cofre-'));
  ambiente(dirA);
  const pA = novoPersist();
  await pA.restaurar({ fetchImpl: cofre.f, log: silencioso });
  const dbA = new Database(path.join(dirA, 'crm.db'));
  dbA.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('A')");
  const cA = pA.iniciar({ db: dbA, log: silencioso });
  await cA.enviar('forcar');
  // Novo processo assume o cofre.
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'cofre-'));
  ambiente(dirB);
  const pB = novoPersist();
  await pB.restaurar({ fetchImpl: cofre.f, log: silencioso });
  const versao = cofre.estado.versao;
  dbA.exec("INSERT INTO t VALUES ('A2')");
  await cA.parar();
  assert.equal(cofre.estado.versao, versao, 'gravação do processo antigo recusada');
  dbA.close();
});

test('troca de chave do cofre: retrato antigo abre com a chave anterior e o próximo sai com a nova', async () => {
  const Database = require('better-sqlite3');
  const cofre = cofreFalso();
  const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'cofre-'));
  ambiente(dir1);
  let p = novoPersist();
  await p.restaurar({ fetchImpl: cofre.f, log: silencioso });
  const db1 = new Database(path.join(dir1, 'crm.db'));
  db1.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('dado')");
  await p.iniciar({ db: db1, log: silencioso }).parar();
  db1.close();
  const NOVA = crypto.randomBytes(32).toString('hex');
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cofre-'));
  ambiente(dir2, { SNAPSHOT_KEY: NOVA, SNAPSHOT_KEY_ANTERIOR: KEY });
  p = novoPersist();
  await p.restaurar({ fetchImpl: cofre.f, log: silencioso });
  const db2 = new Database(path.join(dir2, 'crm.db'));
  assert.equal(db2.prepare('SELECT v FROM t').get().v, 'dado');
  db2.exec("INSERT INTO t VALUES ('novo')");
  await p.iniciar({ db: db2, log: silencioso }).parar();
  db2.close();
  // Agora só a chave nova abre.
  const k = Buffer.from(NOVA, 'hex');
  assert.ok(p.decifrar(cofre.estado.dados, k).length > 0);
  assert.throws(() => p.decifrar(cofre.estado.dados, Buffer.from(KEY, 'hex')));
  delete process.env.SNAPSHOT_KEY_ANTERIOR;
});
