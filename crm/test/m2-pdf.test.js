'use strict';
// M2 (entregadores e motociclistas) e relatórios em PDF de todos os setores, contra o servidor REAL. Só dados fictícios.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-m2-'));
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
  const anon = cliente();
  const adm = cliente();
  assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm', email: 'adm@x.com', senha: 'senhaforte123' })).s, 201);
  assert.equal((await adm('POST', '/users', { nome: 'Gestor Teste', email: 'g@x.com', senha: 'senhaforte123', role: 'gestor' })).s, 201);
  const ges = cliente();
  assert.equal((await ges('POST', '/auth/login', { email: 'g@x.com', senha: 'senhaforte123' })).s, 200);
  return { proc, adm, ges, anon };
}

const BASE = { cidade: 'Fortaleza', data_primeiro_contato: '2026-11-01', origem: 'WhatsApp', situacao: 'Novo interessado' };
const texto = (r) => textoPorPagina(r.pdf).join('\n').replace(/\s+/g, ' ');
const pdfOk = (r) => { assert.equal(r.s, 200, `status ${r.s} ${JSON.stringify(r.j)}`); assert.match(r.h.get('content-type'), /application\/pdf/); assert.deepEqual(validar(r.pdf).erros, []); };

test('M2: entregador nasce com a sua pessoa, contrata com confirmação, e mesma pessoa pode ser motorista e entregador sem duplicar', async (t) => {
  const { proc, adm, ges } = await subir(true);
  t.after(() => proc.kill());
  const meta = (await ges('GET', '/meta')).j;
  assert.ok(meta.entities.entregadores, 'meta traz o módulo Entregadores');
  assert.equal(meta.entities.entregadores.singular, 'Entregador');
  assert.deepEqual(meta.entities.entregadores.fechados, ['Contratado']);
  assert.ok(meta.etapa2.funcoes.find((f) => f.funcao === 'entregador').disponivel);

  const e1 = await ges('POST', '/entregadores', { ...BASE, nome: 'Carlos Moto Fictício', telefone: '(85) 98888-1111', modalidade: 'Entregador de moto', veiculo: 'Honda CG 160 vermelha 2022', placa: 'ABC1D23', cnh_categoria: 'A' });
  assert.equal(e1.s, 201, JSON.stringify(e1.j));
  assert.equal(e1.j.titular.tipo, 'pessoa');
  assert.equal((await ges('POST', '/entregadores', { ...BASE, nome: 'X', telefone: '85988881111', modalidade: 'Voa de balão' })).s, 422, 'modalidade fora da lista é recusada');

  // Aviso de telefone repetido vale para entregador também (a pessoa já existe).
  const v = await ges('POST', '/pessoas/verificar-telefone', { telefone: '5585988881111' });
  assert.equal(v.j.possiveis.length, 1);
  assert.deepEqual(v.j.possiveis[0].funcoes.map((f) => f.funcao || f), ['entregador'].map((x) => x)); // função ativa listada

  // Mesma pessoa vira também motorista (adicionar função na ficha): um cadastro de pessoa, dois registros funcionais independentes.
  const carlos = e1.j.titular.id;
  const add = await ges('POST', `/pessoas/${carlos}/funcoes`, { funcao: 'motorista', dados: { ...BASE } });
  assert.equal(add.s, 201, JSON.stringify(add.j));
  const ficha = (await ges('GET', `/pessoas/${carlos}`)).j;
  assert.deepEqual(ficha.funcoes.map((f) => f.funcao).sort(), ['entregador', 'motorista']);
  assert.equal((await ges('GET', '/pessoas?q=carlos')).j.total, 1, 'não duplicou a pessoa');

  // Contratar entregador: exige confirmação explícita, grava a data e NÃO mexe no motorista.
  assert.equal((await ges('POST', `/entregadores/${e1.j.item.id}/contratar`, {})).s, 422);
  assert.equal((await ges('POST', '/entregadores/9999/contratar', { confirmo: true })).s, 404);
  const c = await ges('POST', `/entregadores/${e1.j.item.id}/contratar`, { confirmo: true });
  assert.equal(c.s, 200);
  assert.equal(c.j.item.situacao, 'Contratado');
  assert.match(c.j.item.contratado_em, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await ges('POST', `/entregadores/${e1.j.item.id}/contratar`, { confirmo: true })).s, 409, 'já contratado');
  const motorista = (await ges('GET', `/motoristas/${add.j.item.id}`)).j.item;
  assert.equal(motorista.situacao, 'Novo interessado', 'contratar entregador não altera o motorista da mesma pessoa');
  const hist = (await ges('GET', `/entregadores/${e1.j.item.id}`)).j;
  assert.ok(hist.interacoes.some((i) => /contratado/i.test(i.resumo)));
  assert.equal(hist.titular.id, carlos);

  // Etapas (verde): fechados mostra só o contratado.
  await ges('POST', '/entregadores', { ...BASE, nome: 'Bruna Bike Fictícia', telefone: '85977772222', modalidade: 'Entregador de bicicleta' });
  assert.equal((await ges('GET', '/entregadores?etapa=fechados')).j.total, 1);
  assert.equal((await ges('GET', '/entregadores?etapa=andamento')).j.total, 1);
  assert.equal((await ges('GET', '/entregadores?f_modalidade=Entregador%20de%20bicicleta')).j.total, 1);

  // Permissões: só admin exclui; exclusão encerra o vínculo mas não apaga a pessoa.
  assert.equal((await ges('DELETE', `/entregadores/${e1.j.item.id}`)).s, 403);
  assert.equal((await adm('DELETE', `/entregadores/${e1.j.item.id}`)).s, 200);
  assert.deepEqual((await ges('GET', `/pessoas/${carlos}`)).j.funcoes.map((f) => f.funcao), ['motorista']);

  // Dashboard, relatório e histórico (os módulos antigos continuam intactos).
  const dash = (await ges('GET', '/dashboard')).j;
  assert.equal(dash.kpis.entregadores_total, 1);
  assert.equal(dash.kpis.entregadores_interessados, 1);
  assert.equal(dash.kpis.motoristas_total, 1);
  const rel = (await ges('GET', '/reports/summary?de=2026-11-01&ate=2026-11-30')).j;
  assert.equal(rel.entregadores.total, 1);
  assert.equal(rel.motoristas.total, 1);

  // WhatsApp: a conversa também pode ser vinculada a um entregador.
  const wa = await adm('POST', '/wa/conversas/1/vincular', { tipo: 'entregadores', id: 1 });
  assert.notEqual(wa.s, 500, 'vincular não pode dar erro de servidor');
});

test('sem Etapa 2 o módulo entregadores não existe e nada muda para os módulos atuais', async (t) => {
  const { proc, adm, ges } = await subir(false);
  t.after(() => proc.kill());
  assert.equal((await ges('GET', '/meta')).j.entities.entregadores, undefined);
  assert.equal((await ges('GET', '/entregadores')).s, 404);
  assert.equal((await ges('POST', '/entregadores/1/contratar', { confirmo: true })).s, 404);
  assert.equal((await adm('GET', '/reports/pdf?type=entregadores')).s, 400, 'tipo inexistente');
  assert.equal((await ges('GET', '/dashboard')).j.kpis.entregadores_total, undefined);
  assert.equal((await ges('POST', '/motoristas', { ...BASE, nome: 'Motorista Normal', telefone: '85999990001' })).s, 201);
  pdfOk(await adm('GET', '/reports/pdf?type=motoristas'));
});

test('PDF: todos os setores geram PDF válido com identidade, filtros, totais e aviso de lista vazia; CSV continua funcionando', async (t) => {
  const { proc, adm, ges, anon } = await subir(true);
  t.after(() => proc.kill());
  const cria = async (u, b) => { const r = await ges('POST', u, b); assert.equal(r.s, 201, `${u}: ${r.s} ${JSON.stringify(r.j)}`); return r; };
  await cria('/motoristas', { ...BASE, nome: 'Ana Motorista Fictícia', telefone: '85999990001', situacao: 'Contratado' });
  await cria('/motoristas', { ...BASE, nome: 'Bia Motorista Fictícia', telefone: '85999990002' });
  await cria('/entregadores', { ...BASE, nome: 'Caio Entregador Fictício', telefone: '85999990003', modalidade: 'Motociclista (mototáxi)' });
  await cria('/passageiros', { ...BASE, nome: 'Dani Passageira Fictícia', telefone: '85999990004' });
  await cria('/parceiros', { nome_estabelecimento: 'Posto Fictício', categoria: 'Posto de combustível', data_contato: '2026-11-02', situacao: 'Identificado', telefone: '85999990005' });
  await cria('/atendimentos', { data: '2026-11-03', tipo: 'Dúvida', assunto: 'Como funciona o repasse', descricao: 'Pergunta fictícia sobre o repasse semanal.', prioridade: 'Alta', situacao: 'Aberto' });
  await cria('/campanhas', { titulo: 'Campanha Fictícia', tipo: 'Campanha', canal: 'Instagram', situacao: 'Planejada', data_planejada: '2026-11-05', investimento: 150.5, alcance: 1000, engajamento: 80 });
  await cria('/tarefas', { titulo: 'Tarefa Fictícia', prioridade: 'Alta', data_vencimento: '2026-11-04', situacao: 'Pendente' });
  const cen = await ges('POST', '/finance/cenarios', { nome: 'Cenário Fictício', motoristas_ativos: 50, corridas_motorista_dia: 8, dias_operacao: 26, valor_medio_corrida: 15, comissao_pct: 10 });
  assert.equal(cen.s, 201, JSON.stringify(cen.j));
  const cenId = cen.j.item.id;

  // Admin: cada setor.
  const esperado = { motoristas: ['Relatório de Motoristas', 'Ana Motorista Fictícia', 'Total: 2 registros'], entregadores: ['Entregadores e Motociclistas', 'Caio Entregador Fictício', 'Motociclista (mototáxi)'], passageiros: ['Relatório de Passageiros', 'Dani Passageira Fictícia'], parceiros: ['Parceiros do Clube de Vantagens', 'Posto Fictício'], atendimentos: ['Relatório de Atendimento', 'Como funciona o repasse'], campanhas: ['Marketing e Divulgação', 'Campanha Fictícia', 'R$'], tarefas: ['Relatório de Tarefas', 'Tarefa Fictícia'] };
  for (const [tipo, trechos] of Object.entries(esperado)) {
    const r = await adm('GET', `/reports/pdf?type=${tipo}`);
    pdfOk(r);
    const tx = texto(r);
    for (const trecho of trechos) assert.ok(tx.includes(trecho), `${tipo}: falta “${trecho}”`);
    assert.ok(tx.includes('Fortaleza Move') && tx.includes('FILTROS APLICADOS') && /Página 1 de \d+/.test(tx), `${tipo}: identidade, filtros e rodapé`);
    assert.match(r.h.get('content-disposition'), new RegExp(`fortaleza-move_${tipo}_\\d{4}-\\d{2}-\\d{2}\\.pdf`));
  }
  // Filtros da lista valem no PDF: busca, situação e etapa.
  const so = texto(await adm('GET', '/reports/pdf?type=motoristas&etapa=fechados'));
  assert.ok(so.includes('Ana Motorista Fictícia') && !so.includes('Bia Motorista Fictícia') && so.includes('Etapa: Fechados'));
  const busca = texto(await adm('GET', `/reports/pdf?type=motoristas&q=${encodeURIComponent('Bia')}`));
  assert.ok(busca.includes('Bia Motorista Fictícia') && !busca.includes('Ana Motorista Fictícia') && busca.includes('Busca: “Bia”'));
  // Sem resultado: o PDF sai assim mesmo e diz isso.
  const vazio = await adm('GET', `/reports/pdf?type=motoristas&q=${encodeURIComponent('ninguém com esse nome')}`);
  pdfOk(vazio);
  assert.ok(texto(vazio).includes('Nenhum registro encontrado para os filtros aplicados.'));
  assert.equal(vazio.h.get('x-linhas'), '0');
  // Resumo do período, financeiro e cenário.
  const resumo = await adm('GET', '/reports/pdf?type=resumo&de=2026-11-01&ate=2026-11-30');
  pdfOk(resumo);
  assert.equal(resumo.h.get('x-linhas'), null, 'resumo não anuncia contagem de linhas');
  assert.ok(texto(resumo).includes('Relatório geral do período') && texto(resumo).includes('01/11/2026 a 30/11/2026'));
  const fin = await adm('GET', '/reports/pdf?type=financeiro');
  pdfOk(fin);
  assert.ok(texto(fin).includes('Planejamento financeiro') && texto(fin).includes('Simulação incompleta (sem custos)'), 'cenário sem custos aparece como incompleto');
  const one = await adm('GET', `/reports/pdf?type=cenario&id=${cenId}`);
  pdfOk(one);
  assert.ok(texto(one).includes('Cenário: Cenário Fictício') && texto(one).includes('Simulação incompleta'));
  assert.equal((await adm('GET', '/reports/pdf?type=cenario&id=99999')).s, 404);
  assert.equal((await adm('GET', '/reports/pdf?type=cenario&id=abc')).s, 404);

  // Gestor: só setores sem lista de pessoas; o servidor decide (não o botão).
  for (const tipo of ['motoristas', 'entregadores', 'passageiros', 'parceiros', 'atendimentos']) assert.equal((await ges('GET', `/reports/pdf?type=${tipo}`)).s, 403, `gestor não exporta ${tipo}`);
  for (const q of ['tarefas', 'campanhas', 'resumo', 'financeiro', `cenario&id=${cenId}`]) pdfOk(await ges('GET', `/reports/pdf?type=${q}`));
  assert.equal((await anon('GET', '/reports/pdf?type=tarefas')).s, 401, 'sem login não exporta');
  assert.equal((await adm('GET', '/reports/pdf?type=__proto__')).s, 400);
  assert.equal((await adm('GET', '/reports/pdf')).s, 400);
  assert.deepEqual((await ges('GET', '/meta')).j.can.exportar_pdf.sort(), ['campanhas', 'cenario', 'financeiro', 'resumo', 'tarefas']);

  // Auditoria: cada exportação fica registrada (sem os dados dentro).
  const audit = (await adm('GET', '/audit')).j.items.filter((a) => a.action === 'exportar');
  assert.ok(audit.some((a) => a.entity === 'motoristas' && /Exportação PDF/.test(a.detail)));
  assert.ok(audit.some((a) => a.user_nome === 'Gestor Teste' && a.entity === 'tarefas'));
  assert.ok(!audit.some((a) => /Ana Motorista/.test(a.detail || '')), 'auditoria não guarda nomes de pessoas');

  // CSV continua: só admin, mesmos dados; modo=lista usa os filtros da lista e todo o histórico.
  const csv = await adm('GET', '/reports/export?type=motoristas&de=2026-11-01&ate=2026-11-30');
  assert.equal(csv.s, 200);
  assert.ok(csv.csv.includes('Ana Motorista Fictícia'));
  assert.equal((await ges('GET', '/reports/export?type=motoristas')).s, 403, 'CSV segue só para o admin');
  const lista = await adm('GET', '/reports/export?type=motoristas&modo=lista&etapa=fechados');
  assert.ok(lista.csv.includes('Ana Motorista') && !lista.csv.includes('Bia Motorista'));
  assert.equal((await adm('GET', '/reports/export?type=entregadores&modo=lista')).csv.includes('Caio Entregador'), true);
});
