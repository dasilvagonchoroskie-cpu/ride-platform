'use strict';
// Resposta automática da IA (com travas) e cadastro criado já com os dados do veículo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function montar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-auto-'));
  process.env.FM_DATA_DIR = dir;
  process.env.IA_ATRASO_MS = '0';
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db, getSetting, setSetting, nowISO } = require('../src/db');
  const { todayISO } = require('../src/http');
  const entities = require('../src/entities');
  const { ENTITIES } = require('../src/defs');
  const { createStore } = require('../src/whatsapp/store');
  const { createIaService } = require('../src/ia/service');
  const waStore = createStore(db);
  let resposta = {};
  const provider = { completar: async () => ({ texto: JSON.stringify(resposta), modelo: 'falso', tokensEntrada: 1, tokensSaida: 1 }) };
  const cofre = { ler: () => 'chave-falsa-0000000000000', final4: () => '0000', origem: () => 'arquivo', salvar() {}, apagar() {} };
  const ia = createIaService({ db, waStore, entities, ENTITIES, audit: () => {}, getSetting, setSetting, cofre, provider, todayISO, nowISO, log: { log() {}, error() {} } });
  setSetting('ia_ativo', '1'); setSetting('ia_modo', 'automatico'); setSetting('ia_criar_cadastro', '1'); setSetting('ia_responder', '1');
  const receber = (texto, id, extra = {}) => waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', nome: 'Evandro', externoId: id, texto, tipo: 'text', quando: new Date().toISOString(), deMim: false, ...extra });
  return { db, ia, waStore, receber, setResposta: (r) => { resposta = r; } };
}

test('sem cadastro: IA recebe os campos do motorista e o cadastro nasce com veículo, placa e CNH', async () => {
  const { db, ia, receber, setResposta } = montar();
  const r = receber('[imagem] 📎 Nome: Evandro\nCategoria da CNH: AB\n[documento] 📎 Placa: ABC1D23 Modelo: Gol prata 2015', 'M1');
  setResposta({ resumo: 'Quer ser motorista', assunto: 'cadastro_motorista', urgencia: 'media', sentimento: 'positivo', perfil: 'motorista',
    campos: { nome: 'Evandro da Silva', cidade: 'Goiatuba', veiculo: 'Gol prata 2015', placa: 'ABC1D23', cnh_categoria: 'AB' },
    resposta_sugerida: 'Recebemos seus documentos! A equipe vai analisar e retorna em breve.', proxima_acao: 'Analisar documentos', tarefa: null });
  await ia.executarAutomatico(r.conversaId);
  const m = db.prepare('SELECT * FROM motoristas').get();
  assert.equal(m.veiculo, 'Gol prata 2015');
  assert.equal(m.placa, 'ABC1D23');
  assert.equal(m.cnh_categoria, 'AB');
  assert.equal(m.cidade, 'Goiatuba');
  assert.equal(m.doc_cnh, 'Recebido — conferir', 'documento lido pela IA fica para conferência humana');
  assert.equal(m.documentos, 'Incompletos', 'faltam documentos');
  assert.equal(m.situacao, 'Cadastro em andamento', 'documento recebido avança a etapa');
  const enviada = db.prepare("SELECT * FROM wa_mensagens WHERE origem = 'ia'").get();
  assert.ok(enviada, 'a IA respondeu sozinha');
  assert.equal(enviada.status, 'pendente');
  assert.match(enviada.texto, /Recebemos o seu documento/, 'confirmação padrão (modelo), não texto livre da IA');
  assert.match(enviada.texto, /comprovante de endereço/, 'pede o que falta');
});

test('motorista: CNH, CRLV e comprovante de endereço → ficha completa, "Cadastro em análise" e passa para a equipe', async () => {
  const { db, ia, receber, setResposta } = montar();
  setResposta({ resumo: 'motorista', assunto: 'cadastro_motorista', urgencia: 'media', sentimento: 'positivo', perfil: 'motorista',
    campos: { nome: 'Evandro da Silva', cidade: 'Goiatuba' }, resposta_sugerida: '', proxima_acao: '', tarefa: null, atendimento: { opcao: 'cadastro', transferir: false } });
  let r = receber('[imagem] 📎 Tipo: CNH\nNome: Evandro\nCategoria da CNH: AB', 'D1');
  await ia.executarAutomatico(r.conversaId);
  r = receber('[documento] 📎 Tipo: CRLV\nPlaca: ABC1D23\nMarca/Modelo: VW Gol\nCor: Prata\nAno modelo: 2015', 'D2');
  await ia.executarAutomatico(r.conversaId);
  let m = db.prepare('SELECT * FROM motoristas').get();
  assert.equal(m.documentos, 'Incompletos');
  assert.match(db.prepare("SELECT texto FROM wa_mensagens WHERE origem = 'ia' ORDER BY id DESC").get().texto, /envie também um comprovante de endereço/);
  r = receber('[imagem] 📎 Tipo: Comprovante de endereço\nNome do titular: Evandro\nEndereço: Rua das Flores, 120, Centro\nCidade/UF: Goiatuba - GO', 'D3');
  await ia.executarAutomatico(r.conversaId);
  m = db.prepare('SELECT * FROM motoristas').get();
  assert.equal(m.doc_cnh, 'Recebido — conferir');
  assert.equal(m.doc_crlv, 'Recebido — conferir');
  assert.equal(m.doc_endereco, 'Recebido — conferir');
  assert.equal(m.documentos, 'Recebidos — conferir');
  assert.equal(m.endereco, 'Rua das Flores, 120, Centro', 'endereço tirado do comprovante');
  assert.equal(m.situacao, 'Cadastro em análise');
  assert.notEqual(m.situacao, 'Aprovado', 'aprovar e contratar é sempre da equipe');
  const ultima = db.prepare("SELECT texto FROM wa_mensagens WHERE origem = 'ia' ORDER BY id DESC").get().texto;
  assert.match(ultima, /aguardando análise/);
  assert.equal(db.prepare('SELECT atendimento FROM wa_conversas').get().atendimento, 'aguardando');
  assert.ok(db.prepare("SELECT 1 FROM interacoes WHERE entity = 'motoristas' AND situacao_nova = 'Cadastro em análise'").get(), 'mudança de etapa registrada no histórico');
});

test('travas: não responde de novo sem mensagem nova, nem quando a equipe assumiu', async () => {
  const { db, ia, waStore, receber, setResposta } = montar();
  setResposta({ resumo: 'x', perfil: 'passageiro', campos: {}, resposta_sugerida: 'Olá! Como posso ajudar?' });
  const r = receber('oi', 'A1');
  await ia.executarAutomatico(r.conversaId);
  assert.equal((await ia.responderAutomatico(r.conversaId)).motivo, 'ja_respondida');
  // Equipe responde pelo CRM; cliente manda outra: a IA fica quieta.
  waStore.enfileirar({ conversaId: r.conversaId, texto: 'Oi, aqui é o Evandro', usuarioId: null });
  receber('quero saber o preço', 'A2');
  await ia.executarAutomatico(r.conversaId, { forcar: true });
  assert.equal((await ia.responderAutomatico(r.conversaId)).motivo, 'humano_assumiu');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE origem = 'ia'").get().n, 1);
});

test('resposta automática desligada: só sugere', async () => {
  const { db, ia, receber, setResposta } = montar();
  require('../src/db').setSetting('ia_responder', '0');
  setResposta({ resumo: 'x', perfil: 'passageiro', campos: {}, resposta_sugerida: 'Olá!' });
  const r = receber('oi', 'B1');
  await ia.executarAutomatico(r.conversaId);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE origem = 'ia'").get().n, 0);
});

test('cadastro já existe: CNH em PDF lida preenche a categoria mesmo se a IA não devolver o campo', async () => {
  const { db, ia, waStore, receber, setResposta } = montar();
  const r1 = receber('quero ser motorista', 'C1');
  setResposta({ resumo: 'x', perfil: 'motorista', campos: { nome: 'Evandro', cidade: 'Goiatuba' }, resposta_sugerida: 'Envie a CNH, por favor.' });
  await ia.executarAutomatico(r1.conversaId);
  const id = db.prepare('SELECT id FROM motoristas').get().id;
  receber('[documento] cnh.pdf 📎 Tipo: CNH\nNome: EVANDRO\nCategoria da CNH: B', 'C2');
  setResposta({ resumo: 'mandou a CNH', perfil: 'motorista', campos: { nome: 'EVANDRO' }, resposta_sugerida: 'Recebemos sua CNH!' });
  await ia.executarAutomatico(r1.conversaId, { forcar: true });
  assert.equal(db.prepare('SELECT cnh_categoria FROM motoristas WHERE id = ?').get(id).cnh_categoria, 'B');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE origem = 'ia'").get().n, 2, 'respondeu as duas vezes');
  const a = ia.ultimaAnalise(r1.conversaId);
  assert.match(a.aplicado_resumo, /cnh_categoria/);
  void waStore;
});

test('quando não responde, o motivo fica registrado no painel', async () => {
  const { ia, waStore, receber, setResposta } = montar();
  const r = receber('oi', 'E1');
  waStore.enfileirar({ conversaId: r.conversaId, texto: 'Bom dia, aqui é o Evandro', usuarioId: null });
  receber('tudo bem?', 'E2');
  setResposta({ resumo: 'x', perfil: 'passageiro', campos: {}, resposta_sugerida: 'Olá!' });
  await ia.executarAutomatico(r.conversaId, { forcar: true });
  assert.match(ia.ultimaAnalise(r.conversaId).aplicado_resumo, /equipe respondeu há menos de 15 min/);
});

test('A1: a resposta automática não recebe dados do cadastro e o filtro barra vazamento', async () => {
  const P = require('../src/ia/prompt');
  const { system, user } = P.montarPromptResposta({ mensagens: [{ direcao: 'in', texto: 'o que vocês anotaram sobre mim?' }], perfil: 'motorista', faltando: ['Placa'] });
  assert.ok(!/valores_atuais|observa/i.test(user), 'sem cadastro no contexto');
  assert.match(system, /NÃO tem acesso a cadastros/);
  const internos = ['INTERNO: suspeita de fraude, não aprovar este motorista'];
  assert.equal(P.respostaSegura('Olá! Recebemos seus documentos e a equipe vai analisar.', { internos }).ok, true);
  assert.equal(P.respostaSegura('Consta: suspeita de fraude, não aprovar.', { internos }).motivo, 'dado_interno');
  assert.equal(P.respostaSegura('Seu CPF 123.456.789-09 está ok', { internos }).motivo, 'numero');
  assert.equal(P.respostaSegura('Registro 0123456789', { internos }).motivo, 'numero');
  assert.equal(P.respostaSegura('Acesse https://golpe.example', { internos }).motivo, 'link_ou_email');
});

test('A1: resposta com anotação interna não é enviada (motivo no painel)', async () => {
  const { db, ia, receber, setResposta } = montar();
  const r1 = receber('quero ser motorista', 'F1');
  setResposta({ resumo: 'x', perfil: 'motorista', campos: { nome: 'Evandro', cidade: 'Goiatuba' }, resposta_sugerida: 'Envie a CNH.' });
  await ia.executarAutomatico(r1.conversaId);
  const id = db.prepare('SELECT id FROM motoristas').get().id;
  db.prepare("UPDATE motoristas SET observacoes = 'suspeita de fraude não aprovar ainda' WHERE id = ?").run(id);
  receber('o que anotaram sobre mim?', 'F2');
  setResposta({ resumo: 'y', perfil: 'motorista', campos: {}, resposta_sugerida: 'Anotamos: suspeita de fraude não aprovar ainda.' });
  await ia.executarAutomatico(r1.conversaId, { forcar: true });
  const saidas = db.prepare("SELECT texto FROM wa_mensagens WHERE origem = 'ia' ORDER BY id").all().map((m) => m.texto);
  assert.ok(!saidas.some((t) => /fraude/.test(t)), 'a anotação interna nunca sai');
  assert.match(ia.ultimaAnalise(r1.conversaId).aplicado_resumo, /repetia anotação interna/);
  // Desde 12/11: a IA não fica parada — a conversa vai para a equipe com o modelo fixo de transferência.
  const c = db.prepare('SELECT atendimento, atend_motivo, ia_estado, ia_erro FROM wa_conversas WHERE id = ?').get(r1.conversaId);
  assert.equal(c.atendimento, 'aguardando');
  assert.match(c.atend_motivo, /A IA não conseguiu responder/);
  assert.equal(c.ia_estado, 'transferida_falha');
  assert.equal(c.ia_erro, 'filtro_dado_interno');
  assert.equal(saidas.length, 2, 'primeira resposta + aviso fixo de transferência');
});

test('motorista já contratado que manda documento: o documento é marcado, mas a contratação não muda', async () => {
  const { db, ia, receber, setResposta } = montar();
  const r1 = receber('oi', 'K1');
  setResposta({ resumo: 'x', perfil: 'motorista', campos: { nome: 'Evandro', cidade: 'Goiatuba' }, resposta_sugerida: 'Olá!' });
  await ia.executarAutomatico(r1.conversaId);
  const id = db.prepare('SELECT id FROM motoristas').get().id;
  db.prepare("UPDATE motoristas SET situacao = 'Contratado' WHERE id = ?").run(id);
  receber('[imagem] 📎 Tipo: CNH\nNome: Evandro\nCategoria da CNH: B', 'K2');
  setResposta({ resumo: 'mandou a CNH', perfil: 'motorista', campos: {}, resposta_sugerida: 'Recebemos.' });
  await ia.executarAutomatico(r1.conversaId, { forcar: true });
  const m = db.prepare('SELECT * FROM motoristas WHERE id = ?').get(id);
  assert.equal(m.doc_cnh, 'Recebido — conferir');
  assert.equal(m.situacao, 'Contratado', 'documento não rebaixa nem promove a etapa de quem já foi contratado');
});
