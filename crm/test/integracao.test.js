'use strict';
// Teste de integração com o servidor real (Express + SQLite): sobe server.js numa porta livre com data/ temporária.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const portaLivre = () => new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

test('servidor real: configuração inicial, perfis e recuperação de senha por código', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-int-'));
  const porta = await portaLivre();
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false' },
    stdio: 'ignore'
  });
  t.after(() => proc.kill());
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 50; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }

  const cliente = () => {
    let ck = '';
    return async (m, u, b) => {
      const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0];
      let j = null; try { j = await r.json(); } catch (e) { /* vazio */ }
      return { s: r.status, j };
    };
  };
  const adm = cliente();
  assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-ERRADA-0000', nome: 'Adm', email: 'adm@x.com', senha: 'senhaforte123' })).s, 403);
  assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm', email: 'adm@x.com', senha: 'senhaforte123' })).s, 201);
  assert.equal((await adm('GET', '/auth/recovery-codes')).j.restantes, 0);

  // Gerar códigos exige a senha atual.
  assert.equal((await adm('POST', '/auth/recovery-codes', { senha_atual: 'errada12345' })).s, 422);
  const g = await adm('POST', '/auth/recovery-codes', { senha_atual: 'senhaforte123' });
  assert.equal(g.s, 200);
  assert.equal(g.j.codigos.length, 8);
  assert.match(g.j.codigos[0], /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const anon = cliente();
  // Código errado e e-mail inexistente: mesma resposta.
  const e1 = await anon('POST', '/auth/recover', { email: 'adm@x.com', codigo: 'AAAA-BBBB-CCCC', senha: 'novasenha456' });
  const e2 = await anon('POST', '/auth/recover', { email: 'naoexiste@x.com', codigo: g.j.codigos[0], senha: 'novasenha456' });
  assert.equal(e1.s, 400); assert.equal(e2.s, 400); assert.equal(e1.j.error.message, e2.j.error.message);
  // Código certo (minúsculo e sem hífen também vale), senha nova funciona, sessões antigas caem.
  const ok = await anon('POST', '/auth/recover', { email: 'ADM@x.com', codigo: g.j.codigos[0].toLowerCase().replace(/-/g, ''), senha: 'novasenha456' });
  assert.equal(ok.s, 200); assert.equal(ok.j.restantes, 7);
  assert.equal((await adm('GET', '/auth/me')).s, 401, 'sessão antiga encerrada');
  // Código já usado não vale de novo.
  assert.equal((await anon('POST', '/auth/recover', { email: 'adm@x.com', codigo: g.j.codigos[0], senha: 'outrasenha789' })).s, 400);
  const adm2 = cliente();
  assert.equal((await adm2('POST', '/auth/login', { email: 'adm@x.com', senha: 'senhaforte123' })).s, 401);
  assert.equal((await adm2('POST', '/auth/login', { email: 'adm@x.com', senha: 'novasenha456' })).s, 200);

  // Gestor: sem acesso a configurações da IA nem exportação; admin redefine a senha dele.
  const cg = await adm2('POST', '/users', { nome: 'Gestor', email: 'g@x.com', senha: 'senhaforte123' });
  assert.equal(cg.s, 201);
  const ges = cliente();
  assert.equal((await ges('POST', '/auth/login', { email: 'g@x.com', senha: 'senhaforte123' })).s, 200);
  assert.equal((await ges('POST', '/ia/config', { provedor: 'groq' })).s, 403);
  assert.equal((await ges('GET', '/reports/export?tipo=motoristas')).s, 403);
  assert.equal((await adm2('PATCH', `/users/${cg.j.item ? cg.j.item.id : cg.j.user ? cg.j.user.id : 2}`, { senha: 'trocada12345' })).s, 200);

  // Limite: muitas tentativas de código erradas bloqueiam (429).
  let ultimo = 0;
  for (let i = 0; i < 12; i++) ultimo = (await anon('POST', '/auth/recover', { email: 'adm@x.com', codigo: 'ZZZZ-ZZZZ-ZZZZ', senha: 'novasenha456' })).s;
  assert.equal(ultimo, 429);
});
