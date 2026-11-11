'use strict';
// Etapa 2 — ficha central de pessoas, "adicionar função" e junção de duplicados. Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const portaLivre = () => new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

async function subir(etapa2) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-pessoas-'));
  const porta = await portaLivre();
  const env = { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false' };
  if (etapa2) env.FM_ETAPA2 = '1'; else delete env.FM_ETAPA2;
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 60; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const cliente = () => { let ck = ''; return async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined }); for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const nome = kv.split('=')[0]; const resto = ck.split('; ').filter((x) => x && !x.startsWith(nome + '=')); if (!/Max-Age=0/.test(sc)) resto.push(kv); ck = resto.join('; '); } let j = null; try { j = await r.json(); } catch (e) { /* */ } return { s: r.status, j }; }; };
  const adm = cliente();
  assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm', email: 'adm@x.com', senha: 'senhaforte123' })).s, 201);
  assert.equal((await adm('POST', '/users', { nome: 'Gestor Teste', email: 'g@x.com', senha: 'senhaforte123', role: 'gestor' })).s, 201);
  const ges = cliente();
  assert.equal((await ges('POST', '/auth/login', { email: 'g@x.com', senha: 'senhaforte123' })).s, 200);
  return { proc, adm, ges };
}

const MOT = { cidade: 'Fortaleza', data_primeiro_contato: '2026-11-01', origem: 'WhatsApp', situacao: 'Novo interessado' };
const PAS = { cidade: 'Fortaleza', data_primeiro_contato: '2026-11-01', origem: 'WhatsApp', situacao: 'Novo interessado' };

test('ficha central: pessoa com uma e com várias funções, aviso de telefone, adicionar função e situações independentes', async (t) => {
  const { proc, adm, ges } = await subir(true);
  t.after(() => proc.kill());
  assert.ok((await adm('GET', '/meta')).j.etapa2, 'meta informa que a Etapa 2 está ligada');

  // Motorista novo → nasce com a sua pessoa (sem associar a ninguém).
  const m1 = await ges('POST', '/motoristas', { ...MOT, nome: 'João Teste Silva', telefone: '(85) 99999-0000' });
  assert.equal(m1.s, 201);
  assert.equal(m1.j.titular.tipo, 'pessoa');
  const joao = m1.j.titular.id;
  let f = await ges('GET', `/pessoas/${joao}`);
  assert.equal(f.s, 200);
  assert.deepEqual(f.j.funcoes.map((x) => x.funcao), ['motorista']);
  assert.match(f.j.pessoa.uid, /^[0-9a-f-]{36}$/);
  assert.equal(f.j.funcoes_disponiveis.find((x) => x.funcao === 'passageiro').ja_tem, false);
  assert.equal(f.j.funcoes_disponiveis.find((x) => x.funcao === 'entregador').disponivel, false, 'entregador só no M2');

  // Aviso de possível duplicado pelo telefone, escrito de outro jeito; não associa sozinho.
  const v = await ges('POST', '/pessoas/verificar-telefone', { telefone: '5585999990000' });
  assert.equal(v.j.possiveis.length, 1);
  assert.equal(v.j.possiveis[0].nome, 'João Teste Silva');
  assert.equal(v.j.possiveis[0].telefone_final, '…0000');
  const p1 = await ges('POST', '/passageiros', { ...PAS, nome: 'João T. Silva', telefone: '85 99999-0000' });
  assert.equal(p1.s, 201);
  assert.notEqual(p1.j.titular.id, joao, 'sem escolha do usuário, é outra pessoa (fica para a junção)');
  const outro = p1.j.titular.id;

  // Adicionar função na ficha: nasce com nome/telefone/cidade da pessoa.
  const add = await ges('POST', `/pessoas/${joao}/funcoes`, { funcao: 'passageiro', dados: { origem: 'Indicação', data_primeiro_contato: '2026-11-02', situacao: 'Novo interessado' } });
  assert.equal(add.s, 201, JSON.stringify(add.j));
  assert.equal(add.j.item.nome, 'João Teste Silva');
  assert.equal((await ges('POST', `/pessoas/${joao}/funcoes`, { funcao: 'passageiro', dados: PAS })).s, 409, 'a mesma função ativa duas vezes não');
  assert.equal((await ges('POST', `/pessoas/${joao}/funcoes`, { funcao: 'parceiro_clube', dados: {} })).s, 422, 'função de empresa não cabe em pessoa');
  assert.equal((await ges('POST', `/pessoas/${joao}/funcoes`, { funcao: 'entregador', dados: {} })).s, 422, 'entregador ainda indisponível');
  // Escolher a pessoa ao criar pelo módulo: se já tem a função, recusa sem criar nada.
  const antes = (await adm('GET', '/pessoas')).j.total;
  assert.equal((await ges('POST', '/motoristas', { ...MOT, nome: 'João', telefone: '85999990000', pessoa_id: joao })).s, 409);
  // Erro de validação: nada é criado (nem pessoa nova).
  const inval = await ges('POST', '/motoristas', { nome: 'Sem Dados' });
  assert.equal(inval.s, 422);
  assert.ok(inval.j.error.fields);
  assert.equal((await adm('GET', '/pessoas')).j.total, antes);

  f = await ges('GET', `/pessoas/${joao}`);
  assert.deepEqual(f.j.funcoes.map((x) => x.funcao).sort(), ['motorista', 'passageiro']);
  assert.equal(f.j.possiveis_duplicados.length, 1, 'a ficha mostra o possível duplicado');

  // Situações independentes: contratar o motorista não mexe no passageiro.
  assert.equal((await adm('POST', `/motoristas/${m1.j.item.id}/contratar`, { confirmo: true })).s, 200);
  f = await ges('GET', `/pessoas/${joao}`);
  const porFuncao = Object.fromEntries(f.j.funcoes.map((x) => [x.funcao, x.registro]));
  assert.equal(porFuncao.motorista.situacao, 'Contratado');
  assert.equal(porFuncao.motorista.fechado, true);
  assert.equal(porFuncao.passageiro.situacao, 'Novo interessado');
  assert.equal(porFuncao.passageiro.fechado, false);

  // Busca por nome e por telefone.
  assert.equal((await ges('GET', '/pessoas?q=teste silva')).j.total, 1);
  assert.equal((await ges('GET', '/pessoas?q=9999-0000')).j.total, 2);
  void outro;
});

test('juntar duplicados: só admin, confirmação explícita, escolha do registro principal, nada apagado, auditado', async (t) => {
  const { proc, adm, ges } = await subir(true);
  t.after(() => proc.kill());
  const a = await adm('POST', '/motoristas', { ...MOT, nome: 'Maria Exemplo', telefone: '85 97777-1111' });
  const pa = await adm('POST', `/pessoas/${a.j.titular.id}/funcoes`, { funcao: 'passageiro', dados: PAS });
  const b = await adm('POST', '/passageiros', { ...PAS, nome: 'Maria E. Exemplo', telefone: '5585977771111', cidade: 'Caucaia' });
  const A = a.j.titular.id; const Bp = b.j.titular.id;
  // Histórico no registro que vai ser encerrado: precisa continuar existindo.
  assert.equal((await adm('POST', `/passageiros/${b.j.item.id}/interacoes`, { resumo: 'ligou pedindo informação', canal: 'Telefone' })).s, 201);

  const dup = await adm('GET', '/pessoas/duplicados');
  assert.equal(dup.s, 200);
  const g = dup.j.grupos.find((x) => x.pessoas.some((p) => p.id === A));
  assert.ok(g && g.pessoas.some((p) => p.id === Bp));
  assert.equal(g.mesmo_nome, false, 'nomes divergentes aparecem para comparação');
  assert.equal((await ges('GET', '/pessoas/duplicados')).s, 403);
  assert.equal((await ges('POST', '/pessoas/juntar', { manter_id: A, juntar_id: Bp, confirmo: true })).s, 403);
  assert.equal((await adm('POST', '/pessoas/juntar', { manter_id: A, juntar_id: Bp })).s, 422, 'sem confirmação explícita');
  const semEscolha = await adm('POST', '/pessoas/juntar', { manter_id: A, juntar_id: Bp, confirmo: true });
  assert.equal(semEscolha.s, 422, 'as duas são passageiras: precisa escolher o registro principal');
  assert.deepEqual(semEscolha.j.error.conflitos, ['passageiro']);

  const ok = await adm('POST', '/pessoas/juntar', { manter_id: A, juntar_id: Bp, confirmo: true, principais: { passageiro: b.j.item.id } });
  assert.equal(ok.s, 200, JSON.stringify(ok.j));
  assert.deepEqual(ok.j.funcoes.map((x) => `${x.funcao}#${x.registro_id}`).sort(), [`motorista#${a.j.item.id}`, `passageiro#${b.j.item.id}`]);
  const enc = ok.j.funcoes_encerradas.find((x) => x.registro_id === pa.j.item.id);
  assert.ok(enc && /duplicado/.test(enc.motivo_encerramento), 'o outro registro de passageiro foi encerrado, não excluído');
  assert.equal((await adm('GET', `/passageiros/${pa.j.item.id}`)).s, 200, 'registro encerrado continua existindo');
  const hist = await adm('GET', `/passageiros/${b.j.item.id}`);
  assert.ok(hist.j.interacoes.some((i) => /ligou pedindo/.test(i.resumo)), 'histórico preservado');
  assert.equal(ok.j.pessoa.cidade, 'Fortaleza', 'campo preenchido não é sobrescrito');
  assert.ok(ok.j.eventos.some((e) => e.evento === 'juntada'));
  const velha = await adm('GET', `/pessoas/${Bp}`);
  assert.equal(velha.j.mesclada, true);
  assert.equal(velha.j.mesclada_em_id, A);
  assert.equal((await adm('POST', '/pessoas/juntar', { manter_id: A, juntar_id: Bp, confirmo: true })).s, 409, 'não junta de novo');
  const aud = await adm('GET', '/audit');
  assert.ok(aud.j.items.some((x) => x.action === 'juntar' && x.entity === 'pessoas'));

  // Excluir um registro funcional (admin): o vínculo é encerrado e aparece no histórico da pessoa.
  assert.equal((await adm('DELETE', `/motoristas/${a.j.item.id}`)).s, 200);
  const depois = await adm('GET', `/pessoas/${A}`);
  assert.ok(!depois.j.funcoes.some((x) => x.funcao === 'motorista'));
  assert.ok(depois.j.funcoes_encerradas.some((x) => x.funcao === 'motorista' && x.motivo_encerramento === 'registro excluído'));
});

test('produção protegida: sem FM_ETAPA2 as rotas de pessoas não existem e o cadastro funciona como antes', async (t) => {
  const { proc, adm } = await subir(false);
  t.after(() => proc.kill());
  assert.equal((await adm('GET', '/meta')).j.etapa2, null);
  assert.equal((await adm('GET', '/pessoas')).s, 404);
  assert.equal((await adm('GET', '/pessoas/duplicados')).s, 404);
  const m = await adm('POST', '/motoristas', { ...MOT, nome: 'Sem Etapa', telefone: '85 91111-2222' });
  assert.equal(m.s, 201);
  assert.equal(m.j.titular, undefined);
});
