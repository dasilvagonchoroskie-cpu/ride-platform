'use strict';
// Exportação PDF + CSV da tela Relatórios contra o servidor REAL (dados fictícios, Etapa 2 ligada, banco temporário).
// Confere: a tela (/reports/summary), o PDF e o CSV mostram os MESMOS registros e totais para a mesma consulta; filtros de
// período; relatório vazio; financeiro (estimado, data em UTC-3); permissões no servidor; nomes de arquivo; acentos e R$;
// relatório extenso com várias páginas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const { textoPorPagina, validar } = require('./util-pdf');

const portaLivre = () => new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

async function subir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-rel-'));
  const porta = await portaLivre();
  const env = { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false', FM_ETAPA2: '1' };
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
  const anon = cliente(); const adm = cliente(); const ges = cliente();
  assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm Fictício', email: 'adm@x.com', senha: 'senhaforte123' })).s, 201);
  assert.equal((await adm('POST', '/users', { nome: 'Gestor Teste', email: 'g@x.com', senha: 'senhaforte123', role: 'gestor' })).s, 201);
  assert.equal((await ges('POST', '/auth/login', { email: 'g@x.com', senha: 'senhaforte123' })).s, 200);
  return { proc, adm, ges, anon, dir };
}

const texto = (r) => textoPorPagina(r.pdf).join('\n').replace(/\s+/g, ' ');
const pdfOk = (r) => { assert.equal(r.s, 200, `status ${r.s} ${JSON.stringify(r.j)}`); assert.match(r.h.get('content-type'), /application\/pdf/); assert.deepEqual(validar(r.pdf).erros, []); };
const linhasCsv = (r) => { assert.equal(r.s, 200); return r.csv.replace(/^﻿/, '').trim().split('\r\n').length - 1; };
const DE = '2026-11-01'; const ATE = '2026-11-30';
const PER = `de=${DE}&ate=${ATE}`;

async function popular(ges) {
  const cria = async (u, b) => { const r = await ges('POST', u, b); assert.equal(r.s, 201, `${u}: ${r.s} ${JSON.stringify(r.j)}`); return r; };
  const M = { cidade: 'Fortaleza', origem: 'WhatsApp', situacao: 'Novo interessado' };
  // Dentro do período (novembro) e fora dele (outubro / dezembro): só os de novembro podem aparecer.
  await cria('/motoristas', { ...M, nome: 'João Ação Fictício', telefone: '85999990001', data_primeiro_contato: '2026-11-01', situacao: 'Contratado' });
  await cria('/motoristas', { ...M, nome: 'Maria Coração Fictícia', telefone: '85999990002', data_primeiro_contato: '2026-11-30' });
  await cria('/motoristas', { ...M, nome: 'Fora Outubro Fictício', telefone: '85999990003', data_primeiro_contato: '2026-10-31' });
  await cria('/motoristas', { ...M, nome: 'Fora Dezembro Fictício', telefone: '85999990004', data_primeiro_contato: '2026-12-01' });
  await cria('/entregadores', { ...M, nome: 'Caio Entregador Fictício', telefone: '85999990005', data_primeiro_contato: '2026-11-10', modalidade: 'Motociclista (mototáxi)' });
  await cria('/entregadores', { ...M, nome: 'Fora Entregador Fictício', telefone: '85999990006', data_primeiro_contato: '2026-09-10', modalidade: 'Motociclista (mototáxi)' });
  await cria('/passageiros', { ...M, nome: 'Dani Passageira Fictícia', telefone: '85999990007', data_primeiro_contato: '2026-11-05' });
  await cria('/passageiros', { ...M, nome: 'Fora Passageiro Fictício', telefone: '85999990008', data_primeiro_contato: '2026-08-05' });
  await cria('/parceiros', { nome_estabelecimento: 'Posto Fictício', categoria: 'Posto de combustível', data_contato: '2026-11-02', situacao: 'Identificado', telefone: '85999990009' });
  await cria('/parceiros', { nome_estabelecimento: 'Fora Parceiro Fictício', categoria: 'Posto de combustível', data_contato: '2026-07-02', situacao: 'Identificado', telefone: '85999990010' });
  await cria('/comercios', { nome_estabelecimento: 'Padaria Sol Fictícia', razao_social: 'Sol Fictícia LTDA', categoria: 'Padaria / confeitaria', responsavel: 'Marta Fictícia', telefone: '(85) 3333-4444', cidade: 'Fortaleza', endereco: 'Rua Fictícia, 100', data_primeiro_contato: '2026-11-05', origem: 'Indicação', situacao: 'Identificado', volume_entregas: '10 a 30 por dia' });
  await cria('/comercios', { nome_estabelecimento: 'Fora Comércio Fictício', razao_social: 'Fora LTDA', categoria: 'Padaria / confeitaria', responsavel: 'Fora Fictícia', telefone: '(85) 3333-5555', cidade: 'Fortaleza', endereco: 'Rua Fictícia, 200', data_primeiro_contato: '2026-06-05', origem: 'Indicação', situacao: 'Identificado', volume_entregas: '10 a 30 por dia' });
  await cria('/atendimentos', { data: '2026-11-03', tipo: 'Dúvida', assunto: 'Como funciona o repasse', descricao: 'Pergunta fictícia.', prioridade: 'Alta', situacao: 'Aberto' });
  await cria('/atendimentos', { data: '2026-05-03', tipo: 'Dúvida', assunto: 'Fora do período fictício', descricao: 'Pergunta fictícia.', prioridade: 'Baixa', situacao: 'Aberto' });
  // Campanha com data planejada em novembro e outra só com data de publicação em novembro (planejada em outubro).
  await cria('/campanhas', { titulo: 'Campanha Planejada Fictícia', tipo: 'Campanha', canal: 'Instagram', situacao: 'Planejada', data_planejada: '2026-11-05', investimento: 1234.5, alcance: 1000, engajamento: 80 });
  await cria('/campanhas', { titulo: 'Campanha Fora Fictícia', tipo: 'Campanha', canal: 'Instagram', situacao: 'Planejada', data_planejada: '2026-02-05', investimento: 99, alcance: 1, engajamento: 1 });
  await cria('/tarefas', { titulo: 'Tarefa Dentro Fictícia', prioridade: 'Alta', data_vencimento: '2026-11-04', situacao: 'Pendente' });
  await cria('/tarefas', { titulo: 'Tarefa Concluída Fictícia', prioridade: 'Média', data_vencimento: '2026-11-20', situacao: 'Concluída' });
  await cria('/tarefas', { titulo: 'Tarefa Fora Fictícia', prioridade: 'Alta', data_vencimento: '2027-01-04', situacao: 'Pendente' });
}

test('tela × PDF × CSV: mesmos registros e totais por período, em todos os módulos; nomes de arquivo; acentos e reais', async (t) => {
  const { proc, adm, ges } = await subir();
  t.after(() => proc.kill());
  await popular(ges);
  const s = (await adm('GET', `/reports/summary?${PER}`)).j;

  // Cada módulo: total da tela = linhas do PDF (X-Linhas) = linhas do CSV; o texto do PDF traz só os de novembro.
  const modulos = { motoristas: s.motoristas.total, entregadores: s.entregadores.total, passageiros: s.passageiros.total, parceiros: s.parceiros.total, comercios: s.comercios.total, atendimentos: s.atendimentos.total, campanhas: s.campanhas.total, tarefas: s.tarefas.total };
  assert.deepEqual(modulos, { motoristas: 2, entregadores: 1, passageiros: 1, parceiros: 1, comercios: 1, atendimentos: 1, campanhas: 1, tarefas: 2 }, 'a tela só conta o período');
  for (const [tipo, total] of Object.entries(modulos)) {
    const pdf = await adm('GET', `/reports/pdf?type=${tipo}&${PER}`);
    pdfOk(pdf);
    assert.equal(Number(pdf.h.get('x-linhas')), total, `${tipo}: PDF = tela`);
    assert.ok(texto(pdf).includes(tipo === 'campanhas' ? `Total: ${total}` : `Total: ${total} ${total === 1 ? 'registro' : 'registros'}`), `${tipo}: totalizador do PDF`);
    assert.ok(texto(pdf).includes(`${total} ${total === 1 ? 'registro' : 'registros'}`), `${tipo}: subtítulo com a quantidade`);
    assert.ok(texto(pdf).includes('01/11/2026 a 30/11/2026'), `${tipo}: período aparece no PDF`);
    assert.ok(!texto(pdf).includes('Fora '), `${tipo}: nada de fora do período no PDF`);
    const csv = await adm('GET', `/reports/export?type=${tipo}&${PER}`);
    assert.equal(linhasCsv(csv), total, `${tipo}: CSV = tela`);
    assert.ok(!csv.csv.includes('Fora '), `${tipo}: nada de fora do período no CSV`);
    // Nome do arquivo leva o período, igual para PDF e CSV.
    assert.equal(pdf.h.get('content-disposition'), `attachment; filename="fortaleza-move_${tipo}_${DE}_a_${ATE}.pdf"`);
    assert.equal(csv.h.get('content-disposition'), `attachment; filename="${tipo}_${DE}_a_${ATE}.csv"`);
  }

  // Acentos e reais saem corretos no PDF e no CSV.
  const mot = texto(await adm('GET', `/reports/pdf?type=motoristas&${PER}`));
  assert.ok(mot.includes('João Ação Fictício') && mot.includes('Maria Coração Fictícia'));
  const camp = texto(await adm('GET', `/reports/pdf?type=campanhas&${PER}`));
  assert.ok(camp.includes('R$ 1.234,50'), 'valor em reais no padrão brasileiro');
  assert.ok(camp.includes('Campanha Planejada Fictícia'));
  assert.equal(s.campanhas.investimento, 1234.5);
  assert.ok((await adm('GET', `/reports/export?type=motoristas&${PER}`)).csv.includes('João Ação Fictício'));

  // Fronteira do período: um dia só (01/11) traz só quem tem 01/11; o dia 31/10 traz só o de outubro.
  const um = await adm('GET', `/reports/pdf?type=motoristas&de=${DE}&ate=${DE}`);
  assert.equal(Number(um.h.get('x-linhas')), 1);
  assert.ok(texto(um).includes('João Ação Fictício') && !texto(um).includes('Maria Coração'));
  assert.equal((await adm('GET', '/reports/summary?de=2026-10-31&ate=2026-10-31')).j.motoristas.total, 1);

  // Filtro por situação/etapa vale igual no PDF e no CSV (modo=lista, mesmos filtros da tela de lista).
  const fech = await adm('GET', `/reports/pdf?type=motoristas&${PER}&etapa=fechados`);
  assert.equal(Number(fech.h.get('x-linhas')), 1);
  assert.ok(texto(fech).includes('Etapa: Fechados') && texto(fech).includes('João Ação'));
  const fechCsv = await adm('GET', `/reports/export?type=motoristas&modo=lista&etapa=fechados&${PER}`);
  assert.equal(linhasCsv(fechCsv), 1);

  // Campanhas e tarefas: totais do cartão da tela (investimento, concluídas) aparecem no PDF.
  const tar = texto(await adm('GET', `/reports/pdf?type=tarefas&${PER}`));
  assert.ok(tar.toLowerCase().includes('concluídas') && tar.includes('Tarefa Concluída Fictícia') && !tar.includes('Tarefa Fora'));
  assert.equal(s.tarefas.concluidas, 1);

  // Resumo geral: números da tela no PDF, inclusive comércios e documentos (cartões da tela).
  const res = await adm('GET', `/reports/pdf?type=resumo&${PER}`);
  pdfOk(res);
  const rt = texto(res);
  for (const trecho of ['Relatório geral do período', '01/11/2026 a 30/11/2026', 'Comércios parceiros (entregas)', 'Documentos (arquivo digital)', 'Motoristas por situação', 'Parceiros por categoria', 'Atendimentos por tipo', 'Campanhas por canal']) assert.ok(rt.includes(trecho), `resumo: falta “${trecho}”`);
  assert.equal(res.h.get('content-disposition'), `attachment; filename="fortaleza-move_resumo_${DE}_a_${ATE}.pdf"`);
});

test('períodos sem registros: PDF válido que diz isso claramente; CSV só com cabeçalho; nada inventado', async (t) => {
  const { proc, adm, ges } = await subir();
  t.after(() => proc.kill());
  await popular(ges);
  const VAZIO = 'de=2030-01-01&ate=2030-01-31';
  for (const tipo of ['motoristas', 'entregadores', 'passageiros', 'parceiros', 'comercios', 'atendimentos', 'campanhas', 'tarefas']) {
    const pdf = await adm('GET', `/reports/pdf?type=${tipo}&${VAZIO}`);
    pdfOk(pdf);
    assert.equal(pdf.h.get('x-linhas'), '0');
    assert.ok(texto(pdf).includes('Nenhum registro encontrado para os filtros aplicados.') && texto(pdf).includes('01/01/2030 a 31/01/2030'), `${tipo}: aviso de vazio e período`);
    assert.equal(linhasCsv(await adm('GET', `/reports/export?type=${tipo}&${VAZIO}`)), 0, `${tipo}: CSV vazio`);
  }
  const res = await adm('GET', `/reports/pdf?type=resumo&${VAZIO}`);
  pdfOk(res);
  assert.ok(texto(res).includes('Nenhuma simulação salva no período.'));
  const fin = await adm('GET', `/reports/pdf?type=financeiro&${VAZIO}`);
  pdfOk(fin);
  assert.ok(texto(fin).includes('Nenhuma simulação salva no período.') && texto(fin).includes('estimativas'));
  const doc = await adm('GET', `/reports/pdf?type=documentos&${VAZIO}`);
  pdfOk(doc);
  assert.ok(texto(doc).includes('Nenhum documento encontrado para os filtros aplicados.') && texto(doc).includes('01/01/2030 a 31/01/2030'));
  assert.equal(linhasCsv(await adm('GET', `/reports/export?type=documentos&${VAZIO}`)), 0);
  assert.equal(linhasCsv(await adm('GET', `/reports/export?type=simulacoes&${VAZIO}`)), 0);
});

test('financeiro: estimado, cenário/corridas/data/responsável, data em Fortaleza (UTC-3) e CSV com cabeçalhos "estimado"', async (t) => {
  const { proc, adm, ges, dir } = await subir();
  t.after(() => proc.kill());
  const cen = await ges('POST', '/finance/cenarios', { nome: 'Cenário Otimista Fictício', motoristas_ativos: 50, corridas_motorista_dia: 8, dias_operacao: 26, valor_medio_corrida: 15, comissao_pct: 10 });
  assert.equal(cen.s, 201, JSON.stringify(cen.j));
  const id = cen.j.item.id;
  // O cenário nasce zerado: as premissas entram por PATCH (como na tela do financeiro).
  assert.equal((await ges('PATCH', `/finance/cenarios/${id}`, { motoristas_ativos: 50, corridas_motorista_dia: 8, dias_operacao: 26, valor_medio_corrida: 15 })).s, 200);
  assert.equal((await ges('POST', `/finance/cenarios/${id}/custos`, { descricao: 'Servidor fictício', valor: 1500 })).s, 201);
  const sim = await ges('POST', '/finance/simulacoes', { cenario_id: id, observacao: 'teste fictício' });
  assert.equal(sim.s, 201, JSON.stringify(sim.j));
  const simId = (sim.j.item || sim.j).id;
  // 22h30 de 01/11 em Fortaleza = 01h30 UTC de 02/11: a data civil tem que ser 01/11 (e não 02/11).
  const db = new Database(path.join(dir, 'crm.db'));
  db.prepare('UPDATE simulacoes SET created_at = ? WHERE id = ?').run('2026-11-02T01:30:00.000Z', simId);
  db.close();

  const dia1 = 'de=2026-11-01&ate=2026-11-01'; const dia2 = 'de=2026-11-02&ate=2026-11-02';
  const s1 = (await adm('GET', `/reports/summary?${dia1}`)).j.simulacoes;
  assert.equal(s1.total, 1);
  assert.equal((await adm('GET', `/reports/summary?${dia2}`)).j.simulacoes.total, 0);

  for (const tipo of ['financeiro', 'resumo']) {
    const pdf = await adm('GET', `/reports/pdf?type=${tipo}&${dia1}`);
    pdfOk(pdf);
    const tx = texto(pdf);
    assert.ok(tx.includes('01/11/2026') && tx.includes('Cenário Otimista Fictício'), `${tipo}: data local e cenário`);
    assert.ok(tx.includes('10.400'), `${tipo}: corridas por mês`);
    assert.ok(tx.includes('Receita estimada') && tx.includes('Resultado estimado'), `${tipo}: receita e resultado são identificados como estimados`);
    assert.ok(/estimativas baseadas em premissas configuráveis|Valores estimados/.test(tx) && /não representam receita (efetivamente )?realizada/.test(tx), `${tipo}: aviso de estimativa`);
    assert.ok(tx.includes('Gestor Teste'), `${tipo}: responsável pelo registro`);
    assert.ok(tx.includes('R$ 15.600,00') && tx.includes('R$ 14.100,00'), `${tipo}: receita e resultado estimados em reais`);
    // No dia seguinte (02/11 em Fortaleza) a simulação NÃO entra.
    const outro = texto(await adm('GET', `/reports/pdf?type=${tipo}&${dia2}`));
    assert.ok(!outro.includes('Cenário Otimista Fictício') || tipo === 'financeiro' /* o cenário em si é listado no financeiro */);
    if (tipo === 'resumo') assert.ok(outro.includes('Nenhuma simulação salva no período.'));
  }
  const fin2 = texto(await adm('GET', `/reports/pdf?type=financeiro&${dia2}`));
  assert.ok(fin2.includes('Nenhuma simulação salva no período.'));

  // CSV: mesma simulação, data local e cabeçalhos que dizem "estimado".
  const csv = await adm('GET', `/reports/export?type=simulacoes&${dia1}`);
  assert.equal(linhasCsv(csv), 1);
  assert.ok(csv.csv.includes('Receita estimada (plataforma)') && csv.csv.includes('Resultado estimado'));
  assert.ok(csv.csv.includes('2026-11-01'), 'CSV traz a data local');
  // Gestor: PDF financeiro sim; CSV não.
  pdfOk(await ges('GET', `/reports/pdf?type=financeiro&${dia1}`));
  assert.equal((await ges('GET', `/reports/export?type=simulacoes&${dia1}`)).s, 403);
});

test('permissões no servidor: admin exporta tudo; gestor só tarefas/campanhas/resumo/financeiro/cenário em PDF e nenhum CSV; sem login nada', async (t) => {
  const { proc, adm, ges, anon } = await subir();
  t.after(() => proc.kill());
  await popular(ges);
  const cen = await ges('POST', '/finance/cenarios', { nome: 'Cenário Fictício', motoristas_ativos: 10, corridas_motorista_dia: 5, dias_operacao: 20, valor_medio_corrida: 12, comissao_pct: 10 });
  const cenId = cen.j.item.id;
  const todos = ['motoristas', 'entregadores', 'passageiros', 'parceiros', 'comercios', 'atendimentos', 'campanhas', 'tarefas', 'documentos', 'resumo', 'financeiro', `cenario&id=${cenId}`];
  const gestorPode = new Set(['tarefas', 'campanhas', 'resumo', 'financeiro', `cenario&id=${cenId}`]);
  for (const tipo of todos) {
    pdfOk(await adm('GET', `/reports/pdf?type=${tipo}&${PER}`));
    const g = await ges('GET', `/reports/pdf?type=${tipo}&${PER}`);
    if (gestorPode.has(tipo)) pdfOk(g); else { assert.equal(g.s, 403, `gestor não exporta ${tipo}`); assert.equal(g.pdf, undefined); }
    assert.equal((await anon('GET', `/reports/pdf?type=${tipo}&${PER}`)).s, 401, `sem login: ${tipo}`);
  }
  // CSV: só administrador, em qualquer tipo (inclusive os que o gestor exporta em PDF).
  for (const tipo of ['motoristas', 'entregadores', 'passageiros', 'parceiros', 'comercios', 'atendimentos', 'campanhas', 'tarefas', 'documentos', 'simulacoes']) {
    assert.equal((await adm('GET', `/reports/export?type=${tipo}&${PER}`)).s, 200, `admin CSV ${tipo}`);
    const g = await ges('GET', `/reports/export?type=${tipo}&${PER}`);
    assert.equal(g.s, 403, `gestor CSV ${tipo}`);
    assert.equal(g.csv, undefined);
    assert.equal((await anon('GET', `/reports/export?type=${tipo}&${PER}`)).s, 401);
  }
  // O que a tela decide mostrar vem do servidor.
  assert.deepEqual((await ges('GET', '/meta')).j.can.exportar_pdf.sort(), ['campanhas', 'cenario', 'financeiro', 'resumo', 'tarefas']);
  assert.equal((await ges('GET', '/meta')).j.can.exportar, false);
  const am = (await adm('GET', '/meta')).j.can;
  assert.equal(am.exportar, true);
  for (const tipo of ['motoristas', 'entregadores', 'passageiros', 'parceiros', 'comercios', 'atendimentos', 'documentos', 'resumo', 'financeiro']) assert.ok(am.exportar_pdf.includes(tipo), `admin pode ${tipo}`);
  // Tentativas de contornar: tipo repetido/forçado, caminho, maiúsculas e o gestor tentando o tipo proibido junto ao permitido.
  for (const q of ['type=tarefas&type=motoristas', 'type=MOTORISTAS', 'type=../motoristas', 'type=motoristas%00', 'type=constructor', 'type=__proto__', 'type=']) {
    const g = await ges('GET', `/reports/pdf?${q}`);
    assert.ok([400, 403].includes(g.s), `${q} → ${g.s}`);
    assert.equal(g.pdf, undefined);
  }
  // Nenhum PDF de gestor traz dado pessoal de motoristas/passageiros e nenhum relatório traz CPF/CNPJ.
  for (const tipo of ['tarefas', 'campanhas', 'resumo', 'financeiro']) {
    const tx = texto(await ges('GET', `/reports/pdf?type=${tipo}&${PER}`));
    for (const nome of ['João Ação', 'Maria Coração', 'Dani Passageira', 'Caio Entregador', 'Padaria Sol', '85999990001']) assert.ok(!tx.includes(nome), `${tipo} (gestor) não traz ${nome}`);
  }
  for (const tipo of ['motoristas', 'entregadores', 'passageiros', 'parceiros', 'comercios', 'documentos', 'resumo']) assert.ok(!/\b(CPF|CNPJ)\b\s*[:\d]/.test(texto(await adm('GET', `/reports/pdf?type=${tipo}&${PER}`))), `${tipo}: sem CPF/CNPJ`);
  // Auditoria: toda exportação (PDF e CSV, admin e gestor) fica registrada, sem os dados.
  const aud = (await adm('GET', '/audit?size=200')).j.items.filter((a) => a.action === 'exportar');
  assert.ok(aud.some((a) => a.user_nome === 'Gestor Teste' && a.entity === 'financeiro' && /PDF/.test(a.detail)));
  assert.ok(aud.some((a) => a.entity === 'motoristas' && /CSV/.test(a.detail)));
  assert.ok(!aud.some((a) => /João Ação|Maria Coração/.test(a.detail || '')));
});

test('relatório extenso: várias páginas, cabeçalho repetido, todos os registros e numeração "Página X de N"', async (t) => {
  const { proc, adm, ges } = await subir();
  t.after(() => proc.kill());
  const N = 140;
  for (let i = 1; i <= N; i++) {
    const r = await ges('POST', '/tarefas', { titulo: `Tarefa extensa fictícia número ${String(i).padStart(3, '0')} com acentuação ção`, prioridade: 'Média', data_vencimento: '2026-11-10', situacao: 'Pendente' });
    assert.equal(r.s, 201);
  }
  const pdf = await adm('GET', `/reports/pdf?type=tarefas&${PER}`);
  pdfOk(pdf);
  assert.equal(pdf.h.get('x-linhas'), String(N));
  const pag = textoPorPagina(pdf.pdf);
  assert.ok(pag.length >= 3, `esperava várias páginas, veio ${pag.length}`);
  const tudo = pag.join('\n').replace(/\s+/g, ' ');
  for (const i of [1, 70, N]) assert.ok(tudo.includes(`número ${String(i).padStart(3, '0')}`), `registro ${i} presente`);
  assert.ok(tudo.includes(`Total: ${N} registros`));
  pag.forEach((p, i) => {
    const t1 = p.replace(/\s+/g, ' ');
    assert.ok(t1.includes(`Página ${i + 1} de ${pag.length}`), `rodapé da página ${i + 1}`);
    if (i > 0) assert.ok(/Título/.test(t1) && /Vencimento/.test(t1), `cabeçalho da tabela repetido na página ${i + 1}`);
  });
  const csv = await adm('GET', `/reports/export?type=tarefas&${PER}`);
  assert.equal(linhasCsv(csv), N);
  // Gestor também exporta tarefas (PDF), com o mesmo total.
  const g = await ges('GET', `/reports/pdf?type=tarefas&${PER}`);
  pdfOk(g);
  assert.equal(g.h.get('x-linhas'), String(N));
});

test('documentos: PDF e CSV respeitam o período pela data de inclusão (Fortaleza) e batem com o cartão da tela', async (t) => {
  const crypto = require('crypto');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-reldoc-'));
  const porta = await portaLivre();
  const env = { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false', FM_ETAPA2: '1', FM_DOCS_KEY: crypto.randomBytes(32).toString('hex'), FM_DADOS_KEY: crypto.randomBytes(32).toString('hex') };
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  t.after(() => proc.kill());
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 80; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  let ck = '';
  const f = async (m, u, b) => {
    const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined });
    for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); ck = kv; }
    const tipo = r.headers.get('content-type') || '';
    if (tipo.includes('application/pdf')) return { s: r.status, pdf: Buffer.from(await r.arrayBuffer()), h: r.headers };
    if (tipo.includes('text/csv')) return { s: r.status, csv: await r.text(), h: r.headers };
    let j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ } return { s: r.status, j, h: r.headers };
  };
  assert.equal((await f('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm Fictício', email: 'adm@x.com', senha: 'senhaforte123' })).s, 201);
  const m = await f('POST', '/motoristas', { nome: 'Doc Motorista Fictício', telefone: '85999991111', cidade: 'Fortaleza', data_primeiro_contato: '2026-11-01', origem: 'WhatsApp', situacao: 'Novo interessado' });
  assert.equal(m.s, 201);
  const mid = m.j.item.id;
  const pdfMin = (marca) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${marca}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
  const envia = async (categoria) => {
    const r = await fetch(`${B}/documentos`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', cookie: ck, 'x-documento': encodeURIComponent(JSON.stringify({ funcao: 'motorista', registro_id: mid, categoria })), 'x-nome-arquivo': encodeURIComponent(`${categoria}.pdf`) }, body: pdfMin(categoria) });
    assert.equal(r.status, 201, await r.text());
  };
  await envia('cnh'); await envia('crlv');
  // O primeiro documento foi incluído às 22h30 de 01/11 em Fortaleza (01h30 UTC de 02/11); o segundo, em 05/11.
  const db = new Database(path.join(dir, 'crm.db'));
  const ids = db.prepare('SELECT id FROM documentos ORDER BY id').all().map((x) => x.id);
  db.prepare('UPDATE documentos SET criado_em = ? WHERE id = ?').run('2026-11-02T01:30:00.000Z', ids[0]);
  db.prepare('UPDATE documentos SET criado_em = ? WHERE id = ?').run('2026-11-05T15:00:00.000Z', ids[1]);
  db.close();

  for (const [per, esperado] of [['de=2026-11-01&ate=2026-11-01', 1], ['de=2026-11-02&ate=2026-11-04', 0], ['de=2026-11-05&ate=2026-11-05', 1], ['de=2026-11-01&ate=2026-11-30', 2]]) {
    const tela = (await f('GET', `/reports/summary?${per}`)).j.documentos;
    assert.equal(tela.enviados_no_periodo, esperado, `cartão da tela ${per}`);
    const pdf = await f('GET', `/reports/pdf?type=documentos&${per}`);
    pdfOk(pdf);
    assert.equal(Number(pdf.h.get('x-linhas')), esperado, `PDF = tela (${per})`);
    assert.ok(texto(pdf).includes('Período (data de inclusão do documento)'));
    assert.equal(linhasCsv(await f('GET', `/reports/export?type=documentos&${per}`)), esperado, `CSV = tela (${per})`);
  }
  // Sem período: todo o histórico, como antes. Sem conteúdo de arquivo nem CPF/CNPJ no relatório.
  const todos = await f('GET', '/reports/pdf?type=documentos');
  pdfOk(todos);
  assert.equal(Number(todos.h.get('x-linhas')), 2);
  assert.ok(texto(todos).includes('sem filtros: todos os documentos') && texto(todos).includes('Doc Motorista Fictício') && texto(todos).includes('não contém CPF, CNPJ nem o conteúdo dos arquivos'));
});
