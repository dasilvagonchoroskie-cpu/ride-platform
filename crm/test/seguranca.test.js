'use strict';
// Correções da auditoria de 06/11/2026.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const portaLivre = () => new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

test('verificação em duas etapas: senha sozinha não entra; código errado, reutilizado e desafio vencido são recusados', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-2fa-'));
  const porta = await portaLivre();
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false' }, stdio: 'ignore'
  });
  t.after(() => proc.kill());
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 50; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const cliente = () => { let ck = ''; return async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined }); for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const nome = kv.split('=')[0]; const resto = ck.split('; ').filter((x) => x && !x.startsWith(nome + '=')); if (!/Max-Age=0/.test(sc)) resto.push(kv); ck = resto.join('; '); } let j = null; try { j = await r.json(); } catch (e) { /* */ } return { s: r.status, j }; }; };
  const { codigoTotp } = require('../src/auth');
  const adm = cliente();
  await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm', email: 'adm@x.com', senha: 'senhaforte123' });
  assert.equal((await adm('POST', '/auth/2fa/iniciar', { senha_atual: 'errada12345' })).s, 422);
  const ini = await adm('POST', '/auth/2fa/iniciar', { senha_atual: 'senhaforte123' });
  const segredo = ini.j.chave.replace(/\s/g, '');
  assert.match(ini.j.uri, /^otpauth:\/\/totp\//);
  assert.equal((await adm('GET', '/auth/2fa')).j.ativo, false, 'só ativa depois de confirmar');
  assert.equal((await adm('POST', '/auth/2fa/confirmar', { codigo: '000000' })).s, 422);
  const passo = Math.floor(Date.now() / 30000);
  assert.equal((await adm('POST', '/auth/2fa/confirmar', { codigo: codigoTotp(segredo, passo) })).s, 200);

  const c = cliente();
  const l1 = await c('POST', '/auth/login', { email: 'adm@x.com', senha: 'senhaforte123' });
  assert.equal(l1.j.precisa_codigo, true);
  assert.equal((await c('GET', '/auth/me')).s, 401, 'senha certa sozinha não abre sessão');
  assert.equal((await c('POST', '/auth/login/codigo', { desafio: l1.j.desafio, codigo: '123456' })).s, 401);
  assert.equal((await c('POST', '/auth/login/codigo', { desafio: l1.j.desafio, codigo: codigoTotp(segredo, passo) })).s, 401, 'código já usado não vale de novo');
  const ok = await c('POST', '/auth/login/codigo', { desafio: l1.j.desafio, codigo: codigoTotp(segredo, passo + 1) });
  assert.equal(ok.s, 200);
  assert.equal((await c('GET', '/auth/me')).s, 200);
  assert.equal((await c('POST', '/auth/login/codigo', { desafio: l1.j.desafio, codigo: codigoTotp(segredo, passo + 1) })).s, 401, 'desafio é de uso único');
  assert.equal((await cliente()('POST', '/auth/login/codigo', { desafio: 'inventado', codigo: '123456' })).s, 401);
});

test('sessão parada além do limite de inatividade expira', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-ina-'));
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, ['-e', `
    const { db } = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'db'))});
    const auth = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'auth'))});
    db.prepare("INSERT INTO users (nome,email,senha_hash,role,created_at,updated_at) VALUES ('a','a@x.com','x','admin','t','t')").run();
    const res = { append(){}, setHeader(){} }; const req = { headers: {}, ip: '', socket: {} };
    const tok = auth.createSession(1, req, res);
    const r = { headers: { cookie: 'fm_sid=' + tok } };
    const antes = !!auth.currentSession(r);
    db.prepare("UPDATE sessions SET last_seen_at = ?").run(new Date(Date.now() - 61 * 60000).toISOString());
    console.log(JSON.stringify({ antes, depois: !!auth.currentSession(r) }));`], { env: { ...process.env, FM_DATA_DIR: dir } }).toString();
  assert.deepEqual(JSON.parse(out.trim().split('\n').pop()), { antes: true, depois: false });
});

test('números de documento são mascarados no texto lido (CPF, registro, Renavam); datas e placa ficam', () => {
  const { mascararNumeros } = require('../src/ia/documentos');
  const t = mascararNumeros('Nome: ANA\nCPF: 123.456.789-09\nNúmero do registro: 01234567890\nRenavam: 0098 765 4321\nValidade: 10/05/2030\nPlaca: ABC1D23\nCategoria da CNH: B');
  assert.match(t, /CPF: \*\*\*\.\*\*\*\.\*\*\*-09/);
  assert.match(t, /registro: •+890/);
  assert.match(t, /Renavam: •+321/);
  assert.match(t, /Validade: 10\/05\/2030/);
  assert.match(t, /Placa: ABC1D23/);
  assert.ok(!t.includes('123.456.789'));
});

test('download de mídia para no limite (arquivo grande não enche a memória)', async () => {
  const { Readable } = require('stream');
  let lidos = 0;
  const gerador = Readable.from((function* () { for (let i = 0; i < 1000; i++) { lidos += 1; yield Buffer.alloc(64 * 1024); } })());
  const baixar = async (limite) => {
    const partes = []; let total = 0;
    for await (const p of gerador) { total += p.length; if (total > limite) { gerador.destroy(); throw new Error('Arquivo maior que o limite.'); } partes.push(p); }
    return Buffer.concat(partes);
  };
  await assert.rejects(baixar(1024 * 1024), /maior que o limite/);
  assert.ok(lidos < 30, `parou cedo (${lidos} pedaços de 1000)`);
  // E o código do conector usa exatamente esse caminho (fluxo + corte).
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'src', 'whatsapp', 'baileys-channel.js'), 'utf8');
  assert.match(fonte, /downloadMediaMessage\(m, 'stream'/);
  assert.match(fonte, /if \(total > limite\)/);
});

test('endereço de IA "personalizado" não aceita rede interna em produção', () => {
  const antes = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  delete require.cache[require.resolve('../src/ia/provider')];
  const { urlBaseValida } = require('../src/ia/provider');
  for (const u of ['https://127.0.0.1', 'https://localhost', 'https://169.254.169.254', 'https://10.1.2.3', 'https://192.168.0.1', 'https://172.20.0.1', 'https://[::1]', 'https://intranet.local', 'https://2130706433'])
    assert.equal(urlBaseValida(u), false, u);
  assert.equal(urlBaseValida('https://api.exemplo.com/v1'), true);
  process.env.NODE_ENV = antes;
  delete require.cache[require.resolve('../src/ia/provider')];
});

test('verificação por e-mail: só aparelho novo pede código; aparelho lembrado entra direto; link de senha nova por e-mail', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-mail-'));
  const caixa = path.join(dir, 'emails.jsonl');
  const porta = await portaLivre();
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false', EMAIL_TESTE_ARQUIVO: caixa, PUBLIC_URL: 'https://crm.exemplo' }, stdio: 'ignore'
  });
  t.after(() => proc.kill());
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 50; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const cliente = () => { let ck = ''; const f = async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined }); for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const nome = kv.split('=')[0]; const resto = ck.split('; ').filter((x) => x && !x.startsWith(nome + '=')); if (!/Max-Age=0/.test(sc)) resto.push(kv); ck = resto.join('; '); } let j = null; try { j = await r.json(); } catch (e) { /* */ } return { s: r.status, j }; }; f.semSessao = () => { ck = ck.split('; ').filter((x) => !x.startsWith('fm_sid=')).join('; '); }; return f; };
  const ultimoCodigo = () => { const l = fs.readFileSync(caixa, 'utf8').trim().split('\n').pop(); return JSON.parse(l); };

  const adm = cliente();
  assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm', email: 'dono@x.com', senha: 'senhaforte123' })).s, 201);
  const st = (await adm('GET', '/auth/2fa')).j;
  assert.equal(st.email_configurado, true);
  assert.equal(st.email_ativo, false);
  assert.equal((await adm('POST', '/auth/2fa/email/iniciar', { senha_atual: 'errada12345' })).s, 422);
  assert.equal((await adm('POST', '/auth/2fa/email/iniciar', { senha_atual: 'senhaforte123' })).s, 200);
  const m1 = ultimoCodigo();
  assert.equal(m1.para, 'dono@x.com');
  const cod1 = /: (\d{6})/.exec(m1.texto)[1];
  assert.equal((await adm('POST', '/auth/2fa/email/confirmar', { codigo: '000000' })).s, 422);
  assert.equal((await adm('POST', '/auth/2fa/email/confirmar', { codigo: cod1 })).s, 200);
  assert.equal((await adm('GET', '/auth/2fa')).j.email_ativo, true);

  // O aparelho que ativou ficou confirmado: sai e entra só com a senha.
  adm.semSessao();
  const l0 = await adm('POST', '/auth/login', { email: 'dono@x.com', senha: 'senhaforte123' });
  assert.equal(l0.s, 200); assert.ok(l0.j.user, 'aparelho confirmado não pede código');

  // Aparelho novo: pede código do e-mail; senha sozinha não abre sessão.
  const novo = cliente();
  const l1 = await novo('POST', '/auth/login', { email: 'dono@x.com', senha: 'senhaforte123' });
  assert.equal(l1.j.precisa_codigo, true); assert.equal(l1.j.via, 'email'); assert.match(l1.j.email, /^do\*+@x\.com$/);
  assert.equal((await novo('GET', '/auth/me')).s, 401);
  const cod2 = /: (\d{6})/.exec(ultimoCodigo().texto)[1];
  assert.equal((await novo('POST', '/auth/login/codigo', { desafio: l1.j.desafio, codigo: '111111' === cod2 ? '222222' : '111111' })).s, 401);
  assert.equal((await novo('POST', '/auth/login/codigo', { desafio: l1.j.desafio, codigo: cod2 })).s, 200);
  assert.equal((await novo('GET', '/auth/me')).s, 200);
  novo.semSessao();
  assert.ok((await novo('POST', '/auth/login', { email: 'dono@x.com', senha: 'senhaforte123' })).j.user, 'aparelho novo, depois de confirmado, entra direto');

  // Esquecer os outros aparelhos: o "novo" volta a pedir código; quem pediu continua.
  assert.equal((await adm('POST', '/auth/aparelhos/esquecer', {})).j.removidos, 1);
  novo.semSessao();
  assert.equal((await novo('POST', '/auth/login', { email: 'dono@x.com', senha: 'senhaforte123' })).j.precisa_codigo, true);

  // Esqueci minha senha: mesma resposta para e-mail que não existe; o link vale uma vez.
  const anon = cliente();
  const r0 = await anon('POST', '/auth/recover/email', { email: 'ninguem@x.com' });
  const linhas = fs.readFileSync(caixa, 'utf8').trim().split('\n').length;
  const r1 = await anon('POST', '/auth/recover/email', { email: 'dono@x.com' });
  assert.equal(r0.s, 200); assert.deepEqual(r0.j, r1.j, 'resposta igual (sem revelar se o e-mail existe)');
  assert.equal(fs.readFileSync(caixa, 'utf8').trim().split('\n').length, linhas + 1, 'só o e-mail cadastrado recebe');
  const link = /https:\/\/crm\.exemplo\/reset\?token=([\w-]+)/.exec(ultimoCodigo().texto);
  assert.ok(link, 'e-mail traz o link');
  assert.equal((await anon('POST', '/auth/reset', { token: link[1], senha: 'senhanova4567' })).s, 200);
  assert.equal((await anon('POST', '/auth/reset', { token: link[1], senha: 'outrasenha890' })).s, 400, 'link de uso único');
  assert.equal((await adm('GET', '/auth/me')).s, 401, 'trocar a senha derruba as sessões');
});
