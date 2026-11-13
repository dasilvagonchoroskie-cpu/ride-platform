'use strict';
// Auditoria automática de autorização (12/11/2026): lê TODAS as rotas declaradas no código e confere contra o servidor real:
//  - toda rota depois do `router.use(auth.requireAuth)` responde 401 sem login (nenhuma rota esquecida fica pública);
//  - toda rota marcada com `requireAdmin` responde 403 para o gestor (sem efeito colateral);
//  - mutação de outra origem (CSRF) é recusada antes de chegar à rota.
// Se uma rota nova for criada sem proteção, este teste falha.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const SRC = path.join(__dirname, '..', 'src');
const portaLivre = () => new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

function rotas() {
  const out = [];
  const ler = (arquivo, depoisDe) => {
    let txt = fs.readFileSync(path.join(SRC, arquivo), 'utf8');
    if (depoisDe) txt = txt.slice(txt.indexOf(depoisDe));
    const re = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,([^\n]*)/g;
    let m;
    while ((m = re.exec(txt))) out.push({ metodo: m[1].toUpperCase(), caminho: m[2], admin: /requireAdmin/.test(m[3]), arquivo });
  };
  ler('routes.js', 'router.use(auth.requireAuth)');
  ler('whatsapp/routes.js');
  ler('ia/routes.js');
  return out;
}
const concreto = (c) => c.replace(/:entity/g, 'motoristas').replace(/:[a-zA-Z_]+/g, '1');

async function subir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-rotas-'));
  const porta = await portaLivre();
  const env = { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false', FM_ETAPA2: '1', IA_VARREDURA: '0' };
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 80; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const cliente = () => {
    let ck = '';
    return async (m, u, b, extra = {}) => {
      const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck, ...extra }, body: m === 'GET' ? undefined : JSON.stringify(b || {}) });
      for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const nome = kv.split('=')[0]; const resto = ck.split('; ').filter((x) => x && !x.startsWith(`${nome}=`)); if (!/Max-Age=0/.test(sc)) resto.push(kv); ck = resto.join('; '); }
      await r.arrayBuffer().catch(() => {});
      return r.status;
    };
  };
  const anon = cliente(); const adm = cliente(); const ges = cliente(); const ava = cliente();
  assert.equal(await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm', email: 'adm@x.com', senha: 'senhaforte123' }), 201);
  assert.equal(await adm('POST', '/users', { nome: 'Gestor', email: 'g@x.com', senha: 'senhaforte123', role: 'gestor' }), 201);
  assert.equal(await ges('POST', '/auth/login', { email: 'g@x.com', senha: 'senhaforte123' }), 200);
  assert.equal(await adm('POST', '/users', { nome: 'Avaliador', email: 'av@x.com', senha: 'senhaforte123', role: 'avaliador' }), 201);
  assert.equal(await ava('POST', '/auth/login', { email: 'av@x.com', senha: 'senhaforte123' }), 200);
  return { proc, anon, adm, ges, ava };
}

test('autorização: todas as rotas protegidas exigem login e as de administrador recusam o gestor', async (t) => {
  const { proc, anon, ges, adm, ava } = await subir();
  t.after(() => proc.kill());
  const lista = rotas();
  assert.ok(lista.length > 100, `esperava mais de 100 rotas, achei ${lista.length}`);
  const semLogin = [];
  for (const r of lista) {
    const s = await anon(r.metodo, concreto(r.caminho));
    if (s !== 401) semLogin.push(`${r.metodo} ${r.caminho} → ${s}`);
  }
  assert.deepEqual(semLogin, [], 'rotas que respondem sem login');
  const admins = lista.filter((r) => r.admin);
  assert.ok(admins.length >= 15);
  const vazou = [];
  for (const r of admins) {
    const s = await ges(r.metodo, concreto(r.caminho));
    if (s !== 403) vazou.push(`${r.metodo} ${r.caminho} → ${s}`);
  }
  assert.deepEqual(vazou, [], 'rotas de administrador que o gestor alcança');
  // Avaliador: lista fechada. Tudo fora dela (e fora da própria conta) responde 403 — inclusive o que o gestor alcança.
  const { avaliadorPodeRota } = require('../src/policy');
  const escapou = [];
  for (const r of lista) {
    const c = concreto(r.caminho);
    if (c.startsWith('/auth/') || avaliadorPodeRota(r.metodo, c)) continue;
    if (r.metodo === 'POST' && c === '/auth/logout') continue;
    const s = await ava(r.metodo, c);
    if (s !== 403) escapou.push(`${r.metodo} ${r.caminho} → ${s}`);
  }
  assert.deepEqual(escapou, [], 'rotas que o avaliador alcança fora da lista fechada');
  // O gestor continua conseguindo usar o que é dele (não bloqueamos demais).
  assert.equal(await ges('GET', '/meta'), 200);
  assert.equal(await ges('GET', '/motoristas'), 200);
  assert.equal(await ges('GET', '/tarefas'), 200);
  // CSRF: mutação com Origin de outro site ou Sec-Fetch-Site cross-site é recusada (mesmo com sessão válida).
  assert.equal(await adm('POST', '/tarefas', { titulo: 'x', prioridade: 'Alta', data_vencimento: '2026-11-20', situacao: 'Pendente' }, { origin: 'https://site-malicioso.example' }), 403);
  assert.equal(await adm('DELETE', '/motoristas/1', {}, { 'sec-fetch-site': 'cross-site' }), 403);
  assert.equal(await adm('POST', '/tarefas', { titulo: 'Tarefa ok', prioridade: 'Alta', data_vencimento: '2026-11-20', situacao: 'Pendente' }), 201);
});
