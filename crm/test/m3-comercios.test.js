'use strict';
// M3 (comércios parceiros) contra o servidor REAL e a camada do WhatsApp em processo. Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { textoPorPagina, validar } = require('./util-pdf');

const portaLivre = () => new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

async function subir(etapa2) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-m3-'));
  const porta = await portaLivre();
  const env = { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false' };
  if (etapa2) env.FM_ETAPA2 = '1'; else delete env.FM_ETAPA2;
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 60; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const cliente = () => {
    let ck = '';
    return async (m, u, b) => {
      const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined });
      for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const nome = kv.split('=')[0]; const resto = ck.split('; ').filter((x) => x && !x.startsWith(`${nome}=`)); if (!/Max-Age=0/.test(sc)) resto.push(kv); ck = resto.join('; '); }
      const tipo = r.headers.get('content-type') || '';
      if (tipo.includes('application/pdf')) return { s: r.status, pdf: Buffer.from(await r.arrayBuffer()), h: r.headers };
      if (tipo.includes('text/csv')) return { s: r.status, csv: await r.text(), h: r.headers };
      let j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ } return { s: r.status, j, h: r.headers };
    };
  };
  const adm = cliente();
  assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm', email: 'adm@x.com', senha: 'senhaforte123' })).s, 201);
  assert.equal((await adm('POST', '/users', { nome: 'Gestor Teste', email: 'g@x.com', senha: 'senhaforte123', role: 'gestor' })).s, 201);
  const ges = cliente();
  assert.equal((await ges('POST', '/auth/login', { email: 'g@x.com', senha: 'senhaforte123' })).s, 200);
  return { proc, adm, ges, anon: cliente() };
}

const COM = { nome_estabelecimento: 'Padaria Sol Fictícia', razao_social: 'Sol Fictícia Alimentos LTDA', categoria: 'Padaria / confeitaria', responsavel: 'Dona Marta Fictícia', telefone: '(85) 3333-4444', cidade: 'Fortaleza', endereco: 'Rua Fictícia, 100, Centro', data_primeiro_contato: '2026-11-05', origem: 'Indicação', situacao: 'Identificado', volume_entregas: '10 a 30 por dia' };
const PARC = { nome_estabelecimento: 'Padaria Sol Fictícia', categoria: 'Outros estabelecimentos', telefone: '(85) 3333-4444', cidade: 'Fortaleza', data_contato: '2026-11-06', situacao: 'Identificado' };
const texto = (r) => textoPorPagina(r.pdf).join('\n').replace(/\s+/g, ' ');

test('M3: comércio nasce com ficha de empresa, reaproveita a empresa existente, sem duplicar, e é independente do Clube', async (t) => {
  const { proc, adm, ges } = await subir(true);
  t.after(() => proc.kill());
  const meta = (await ges('GET', '/meta')).j;
  assert.ok(meta.entities.comercios, 'meta traz o módulo Comércios');
  assert.deepEqual(meta.entities.comercios.fechados, ['Ativo na plataforma']);
  assert.ok(meta.etapa2.funcoes.find((f) => f.funcao === 'comercio').disponivel);

  // Cadastro: validações e ficha central da empresa (razão social e endereço completam a empresa).
  assert.equal((await ges('POST', '/comercios', { ...COM, categoria: 'Categoria inventada' })).s, 422);
  assert.equal((await ges('POST', '/comercios', { ...COM, situacao: 'Qualquer' })).s, 422);
  assert.equal((await ges('POST', '/comercios', { ...COM, nome_estabelecimento: '' })).s, 422);
  const c1 = await ges('POST', '/comercios', COM);
  assert.equal(c1.s, 201, JSON.stringify(c1.j));
  assert.equal(c1.j.titular.tipo, 'empresa');
  const empresaId = c1.j.titular.id;
  let ficha = (await ges('GET', `/empresas/${empresaId}`)).j;
  assert.equal(ficha.empresa.nome, 'Padaria Sol Fictícia');
  assert.equal(ficha.empresa.razao_social, 'Sol Fictícia Alimentos LTDA');
  assert.equal(ficha.empresa.endereco, 'Rua Fictícia, 100, Centro');
  assert.equal(ficha.empresa.tem_cnpj, false, 'CNPJ não é coletado antes da etapa de documentos');
  assert.deepEqual(ficha.funcoes.map((f) => f.funcao), ['comercio']);

  // Prevenção de duplicidade: o telefone já cadastrado é avisado, e mesma função na mesma empresa é recusada.
  const v = await ges('POST', '/empresas/verificar-telefone', { telefone: '85 3333-4444' });
  assert.equal(v.j.possiveis.length, 1);
  assert.equal(v.j.possiveis[0].id, empresaId);
  assert.deepEqual(v.j.possiveis[0].funcoes.map((f) => f.funcao), ['comercio']);
  const dup = await ges('POST', '/comercios', { ...COM, empresa_id: empresaId });
  assert.equal(dup.s, 409, 'a empresa já tem a função de comércio');

  // Reutilização: a MESMA empresa vira também Parceiro do Clube (um cadastro de empresa, duas funções).
  const p1 = await ges('POST', '/parceiros', { ...PARC, empresa_id: empresaId });
  assert.equal(p1.s, 201, JSON.stringify(p1.j));
  assert.equal(p1.j.titular.id, empresaId);
  assert.equal((await ges('GET', '/empresas?q=padaria')).j.total, 1, 'não duplicou a empresa');
  ficha = (await ges('GET', `/empresas/${empresaId}`)).j;
  assert.deepEqual(ficha.funcoes.map((f) => f.funcao).sort(), ['comercio', 'parceiro_clube']);
  assert.equal(ficha.funcoes.find((f) => f.funcao === 'comercio').registro.situacao, 'Identificado');

  // Independência: ativar o comércio não muda o Clube, e mudar o Clube não muda o comércio.
  const idCom = c1.j.item.id; const idPar = p1.j.item.id;
  assert.equal((await ges('POST', `/comercios/${idCom}/ativar`, {})).s, 422, 'exige confirmação explícita');
  assert.equal((await ges('POST', '/comercios/9999/ativar', { confirmo: true })).s, 404);
  const at = await ges('POST', `/comercios/${idCom}/ativar`, { confirmo: true });
  assert.equal(at.s, 200);
  assert.equal(at.j.item.situacao, 'Ativo na plataforma');
  assert.match(at.j.item.ativado_em, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await ges('POST', `/comercios/${idCom}/ativar`, { confirmo: true })).s, 409);
  assert.equal((await ges('GET', `/parceiros/${idPar}`)).j.item.situacao, 'Identificado', 'Clube intacto');
  assert.equal((await ges('PATCH', `/parceiros/${idPar}`, { situacao: 'Em negociação' })).s, 200);
  assert.equal((await ges('GET', `/comercios/${idCom}`)).j.item.situacao, 'Ativo na plataforma', 'comércio intacto');

  // Acompanhamento: histórico, mudança de situação por registro e desistência de outro comércio.
  const reg = await ges('POST', `/comercios/${idCom}/interacoes`, { resumo: 'Combinada taxa de entrega fixa com a Dona Marta.', canal: 'WhatsApp' });
  assert.equal(reg.s, 201, JSON.stringify(reg.j));
  const c2 = await ges('POST', '/comercios', { ...COM, nome_estabelecimento: 'Pizzaria Lua Fictícia', razao_social: '', categoria: 'Pizzaria', telefone: '85977771111', endereco: '' });
  assert.equal(c2.s, 201);
  assert.notEqual(c2.j.titular.id, empresaId, 'outro telefone/nome: outra empresa');
  const mov = await ges('POST', `/comercios/${c2.j.item.id}/interacoes`, { resumo: 'Não quis seguir por agora.', situacao_nova: 'Não concretizado' });
  assert.equal(mov.s, 201);
  assert.equal((await ges('GET', `/comercios/${c2.j.item.id}`)).j.item.situacao, 'Não concretizado');
  const hist = (await ges('GET', `/comercios/${idCom}`)).j;
  assert.ok(hist.interacoes.some((i) => /taxa de entrega/.test(i.resumo)));
  assert.ok(hist.interacoes.some((i) => /ativado na plataforma/i.test(i.resumo)));
  assert.equal(hist.titular.id, empresaId);

  // Filtros e etapas.
  assert.equal((await ges('GET', '/comercios?etapa=fechados')).j.total, 1);
  assert.equal((await ges('GET', '/comercios?etapa=andamento')).j.total, 0);
  assert.equal((await ges('GET', '/comercios?f_categoria=Pizzaria')).j.total, 1);
  assert.equal((await ges('GET', '/comercios?q=lua')).j.total, 1);
  assert.equal((await ges('GET', '/comercios?q=Sol%20Fict%C3%ADcia%20Alimentos')).j.total, 1, 'busca pela razão social');

  // Dashboard e relatório (a empresa com duas funções conta em cada função, sem duplicar a empresa).
  const dash = (await ges('GET', '/dashboard')).j;
  assert.equal(dash.kpis.comercios_total, 2);
  assert.equal(dash.kpis.comercios_ativos, 1);
  assert.equal(dash.kpis.parceiros_negociacao, 1);
  assert.equal((await ges('GET', '/meta')).j.pendentes.comercios, 0);
  const rel = (await ges('GET', '/reports/summary?de=2026-11-01&ate=2026-11-30')).j;
  assert.equal(rel.comercios.total, 2);
  assert.equal(rel.comercios.ativos, 1);
  assert.equal((await ges('GET', '/empresas?q=padaria')).j.total + (await ges('GET', '/empresas?q=pizzaria')).j.total, 2, 'duas empresas no total');

  // Tarefa pode apontar para um comércio.
  const tf = await ges('POST', '/tarefas', { titulo: 'Ligar para a padaria', prioridade: 'Alta', data_vencimento: '2026-11-14', situacao: 'Pendente', entidade_tipo: 'comercios', entidade_id: idCom });
  assert.equal(tf.s, 201, JSON.stringify(tf.j));
  assert.equal((await ges('GET', '/relations?type=comercios&q=padaria')).j.items.length, 1);

  // Exclusão: só admin; encerra o vínculo, mas a empresa e o histórico das outras funções ficam.
  assert.equal((await ges('DELETE', `/comercios/${idCom}`)).s, 403);
  assert.equal((await adm('DELETE', `/comercios/${idCom}`)).s, 200);
  ficha = (await ges('GET', `/empresas/${empresaId}`)).j;
  assert.deepEqual(ficha.funcoes.map((f) => f.funcao), ['parceiro_clube']);
  assert.equal(ficha.funcoes_encerradas.length, 1);
  assert.equal((await ges('GET', `/parceiros/${idPar}`)).j.item.situacao, 'Em negociação');
});

test('M3: PDF e CSV de comércios, permissões de admin e gestor, auditoria', async (t) => {
  const { proc, adm, ges, anon } = await subir(true);
  t.after(() => proc.kill());
  assert.equal((await ges('POST', '/comercios', COM)).s, 201);
  assert.equal((await ges('POST', '/comercios', { ...COM, nome_estabelecimento: 'Farmácia Mar Fictícia', razao_social: '', categoria: 'Farmácia', telefone: '85966662222', cidade: 'Caucaia', situacao: 'Em negociação' })).s, 201);

  const pdf = await adm('GET', '/reports/pdf?type=comercios');
  assert.equal(pdf.s, 200);
  assert.deepEqual(validar(pdf.pdf).erros, []);
  const tx = texto(pdf);
  for (const trecho of ['Comércios Parceiros', 'Padaria Sol Fictícia', 'Farmácia Mar Fictícia', 'Total: 2 registros', 'FILTROS APLICADOS', 'Fortaleza Move']) assert.ok(tx.includes(trecho), `falta “${trecho}”`);
  assert.equal(pdf.h.get('x-linhas'), '2');
  assert.match(pdf.h.get('content-disposition'), /fortaleza-move_comercios_\d{4}-\d{2}-\d{2}\.pdf/);
  const f1 = texto(await adm('GET', '/reports/pdf?type=comercios&f_situacao=Em%20negocia%C3%A7%C3%A3o'));
  assert.ok(f1.includes('Farmácia Mar Fictícia') && !f1.includes('Padaria Sol Fictícia'));
  const cid = texto(await adm('GET', '/reports/pdf?type=comercios&q=Caucaia'));
  assert.ok(cid.includes('Farmácia Mar Fictícia') && !cid.includes('Padaria Sol'));
  const per = await adm('GET', '/reports/pdf?type=comercios&de=2026-12-01&ate=2026-12-31');
  assert.equal(per.s, 200);
  assert.ok(texto(per).includes('Nenhum registro encontrado para os filtros aplicados.'), 'período sem registros diz isso');
  assert.equal(per.h.get('x-linhas'), '0');

  // Dado pessoal: gestor não exporta lista de comércios (PDF nem CSV); sem login não exporta nada.
  assert.equal((await ges('GET', '/reports/pdf?type=comercios')).s, 403);
  assert.equal((await ges('GET', '/reports/export?type=comercios')).s, 403);
  assert.equal((await anon('GET', '/reports/pdf?type=comercios')).s, 401);
  const can = (await ges('GET', '/meta')).j.can;
  assert.ok(!can.exportar_pdf.includes('comercios'));
  assert.ok((await adm('GET', '/meta')).j.can.exportar_pdf.includes('comercios'));

  const csv = await adm('GET', '/reports/export?type=comercios&modo=lista&q=Caucaia');
  assert.equal(csv.s, 200);
  assert.ok(csv.csv.includes('Farmácia Mar Fictícia') && !csv.csv.includes('Padaria Sol'));
  assert.ok(!/cnpj/i.test(csv.csv), 'CSV não traz CNPJ');

  // Auditoria registrada, sem dado pessoal; gestor não acessa a auditoria nem junta cadastros.
  const audit = (await adm('GET', '/audit')).j.items;
  assert.ok(audit.some((a) => a.action === 'exportar' && a.entity === 'comercios' && /PDF/.test(a.detail)));
  assert.ok(audit.some((a) => a.action === 'exportar' && a.entity === 'comercios' && /CSV/.test(a.detail)));
  assert.ok(audit.some((a) => a.action === 'criar' && a.entity === 'comercios'));
  assert.ok(!audit.some((a) => /Dona Marta|3333-4444|Rua Fictícia/.test(a.detail || '')), 'auditoria sem dados pessoais');
  assert.equal((await ges('GET', '/audit')).s, 403);
  assert.equal((await ges('POST', '/empresas/juntar', { principal_id: 1, secundaria_id: 2, confirmo: true })).s, 403);
  assert.equal((await ges('GET', '/empresas/duplicados')).s, 403);

  // Ativar e auditar.
  const id = (await ges('GET', '/comercios?q=Padaria')).j.items[0].id;
  assert.equal((await ges('POST', `/comercios/${id}/ativar`, { confirmo: true })).s, 200, 'gestor também ativa');
  assert.ok((await adm('GET', '/audit')).j.items.some((a) => a.action === 'ativar' && a.entity === 'comercios'));
});

test('M3: motoristas, entregadores, passageiros e parceiros seguem iguais; sem Etapa 2 o módulo não existe', async (t) => {
  const on = await subir(true);
  t.after(() => on.proc.kill());
  const { ges, adm } = on;
  const base = { cidade: 'Fortaleza', data_primeiro_contato: '2026-11-05', origem: 'WhatsApp', situacao: 'Novo interessado' };
  assert.equal((await ges('POST', '/motoristas', { ...base, nome: 'Ana Motorista Fictícia', telefone: '85988880001' })).s, 201);
  assert.equal((await ges('POST', '/entregadores', { ...base, nome: 'Caio Entregador Fictício', telefone: '85988880003', modalidade: 'Entregador de moto' })).s, 201);
  assert.equal((await ges('POST', '/passageiros', { ...base, nome: 'Dani Passageira Fictícia', telefone: '85988880004' })).s, 201);
  assert.equal((await ges('POST', '/parceiros', PARC)).s, 201);
  const dash = (await ges('GET', '/dashboard')).j.kpis;
  assert.equal(dash.motoristas_total, 1);
  assert.equal(dash.entregadores_total, 1);
  assert.equal(dash.comercios_total, 0);
  for (const tipo of ['motoristas', 'entregadores', 'passageiros', 'parceiros']) assert.equal((await adm('GET', `/reports/pdf?type=${tipo}`)).s, 200, tipo);
  // Telefone de empresa e de pessoa não se misturam: o aviso de pessoa não lista empresa e vice-versa.
  assert.equal((await ges('POST', '/pessoas/verificar-telefone', { telefone: '85 3333-4444' })).j.possiveis.length, 0);

  const off = await subir(false);
  t.after(() => off.proc.kill());
  assert.equal((await off.ges('GET', '/meta')).j.entities.comercios, undefined);
  assert.equal((await off.ges('GET', '/comercios')).s, 404);
  assert.equal((await off.ges('POST', '/comercios/1/ativar', { confirmo: true })).s, 404);
  assert.equal((await off.adm('GET', '/reports/pdf?type=comercios')).s, 400);
  assert.equal((await off.ges('GET', '/dashboard')).j.kpis.comercios_total, undefined);
});

test('M3 + WhatsApp: a conversa pode ser ligada a um comércio e mostra o nome dele', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-m3wa-'));
  process.env.FM_DATA_DIR = dir; process.env.FM_ETAPA2 = '1';
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db } = require('../src/db');
  const { createStore, VINCULOS } = require('../src/whatsapp/store');
  assert.ok(VINCULOS.comercios);
  const agora = new Date().toISOString();
  const cid = Number(db.prepare("INSERT INTO comercios (nome_estabelecimento, categoria, data_primeiro_contato, origem, situacao, created_at, updated_at) VALUES ('Mercadinho Vento Fictício', 'Supermercado / mercadinho', '2026-11-05', 'WhatsApp', 'Identificado', ?, ?)").run(agora, agora).lastInsertRowid);
  const store = createStore(db);
  const r = store.ingerir({ jid: '5585911112222@s.whatsapp.net', telefone: '5585911112222', nome: 'Seu Zé', externoId: 'M3-1', texto: 'Quero entregas na minha loja', tipo: 'text', quando: new Date().toISOString(), deMim: false });
  const conv = store.listarConversas({}).items.find((c) => c.id === r.conversaId);
  assert.equal(conv.vinculo_tipo, '');
  assert.ok(store.definirVinculo(conv.contato_id, 'comercios', cid).ok);
  assert.equal(store.definirVinculo(conv.contato_id, 'comercios', 99999).erro, 'Cadastro não encontrado.');
  const depois = store.listarConversas({}).items.find((c) => c.id === r.conversaId);
  assert.equal(depois.vinculo_tipo, 'comercios');
  assert.equal(depois.vinculo_nome, 'Mercadinho Vento Fictício');
});
