'use strict';
// Avaliação de candidatos, perfil avaliador e entrada assinada do aplicativo (12/11/2026). Servidor REAL, dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const { assinar } = require('../src/integracao');

const SEGREDO = crypto.randomBytes(32).toString('hex');
const portaLivre = () => new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const pdf = (marca) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${marca} ${crypto.randomBytes(4).toString('hex')}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);

async function subir({ integracao = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-cand-'));
  const porta = await portaLivre();
  const env = { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false', FM_ETAPA2: '1', IA_VARREDURA: '0',
    FM_DOCS_KEY: crypto.randomBytes(32).toString('hex'), FM_DADOS_KEY: crypto.randomBytes(32).toString('hex'), FM_INTEGRACAO_SEGREDO: integracao ? SEGREDO : '' };
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 80; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const cliente = () => {
    let ck = '';
    const f = async (m, u, b) => {
      const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined });
      for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const nome = kv.split('=')[0]; const resto = ck.split('; ').filter((x) => x && !x.startsWith(`${nome}=`)); if (!/Max-Age=0/.test(sc)) resto.push(kv); ck = resto.join('; '); }
      const tipo = r.headers.get('content-type') || '';
      if (!tipo.includes('json')) return { s: r.status, bin: Buffer.from(await r.arrayBuffer()) };
      return { s: r.status, j: await r.json() };
    };
    f.up = async (u, conteudo, meta, nome) => {
      const r = await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/octet-stream', cookie: ck, 'x-documento': encodeURIComponent(JSON.stringify(meta)), 'x-nome-arquivo': encodeURIComponent(nome) }, body: conteudo });
      return { s: r.status, j: await r.json() };
    };
    return f;
  };
  const anon = cliente(); const adm = cliente(); const ges = cliente(); const ava = cliente();
  assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Proprietário Fictício', email: 'adm@x.com', senha: 'senhaforte123' })).s, 201);
  assert.equal((await adm('POST', '/users', { nome: 'Gestor Fictício', email: 'g@x.com', senha: 'senhaforte123', role: 'gestor' })).s, 201);
  assert.equal((await adm('POST', '/users', { nome: 'Dr. Avaliador Fictício', email: 'av@x.com', senha: 'senhaforte123', role: 'avaliador' })).s, 201);
  assert.equal((await ges('POST', '/auth/login', { email: 'g@x.com', senha: 'senhaforte123' })).s, 200);
  assert.equal((await ava('POST', '/auth/login', { email: 'av@x.com', senha: 'senhaforte123' })).s, 200);
  // Chamada assinada como o backend do aplicativo faria.
  const app = async (caminho, { corpo, meta = '', segredo = SEGREDO, ts = Math.floor(Date.now() / 1000), nonce = crypto.randomBytes(12).toString('hex'), json = true, mexer } = {}) => {
    const bruto = json ? Buffer.from(JSON.stringify(corpo)) : corpo;
    const headers = { 'content-type': json ? 'application/json' : 'application/octet-stream', 'x-fm-timestamp': String(ts), 'x-fm-nonce': nonce,
      'x-fm-assinatura': assinar(segredo, { timestamp: String(ts), nonce, metodo: 'POST', caminho: `/api${caminho}`, meta, corpo: bruto }) };
    if (meta) headers['x-fm-meta'] = meta;
    if (mexer) mexer(headers);
    const r = await fetch(B + caminho, { method: 'POST', headers, body: bruto });
    return { s: r.status, j: await r.json(), nonce, ts };
  };
  return { proc, dir, anon, adm, ges, ava, app };
}
const M = { cidade: 'Fortaleza', origem: 'WhatsApp', situacao: 'Novo interessado', data_primeiro_contato: '2026-11-10' };

test('fluxo completo: avaliação aberta, documentos movem só as etapas iniciais, parecer do avaliador, decisão final só do proprietário', async (t) => {
  const { proc, dir, adm, ges, ava } = await subir();
  t.after(() => proc.kill());
  const mot = (await ges('POST', '/motoristas', { ...M, nome: 'Candidato Fictício', telefone: '85999990101', placa: 'ABC1D23', veiculo: 'Carro fictício', observacoes: 'anotação interna fictícia' })).j.item;
  // Gestor abre a avaliação; abrir de novo não duplica.
  const c1 = await ges('POST', '/candidaturas', { funcao: 'motorista', registro_id: mot.id });
  assert.equal(c1.s, 200); assert.equal(c1.j.criada, true);
  const cid = c1.j.candidatura.id;
  assert.equal(c1.j.candidatura.etapa, 'cadastro_recebido');
  assert.equal((await ges('POST', '/candidaturas', { funcao: 'motorista', registro_id: mot.id })).j.criada, false);
  assert.equal((await ava('POST', '/candidaturas', { funcao: 'motorista', registro_id: mot.id })).s, 403, 'avaliador não abre avaliação');

  // Documentos: 1 de 3 → pendente; os 3 → recebida (nunca aprova).
  assert.equal((await adm.up('/documentos', pdf('cnh'), { funcao: 'motorista', registro_id: mot.id, categoria: 'cnh' }, 'cnh.pdf')).s, 201);
  assert.equal((await adm('GET', `/candidaturas/${cid}`)).j.candidatura.etapa, 'documentacao_pendente');
  for (const cat of ['crlv', 'comprovante_endereco']) assert.equal((await adm.up('/documentos', pdf(cat), { funcao: 'motorista', registro_id: mot.id, categoria: cat }, `${cat}.pdf`)).s, 201);
  let d = (await adm('GET', `/candidaturas/${cid}`)).j;
  assert.equal(d.candidatura.etapa, 'documentacao_recebida');
  assert.equal(d.candidatura.decisao, null);

  // Equipe move etapas manuais; "aprovado" por etapa é recusado (só pela decisão final).
  assert.equal((await ges('POST', `/candidaturas/${cid}/etapa`, { etapa: 'aprovado' })).s, 422);
  assert.equal((await ges('POST', `/candidaturas/${cid}/etapa`, { etapa: 'avaliacao_presencial_pendente', observacao: 'Agendada para sexta' })).j.candidatura.etapa, 'avaliacao_presencial_pendente');
  assert.equal((await ava('POST', `/candidaturas/${cid}/etapa`, { etapa: 'avaliacao_presencial_realizada' })).s, 403, 'avaliador não muda etapa');

  // Avaliador: vê o candidato SEM telefone/anotações; abre documentos liberados.
  const lista = (await ava('GET', '/candidaturas')).j;
  assert.equal(lista.total, 1);
  d = (await ava('GET', `/candidaturas/${cid}`)).j;
  assert.equal(d.candidato.nome, 'Candidato Fictício');
  assert.equal(d.candidato.placa, 'ABC1D23');
  assert.equal(d.candidato.telefone, undefined, 'avaliador não vê telefone');
  assert.equal(d.candidato.observacoes, undefined, 'avaliador não vê anotações internas');
  assert.deepEqual(d.pode, { mudar_etapa: false, decidir: false, reabrir: false, parecer: true, abrir_ficha: false });
  const cnh = d.documentos.itens.find((x) => x.categoria === 'cnh');
  assert.equal(cnh.pode.ver, true);
  assert.equal(cnh.pode.conferir, false);
  const arq = await ava('GET', `/documentos/${cnh.id}/arquivo`);
  assert.equal(arq.s, 200);
  assert.ok(arq.bin.toString('latin1').startsWith('%PDF'));

  // Parecer: validações e registro.
  assert.equal((await ava('POST', `/candidaturas/${cid}/pareceres`, { situacao: 'favoravel', parecer: 'curto' })).s, 422);
  assert.equal((await ava('POST', `/candidaturas/${cid}/pareceres`, { situacao: 'pendente_informacao', parecer: 'Falta comprovar residência recente.' })).s, 422, 'pendência exige lista');
  assert.equal((await ava('POST', `/candidaturas/${cid}/pareceres`, { situacao: 'favoravel', parecer: 'Documentação coerente com o cadastro.', verificacao: 'sem_restricao' })).s, 422, 'verificação exige fonte');
  const p1 = await ava('POST', `/candidaturas/${cid}/pareceres`, { situacao: 'favoravel_com_ressalvas', parecer: 'Documentação coerente com o cadastro.', verificacao: 'sem_restricao', verificacao_fonte: 'Certidão estadual (fictícia)', pendencias: 'Confirmar endereço na entrevista' });
  assert.equal(p1.s, 200);
  const p2 = await ava('POST', `/candidaturas/${cid}/pareceres`, { situacao: 'favoravel', parecer: 'Endereço confirmado na entrevista presencial.', substitui_id: p1.j.parecer_id });
  assert.equal(p2.s, 200);
  assert.equal(p2.j.pareceres.length, 2, 'histórico de pareceres mantido');
  assert.equal(p2.j.pareceres[0].substitui_id, p1.j.parecer_id);
  // Gestor vê que há parecer, mas não o conteúdo.
  const dg = (await ges('GET', `/candidaturas/${cid}`)).j;
  assert.equal(dg.pareceres[0].parecer, undefined);
  assert.ok(dg.eventos.filter((e) => e.tipo === 'parecer').every((e) => e.detalhe === 'Parecer registrado'));
  // Proprietário lê tudo.
  assert.equal((await adm('GET', `/candidaturas/${cid}`)).j.pareceres[1].verificacao_fonte, 'Certidão estadual (fictícia)');

  // Decisão final: só administrador, com confirmação; recusa exige motivo.
  assert.equal((await ges('POST', `/candidaturas/${cid}/decisao`, { decisao: 'aprovado', confirmo: true })).s, 403);
  assert.equal((await ava('POST', `/candidaturas/${cid}/decisao`, { decisao: 'aprovado', confirmo: true })).s, 403);
  assert.equal((await adm('POST', `/candidaturas/${cid}/decisao`, { decisao: 'aprovado' })).s, 422, 'sem confirmação');
  assert.equal((await adm('POST', `/candidaturas/${cid}/decisao`, { decisao: 'recusado', confirmo: true })).s, 422, 'recusa sem motivo');
  const dec = await adm('POST', `/candidaturas/${cid}/decisao`, { decisao: 'aprovado', confirmo: true, motivo: 'Aprovado após avaliação presencial.' });
  assert.equal(dec.s, 200);
  assert.equal(dec.j.candidatura.etapa, 'aprovado');
  assert.equal(dec.j.candidatura.decidido_por_nome, 'Proprietário Fictício');
  // Aprovação na avaliação NÃO contrata a ficha automaticamente.
  assert.equal((await adm('GET', `/motoristas/${mot.id}`)).j.item.situacao, 'Novo interessado');
  assert.equal((await adm('GET', `/motoristas/${mot.id}`)).j.ficha.avaliacao.etapa, 'aprovado');
  // Depois da decisão: nada de novo parecer ou etapa; reabrir só com motivo.
  assert.equal((await ava('POST', `/candidaturas/${cid}/pareceres`, { situacao: 'favoravel', parecer: 'Parecer tardio fictício.' })).s, 409);
  assert.equal((await ges('POST', `/candidaturas/${cid}/etapa`, { etapa: 'documentacao_em_analise' })).s, 409);
  assert.equal((await adm('POST', `/candidaturas/${cid}/reabrir`, { confirmo: true })).s, 422);
  const re = await adm('POST', `/candidaturas/${cid}/reabrir`, { confirmo: true, motivo: 'Decisão registrada por engano.' });
  assert.equal(re.j.candidatura.etapa, 'avaliacao_presencial_realizada');
  assert.equal(re.j.candidatura.decisao, null);

  // Pareceres e histórico são permanentes (gatilhos no banco).
  const db = new Database(path.join(dir, 'crm.db'));
  assert.throws(() => db.prepare("UPDATE candidatura_pareceres SET parecer = 'x'").run(), /não pode ser alterado/);
  assert.throws(() => db.prepare('DELETE FROM candidatura_pareceres').run(), /não podem ser apagados/);
  assert.throws(() => db.prepare('DELETE FROM candidatura_eventos').run(), /não pode ser apagado/);
  assert.throws(() => db.prepare('DELETE FROM candidaturas').run(), /não podem ser apagadas/);
  assert.throws(() => db.prepare("UPDATE candidaturas SET etapa = 'aprovado' WHERE id = ?").run(cid), /CHECK/, 'aprovado sem decisão registrada é impossível');
  // Auditoria: acessos do avaliador e a decisão registrados; texto do parecer não vai para a trilha geral.
  const aud = db.prepare('SELECT action, user_nome, detail FROM audit_log').all();
  db.close();
  assert.ok(aud.some((a) => a.action === 'candidatura_ver' && a.user_nome === 'Dr. Avaliador Fictício'));
  assert.ok(aud.some((a) => a.action === 'candidatura_decidir' && a.user_nome === 'Proprietário Fictício'));
  assert.ok(!aud.some((a) => /Endereço confirmado na entrevista/.test(a.detail || '')));
});

test('avaliador: lista fechada de rotas, escopo dos documentos e nada de outros módulos', async (t) => {
  const { proc, adm, ges, ava } = await subir();
  t.after(() => proc.kill());
  const mot = (await ges('POST', '/motoristas', { ...M, nome: 'Com Avaliação', telefone: '85999990201' })).j.item;
  const sem = (await ges('POST', '/motoristas', { ...M, nome: 'Sem Avaliação', telefone: '85999990202' })).j.item;
  const ent = (await ges('POST', '/entregadores', { ...M, nome: 'Entregador Fictício', telefone: '85999990203', modalidade: 'Motociclista (mototáxi)' })).j.item;
  const com = (await ges('POST', '/comercios', { nome_estabelecimento: 'Loja Fictícia', razao_social: 'Loja LTDA', categoria: 'Padaria / confeitaria', responsavel: 'Fulana', telefone: '(85) 3333-0000', cidade: 'Fortaleza', endereco: 'Rua X', data_primeiro_contato: '2026-11-10', origem: 'Indicação', situacao: 'Identificado', volume_entregas: '10 a 30 por dia' })).j.item;
  await ges('POST', '/candidaturas', { funcao: 'motorista', registro_id: mot.id });
  await ges('POST', '/candidaturas', { funcao: 'entregador', registro_id: ent.id });
  const up = async (funcao, id, cat) => (await adm.up('/documentos', pdf(cat), { funcao, registro_id: id, categoria: cat, titulo: cat === 'outros' ? 'Documento fictício' : undefined }, `${cat}.pdf`)).j.documento.id;
  const dMot = await up('motorista', mot.id, 'cnh');
  const dSem = await up('motorista', sem.id, 'cnh');
  const dEnt = await up('entregador', ent.id, 'cnh');
  const dCom = await up('comercio', com.id, 'outros');

  assert.equal((await ava('GET', `/documentos/${dMot}/arquivo`)).s, 200, 'candidato no escopo');
  assert.equal((await ava('GET', `/documentos/${dSem}/arquivo`)).s, 403, 'motorista sem avaliação aberta');
  assert.equal((await ava('GET', `/documentos/${dEnt}/arquivo`)).s, 403, 'entregador fora do escopo padrão');
  assert.equal((await ava('GET', `/documentos/${dCom}/arquivo`)).s, 403, 'comércio nunca');
  assert.equal((await ava('GET', `/documentos/${dSem}`)).s, 403, 'nem os dados do documento fora do escopo');
  assert.equal((await ava('GET', '/candidaturas')).j.total, 1, 'só motoristas por padrão');
  const cEnt = (await adm('GET', '/candidaturas?funcao=entregador')).j.items[0].id;
  assert.equal((await ava('GET', `/candidaturas/${cEnt}`)).s, 403);
  // Proprietário libera entregadores para o avaliador → passa a ver.
  assert.equal((await adm('PUT', '/documentos/politica', { avaliador: { funcoes: ['motorista', 'entregador'] } })).s, 200);
  assert.equal((await ava('GET', `/documentos/${dEnt}/arquivo`)).s, 200);
  assert.equal((await ges('PUT', '/documentos/politica', { avaliador: { funcoes: ['motorista', 'entregador'] } })).s, 403, 'só o administrador muda a política');

  // Fora da lista fechada: 403 (mesmo rotas que o gestor alcança).
  for (const [m, u, b] of [['GET', '/motoristas'], ['GET', `/motoristas/${mot.id}`], ['POST', '/motoristas', { ...M, nome: 'X', telefone: '85999990299' }], ['GET', '/dashboard'],
    ['GET', '/documentos'], ['GET', `/documentos?funcao=motorista&registro_id=${mot.id}`], ['POST', `/documentos/${dMot}/conferir`, { situacao: 'conferido' }], ['GET', '/pessoas'],
    ['GET', '/reports/summary'], ['GET', '/reports/pdf?type=motoristas'], ['GET', '/reports/export?type=motoristas'], ['GET', '/wa/conversas'], ['GET', '/tarefas'],
    ['GET', '/audit'], ['GET', '/users'], ['GET', '/settings'], ['GET', '/notificacoes'], ['DELETE', `/motoristas/${mot.id}`], ['POST', '/candidaturas/1/decisao', { decisao: 'aprovado', confirmo: true }]]) {
    assert.equal((await ava(m, u, b)).s, 403, `${m} ${u}`);
  }
  assert.equal((await ava.up('/documentos', pdf('x'), { funcao: 'motorista', registro_id: mot.id, categoria: 'crlv' }, 'crlv.pdf')).s, 403, 'não anexa documento');
  // A própria conta continua funcionando.
  assert.equal((await ava('GET', '/auth/me')).s, 200);
  const meta = (await ava('GET', '/meta')).j;
  assert.equal(meta.user.role, 'avaliador');
  assert.deepEqual(Object.keys(meta.entities).sort(), ['entregadores', 'motoristas']);
  assert.equal(meta.pendentes.atendimentos, undefined, 'sem contagens de outros módulos');
  assert.deepEqual(meta.can, { exportar: false, exportar_pdf: [], excluir_financeiro: false, ver_atividade: false, excluir: [] });
  // Perfil inválido continua recusado; o avaliador nunca vira administrador.
  assert.equal((await adm('POST', '/users', { nome: 'Outro', email: 'o@x.com', senha: 'senhaforte123', role: 'superadmin' })).s, 422);
  assert.equal((await ava('PATCH', '/users/3', { role: 'admin' })).s, 403);
});

test('integração do aplicativo: assinatura, horário, repetição, candidato sem duplicar, documentos cifrados e idempotentes', async (t) => {
  const { proc, dir, adm, ges, app } = await subir();
  t.after(() => proc.kill());
  const cand = { externo_id: 'a1b2c3d4-0000-4000-8000-000000000001', nome: 'Candidato do App Fictício', telefone: '+5585988887777', cidade: 'Fortaleza', veiculo: 'Onix 2020 prata', placa: 'abc-1d23', cnh_categoria: 'b', data_cadastro: '2026-11-12T01:30:00.000Z', cpf: '12345678909' };
  const C = '/integracoes/app-motorista/candidato';
  // Sem assinatura / assinatura errada / segredo errado / horário velho → 401; nada é criado.
  assert.equal((await app(C, { corpo: cand, segredo: crypto.randomBytes(32).toString('hex') })).s, 401);
  assert.equal((await app(C, { corpo: cand, ts: Math.floor(Date.now() / 1000) - 900 })).s, 401);
  assert.equal((await app(C, { corpo: cand, mexer: (h) => { h['x-fm-assinatura'] = 'v1=' + '0'.repeat(64); } })).s, 401);
  assert.equal((await app(C, { corpo: cand, mexer: (h) => { delete h['x-fm-assinatura']; } })).s, 401);
  // Corpo alterado depois de assinar (assinatura feita sobre outro nome) → 401.
  assert.equal((await app(C, { corpo: cand, mexer: (h) => {
    h['x-fm-assinatura'] = assinar(SEGREDO, { timestamp: h['x-fm-timestamp'], nonce: h['x-fm-nonce'], metodo: 'POST', caminho: `/api${C}`, meta: '', corpo: Buffer.from(JSON.stringify({ ...cand, nome: 'Outro Nome' })) });
  } })).s, 401);
  // Assinatura de outra rota não vale nesta.
  assert.equal((await app(C, { corpo: cand, mexer: (h) => {
    h['x-fm-assinatura'] = assinar(SEGREDO, { timestamp: h['x-fm-timestamp'], nonce: h['x-fm-nonce'], metodo: 'POST', caminho: '/api/integracoes/app-motorista/documento', meta: '', corpo: Buffer.from(JSON.stringify(cand)) });
  } })).s, 401);
  assert.equal((await adm('GET', '/motoristas')).j.items.length, 0, 'nada criado');

  // Válido: cria ficha (origem Aplicativo, data local de Fortaleza, placa/categoria normalizadas, sem CPF) + avaliação.
  const r1 = await app(C, { corpo: cand });
  assert.equal(r1.s, 201, JSON.stringify(r1.j));
  const ficha = (await adm('GET', `/motoristas/${r1.j.registro_id}`)).j.item;
  assert.equal(ficha.origem, 'Aplicativo do motorista');
  assert.equal(ficha.data_primeiro_contato, '2026-11-11', '01h30 UTC = 22h30 do dia anterior em Fortaleza');
  assert.equal(ficha.placa, 'ABC1D23');
  assert.equal(ficha.cnh_categoria, 'B');
  assert.equal(ficha.situacao, 'Novo interessado', 'o app nunca aprova');
  assert.ok(!JSON.stringify(ficha).includes('12345678909'), 'CPF não entra');
  const cid = r1.j.candidatura_id;
  assert.equal((await adm('GET', `/candidaturas/${cid}`)).j.candidatura.origem, 'aplicativo');
  // Repetição do MESMO envio (mesmo nonce) → 409; reenvio novo do mesmo candidato → 200 sem duplicar.
  assert.equal((await app(C, { corpo: cand, nonce: r1.nonce, ts: r1.ts })).s, 409);
  const r2 = await app(C, { corpo: { ...cand, cidade: 'Caucaia' } });
  assert.equal(r2.s, 200); assert.equal(r2.j.registro_id, r1.j.registro_id); assert.equal(r2.j.criado, false);
  assert.equal((await adm('GET', `/motoristas/${r1.j.registro_id}`)).j.item.cidade, 'Fortaleza', 'não sobrescreve');
  // Candidato que já falou pelo WhatsApp (mesmo telefone) é ligado à ficha existente.
  const zap = (await ges('POST', '/motoristas', { ...M, nome: 'Já Conhecido Fictício', telefone: '(85) 97777-6666' })).j.item;
  const r3 = await app(C, { corpo: { ...cand, externo_id: 'a1b2c3d4-0000-4000-8000-000000000002', nome: 'Já Conhecido', telefone: '+5585977776666', placa: '' } });
  assert.equal(r3.j.registro_id, zap.id);
  assert.equal((await adm('GET', '/motoristas')).j.items.length, 2);
  // Campos inválidos → 422.
  assert.equal((await app(C, { corpo: { ...cand, externo_id: '../../etc' } })).s, 422);
  assert.equal((await app(C, { corpo: { ...cand, telefone: 'abc' } })).s, 422);

  // Documentos: precisam do candidato; tipo mapeado; cifrado; idempotente; mesma foto nova = nova versão; arquivo inválido recusado.
  const D = '/integracoes/app-motorista/documento';
  const doc = (tipo, id, corpo = pdf(tipo), externo = cand.externo_id) => app(D, { json: false, corpo, meta: JSON.stringify({ externo_id: externo, documento_externo_id: id, tipo, nome_arquivo: `${tipo}.pdf`, enviado_em: '2026-11-12T12:00:00.000Z' }) });
  assert.equal((await doc('CNH_FRONT', 'd0000001-aaaa', pdf('x'), 'ffffffff-desconhecido')).s, 409);
  assert.equal((await doc('CNH_FRONT', 'd0000001-aaaa')).s, 201);
  assert.equal((await doc('CNH_FRONT', 'd0000001-aaaa')).j.repetido, true, 'mesmo documento não entra duas vezes');
  assert.equal((await doc('CRIMINAL_RECORD', 'd0000002-aaaa')).s, 201);
  assert.equal((await doc('CRIMINAL_RECORD', 'd0000003-aaaa')).j.versao, 2, 'nova certidão = nova versão (a anterior fica no histórico)');
  assert.equal((await doc('NAO_EXISTE', 'd0000004-aaaa')).s, 422);
  assert.equal((await doc('CRLV', 'd0000005-aaaa', Buffer.from('MZ executável fictício'))).s, 422, 'arquivo que não é PDF/imagem');
  let d = (await adm('GET', `/candidaturas/${cid}`)).j;
  assert.equal(d.candidatura.etapa, 'documentacao_pendente');
  const ant = d.documentos.itens.find((x) => x.titulo === 'Certidão de antecedentes criminais');
  assert.equal(ant.total_versoes, 2);
  await doc('CRLV', 'd0000006-aaaa'); await doc('RESIDENCE_PROOF', 'd0000007-aaaa');
  d = (await adm('GET', `/candidaturas/${cid}`)).j;
  assert.equal(d.candidatura.etapa, 'documentacao_recebida');
  assert.equal(d.candidatura.decisao, null, 'documentos completos não aprovam');
  // Arquivo guardado cifrado (o conteúdo não aparece em disco).
  const raiz = path.join(dir, 'documentos');
  const blobs = [];
  const andar = (p) => { for (const n of fs.readdirSync(p)) { const f = path.join(p, n); if (fs.statSync(f).isDirectory()) andar(f); else blobs.push(fs.readFileSync(f)); } };
  andar(raiz);
  assert.ok(blobs.length >= 5 && blobs.every((b) => !b.toString('latin1').includes('%PDF')));
  // O gestor não abre a certidão (categoria não liberada a ele).
  assert.equal((await ges('GET', `/documentos/${ant.id}/arquivo`)).s, 403);
});

test('integração desligada sem segredo (fail-closed) e rota pública não aceita sessão no lugar da assinatura', async (t) => {
  const { proc, adm, app } = await subir({ integracao: false });
  t.after(() => proc.kill());
  const r = await app('/integracoes/app-motorista/candidato', { corpo: { externo_id: 'a1b2c3d4-0000-4000-8000-000000000009', nome: 'Fulano Fictício', telefone: '85999990000' } });
  assert.equal(r.s, 404);
  assert.equal((await adm('POST', '/integracoes/app-motorista/candidato', { externo_id: 'a1b2c3d4-0000-4000-8000-000000000009', nome: 'Fulano', telefone: '85999990000' })).s, 404);
});
