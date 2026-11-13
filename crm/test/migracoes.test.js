'use strict';
// Etapa 2 — migrações versionadas, pessoas/empresas/vínculos e relatório de duplicados. Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const SRC = path.join(__dirname, '..', 'src');
const portaLivre = () => new Promise((ok) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

// Banco novo (esquema atual de produção) com cadastros fictícios em situações que pedem cuidado.
function bancoFicticio({ etapa2 = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-mig-'));
  process.env.FM_DATA_DIR = dir;
  if (etapa2) process.env.FM_ETAPA2 = '1'; else delete process.env.FM_ETAPA2;
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC)) delete require.cache[k];
  const { db } = require('../src/db');
  const agora = new Date().toISOString();
  const mot = db.prepare("INSERT INTO motoristas (nome, telefone, cidade, data_primeiro_contato, origem, situacao, created_at, updated_at) VALUES (?, ?, 'Fortaleza', '2026-11-01', 'WhatsApp', ?, ?, ?)");
  const pas = db.prepare("INSERT INTO passageiros (nome, telefone, cidade, origem, data_primeiro_contato, situacao, created_at, updated_at) VALUES (?, ?, 'Fortaleza', 'WhatsApp', '2026-11-01', 'Novo interessado', ?, ?)");
  const par = db.prepare("INSERT INTO parceiros (nome_estabelecimento, categoria, telefone, cidade, data_contato, situacao, created_at, updated_at) VALUES (?, 'Farmácia', ?, 'Fortaleza', '2026-11-01', 'Identificado', ?, ?)");
  // João: motorista e passageiro, mesmo telefone escrito de jeitos diferentes e nome com/sem acento → MESMA pessoa.
  mot.run('João Teste Silva', '(85) 98888-7777', 'Contratado', agora, agora);
  pas.run('joao teste  silva', '5585988887777', agora, agora);
  // Maria (motorista) e Mariana (passageira) com o mesmo telefone → pessoas SEPARADAS (dúvida para o administrador).
  mot.run('Maria Exemplo', '85 97777-1111', 'Novo interessado', agora, agora);
  pas.run('Mariana Exemplo', '5585977771111', agora, agora);
  // Dois motoristas iguais (cadastro digitado duas vezes) → pessoas SEPARADAS (não pode ter 2 vínculos da mesma função).
  mot.run('Pedro Fictício', '85 96666-2222', 'Aprovado', agora, agora);
  mot.run('Pedro Ficticio', '(85) 96666-2222', 'Novo interessado', agora, agora);
  // Sem telefone válido.
  mot.run('Carlos Sem Fone', '123', 'Novo interessado', agora, agora);
  // Empresa parceira do Clube.
  par.run('Farmácia Exemplo', '85 3333-4444', agora, agora);
  db.prepare("INSERT INTO interacoes (entity, entity_id, data, resumo, created_at) VALUES ('motoristas', 1, ?, 'contato fictício', ?)").run(agora, agora);
  return { db, dir };
}

test('migrações: aplicam em ordem, registram versão e são idempotentes; registros antigos ficam idênticos', () => {
  const { db } = bancoFicticio();
  const m = require('../src/migracoes');
  const { digitalTabelas, contar } = require('../src/migracoes/simular');
  const antesDigital = digitalTabelas(db);
  const antesContagem = contar(db);
  assert.deepEqual(m.estado(db).pendentes, [1, 2, 3, 4, 5, 6, 7]);
  const r1 = m.migrar(db, { log: { log() {} } });
  assert.deepEqual(r1.aplicadas.map((x) => x.versao), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(m.estado(db).pendentes, []);
  assert.equal(m.estado(db).versao_atual, 7);
  const r2 = m.migrar(db, { log: { log() {} } });
  assert.equal(r2.aplicadas.length, 0, 'segunda execução não faz nada');
  assert.deepEqual(contar(db), antesContagem, 'nenhum registro antigo a mais ou a menos');
  assert.deepEqual(digitalTabelas(db), antesDigital, 'nenhum registro antigo alterado');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM schema_migracoes').get().c, 7);
  assert.ok(m.verificarIntegridade(db).ok);
});

test('vínculos: mesmo telefone + mesmo nome = mesma pessoa; qualquer dúvida = pessoas separadas', () => {
  const { db } = bancoFicticio();
  const m = require('../src/migracoes');
  const r = m.migrar(db, { log: { log() {} } });
  const resumo = r.aplicadas.find((x) => x.versao === 2).resumo;
  assert.equal(resumo.vinculos_criados, 8, 'os 5 motoristas, 2 passageiros e 1 parceiro');
  assert.equal(resumo.unidos_por_telefone_e_nome, 1, 'só o João');
  assert.equal(resumo.pessoas_criadas, 6, '7 registros de pessoa, João conta uma vez');
  assert.equal(resumo.empresas_criadas, 1);
  const pessoaDe = (tabela, id) => db.prepare("SELECT titular_id FROM vinculos WHERE registro_tabela = ? AND registro_id = ? AND ativo = 1").get(tabela, id).titular_id;
  assert.equal(pessoaDe('motoristas', 1), pessoaDe('passageiros', 1), 'João: motorista e passageiro na mesma pessoa');
  assert.notEqual(pessoaDe('motoristas', 2), pessoaDe('passageiros', 2), 'Maria ≠ Mariana');
  assert.notEqual(pessoaDe('motoristas', 3), pessoaDe('motoristas', 4), 'dois registros da mesma função nunca na mesma pessoa');
  const joao = db.prepare('SELECT * FROM pessoas WHERE id = ?').get(pessoaDe('motoristas', 1));
  assert.match(joao.uid, /^[0-9a-f-]{36}$/, 'identificador permanente');
  assert.equal(joao.telefone_chave, '8588887777');
  assert.equal(db.prepare('SELECT telefone_chave FROM pessoas WHERE id = ?').get(pessoaDe('motoristas', 5)).telefone_chave, null, 'telefone inválido não vira chave');
  const funcoes = db.prepare("SELECT funcao FROM vinculos WHERE titular_tipo = 'pessoa' AND titular_id = ? ORDER BY funcao").all(joao.id).map((x) => x.funcao);
  assert.deepEqual(funcoes, ['motorista', 'passageiro']);
  assert.equal(db.prepare("SELECT funcao FROM vinculos WHERE titular_tipo = 'empresa'").get().funcao, 'parceiro_clube');
});

test('regras do banco: uma função ativa por titular, um titular por registro, função compatível com o titular', () => {
  const { db } = bancoFicticio();
  require('../src/migracoes').migrar(db, { log: { log() {} } });
  const agora = new Date().toISOString();
  const ins = db.prepare('INSERT INTO vinculos (titular_tipo, titular_id, funcao, registro_tabela, registro_id, ativo, criado_em, encerrado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const joao = db.prepare("SELECT titular_id FROM vinculos WHERE registro_tabela = 'motoristas' AND registro_id = 1").get().titular_id;
  assert.throws(() => ins.run('pessoa', joao, 'motorista', 'motoristas', 6, 1, agora, null), /UNIQUE/, 'segundo vínculo ativo de motorista');
  assert.throws(() => ins.run('pessoa', joao + 1, 'motorista', 'motoristas', 1, 1, agora, null), /UNIQUE/, 'mesmo registro em duas pessoas');
  assert.throws(() => ins.run('pessoa', joao, 'parceiro_clube', 'parceiros', 1, 1, agora, null), /CHECK/, 'pessoa não é parceiro do Clube (isso é empresa)');
  assert.throws(() => ins.run('pessoa', joao, 'motorista', 'passageiros', 9, 1, agora, null), /CHECK/, 'função e tabela precisam combinar');
  assert.throws(() => ins.run('pessoa', joao, 'entregador', 'entregadores', 1, 0, agora, null), /CHECK/, 'encerrado precisa de data');
  // Encerrar o vínculo antigo libera a função (o histórico continua guardado).
  db.prepare("UPDATE vinculos SET ativo = 0, encerrado_em = ? WHERE registro_tabela = 'motoristas' AND registro_id = 1").run(agora);
  ins.run('pessoa', joao, 'motorista', 'motoristas', 6, 1, agora, null);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM vinculos WHERE titular_id = ? AND funcao = 'motorista'").get(joao).c, 3 - 1, 'o antigo encerrado + o novo ativo');
  // CPF só existe cifrado E com finalidade registrada.
  assert.throws(() => db.prepare("UPDATE pessoas SET cpf_cifrado = 'x', cpf_indice = 'y' WHERE id = ?").run(joao), /CHECK/);
});

test('falha no meio: nada fica pela metade; código alterado ou banco mais novo que o código: recusa', () => {
  const { db } = bancoFicticio();
  const m = require('../src/migracoes');
  const quebrada = { versao: 1, nome: 'quebrada', up(d) { d.exec('CREATE TABLE tabela_nova (id INTEGER)'); d.exec("INSERT INTO tabela_nova VALUES (1)"); throw new Error('falha simulada'); } };
  assert.throws(() => m.migrar(db, { lista: [quebrada], log: { log() {} } }), /falha simulada/);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'tabela_nova'").get().c, 0, 'a tabela criada antes da falha foi desfeita');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM schema_migracoes').get().c, 0, 'migração não registrada');
  const reprova = { versao: 1, nome: 'reprova', up(d) { d.exec('CREATE TABLE outra (id INTEGER)'); }, verificar: () => ['conferência reprovada'] };
  assert.throws(() => m.migrar(db, { lista: [reprova], log: { log() {} } }), /conferência reprovada/);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'outra'").get().c, 0);
  const boa = { versao: 1, nome: 'boa', up(d) { d.exec('CREATE TABLE boa (id INTEGER)'); } };
  m.migrar(db, { lista: [boa], log: { log() {} } });
  const alterada = { versao: 1, nome: 'boa', up(d) { d.exec('CREATE TABLE boa (id INTEGER, outra TEXT)'); } };
  assert.throws(() => m.migrar(db, { lista: [alterada], log: { log() {} } }), /alterada/);
  assert.throws(() => m.migrar(db, { lista: [], log: { log() {} } }), /não conhece/);
  assert.throws(() => m.migrar(db, { lista: [boa, { ...boa, versao: 1 }], log: { log() {} } }), /fora de ordem/);
});

test('produção protegida: sem FM_ETAPA2 nada é migrado; com FM_ETAPA2=1 migra e guarda cópia de segurança antes', () => {
  const sem = bancoFicticio();
  assert.equal(sem.db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'pessoas'").get().c, 0);
  const com = bancoFicticio({ etapa2: true }); // banco novo: migra ao ligar (sem cadastros ainda)
  assert.equal(com.db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'pessoas'").get().c, 1);
  const copias = fs.readdirSync(path.join(com.dir, 'backups')).filter((f) => f.startsWith('pre-migracao-'));
  assert.equal(copias.length, 7, 'uma cópia antes de cada migração');
  delete process.env.FM_ETAPA2;
});

test('simulação em cópia: o banco original não muda; relatório de duplicados não mostra telefone completo', () => {
  const { db, dir } = bancoFicticio();
  const arq = path.join(dir, 'crm.db');
  db.pragma('wal_checkpoint(TRUNCATE)');
  const { simular } = require('../src/migracoes/simular');
  const ro = new Database(arq, { readonly: true });
  const r = simular(ro.serialize());
  ro.close();
  assert.equal(r.erro, null);
  assert.equal(r.inalteradas, true);
  assert.equal(r.novas.vinculos, 8);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'pessoas'").get().c, 0, 'original continua sem as tabelas novas');
  const d = r.duplicados;
  const joao = d.grupos.find((g) => g.registros.some((x) => x.nome === 'João Teste Silva'));
  assert.equal(joao.mesmo_nome, true);
  assert.equal(joao.unido_automaticamente, true);
  const maria = d.grupos.find((g) => g.registros.some((x) => x.nome === 'Maria Exemplo'));
  assert.equal(maria.mesmo_nome, false);
  assert.equal(maria.unido_automaticamente, false);
  const pedro = d.grupos.find((g) => g.registros.some((x) => x.nome === 'Pedro Fictício'));
  assert.equal(pedro.mesma_funcao, true);
  assert.equal(pedro.unido_automaticamente, false);
  const json = JSON.stringify(d);
  assert.ok(!/988887777|977771111|966662222/.test(json), 'sem telefone completo no relatório');
  assert.match(json, /…7777/);
});

test('rotas de leitura da Etapa 2: só administrador; consulta fica na auditoria', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-mig-rota-'));
  const porta = await portaLivre();
  const env = { ...process.env, FM_DATA_DIR: dir, PORT: String(porta), HOST: '127.0.0.1', FM_INSTALL_KEY: 'FM-TEST-CHAV-E123', TRUST_PROXY: 'false' };
  delete env.FM_ETAPA2;
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  t.after(() => proc.kill());
  const B = `http://127.0.0.1:${porta}/api`;
  for (let i = 0; i < 50; i++) { try { await fetch(`${B}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
  const cliente = () => { let ck = ''; return async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined }); for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const nome = kv.split('=')[0]; const resto = ck.split('; ').filter((x) => x && !x.startsWith(nome + '=')); if (!/Max-Age=0/.test(sc)) resto.push(kv); ck = resto.join('; '); } let j = null; try { j = await r.json(); } catch (e) { /* */ } return { s: r.status, j }; }; };
  const adm = cliente();
  assert.equal((await adm('POST', '/auth/setup', { chave: 'FM-TEST-CHAV-E123', nome: 'Adm', email: 'adm@x.com', senha: 'senhaforte123' })).s, 201);
  await adm('POST', '/motoristas', { nome: 'Teste Um', telefone: '85999990000', cidade: 'Fortaleza', data_primeiro_contato: '2026-11-01', origem: 'WhatsApp', situacao: 'Novo interessado' });
  await adm('POST', '/passageiros', { nome: 'Teste Um', telefone: '(85) 99999-0000', cidade: 'Fortaleza', data_primeiro_contato: '2026-11-01', origem: 'WhatsApp', situacao: 'Novo interessado' });
  assert.equal((await adm('POST', '/users', { nome: 'Gestor Teste', email: 'g@x.com', senha: 'senhaforte123', role: 'gestor' })).s, 201);
  const g = cliente();
  await g('POST', '/auth/login', { email: 'g@x.com', senha: 'senhaforte123' });
  assert.equal((await g('GET', '/admin/duplicados')).s, 403);
  assert.equal((await g('GET', '/admin/migracoes')).s, 403);
  const dup = await adm('GET', '/admin/duplicados');
  assert.equal(dup.s, 200);
  assert.equal(dup.j.total_grupos, 1);
  const mig = await adm('GET', '/admin/migracoes');
  assert.equal(mig.j.etapa2_ligada, false);
  assert.deepEqual(mig.j.pendentes, [1, 2, 3, 4, 5, 6, 7], 'nada foi migrado no servidor');
  assert.equal(mig.j.integridade.ok, true);
  const aud = await adm('GET', '/audit');
  assert.ok(aud.j.items.some((a) => a.entity === 'duplicados'));
});

test('campos protegidos (CPF/CNPJ): só cifrados, com finalidade; índice acha repetido; adulterado não abre; sem chave não grava', () => {
  const p = require('../src/protegidos');
  const cpf = '529.982.247-25'; // CPF de exemplo válido (gerado, não pertence a ninguém conhecido)
  delete process.env.FM_DADOS_KEY;
  assert.throws(() => p.proteger('cpf', cpf, 'cadastro de motorista'), /FM_DADOS_KEY/);
  process.env.FM_DADOS_KEY = 'a'.repeat(64);
  assert.equal(p.validarCPF(cpf), true);
  assert.equal(p.validarCPF('111.111.111-11'), false);
  assert.equal(p.validarCNPJ('11.222.333/0001-81'), true);
  assert.throws(() => p.proteger('cpf', '123.456.789-00', 'x cadastro'), /inválido/);
  assert.throws(() => p.proteger('cpf', cpf, ''), /finalidade/);
  const a = p.proteger('cpf', cpf, 'cadastro de motorista');
  const b = p.proteger('cpf', '52998224725', 'cadastro de motorista');
  assert.ok(!a.cifrado.includes('52998224725'));
  assert.notEqual(a.cifrado, b.cifrado, 'cifra diferente a cada gravação');
  assert.equal(a.indice, b.indice, 'mesmo índice: acha o repetido sem abrir');
  assert.equal(a.indice, p.indiceDe('cpf', cpf));
  assert.equal(p.abrir('cpf', a.cifrado), '52998224725');
  assert.throws(() => p.abrir('cnpj', a.cifrado), 'CPF não abre como CNPJ');
  const adulterado = `P1.${Buffer.from(Buffer.from(a.cifrado.slice(3), 'base64').map((x, i) => (i === 30 ? x ^ 1 : x))).toString('base64')}`;
  assert.throws(() => p.abrir('cpf', adulterado));
  assert.equal(p.mascarar('cpf', '52998224725'), '***.***.*47-25');
  process.env.FM_DADOS_KEY = 'b'.repeat(64);
  assert.throws(() => p.abrir('cpf', a.cifrado), 'outra chave não abre');
  delete process.env.FM_DADOS_KEY;
});

test('históricos preservados: migração e junção não mexem nos históricos antigos e a ficha central mostra todos', () => {
  const { db } = bancoFicticio();
  const antigo = '2026-10-05T13:00:00.000Z';
  const agora = new Date().toISOString();
  // Históricos fictícios em todos os lugares onde eles existem hoje.
  const inter = db.prepare('INSERT INTO interacoes (entity, entity_id, data, canal, resumo, situacao_anterior, situacao_nova, created_by_nome, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  inter.run('motoristas', 1, antigo, 'WhatsApp', 'Primeiro contato do João (antigo)', 'Novo interessado', 'Primeiro contato realizado', 'Atendente', antigo);
  inter.run('passageiros', 1, antigo, 'Telefone', 'João pediu informação de preço (antigo)', null, null, 'Atendente', antigo);
  inter.run('motoristas', 4, antigo, 'Interno', 'Cadastro repetido do Pedro (antigo)', null, null, 'Atendente', antigo);
  db.prepare("INSERT INTO tarefas (titulo, prioridade, data_vencimento, situacao, entidade_tipo, entidade_id, created_at, updated_at) VALUES ('Conferir CNH do João', 'Média', '2026-10-10', 'Concluída', 'motoristas', 1, ?, ?)").run(antigo, antigo);
  const contato = db.prepare("INSERT INTO wa_contatos (jid, telefone, nome, vinculo_tipo, vinculo_id, created_at, updated_at) VALUES ('5585988887777@s.whatsapp.net', '5585988887777', 'João', 'motoristas', 1, ?, ?)").run(antigo, antigo).lastInsertRowid;
  const conv = db.prepare("INSERT INTO wa_conversas (contato_id, situacao, ultima_em, created_at, updated_at) VALUES (?, 'Resolvida', ?, ?, ?)").run(contato, antigo, antigo, antigo).lastInsertRowid;
  for (const t of ['oi, quero ser motorista', 'segue minha CNH']) db.prepare("INSERT INTO wa_mensagens (conversa_id, direcao, texto, ocorrida_em, created_at) VALUES (?, 'in', ?, ?, ?)").run(conv, t, antigo, antigo);
  db.prepare("INSERT INTO wa_eventos (conversa_id, tipo, detalhe, criado_em) VALUES (?, 'transferida', 'documentos', ?)").run(conv, antigo);
  db.prepare("INSERT INTO audit_log (user_nome, action, entity, entity_id, detail, ip, created_at) VALUES ('Atendente', 'editar', 'motoristas', 1, 'Campos alterados: situacao', '', ?)").run(antigo);

  const { digitalTabelas } = require('../src/migracoes/simular');
  const digital = (d) => { const x = digitalTabelas(d); delete x.audit_log; delete x.users; return x; };
  const antesHist = digital(db);
  const auditAntigo = db.prepare('SELECT * FROM audit_log ORDER BY id').all();

  require('../src/migracoes').migrar(db, { log: { log() {} } });
  assert.deepEqual(digital(db), antesHist, 'migração não alterou nenhum histórico antigo');

  const entities = require('../src/entities');
  const { createPessoas } = require('../src/pessoas');
  const auditar = (req, action, entity, id, detail) => db.prepare("INSERT INTO audit_log (user_id, user_nome, action, entity, entity_id, detail, ip, created_at) VALUES (?, 'Adm', ?, ?, ?, ?, '', ?)").run(req.user.id, action, entity, id, detail, agora);
  process.env.FM_ETAPA2 = '1';
  const svc = createPessoas({ db, entities, ENTITIES: entities.ENTITIES, audit: auditar });
  const req = { user: { id: null, role: 'admin' } };
  const idDe = (tabela, id) => db.prepare('SELECT titular_id FROM vinculos WHERE registro_tabela = ? AND registro_id = ? AND ativo = 1').get(tabela, id).titular_id;

  // Ficha central do João: histórico das DUAS funções, com as datas e os textos originais.
  const f = svc.ficha(idDe('motoristas', 1), { admin: true });
  const mot = f.historico_funcoes.find((h) => h.funcao === 'motorista');
  const pas = f.historico_funcoes.find((h) => h.funcao === 'passageiro');
  const antiga = mot.interacoes.find((i) => i.resumo === 'Primeiro contato do João (antigo)');
  assert.ok(antiga, 'acompanhamento antigo aparece');
  assert.equal(antiga.data, antigo, 'data original preservada');
  assert.equal(antiga.situacao_nova, 'Primeiro contato realizado');
  assert.equal(mot.interacoes.length, 2, 'os dois acompanhamentos do motorista (o antigo e o da base fictícia)');
  assert.equal(mot.tarefas[0].titulo, 'Conferir CNH do João');
  assert.equal(mot.conversas[0].mensagens, 2);
  assert.equal(mot.auditoria[0].detail, 'Campos alterados: situacao');
  assert.equal(pas.interacoes[0].resumo, 'João pediu informação de preço (antigo)');
  assert.equal(f.eventos.length, 0, 'o histórico central começa vazio: não substitui nem copia os antigos');
  assert.equal(svc.ficha(idDe('motoristas', 1), { admin: false }).historico_funcoes[0].auditoria, null, 'auditoria só para administrador');

  // Junção dos dois Pedros (mesma função): a ficha repetida é encerrada e o histórico dela continua na ficha central.
  const p3 = idDe('motoristas', 3); const p4 = idDe('motoristas', 4);
  const r = svc.juntar({ manterId: p3, juntarId: p4, principais: { motorista: 3 }, confirmo: true }, req);
  const encerrada = r.historico_funcoes.find((h) => h.registro_id === 4);
  assert.equal(encerrada.ativo, false);
  assert.equal(encerrada.interacoes[0].resumo, 'Cadastro repetido do Pedro (antigo)');
  assert.deepEqual(digital(db).interacoes, antesHist.interacoes, 'junção não mexe nos acompanhamentos');
  assert.deepEqual(digital(db).tarefas, antesHist.tarefas);
  assert.deepEqual(digital(db).wa_mensagens, antesHist.wa_mensagens);
  assert.deepEqual(db.prepare('SELECT * FROM audit_log ORDER BY id').all().slice(0, auditAntigo.length), auditAntigo, 'auditoria antiga intacta (só ganha linhas novas)');
  assert.ok(r.eventos.some((e) => e.evento === 'juntada'), 'o histórico central registra o acontecimento novo');
  delete process.env.FM_ETAPA2;
});
