'use strict';
// M4 (documentos e armazenamento) contra o servidor REAL. Só dados e arquivos fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { textoPorPagina } = require('./util-pdf');

const CRM = path.join(__dirname, '..');
const portaLivre = () => new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const CHAVE_DOCS = crypto.randomBytes(32).toString('hex');
const CHAVE_DADOS = crypto.randomBytes(32).toString('hex');

// Arquivos fictícios (cabeçalhos reais; conteúdo sem valor).
const pdf = (marca) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${marca}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
const png = (marca) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`IHDR-${marca}-fim`)]);
const jpg = (marca) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`JFIF-${marca}-fim`)]);

async function subir({ dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-m4-')), etapa2 = true, env: extra = {}, preparar = true } = {}) {
  const porta = await portaLivre();
  const env = { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false', FM_DOCS_KEY: CHAVE_DOCS, FM_DADOS_KEY: CHAVE_DADOS, ...extra };
  if (etapa2) env.FM_ETAPA2 = '1'; else delete env.FM_ETAPA2;
  const proc = spawn(process.execPath, [path.join(CRM, 'server.js')], { env, stdio: 'ignore' });
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 80; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const cliente = () => {
    let ck = '';
    const guardar = (r) => { for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const nome = kv.split('=')[0]; const resto = ck.split('; ').filter((x) => x && !x.startsWith(`${nome}=`)); if (!/Max-Age=0/.test(sc)) resto.push(kv); ck = resto.join('; '); } };
    const f = async (m, u, b) => {
      const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined });
      guardar(r);
      const tipo = r.headers.get('content-type') || '';
      if (tipo.includes('application/pdf')) return { s: r.status, pdf: Buffer.from(await r.arrayBuffer()), h: r.headers };
      if (tipo.includes('text/csv')) return { s: r.status, csv: await r.text(), h: r.headers };
      if (r.status === 200 && /^(application\/octet-stream|image\/|application\/pdf)/.test(tipo)) return { s: r.status, bin: Buffer.from(await r.arrayBuffer()), h: r.headers };
      let j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ } return { s: r.status, j, h: r.headers };
    };
    // Envio de arquivo: corpo bruto + metadados em cabeçalhos (como o front faz).
    f.up = async (u, buf, meta, nome) => {
      const r = await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/octet-stream', cookie: ck, 'x-documento': encodeURIComponent(JSON.stringify(meta || {})), 'x-nome-arquivo': encodeURIComponent(nome || '') }, body: buf });
      guardar(r);
      let j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ } return { s: r.status, j };
    };
    // Baixar o arquivo (bytes crus), com o status.
    f.baixar = async (u) => {
      const r = await fetch(B + u, { headers: { cookie: ck } });
      const tipo = r.headers.get('content-type') || '';
      if (r.status === 200) return { s: 200, bin: Buffer.from(await r.arrayBuffer()), h: r.headers };
      let j = null; try { j = await r.json(); } catch (e) { /* */ } return { s: r.status, j, tipo };
    };
    return f;
  };
  const adm = cliente(); const ges = cliente();
  if (preparar) {
    assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm', email: 'adm@x.com', senha: 'senhaforte123' })).s, 201);
    assert.equal((await adm('POST', '/users', { nome: 'Gestor Teste', email: 'g@x.com', senha: 'senhaforte123', role: 'gestor' })).s, 201);
    assert.equal((await ges('POST', '/auth/login', { email: 'g@x.com', senha: 'senhaforte123' })).s, 200);
  }
  return { proc, dir, porta, adm, ges, anon: cliente(), cliente, B, parar: () => new Promise((ok) => { proc.once('exit', ok); proc.kill(); }) };
}
async function entrar(S, quem) {
  const c = S.cliente();
  const cred = quem === 'adm' ? { email: 'adm@x.com', senha: 'senhaforte123' } : { email: 'g@x.com', senha: 'senhaforte123' };
  assert.equal((await c('POST', '/auth/login', cred)).s, 200);
  return c;
}

const BASE = { cidade: 'Fortaleza', data_primeiro_contato: '2026-11-01', origem: 'WhatsApp', situacao: 'Novo interessado' };
const COM = { nome_estabelecimento: 'Padaria Sol Fictícia', razao_social: 'Sol Fictícia LTDA', categoria: 'Padaria / confeitaria', responsavel: 'Dona Marta Fictícia', telefone: '(85) 3333-4444', cidade: 'Fortaleza', endereco: 'Rua Fictícia, 100', data_primeiro_contato: '2026-11-05', origem: 'Indicação', situacao: 'Identificado', volume_entregas: '10 a 30 por dia' };
const PARC = { nome_estabelecimento: 'Padaria Sol Fictícia', categoria: 'Outros estabelecimentos', telefone: '(85) 3333-4444', cidade: 'Fortaleza', data_contato: '2026-11-06', situacao: 'Identificado' };
const CPF_OK = '529.982.247-25'; const CPF_OK2 = '111.444.777-35';
const CNPJ_OK = '11.222.333/0001-81'; const CNPJ_OK2 = '11.444.777/0001-61';

async function criarMotorista(c, nome, tel) {
  const r = await c('POST', '/motoristas', { ...BASE, nome, telefone: tel });
  assert.equal(r.s, 201, JSON.stringify(r.j));
  return r.j;
}
const idDe = (r) => r.j.item.id;

test('M4: envio, armazenamento cifrado, ver/baixar, conferência, rejeição e substituição com histórico', async (t) => {
  const S = await subir();
  t.after(() => S.proc.kill());
  const { adm, ges } = S;
  const mot = await criarMotorista(adm, 'Carlos Motorista Fictício', '85988880001');
  const mid = mot.item.id;

  const meta = await adm('GET', '/documentos/meta');
  assert.equal(meta.s, 200);
  assert.ok(meta.j.funcoes.motorista.categorias.some((c) => c.chave === 'cnh'));
  assert.equal(meta.j.armazenamento.pronto, true);

  // Sem arquivo ainda: os 3 exigidos aparecem como "Não enviado" e a situação geral reflete isso.
  let lista = (await adm('GET', `/documentos?funcao=motorista&registro_id=${mid}`)).j;
  assert.equal(lista.geral.codigo, 'nao_enviados');
  assert.deepEqual(lista.itens.filter((i) => i.situacao === 'nao_enviado').map((i) => i.categoria).sort(), ['cnh', 'comprovante_endereco', 'crlv']);

  // Envio da CNH (versão 1).
  const conteudo1 = pdf('CNH-FICTICIA-V1');
  const up = await adm.up('/documentos', conteudo1, { funcao: 'motorista', registro_id: mid, categoria: 'cnh', observacoes: 'frente e verso' }, 'minha cnh.pdf');
  assert.equal(up.s, 201, JSON.stringify(up.j));
  const did = up.j.documento.id;
  assert.equal(up.j.documento.situacao, 'pendente');
  assert.equal(up.j.documento.versao_atual.numero, 1);
  assert.equal(up.j.documento.versao_atual.nome_original, 'minha cnh.pdf');

  // O arquivo no disco está cifrado: não contém o texto original nem tem nome do usuário/documento.
  const raiz = path.join(S.dir, 'documentos');
  const blobs = []; (function varrer(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) varrer(p); else blobs.push(p); } })(raiz);
  assert.equal(blobs.length, 1);
  assert.match(path.relative(raiz, blobs[0]), /^\d{4}[\\/]\d{2}[\\/][a-f0-9]{32}\.bin$/, 'nome interno aleatório, nunca o enviado');
  const gravado = fs.readFileSync(blobs[0]);
  assert.ok(!gravado.includes('CNH-FICTICIA-V1'), 'conteúdo cifrado em repouso');
  assert.ok(!gravado.includes('%PDF'), 'sem assinatura legível no disco');
  if (process.platform !== 'win32') assert.equal(fs.statSync(blobs[0]).mode & 0o077, 0, 'arquivo só do dono');

  // Admin baixa e vê: bytes idênticos; cabeçalhos de segurança; sem cache.
  const baixa = await adm.baixar(`/documentos/${did}/arquivo`);
  assert.equal(baixa.s, 200);
  assert.ok(baixa.bin.equals(conteudo1), 'integridade: mesmo conteúdo');
  assert.match(baixa.h.get('content-disposition'), /^attachment; filename="cnh_v1\.pdf"$/);
  assert.equal(baixa.h.get('content-type'), 'application/pdf');
  assert.match(baixa.h.get('content-security-policy'), /sandbox/);
  assert.match(baixa.h.get('cache-control') || '', /no-store/);
  const ver = await adm.baixar(`/documentos/${did}/arquivo?modo=ver`);
  assert.match(ver.h.get('content-disposition'), /^inline/);

  // Campo antigo da ficha foi sincronizado e a situação do motorista NÃO mudou.
  let ficha = (await adm('GET', `/motoristas/${mid}`)).j;
  const reg = ficha.item;
  assert.equal(reg.doc_cnh, 'Recebido — conferir');
  assert.equal(reg.situacao, 'Novo interessado', 'anexar não muda a situação do motorista');

  // Conferência: rejeitar exige motivo; conferir muda só o documento.
  assert.equal((await adm('POST', `/documentos/${did}/conferir`, { resultado: 'rejeitado' })).s, 422);
  assert.equal((await adm('POST', `/documentos/${did}/conferir`, { resultado: 'inventado' })).s, 422);
  const rej = await adm('POST', `/documentos/${did}/conferir`, { resultado: 'rejeitado', observacoes: 'Foto cortada, enviar de novo' });
  assert.equal(rej.s, 200);
  assert.equal(rej.j.documento.situacao, 'rejeitado');
  assert.equal(rej.j.documento.conferido_por_nome, 'Adm');
  assert.ok(rej.j.documento.conferido_em);
  lista = (await adm('GET', `/documentos?funcao=motorista&registro_id=${mid}`)).j;
  assert.equal(lista.geral.codigo, 'com_pendencias');

  // Substituição: versão 2 volta a "pendente"; a v1 continua guardada e acessível ao admin.
  const conteudo2 = png('CNH-FICTICIA-V2');
  const sub = await adm.up(`/documentos/${did}/versoes`, conteudo2, { observacoes: 'foto nova' }, 'cnh-nova.png');
  assert.equal(sub.s, 201, JSON.stringify(sub.j));
  assert.equal(sub.j.documento.situacao, 'pendente');
  assert.equal(sub.j.documento.versao_atual.numero, 2);
  assert.equal(sub.j.documento.total_versoes, 2);
  assert.equal(sub.j.documento.conferido_por_nome, null, 'nova versão exige nova conferência');
  assert.ok((await adm.baixar(`/documentos/${did}/arquivo?versao=1`)).bin.equals(conteudo1), 'original preservado');
  assert.ok((await adm.baixar(`/documentos/${did}/arquivo`)).bin.equals(conteudo2));
  assert.equal((await adm.baixar(`/documentos/${did}/arquivo?versao=9`)).s, 404);

  const conf = await adm('POST', `/documentos/${did}/conferir`, { resultado: 'conferido' });
  assert.equal(conf.j.documento.situacao, 'conferido');
  ficha = (await adm('GET', `/motoristas/${mid}`)).j;
  assert.equal(ficha.item.doc_cnh, 'Conferido');
  assert.equal(ficha.item.situacao, 'Novo interessado', 'conferir não contrata nem muda a situação');

  // Histórico: versões, eventos e hash (hash só para admin).
  const h = (await adm('GET', `/documentos/${did}`)).j;
  assert.deepEqual(h.versoes.map((v) => v.numero), [2, 1]);
  assert.ok(h.versoes[0].sha256 && /^[a-f0-9]{64}$/.test(h.versoes[0].sha256));
  const tipos = h.eventos.map((e) => e.tipo);
  for (const esperado of ['enviado', 'rejeitado', 'substituido', 'conferido', 'baixado', 'visualizado']) assert.ok(tipos.includes(esperado), `evento ${esperado}`);
  assert.ok(!JSON.stringify(h).includes('chave_embrulhada') && !JSON.stringify(h).includes('chave_armazenamento'), 'histórico não expõe chaves nem nome interno');

  // Auditoria registra os acessos (sem conteúdo).
  const aud = (await adm('GET', '/audit?limit=200')).j;
  const acoes = JSON.stringify(aud);
  for (const a of ['doc_enviar', 'doc_substituir', 'doc_baixar', 'doc_visualizar', 'doc_conferido', 'doc_rejeitado']) assert.ok(acoes.includes(a), `auditoria ${a}`);
  assert.ok(!acoes.includes('CNH-FICTICIA'), 'auditoria sem conteúdo do arquivo');
  await S.parar();
});

test('M4: arquivos inválidos são recusados (tipo, extensão, tamanho, conteúdo ativo, nome malicioso)', async (t) => {
  const S = await subir({ env: { DOCS_MAX_MB: '1' } });
  t.after(() => S.proc.kill());
  const { adm } = S;
  const mid = (await criarMotorista(adm, 'Ana Fictícia', '85988880002')).item.id;
  const meta = { funcao: 'motorista', registro_id: mid, categoria: 'cnh' };

  const casos = [
    ['texto puro', Buffer.from('isto não é um documento, é só texto de teste'), 'x.pdf'],
    ['executável disfarçado', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]), 'cnh.pdf'],
    ['extensão não combina (PNG como .pdf)', png('a'), 'cnh.pdf'],
    ['extensão proibida', pdf('a'), 'cnh.exe'],
    ['sem extensão', pdf('a'), 'cnh'],
    ['PDF com JavaScript', Buffer.from('%PDF-1.4\n1 0 obj<</S/JavaScript /JS (app.alert(1))>>endobj\n%%EOF'), 'cnh.pdf'],
    ['PDF com abertura automática', Buffer.from('%PDF-1.4\n1 0 obj<</OpenAction 2 0 R>>endobj\n%%EOF'), 'cnh.pdf'],
    ['vazio', Buffer.alloc(0), 'cnh.pdf']
  ];
  for (const [nome, buf, arq] of casos) {
    const r = await adm.up('/documentos', buf, meta, arq);
    assert.ok([400, 422].includes(r.s), `${nome} deveria ser recusado (veio ${r.s})`);
  }
  // Maior que o limite (1 MB neste teste).
  const grande = Buffer.concat([pdf('g'), Buffer.alloc(1.5 * 1024 * 1024, 7)]);
  const rg = await adm.up('/documentos', grande, meta, 'cnh.pdf');
  assert.ok([413, 422].includes(rg.s), `grande demais: ${rg.s}`);
  // Metadados inválidos.
  assert.equal((await adm.up('/documentos', pdf('a'), { ...meta, categoria: 'inventada' }, 'a.pdf')).s, 422);
  assert.equal((await adm.up('/documentos', pdf('a'), { ...meta, funcao: 'passageiro' }, 'a.pdf')).s, 422);
  assert.equal((await adm.up('/documentos', pdf('a'), { ...meta, registro_id: 99999 }, 'a.pdf')).s, 404);
  assert.equal((await adm.up('/documentos', pdf('a'), { ...meta, data_envio: '2099-01-01' }, 'a.pdf')).s, 422);
  assert.equal((await adm.up('/documentos', pdf('a'), { ...meta, categoria: 'outros' }, 'a.pdf')).s, 422, '"outros" exige nome');
  // Nada foi gravado em disco pelos envios recusados.
  const dirDocs = path.join(S.dir, 'documentos');
  const arquivos = fs.existsSync(dirDocs) ? fs.readdirSync(dirDocs, { recursive: true }).filter((p) => p.endsWith('.bin')) : [];
  assert.equal(arquivos.length, 0, 'recusado não deixa resíduo');

  // Nome malicioso (pasta, aspas, quebra de linha) é aceito como texto inerte: vira só rótulo, nunca caminho/cabeçalho.
  const ok = await adm.up('/documentos', pdf('b'), meta, '../../etc/passwd"\r\nX-Evil: 1\\.pdf');
  assert.equal(ok.s, 201, JSON.stringify(ok.j));
  assert.ok(!/[\\/"\r\n]/.test(ok.j.documento.versao_atual.nome_original));
  const baixa = await adm.baixar(`/documentos/${ok.j.documento.id}/arquivo`);
  assert.equal(baixa.h.get('x-evil'), null);
  assert.equal(baixa.h.get('content-disposition'), 'attachment; filename="cnh_v1.pdf"');
  await S.parar();
});

test('M4: permissões — sem login, gestor (padrão e liberado pelo dono) e administrador', async (t) => {
  const S = await subir();
  t.after(() => S.proc.kill());
  const { adm, ges, anon } = S;
  const mid = (await criarMotorista(adm, 'Beatriz Fictícia', '85988880003')).item.id;
  const up = await adm.up('/documentos', pdf('CRLV-B'), { funcao: 'motorista', registro_id: mid, categoria: 'crlv' }, 'crlv.pdf');
  const did = up.j.documento.id;

  // Sem login: tudo 401.
  for (const [m, u] of [['GET', '/documentos/meta'], ['GET', `/documentos?funcao=motorista&registro_id=${mid}`], ['GET', `/documentos/${did}`], ['GET', `/documentos/${did}/arquivo`], ['GET', '/documentos/lista'], ['GET', '/documentos/politica']]) {
    assert.equal((await anon(m, u)).s, 401, `${m} ${u}`);
  }
  assert.equal((await anon.up('/documentos', pdf('x'), { funcao: 'motorista', registro_id: mid, categoria: 'cnh' }, 'a.pdf')).s, 401);

  // Gestor, política padrão: vê a situação, anexa; NÃO vê/baixa, NÃO confere, NÃO mexe na política, NÃO exclui.
  const visao = (await ges('GET', `/documentos?funcao=motorista&registro_id=${mid}`)).j;
  assert.equal(visao.itens.find((i) => i.categoria === 'crlv').situacao, 'pendente');
  assert.equal(visao.itens.find((i) => i.categoria === 'crlv').pode.ver, false);
  const negado = await ges.baixar(`/documentos/${did}/arquivo`);
  assert.equal(negado.s, 403);
  assert.equal((await ges.baixar(`/documentos/${did}/arquivo?modo=ver`)).s, 403);
  assert.equal((await ges('POST', `/documentos/${did}/conferir`, { resultado: 'conferido' })).s, 403);
  assert.equal((await ges('GET', '/documentos/politica')).s, 403);
  assert.equal((await ges('PUT', '/documentos/politica', { gestor: { categorias_visiveis: ['crlv'] } })).s, 403);
  assert.equal((await ges('POST', `/documentos/${did}/excluir-definitivo`, { confirmo: true, motivo: 'tentativa do gestor sem poder' })).s, 403);
  const hg = (await ges('GET', `/documentos/${did}`)).j;
  assert.equal(hg.versoes[0].sha256, null, 'gestor não vê o hash');
  assert.equal(hg.versoes[0].pode_ver, false);
  const anexoGestor = await ges.up('/documentos', pdf('CNH-G'), { funcao: 'motorista', registro_id: mid, categoria: 'cnh' }, 'cnh.pdf');
  assert.equal(anexoGestor.s, 201, 'gestor pode anexar por padrão');
  // A tentativa negada ficou registrada para o administrador.
  const h = (await adm('GET', `/documentos/${did}`)).j;
  assert.ok(h.eventos.some((e) => e.tipo === 'acesso_negado' && e.usuario_nome === 'Gestor Teste'));
  assert.ok(JSON.stringify((await adm('GET', '/audit?limit=100')).j).includes('doc_acesso_negado'));

  // Administrador libera só o CRLV para o gestor VER (conferir continua negado: política separada).
  assert.equal((await adm('PUT', '/documentos/politica', { gestor: { categorias_visiveis: ['crlv'] } })).s, 200);
  assert.equal((await ges.baixar(`/documentos/${did}/arquivo`)).s, 200);
  const outro = anexoGestor.j.documento.id; // CNH: não liberada
  assert.equal((await ges.baixar(`/documentos/${outro}/arquivo`)).s, 403);
  assert.equal((await ges('POST', `/documentos/${did}/conferir`, { resultado: 'conferido' })).s, 403);
  assert.equal((await adm('PUT', '/documentos/politica', { gestor: { conferir: true } })).s, 200);
  assert.equal((await ges('POST', `/documentos/${did}/conferir`, { resultado: 'conferido' })).s, 200);
  assert.equal((await ges('POST', `/documentos/${outro}/conferir`, { resultado: 'conferido' })).s, 403, 'não confere o que não pode abrir');
  // Impedir anexo pelo gestor.
  assert.equal((await adm('PUT', '/documentos/politica', { gestor: { anexar: false } })).s, 200);
  assert.equal((await ges.up('/documentos', pdf('x'), { funcao: 'motorista', registro_id: mid, categoria: 'comprovante_endereco' }, 'a.pdf')).s, 403);
  // Política validada.
  assert.equal((await adm('PUT', '/documentos/politica', { gestor: { categorias_visiveis: ['inventada'] } })).s, 422);
  assert.equal((await adm('PUT', '/documentos/politica', { cpf_cnpj: { cpf: 'obrigatorio' } })).s, 422);
  assert.equal((await adm('PUT', '/documentos/politica', { obrigatorios: { motorista: ['outros'] } })).s, 422);
  await S.parar();
});

test('M4: pessoa com várias funções, documentos independentes por função, sem cópias, e ficha central', async (t) => {
  const S = await subir();
  t.after(() => S.proc.kill());
  const { adm } = S;
  const m = await criarMotorista(adm, 'Davi Dois Papéis Fictício', '85988880004');
  const mid = m.item.id; const pessoaId = m.titular.id;
  const ent = await adm('POST', `/pessoas/${pessoaId}/funcoes`, { funcao: 'entregador', dados: { ...BASE } });
  assert.equal(ent.s, 201, JSON.stringify(ent.j));
  const eid = ent.j.item.id;
  assert.ok(eid);

  const A = await adm.up('/documentos', pdf('CNH-MOTORISTA'), { funcao: 'motorista', registro_id: mid, categoria: 'cnh' }, 'cnh.pdf');
  const Bm = await adm.up('/documentos', jpg('CNH-ENTREGADOR'), { funcao: 'entregador', registro_id: eid, categoria: 'cnh' }, 'cnh.jpg');
  assert.equal(A.s, 201); assert.equal(Bm.s, 201);
  assert.notEqual(A.j.documento.id, Bm.j.documento.id, 'um documento por função');
  // Conferir numa função não afeta a outra.
  await adm('POST', `/documentos/${A.j.documento.id}/conferir`, { resultado: 'conferido' });
  const ficha = (await adm('GET', `/pessoas/${pessoaId}`)).j;
  const doc = (f) => ficha.documentos.find((d) => d.funcao === f);
  assert.equal(doc('motorista').geral.conferidos, 1);
  assert.equal(doc('entregador').geral.conferidos, 0);
  assert.equal(doc('entregador').geral.enviados, 1);
  assert.equal(doc('motorista').registro_id, mid);
  assert.ok(!JSON.stringify(ficha.documentos).includes('sha256'), 'ficha central: só situação, nunca arquivo');
  // Cada função lista só os seus documentos.
  const lm = (await adm('GET', `/documentos?funcao=motorista&registro_id=${mid}`)).j;
  const le = (await adm('GET', `/documentos?funcao=entregador&registro_id=${eid}`)).j;
  assert.equal(lm.itens.find((i) => i.categoria === 'cnh').situacao, 'conferido');
  assert.equal(le.itens.find((i) => i.categoria === 'cnh').situacao, 'pendente');
  // Encerrar (excluir) a ficha de entregador não apaga os documentos do motorista nem os dela: o histórico permanece.
  const del = await adm('DELETE', `/entregadores/${eid}`);
  assert.equal(del.s, 200, JSON.stringify(del.j));
  const lista = (await adm('GET', '/documentos/lista?funcao=entregador')).j;
  assert.equal(lista.total, 1, 'o documento da ficha encerrada continua guardado');
  assert.equal(lista.items[0].registro_existe, false);
  assert.ok((await adm.baixar(`/documentos/${Bm.j.documento.id}/arquivo`)).bin.equals(jpg('CNH-ENTREGADOR')));
  assert.equal((await adm('GET', `/documentos/lista?funcao=motorista`)).j.total, 1);
  // Não se anexa a ficha que já não existe.
  assert.equal((await adm.up('/documentos', pdf('x'), { funcao: 'entregador', registro_id: eid, categoria: 'crlv' }, 'a.pdf')).s, 404);
  await S.parar();
});

test('M4: documentos empresariais (parceiro e comércio) e CNPJ/CPF protegidos', async (t) => {
  const S = await subir();
  t.after(() => S.proc.kill());
  const { adm, ges } = S;
  const c = await adm('POST', '/comercios', COM);
  assert.equal(c.s, 201, JSON.stringify(c.j));
  const cid = c.j.item.id; const empresaId = c.j.titular.id;
  const p = await adm('POST', '/parceiros', { ...PARC, empresa_id: empresaId });
  assert.equal(p.s, 201, JSON.stringify(p.j));
  const pid = p.j.item.id;

  const meta = (await adm('GET', '/documentos/meta')).j;
  assert.ok(meta.funcoes.comercio.categorias.some((x) => x.chave === 'cartao_cnpj'));
  assert.ok(meta.funcoes.parceiro_clube.categorias.some((x) => x.chave === 'alvara'));
  const a = await adm.up('/documentos', pdf('CARTAO-CNPJ'), { funcao: 'comercio', registro_id: cid, categoria: 'cartao_cnpj' }, 'cartao.pdf');
  const b = await adm.up('/documentos', pdf('ALVARA'), { funcao: 'parceiro_clube', registro_id: pid, categoria: 'alvara' }, 'alvara.pdf');
  const o = await adm.up('/documentos', png('OUTRO'), { funcao: 'comercio', registro_id: cid, categoria: 'outros', titulo: 'Foto da fachada' }, 'fachada.png');
  assert.equal(a.s, 201); assert.equal(b.s, 201); assert.equal(o.s, 201, JSON.stringify(o.j));
  // Dois "outros" no mesmo cadastro são documentos diferentes; categoria fixa vira nova versão do mesmo documento.
  const o2 = await adm.up('/documentos', png('OUTRO2'), { funcao: 'comercio', registro_id: cid, categoria: 'outros', titulo: 'Foto do balcão' }, 'balcao.png');
  assert.notEqual(o2.j.documento.id, o.j.documento.id);
  const a2 = await adm.up('/documentos', pdf('CARTAO-CNPJ-2'), { funcao: 'comercio', registro_id: cid, categoria: 'cartao_cnpj' }, 'cartao2.pdf');
  assert.equal(a2.j.documento.id, a.j.documento.id);
  assert.equal(a2.j.documento.versao_atual.numero, 2);
  // Por padrão comércio/parceiro não têm documentos "exigidos": a situação geral diz isso, sem inventar regra.
  const lc = (await adm('GET', `/documentos?funcao=comercio&registro_id=${cid}`)).j;
  assert.equal(lc.geral.codigo, 'sem_exigencia');
  assert.equal((await adm('PUT', '/documentos/politica', { obrigatorios: { comercio: ['cartao_cnpj', 'alvara'] } })).s, 200);
  const lc2 = (await adm('GET', `/documentos?funcao=comercio&registro_id=${cid}`)).j;
  assert.equal(lc2.geral.codigo, 'incompletos');
  assert.equal(lc2.itens.find((i) => i.categoria === 'alvara').situacao, 'nao_enviado');

  // CNPJ: coleta desligada por padrão (decisão do dono pendente).
  const base = `/empresas/${empresaId}/cnpj`;
  assert.equal((await adm('PUT', base, { cnpj: CNPJ_OK, finalidade: 'Cadastro do comércio parceiro' })).s, 409);
  assert.equal((await adm('PUT', '/documentos/politica', { cpf_cnpj: { cnpj: 'opcional', cpf: 'opcional' } })).s, 200);
  assert.equal((await adm('PUT', base, { cnpj: '11.222.333/0001-82', finalidade: 'Cadastro do comércio parceiro' })).s, 422, 'dígito verificador');
  assert.equal((await adm('PUT', base, { cnpj: CNPJ_OK })).s, 422, 'finalidade obrigatória');
  const okc = await adm('PUT', base, { cnpj: CNPJ_OK, finalidade: 'Cadastro do comércio parceiro' });
  assert.equal(okc.s, 200, JSON.stringify(okc.j));
  assert.equal(okc.j.protegido.tem, true);
  assert.equal(okc.j.protegido.mascara, '**.***.***/0001-81');
  assert.ok(!JSON.stringify(okc.j).includes('11222333'), 'resposta nunca traz o número inteiro');
  // Só administrador.
  assert.equal((await ges('PUT', base, { cnpj: CNPJ_OK2, finalidade: 'tentativa do gestor' })).s, 403);
  assert.equal((await ges('POST', `${base}/revelar`)).s, 403);
  assert.equal((await ges('POST', `${base}/remover`, { confirmo: true })).s, 403);
  // A ficha mostra só a máscara (admin) e nada ao gestor; o banco guarda cifrado.
  const fAdm = (await adm('GET', `/empresas/${empresaId}`)).j;
  assert.equal(fAdm.protegido.mascara, '**.***.***/0001-81');
  assert.equal(fAdm.protegido.coleta, 'opcional');
  const fGes = (await ges('GET', `/empresas/${empresaId}`)).j;
  assert.equal(fGes.protegido, undefined);
  assert.ok(!JSON.stringify(fGes).includes('0001-81') && !JSON.stringify(fGes).includes('11222333'));
  // Duplicidade: o mesmo CNPJ em outra empresa é recusado.
  const outraC = await adm('POST', '/comercios', { ...COM, nome_estabelecimento: 'Mercado Lua Fictício', telefone: '(85) 3000-9999' });
  assert.equal(outraC.s, 201);
  assert.equal((await adm('PUT', `/empresas/${outraC.j.titular.id}/cnpj`, { cnpj: CNPJ_OK, finalidade: 'Cadastro do comércio parceiro' })).s, 409);
  assert.equal((await adm('PUT', `/empresas/${outraC.j.titular.id}/cnpj`, { cnpj: CNPJ_OK2, finalidade: 'Cadastro do comércio parceiro' })).s, 200);
  // Revelar: audita e devolve formatado; remover exige confirmação.
  const rev = await adm('POST', `${base}/revelar`);
  assert.equal(rev.j.valor, CNPJ_OK);
  assert.equal((await adm('POST', `${base}/remover`, {})).s, 422);
  const aud = JSON.stringify((await adm('GET', '/audit?limit=300')).j);
  assert.ok(aud.includes('revelar_dado') && aud.includes('proteger_dado'));
  assert.ok(!aud.includes('11222333') && !aud.includes('11.222.333'), 'auditoria sem o número');
  // No banco: nada em texto aberto.
  await S.parar();
  const Database = require('better-sqlite3');
  const raw = new Database(path.join(S.dir, 'crm.db'), { readonly: true });
  const linha = raw.prepare('SELECT * FROM empresas WHERE id = ?').get(empresaId);
  assert.ok(linha.cnpj_cifrado.startsWith('P1.'));
  assert.ok(!JSON.stringify(linha).includes('11222333'), 'CNPJ não aparece aberto no banco');
  raw.close();

  // CPF da pessoa (mesmo mecanismo).
  const S2 = await subir({ dir: S.dir, preparar: false });
  t.after(() => S2.proc.kill());
  const adm2 = await entrar(S2, 'adm');
  await adm2('PUT', '/documentos/politica', { cpf_cnpj: { cpf: 'opcional' } });
  const m = await criarMotorista(adm2, 'Elisa Fictícia', '85988880005');
  const cpfUrl = `/pessoas/${m.titular.id}/cpf`;
  assert.equal((await adm2('PUT', cpfUrl, { cpf: CPF_OK, finalidade: 'Contratação de motorista' })).s, 200);
  assert.equal((await adm2('PUT', cpfUrl, { cpf: '111.111.111-11', finalidade: 'Contratação de motorista' })).s, 422);
  assert.equal((await adm2('GET', `/pessoas/${m.titular.id}`)).j.protegido.mascara, '***.***.*47-25');
  assert.equal((await adm2('POST', `${cpfUrl}/revelar`)).j.valor, CPF_OK);
  assert.equal((await adm2('POST', `${cpfUrl}/remover`, { confirmo: true })).j.protegido.tem, false);
  await S2.parar();
});

test('M4: persistência após reinício, integridade (adulteração) e verificação', async (t) => {
  const S = await subir();
  t.after(() => S.proc.kill());
  const mid = (await criarMotorista(S.adm, 'Fábio Fictício', '85988880006')).item.id;
  const conteudo = pdf('PERSISTE');
  const up = await S.adm.up('/documentos', conteudo, { funcao: 'motorista', registro_id: mid, categoria: 'cnh' }, 'cnh.pdf');
  const did = up.j.documento.id;
  await S.parar();

  // Reinício do serviço com o mesmo diretório de dados: o documento continua, íntegro.
  const S2 = await subir({ dir: S.dir, preparar: false });
  t.after(() => S2.proc.kill());
  const adm2 = await entrar(S2, 'adm');
  const lido = await adm2.baixar(`/documentos/${did}/arquivo`);
  assert.equal(lido.s, 200);
  assert.ok(lido.bin.equals(conteudo), 'documento sobrevive ao reinício');
  assert.equal((await adm2('GET', `/documentos/${did}`)).j.versoes.length, 1);

  // Sem a chave certa o arquivo não abre (e o erro não vaza detalhe).
  await S2.parar();
  const outraChave = crypto.randomBytes(32).toString('hex');
  const S3 = await subir({ dir: S.dir, preparar: false, env: { FM_DOCS_KEY: outraChave } });
  t.after(() => S3.proc.kill());
  const adm3 = await entrar(S3, 'adm');
  const semChave = await adm3.baixar(`/documentos/${did}/arquivo`);
  assert.equal(semChave.s, 500);
  assert.equal(semChave.j.error.code, 'integridade');
  await S3.parar();

  // Adulteração do arquivo no disco: detectada ao abrir, registrada no histórico, e a verificação aponta o problema.
  const raiz = path.join(S.dir, 'documentos');
  const blob = (function achar(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { const r = achar(p); if (r) return r; } else return p; } return null; })(raiz);
  const original = fs.readFileSync(blob);
  const adulterado = Buffer.from(original); adulterado[adulterado.length - 3] ^= 0xff;
  fs.writeFileSync(blob, adulterado);
  const S4 = await subir({ dir: S.dir, preparar: false });
  t.after(() => S4.proc.kill());
  const adm4 = await entrar(S4, 'adm');
  const falha = await adm4.baixar(`/documentos/${did}/arquivo`);
  assert.equal(falha.s, 500);
  assert.equal(falha.j.error.code, 'integridade');
  assert.ok((await adm4('GET', `/documentos/${did}`)).j.eventos.some((e) => e.tipo === 'integridade_falhou'));
  await S4.parar();
  const ver = spawnSync(process.execPath, [path.join(CRM, 'scripts', 'docs-verificar.js')], { env: { ...process.env, FM_DATA_DIR: S.dir, FM_ETAPA2: '1', FM_DOCS_KEY: CHAVE_DOCS, FM_DADOS_KEY: CHAVE_DADOS }, encoding: 'utf8' });
  assert.notEqual(ver.status, 0, 'verificação acusa o arquivo adulterado');
  assert.match(ver.stdout + ver.stderr, /adulterado|hash|integr/i);
  // Restaurado o original, a verificação passa.
  fs.writeFileSync(blob, original);
  const ver2 = spawnSync(process.execPath, [path.join(CRM, 'scripts', 'docs-verificar.js')], { env: { ...process.env, FM_DATA_DIR: S.dir, FM_ETAPA2: '1', FM_DOCS_KEY: CHAVE_DOCS, FM_DADOS_KEY: CHAVE_DADOS }, encoding: 'utf8' });
  assert.equal(ver2.status, 0, ver2.stdout + ver2.stderr);
});

test('M4: backup e recuperação dos documentos (procedimento de teste)', async (t) => {
  const S = await subir();
  t.after(() => S.proc.kill());
  const mid = (await criarMotorista(S.adm, 'Gabi Fictícia', '85988880007')).item.id;
  const c1 = pdf('BACKUP-1'); const c2 = png('BACKUP-2');
  const a = await S.adm.up('/documentos', c1, { funcao: 'motorista', registro_id: mid, categoria: 'cnh' }, 'cnh.pdf');
  await S.adm.up(`/documentos/${a.j.documento.id}/versoes`, c2, {}, 'cnh2.png');
  const b = await S.adm.up('/documentos', jpg('BACKUP-3'), { funcao: 'motorista', registro_id: mid, categoria: 'crlv' }, 'crlv.jpg');
  await S.parar();

  const env = { ...process.env, FM_DATA_DIR: S.dir, FM_ETAPA2: '1', FM_DOCS_KEY: CHAVE_DOCS, FM_DADOS_KEY: CHAVE_DADOS };
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-m4-bkp-'));
  const bk = spawnSync(process.execPath, [path.join(CRM, 'scripts', 'docs-backup.js'), dest], { env, encoding: 'utf8' });
  assert.equal(bk.status, 0, bk.stdout + bk.stderr);
  const r = JSON.parse(bk.stdout);
  assert.equal(r.versoes, 3); assert.equal(r.copiados, 3);
  // O backup só tem dados cifrados: nem o manifesto nem os arquivos mostram conteúdo ou nomes.
  const tudo = []; (function v(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? v(p) : tudo.push(p); } })(dest);
  for (const f of tudo) { const buf = fs.readFileSync(f); assert.ok(!buf.includes('BACKUP-') && !buf.includes('cnh.pdf') && !buf.includes('Gabi'), `backup cifrado: ${path.basename(f)}`); }
  // Segundo backup: nada novo para copiar (incremental).
  const bk2 = JSON.parse(spawnSync(process.execPath, [path.join(CRM, 'scripts', 'docs-backup.js'), dest], { env, encoding: 'utf8' }).stdout);
  assert.equal(bk2.copiados, 0); assert.equal(bk2.ja_existiam, 3);

  // Desastre: apaga os arquivos do armazenamento (o banco fica). A verificação acusa; a restauração recupera tudo.
  fs.rmSync(path.join(S.dir, 'documentos'), { recursive: true, force: true });
  const v1 = spawnSync(process.execPath, [path.join(CRM, 'scripts', 'docs-verificar.js')], { env, encoding: 'utf8' });
  assert.notEqual(v1.status, 0);
  const rs = spawnSync(process.execPath, [path.join(CRM, 'scripts', 'docs-restaurar.js'), dest], { env, encoding: 'utf8' });
  assert.equal(rs.status, 0, rs.stdout + rs.stderr);
  const res = JSON.parse(rs.stdout);
  assert.equal(res.arquivos_restaurados, 3);
  assert.equal(res.verificacao.integro, true);
  const S2 = await subir({ dir: S.dir, preparar: false });
  t.after(() => S2.proc.kill());
  const adm2 = await entrar(S2, 'adm');
  assert.ok((await adm2.baixar(`/documentos/${a.j.documento.id}/arquivo?versao=1`)).bin.equals(c1));
  assert.ok((await adm2.baixar(`/documentos/${a.j.documento.id}/arquivo`)).bin.equals(c2));
  assert.ok((await adm2.baixar(`/documentos/${b.j.documento.id}/arquivo`)).bin.equals(jpg('BACKUP-3')));
  // Backup corrompido não é restaurado.
  fs.rmSync(path.join(S.dir, 'documentos'), { recursive: true, force: true });
  const alvo = tudo.find((f) => f.endsWith('.bin')); fs.writeFileSync(alvo, Buffer.from('corrompido'));
  const rs2 = JSON.parse(spawnSync(process.execPath, [path.join(CRM, 'scripts', 'docs-restaurar.js'), dest], { env, encoding: 'utf8' }).stdout || '{}');
  assert.equal(rs2.arquivos_corrompidos_no_backup && rs2.arquivos_corrompidos_no_backup.length, 1);
  await S2.parar();
});

test('M4: exclusão definitiva só com política, confirmação e motivo; histórico permanece', async (t) => {
  const S = await subir();
  t.after(() => S.proc.kill());
  const { adm, ges } = S;
  const mid = (await criarMotorista(adm, 'Hugo Fictício', '85988880008')).item.id;
  const up = await adm.up('/documentos', pdf('APAGAR'), { funcao: 'motorista', registro_id: mid, categoria: 'cnh' }, 'cnh.pdf');
  const did = up.j.documento.id;
  const corpo = { confirmo: true, motivo: 'Pedido do titular conforme LGPD (teste)' };
  // Desligada por padrão: ninguém exclui, nem o administrador (a política de retenção não foi aprovada).
  const n1 = await adm('POST', `/documentos/${did}/excluir-definitivo`, corpo);
  assert.equal(n1.s, 409); assert.equal(n1.j.error.code, 'politica_nao_definida');
  assert.equal((await adm('PUT', '/documentos/politica', { exclusao_definitiva: true })).s, 200);
  assert.equal((await ges('POST', `/documentos/${did}/excluir-definitivo`, corpo)).s, 403);
  assert.equal((await adm('POST', `/documentos/${did}/excluir-definitivo`, { motivo: corpo.motivo })).s, 422);
  assert.equal((await adm('POST', `/documentos/${did}/excluir-definitivo`, { confirmo: true, motivo: 'curto' })).s, 422);
  const ok = await adm('POST', `/documentos/${did}/excluir-definitivo`, corpo);
  assert.equal(ok.s, 200, JSON.stringify(ok.j));
  assert.equal(ok.j.arquivos_removidos, 1);
  assert.equal((await adm.baixar(`/documentos/${did}/arquivo`)).s, 410);
  const dirDocs = path.join(S.dir, 'documentos');
  assert.equal(fs.readdirSync(dirDocs, { recursive: true }).filter((p) => p.endsWith('.bin')).length, 0, 'arquivo removido do armazenamento');
  const h = (await adm('GET', `/documentos/${did}`)).j;
  assert.ok(h.documento.excluido_em);
  assert.ok(h.eventos.some((e) => e.tipo === 'exclusao_definitiva' && /LGPD/.test(e.detalhe)), 'histórico preservado');
  assert.equal(h.versoes.length, 1, 'registro da versão preservado (sem arquivo)');
  assert.ok(h.versoes[0].arquivo_removido_em);
  assert.equal((await adm('POST', `/documentos/${did}/excluir-definitivo`, corpo)).s, 409, 'não repete');
  // A vaga fica livre: pode-se enviar um documento novo na mesma categoria.
  assert.equal((await adm.up('/documentos', pdf('NOVO'), { funcao: 'motorista', registro_id: mid, categoria: 'cnh' }, 'cnh.pdf')).s, 201);
  // O histórico é imutável no banco (gatilhos): ninguém apaga nem altera evento/versão/documento por SQL comum.
  await S.parar();
  const Database = require('better-sqlite3');
  const raw = new Database(path.join(S.dir, 'crm.db'));
  assert.throws(() => raw.prepare('DELETE FROM documento_eventos').run(), /imut|append|permit|não/i);
  assert.throws(() => raw.prepare("UPDATE documento_eventos SET detalhe = 'x'").run(), /imut|append|permit|não/i);
  assert.throws(() => raw.prepare('DELETE FROM documento_versoes').run(), /imut|permit|não|apag/i);
  assert.throws(() => raw.prepare("UPDATE documento_versoes SET sha256 = 'x'").run(), /imut|permit|não|alter/i);
  assert.throws(() => raw.prepare('DELETE FROM documentos').run(), /imut|permit|não|apag/i);
  raw.close();
});

test('M4: relatórios (PDF/CSV só administrador), dashboard e acompanhamento da ficha', async (t) => {
  const S = await subir();
  t.after(() => S.proc.kill());
  const { adm, ges } = S;
  const m = await criarMotorista(adm, 'Irene Fictícia', '85988880009');
  const mid = m.item.id;
  await adm('PUT', '/documentos/politica', { cpf_cnpj: { cpf: 'opcional' } });
  await adm('PUT', `/pessoas/${m.titular.id}/cpf`, { cpf: CPF_OK, finalidade: 'Contratação de motorista' });
  const a = await adm.up('/documentos', pdf('REL-1'), { funcao: 'motorista', registro_id: mid, categoria: 'cnh' }, 'cnh.pdf');
  await adm.up('/documentos', pdf('REL-2'), { funcao: 'motorista', registro_id: mid, categoria: 'crlv' }, 'crlv.pdf');
  await adm('POST', `/documentos/${a.j.documento.id}/conferir`, { resultado: 'rejeitado', observacoes: 'Ilegível' });

  const k = (await adm('GET', '/dashboard')).j.kpis;
  assert.equal(k.documentos_pendentes, 1);
  assert.equal(k.documentos_atencao, 1);
  const lista = (await adm('GET', '/documentos/lista?situacao=rejeitado')).j;
  assert.equal(lista.total, 1);
  assert.equal(lista.items[0].registro_titulo, 'Irene Fictícia');
  assert.equal((await adm('GET', '/documentos/lista?situacao=xx')).s, 422);
  assert.equal((await adm('GET', '/documentos/lista?q=irene')).j.total, 2);

  const pdfR = await adm('GET', '/reports/pdf?type=documentos');
  assert.equal(pdfR.s, 200);
  const txt = textoPorPagina(pdfR.pdf).join('\n').replace(/\s+/g, ' ');
  assert.match(txt, /Relatório de Documentos/);
  assert.match(txt, /Irene Fictícia/);
  assert.match(txt, /Pendente de conferência/);
  assert.ok(!/529|247-25|\*\*\*/.test(txt), 'relatório sem CPF');
  assert.match(txt, /não contém CPF, CNPJ nem o conteúdo/);
  const vazio = await adm('GET', '/reports/pdf?type=documentos&situacao=necessita_atualizacao');
  assert.match(textoPorPagina(vazio.pdf).join(' ').replace(/\s+/g, ' '), /Nenhum documento encontrado/);
  assert.equal((await ges('GET', '/reports/pdf?type=documentos')).s, 403);
  const csv = await adm('GET', '/reports/export?type=documentos');
  assert.equal(csv.s, 200);
  assert.match(csv.csv, /Irene Fictícia/);
  assert.ok(!csv.csv.includes('REL-1') && !csv.csv.includes('529.982'));
  assert.equal((await ges('GET', '/reports/export?type=documentos')).s, 403);
  const resumo = (await adm('GET', '/reports/summary')).j;
  assert.equal(resumo.documentos.total, 2);
  assert.equal(resumo.documentos.por_situacao.rejeitado, 1);
  const aud = JSON.stringify((await adm('GET', '/audit?limit=100')).j);
  assert.ok(aud.includes('Exportação PDF') && aud.includes('Exportação CSV de documentos'));

  // Acompanhamento da ficha do motorista registra as ações (sem o conteúdo).
  const fich = (await adm('GET', `/motoristas/${mid}`)).j;
  const hist = JSON.stringify(fich.interacoes);
  assert.match(hist, /Documento CNH: rejeitado por Adm/);
  await S.parar();
});

test('M4: sem a Etapa 2 nada de documentos aparece (produção intacta) e M1/M2/M3 seguem funcionando', async (t) => {
  const S = await subir({ etapa2: false });
  t.after(() => S.proc.kill());
  const { adm } = S;
  assert.equal((await adm('GET', '/meta')).j.documentos, false);
  for (const u of ['/documentos/meta', '/documentos/lista', '/documentos?funcao=motorista&registro_id=1', '/documentos/politica']) assert.equal((await adm('GET', u)).s, 404, u);
  assert.equal((await adm.up('/documentos', pdf('x'), { funcao: 'motorista', registro_id: 1, categoria: 'cnh' }, 'a.pdf')).s, 404);
  assert.equal((await adm('GET', '/reports/pdf?type=documentos')).s, 400);
  assert.equal((await adm('GET', '/dashboard')).j.kpis.documentos_pendentes, undefined);
  assert.ok(!fs.existsSync(path.join(S.dir, 'documentos')), 'nenhuma pasta de documentos criada');
  const mot = await adm('POST', '/motoristas', { ...BASE, nome: 'Sem Etapa Dois', telefone: '85988880010' });
  assert.equal(mot.s, 201);
  await S.parar();

  // Com a Etapa 2 ligada mas SEM a chave de cifra: o envio é recusado com mensagem clara; nada é gravado em claro.
  const S2 = await subir({ env: { FM_DOCS_KEY: '' } });
  t.after(() => S2.proc.kill());
  const m2 = await criarMotorista(S2.adm, 'Sem Chave Fictício', '85988880011');
  const meta = (await S2.adm('GET', '/documentos/meta')).j;
  assert.equal(meta.armazenamento.pronto, false);
  assert.match(meta.armazenamento.motivo, /FM_DOCS_KEY/);
  const r = await S2.adm.up('/documentos', pdf('x'), { funcao: 'motorista', registro_id: m2.item.id, categoria: 'cnh' }, 'a.pdf');
  assert.equal(r.s, 503);
  assert.ok(!fs.existsSync(path.join(S2.dir, 'documentos')) || fs.readdirSync(path.join(S2.dir, 'documentos'), { recursive: true }).filter((p) => p.endsWith('.bin')).length === 0);
  await S2.parar();
});

/* ------------------------- unidades: cifra, armazenamento e Supabase ------------------------- */
test('M4: cifra — ida e volta, adulteração, troca de contexto e chave errada', () => {
  process.env.FM_DOCS_KEY = CHAVE_DOCS;
  delete process.env.FM_DOCS_KEY_ANTERIOR;
  const cifra = require('../src/documentos/cifra');
  const c = Buffer.from('conteúdo fictício do documento');
  const { blob, chaveEmbrulhada } = cifra.cifrar(c, 'uid-1', 1);
  assert.ok(!blob.includes('fictício'));
  assert.ok(cifra.decifrar(blob, chaveEmbrulhada, 'uid-1', 1).equals(c));
  // Duas cifragens do mesmo conteúdo nunca saem iguais (chave por arquivo + IV aleatório).
  assert.ok(!cifra.cifrar(c, 'uid-1', 1).blob.equals(blob));
  assert.throws(() => cifra.decifrar(blob, chaveEmbrulhada, 'uid-2', 1), (e) => e.code === 'adulterado' || e.code === 'chave_invalida', 'outro documento não abre');
  assert.throws(() => cifra.decifrar(blob, chaveEmbrulhada, 'uid-1', 2), (e) => e.code === 'adulterado' || e.code === 'chave_invalida', 'outra versão não abre');
  const mexido = Buffer.from(blob); mexido[mexido.length - 1] ^= 1;
  assert.throws(() => cifra.decifrar(mexido, chaveEmbrulhada, 'uid-1', 1), (e) => e.code === 'adulterado');
  process.env.FM_DOCS_KEY = crypto.randomBytes(32).toString('hex');
  assert.throws(() => cifra.decifrar(blob, chaveEmbrulhada, 'uid-1', 1), (e) => ['chave_invalida', 'adulterado'].includes(e.code));
  // Troca da chave mestra: a anterior ainda abre os arquivos antigos.
  process.env.FM_DOCS_KEY_ANTERIOR = CHAVE_DOCS;
  assert.ok(cifra.decifrar(blob, chaveEmbrulhada, 'uid-1', 1).equals(c), 'FM_DOCS_KEY_ANTERIOR abre o que a antiga cifrou');
  delete process.env.FM_DOCS_KEY_ANTERIOR;
  process.env.FM_DOCS_KEY = '';
  assert.equal(cifra.configurada(), false);
  assert.throws(() => cifra.cifrar(c, 'u', 1), (e) => e.code === 'sem_chave');
});

test('M4: armazenamento local recusa disco efêmero (Render) e valida chaves', async () => {
  const a = require('../src/documentos/armazenamento');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-m4-arm-'));
  const env = { RENDER: 'true' };
  const render = a.criarDoAmbiente({ dataDir: dir, env });
  assert.equal(render.pronto().ok, false, 'Render grátis tem disco temporário: não é armazenamento definitivo');
  assert.match(render.pronto().motivo, /tempor|efêmer|persist/i);
  const persistente = a.criarDoAmbiente({ dataDir: dir, env: { RENDER: 'true', FM_DOCS_LOCAL_PERSISTENTE: '1' } });
  assert.equal(persistente.pronto().ok, true);
  const fora = path.join(dir, 'fora-do-docs');
  const loc = a.criarDoAmbiente({ dataDir: dir, env: {} });
  const chave = a.novaChave();
  assert.match(chave, a.CHAVE_OK);
  await loc.gravar(chave, Buffer.from('abc'));
  assert.equal((await loc.ler(chave)).toString(), 'abc');
  await assert.rejects(() => loc.gravar(chave, Buffer.from('outro')), 'não sobrescreve');
  for (const ruim of ['../x', '/etc/passwd', '2026/11/../../x.bin', 'a.bin', `2026/11/${'g'.repeat(32)}.bin`]) {
    await assert.rejects(() => loc.gravar(ruim, Buffer.from('x')), `chave inválida: ${ruim}`);
    await assert.rejects(() => loc.ler(ruim));
  }
  assert.ok(!fs.existsSync(fora));
  await loc.remover(chave);
  assert.equal(await loc.existe(chave), false);
  // A pasta de documentos fica fora do retrato (snapshot) enviado ao cofre.
  const persist = fs.readFileSync(path.join(CRM, 'src', 'persist.js'), 'utf8');
  assert.match(persist, /documentos/);
});

test('M4: armazenamento Supabase Storage privado (contra servidor HTTP falso)', async () => {
  const a = require('../src/documentos/armazenamento');
  const objetos = new Map(); const visto = [];
  const srv = http.createServer((req, res) => {
    const partes = []; req.on('data', (d) => partes.push(d)); req.on('end', () => {
      visto.push({ m: req.method, u: req.url, auth: req.headers.authorization, upsert: req.headers['x-upsert'] });
      const chave = decodeURIComponent(req.url.replace(/^\/storage\/v1\/object\/docs-privado\//, ''));
      if (req.headers.authorization !== 'Bearer SEGREDO-FICTICIO') { res.writeHead(401); return res.end('{}'); }
      if (req.method === 'POST') { if (objetos.has(chave)) { res.writeHead(409); return res.end('{}'); } objetos.set(chave, Buffer.concat(partes)); res.writeHead(200); return res.end('{}'); }
      if (req.method === 'GET') { if (!objetos.has(chave)) { res.writeHead(404); return res.end('{}'); } res.writeHead(200); return res.end(objetos.get(chave)); }
      if (req.method === 'DELETE') { objetos.delete(chave); res.writeHead(200); return res.end('{}'); }
      res.writeHead(405); res.end();
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const arm = a.criarSupabase({ url, chave: 'SEGREDO-FICTICIO', bucket: 'docs-privado' });
  assert.equal(arm.nome, 'supabase');
  assert.equal(arm.pronto().ok, true);
  const k = a.novaChave();
  await arm.gravar(k, Buffer.from('cifrado-fictício'));
  assert.equal((await arm.ler(k)).toString(), 'cifrado-fictício');
  assert.equal(await arm.existe(k), true);
  await assert.rejects(() => arm.gravar(k, Buffer.from('de novo')), 'não sobrescreve objeto existente');
  assert.equal(await arm.ler(a.novaChave()), null, 'inexistente');
  await arm.remover(k);
  assert.equal(await arm.existe(k), false);
  assert.ok(visto.every((v) => v.auth === 'Bearer SEGREDO-FICTICIO'));
  assert.ok(visto.filter((v) => v.m === 'POST').every((v) => v.upsert === 'false'));
  assert.ok(!visto.some((v) => /\/public\//.test(v.u)), 'nunca usa URL pública');
  const ruim = a.criarSupabase({ url, chave: 'errada', bucket: 'docs-privado' });
  await assert.rejects(() => ruim.gravar(a.novaChave(), Buffer.from('x')));
  // Escolha pelo ambiente.
  const amb = a.criarDoAmbiente({ dataDir: os.tmpdir(), env: { DOCS_STORAGE: 'supabase', DOCS_SUPABASE_URL: url, DOCS_SUPABASE_KEY: 'SEGREDO-FICTICIO', DOCS_SUPABASE_BUCKET: 'docs-privado' } });
  assert.equal(amb.nome, 'supabase');
  srv.close();
});
