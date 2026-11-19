'use strict';
// 19/11/2026: foto de perfil dos usuários (módulo e rotas) e aviso "X iniciou o seu atendimento".
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

// JPEG e PNG mínimos (só os primeiros bytes importam para a conferência).
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 2)]);
const url = (tipo, buf) => `data:image/${tipo};base64,${buf.toString('base64')}`;

test('fotos: aceita JPEG/PNG conferidos pelo conteúdo; recusa tipo trocado, lixo, grande demais e usuário inexistente', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, nome TEXT)');
  db.prepare("INSERT INTO users (id, nome) VALUES (1, 'Dono')").run();
  const { criarFotos, tipoDe } = require('../src/fotos');
  const f = criarFotos(db);
  assert.equal(tipoDe(JPEG), 'jpeg');
  assert.equal(tipoDe(PNG), 'png');
  const r = f.salvar(1, url('jpeg', JPEG));
  assert.equal(r.ok, true);
  assert.equal(f.obter(1).tipo, 'jpeg');
  assert.ok(f.obter(1).dados.equals(JPEG));
  assert.equal(f.versoes()[1], r.versao);
  assert.ok(f.salvar(1, url('png', JPEG)).erro, 'tipo declarado diferente do conteúdo');
  assert.ok(f.salvar(1, url('jpeg', Buffer.from('<svg onload=alert(1)>aaaaaaaaaaaaaaaa'))).erro, 'conteúdo que não é imagem');
  assert.ok(f.salvar(1, 'data:image/svg+xml;base64,PHN2Zz4=').erro, 'SVG não é aceito');
  assert.ok(f.salvar(1, url('jpeg', Buffer.concat([JPEG, Buffer.alloc(210 * 1024)]))).erro, 'maior que 200 KB');
  assert.equal(f.salvar(99, url('png', PNG)).status, 404);
  assert.equal(f.salvar(1, url('png', PNG)).ok, true, 'troca a foto');
  assert.equal(f.obter(1).tipo, 'png');
  assert.equal(f.apagar(1), true);
  assert.equal(f.obter(1), null);
});

test('modelo "atendente_iniciou": existe, é editável e usa {atendente}', () => {
  const C = require('../src/ia/central');
  const mem = {};
  const c = C.criarCentral({ getSetting: (k, d) => (k in mem ? mem[k] : d), setSetting: (k, v) => { mem[k] = v; } });
  assert.match(c.texto('atendente_iniciou'), /\{atendente\} iniciou o seu atendimento|\*\{atendente\}\* iniciou o seu atendimento/);
  c.salvarModelos([{ id: 'atendente_iniciou', texto: 'Oi! Aqui é {atendente}.', ativo: true }]);
  assert.equal(c.texto('atendente_iniciou'), 'Oi! Aqui é {atendente}.');
  // Menus antigos salvos sem edição passam a mostrar o padrão novo (premium).
  mem.central_modelos = JSON.stringify({ voltar_menu: { texto: 'Para voltar ao menu inicial, digite 0.', ativo: true } });
  assert.equal(c.texto('voltar_menu'), '↩️ Para voltar ao menu inicial, digite 0.');
});

const portaLivre = () => new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

test('rotas de foto: cada um troca a própria; administrador troca a de todos; equipe vê as versões; /auth/me traz a foto', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-fotos-'));
  const porta = await portaLivre();
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false' }, stdio: 'ignore'
  });
  t.after(() => proc.kill());
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 50; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const cliente = () => {
    let ck = '';
    return async (m, u, b) => {
      const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined });
      for (const sc of r.headers.getSetCookie()) {
        const [kv] = sc.split(';');
        const nome = kv.split('=')[0];
        const resto = ck.split('; ').filter((x) => x && !x.startsWith(nome + '='));
        if (!/Max-Age=0/.test(sc)) resto.push(kv);
        ck = resto.join('; ');
      }
      let j = null;
      const tipo = r.headers.get('content-type') || '';
      if (/json/.test(tipo)) { try { j = await r.json(); } catch (e) { /* */ } }
      return { s: r.status, j, tipo };
    };
  };
  const SENHA = 'Senha-Forte-Teste-2026!';
  const adm = cliente();
  assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm Fictício', email: 'adm@x.com', senha: SENHA })).s, 201);
  assert.equal((await adm('POST', '/users', { nome: 'Gestor Fictício', email: 'g@x.com', senha: SENHA, role: 'gestor' })).s, 201);
  const g = cliente();
  assert.equal((await g('POST', '/auth/login', { email: 'g@x.com', senha: SENHA })).s, 200);
  const meG = (await g('GET', '/auth/me')).j.user;
  const meA = (await adm('GET', '/auth/me')).j.user;
  assert.equal(meG.foto, null);

  assert.equal((await g('POST', `/usuarios/${meG.id}/foto`, { imagem: url('jpeg', JPEG) })).s, 200, 'gestor troca a própria');
  assert.equal((await g('POST', `/usuarios/${meA.id}/foto`, { imagem: url('jpeg', JPEG) })).s, 403, 'gestor não troca a do administrador');
  assert.equal((await g('DELETE', `/usuarios/${meA.id}/foto`)).s, 403);
  assert.equal((await adm('POST', `/usuarios/${meG.id}/foto`, { imagem: url('png', PNG) })).s, 200, 'administrador troca a de todos');
  assert.equal((await g('POST', `/usuarios/${meG.id}/foto`, { imagem: 'data:text/html;base64,PGI+' })).s, 422);
  assert.ok((await g('GET', '/auth/me')).j.user.foto, '/auth/me traz a versão da foto');
  const foto = await g('GET', `/usuarios/${meG.id}/foto`);
  assert.equal(foto.s, 200);
  assert.equal(foto.tipo, 'image/png');
  assert.equal((await g('GET', `/usuarios/${meA.id}/foto`)).s, 404, 'sem foto → 404');
  assert.equal((await g('GET', '/usuarios/abc/foto')).s, 404);
  const equipe = (await g('GET', '/usuarios/equipe')).j.items;
  assert.equal(equipe.length, 2);
  assert.ok(equipe.find((u) => u.id === meG.id).foto);
  assert.equal(Object.keys(equipe[0]).sort().join(), 'foto,id,nome', 'equipe mostra só id, nome e foto (sem e-mail)');
  const semLogin = cliente();
  assert.equal((await semLogin('GET', `/usuarios/${meG.id}/foto`)).s, 401, 'sem login não vê foto');
  assert.equal((await semLogin('GET', '/usuarios/equipe')).s, 401);
  const users = (await adm('GET', '/settings')).j.users;
  assert.ok(users.find((u) => u.id === meG.id).foto, 'lista de usuários traz a foto');
  assert.equal((await adm('DELETE', `/usuarios/${meG.id}/foto`)).s, 200);
  assert.equal((await g('GET', `/usuarios/${meG.id}/foto`)).s, 404);
});
