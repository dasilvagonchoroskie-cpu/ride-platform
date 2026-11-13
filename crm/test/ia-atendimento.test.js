'use strict';
// Correções do atendimento por IA (12/11/2026 noite, pedido do dono): confirmação rápida, áudio, novo atendimento depois
// do encerramento, alternância IA ⇄ equipe, origem "site" ≠ intenção, concorrência e reinício.
// SIMULADO: provedor de IA e canal falsos. Não comprova o funcionamento com o WhatsApp e o Gemini reais.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { recebidosFalso, tipoDoTexto } = require('./apoio/recebidos-falso');

function montar({ confirmacaoMs = '0', atraso = '0', repetir = '0,0' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-atend-'));
  process.env.FM_DATA_DIR = dir;
  process.env.IA_ATRASO_MS = atraso;
  process.env.IA_CONFIRMACAO_MS = confirmacaoMs;
  process.env.IA_REPETIR_MS = repetir;
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db, getSetting, setSetting, nowISO } = require('../src/db');
  const { todayISO } = require('../src/http');
  const entities = require('../src/entities');
  const { ENTITIES } = require('../src/defs');
  const { createStore } = require('../src/whatsapp/store');
  const { createIaService } = require('../src/ia/service');
  const { ErroIA } = require('../src/ia/provider');
  const waStore = createStore(db);
  const estado = {
    analise: { resumo: 'x', perfil: 'desconhecido', campos: {}, atendimento: { opcao: 'indefinido', transferir: false } },
    redacao: { resposta: 'Certo! Posso ajudar com isso.' }, atrasoMs: 0, falhar: 0, chamadas: 0, prompts: [], antesDeRedigir: null
  };
  const provider = {
    completar: async ({ system, user }) => {
      estado.chamadas += 1;
      const redigir = /Central de Atendimento/.test(system);
      estado.prompts.push({ redigir, user });
      if (estado.atrasoMs) await new Promise((ok) => setTimeout(ok, estado.atrasoMs));
      if (estado.falhar > 0) { estado.falhar -= 1; throw new ErroIA('indisponivel', 'O serviço de IA está indisponível agora.', 503); }
      if (redigir && estado.antesDeRedigir) { const f = estado.antesDeRedigir; estado.antesDeRedigir = null; f(); }
      return { texto: JSON.stringify(redigir ? estado.redacao : estado.analise), modelo: 'falso', tokensEntrada: 1, tokensSaida: 1 };
    }
  };
  const cofre = { ler: () => 'chave-falsa-0000000000000', final4: () => '0000', origem: () => 'arquivo', salvar() {}, apagar() {} };
  const auditados = [];
  const logs = [];
  const ia = createIaService({ db, waStore, entities, ENTITIES, audit: (req, acao, t, id, det) => auditados.push({ acao, det }), getSetting, setSetting, cofre, provider, todayISO, nowISO, log: { log: (m) => logs.push(m), error: (m) => logs.push(m) } });
  ia.definirRecebidos(recebidosFalso(db)); // SIMULAÇÃO do armazenamento (o real: test/wa-anexos.test.js)
  setSetting('ia_ativo', '1'); setSetting('ia_modo', 'automatico'); setSetting('ia_responder', '1');
  db.prepare("INSERT INTO users (id, nome, email, senha_hash, role, created_at, updated_at) VALUES (1, 'Dono Fictício', 'dono@x.com', 'x', 'admin', ?, ?)").run(nowISO(), nowISO());
  const eventos = [];
  waStore.ouvir((e) => eventos.push(e));
  let n = 0;
  // Mensagem do cliente: grava (como o WhatsApp faria) e avisa a chegada (confirmação rápida + origem).
  const chegar = (texto, extra = {}) => {
    n += 1;
    const r = waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', nome: 'Cliente', externoId: `E${n}`, texto, tipo: tipoDoTexto(texto), quando: new Date(Date.now() + n).toISOString(), deMim: false, ...extra });
    if (!extra.deMim) ia.registrarChegada(r.conversaId, r.mensagemId);
    return r;
  };
  const receber = async (texto, extra = {}) => { const r = chegar(texto, extra); if (!extra.deMim) await ia.executarAutomatico(r.conversaId); return r; };
  const respostas = () => db.prepare("SELECT texto FROM wa_mensagens WHERE origem = 'ia' AND tipo <> 'aviso' ORDER BY id").all().map((m) => m.texto);
  const avisos = () => db.prepare("SELECT texto FROM wa_mensagens WHERE tipo = 'aviso' ORDER BY id").all().map((m) => m.texto);
  const conv = () => db.prepare('SELECT * FROM wa_conversas').get();
  const espere = (ms) => new Promise((ok) => setTimeout(ok, ms));
  return { db, ia, waStore, chegar, receber, respostas, avisos, conv, estado, auditados, logs, eventos, espere, setSetting };
}

/* ------------------------------------- 2.1 resposta rápida ------------------------------------- */
test('confirmação rápida: sai antes da resposta lenta, uma vez por fala, não conta como resposta nem notifica', async () => {
  const { chegar, ia, respostas, avisos, conv, estado, eventos, espere, logs } = montar({ confirmacaoMs: '30' });
  estado.atrasoMs = 80; // IA lenta (cada chamada 80 ms; análise + redação)
  const r = chegar('Quero saber como funciona o Clube de Vantagens');
  chegar('e quanto custa?'); // segunda mensagem do mesmo "turno": nada de segunda confirmação
  const execucao = ia.executarAutomatico(r.conversaId);
  await espere(60);
  assert.deepEqual(avisos(), ['Recebemos a sua mensagem! Estamos verificando e já respondemos.'], 'confirmação enviada enquanto processa');
  assert.equal(respostas().length, 0, 'a confirmação não é a resposta definitiva');
  assert.equal(conv().ultima_direcao, 'in', 'a lista continua mostrando a mensagem do cliente como pendente');
  await execucao;
  assert.equal(respostas().length, 1, `a resposta de verdade vem depois da confirmação (não foi bloqueada como "já respondida") ${JSON.stringify(logs)}`);
  assert.equal(avisos().length, 1, 'uma confirmação só');
  await espere(10); // os avisos do store saem no próximo ciclo
  assert.equal(eventos.filter((e) => e.tipo === 'ia').length, 1, 'só a resposta definitiva gera notificação "IA respondeu"');
});

test('confirmação rápida: não sai quando a IA responde a tempo, com a equipe atendendo, ou com a IA desligada', async () => {
  const { receber, chegar, waStore, avisos, conv, espere, setSetting } = montar({ confirmacaoMs: '40' });
  await receber('oi'); // IA rápida: responde antes do tempo da confirmação
  await espere(70);
  assert.equal(avisos().length, 0);
  waStore.mudarAtendimento(conv().id, 'humano', { usuarioId: 1 });
  chegar('alô?');
  await espere(70);
  assert.equal(avisos().length, 0, 'com humano, a IA não fala nada');
  waStore.mudarAtendimento(conv().id, 'ia', { usuarioId: 1 });
  setSetting('ia_responder', '0');
  chegar('oi de novo');
  await espere(70);
  assert.equal(avisos().length, 0, 'resposta automática desligada: sem confirmação');
});

test('eco da confirmação que chega pelo celular antes do fim do envio não vira "equipe respondeu"', async () => {
  const { chegar, ia, waStore, db, conv, espere } = montar({ confirmacaoMs: '20' });
  const r = chegar('preciso de ajuda');
  await espere(50);
  const aviso = db.prepare("SELECT * FROM wa_mensagens WHERE tipo = 'aviso'").get();
  assert.ok(aviso);
  // O WhatsApp devolve a mensagem enviada (fromMe) antes do envio terminar.
  waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', externoId: 'ECO1', texto: aviso.texto, tipo: 'text', quando: new Date().toISOString(), deMim: true });
  assert.equal(conv().atendimento, 'ia', 'continua com a IA');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE tipo = 'aviso'").get().n, 2, 'o eco também é aviso');
  waStore.concluirEnvio(aviso.id, 'ECO1');
  assert.equal(db.prepare("SELECT tipo, origem FROM wa_mensagens WHERE externo_id = 'ECO1'").get().tipo, 'aviso');
  await ia.executarAutomatico(r.conversaId);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE origem = 'ia' AND tipo = 'text'").get().n, 1, 'a IA ainda responde');
});

/* --------------------------------------- 2.2 áudio --------------------------------------- */
test('áudio transcrito: a IA lê o texto do áudio e responde normalmente', async () => {
  const { receber, respostas, estado } = montar();
  await receber('oi');
  estado.analise.atendimento = { opcao: 'cadastro', transferir: false };
  estado.redacao = { resposta: 'Para o cadastro, envie a foto da sua CNH.' };
  await receber('[mensagem de voz] 🎤 quero me cadastrar como motorista', { tipo: 'audio' });
  assert.equal(respostas().pop(), 'Para o cadastro, envie a foto da sua CNH.');
  assert.match(estado.prompts.filter((p) => p.redigir).pop().user, /quero me cadastrar como motorista/, 'o texto transcrito chega à IA');
});

test('áudio que não pôde ser ouvido: avisa com franqueza (sem chamar a IA); se repetir, passa para a equipe', async () => {
  const { receber, respostas, conv, estado } = montar();
  await receber('oi');
  const antes = estado.chamadas;
  await receber('[mensagem de voz] (não foi possível ouvir o áudio)', { tipo: 'audio' });
  assert.equal(respostas().pop(), 'Desculpe, não consegui ouvir o seu áudio. Pode escrever a sua mensagem, por favor?');
  assert.equal(estado.chamadas, antes, 'não finge que entendeu: nem chama a IA');
  assert.equal(conv().ia_erro, 'audio_ilegivel');
  await receber('[mensagem de voz]', { tipo: 'audio' });
  assert.equal(conv().atendimento, 'aguardando', 'segundo áudio ilegível seguido: equipe');
  assert.match(respostas().pop(), /encaminhada para nossa equipe/);
});

test('áudio ainda sendo ouvido: a IA espera a leitura (nem responde, nem a varredura atropela)', async () => {
  const { chegar, ia, respostas, db } = montar();
  const r = chegar('[mensagem de voz]', { tipo: 'audio' });
  ia.marcarLeitura(r.mensagemId, true);
  await ia.executarAutomatico(r.conversaId);
  assert.equal(respostas().length, 0);
  db.prepare('UPDATE wa_mensagens SET created_at = ?').run(new Date(Date.now() - 60000).toISOString());
  assert.deepEqual(ia.recuperarPendentes(), [], 'varredura não pega áudio em leitura');
  // Leitura terminou com sucesso: a mensagem vira texto e a IA responde.
  db.prepare('UPDATE wa_mensagens SET texto = ? WHERE id = ?').run('[mensagem de voz] 🎤 bom dia, quero informações', r.mensagemId);
  ia.marcarLeitura(r.mensagemId, false);
  await ia.executarAutomatico(r.conversaId, { forcar: true });
  assert.equal(respostas().length, 1);
});

test('leitura de mídia: falha passageira do Gemini é repetida; falha definitiva não', async () => {
  const { lerComTentativas } = require('../src/ia/transcricao');
  const { ErroIA } = require('../src/ia/provider');
  let n = 0;
  const r = await lerComTentativas(async () => { n += 1; if (n < 3) throw new ErroIA('indisponivel', 'fora'); return { texto: 'ok' }; }, [1, 1], () => {}, async () => {});
  assert.equal(r.texto, 'ok'); assert.equal(n, 3);
  n = 0;
  await assert.rejects(lerComTentativas(async () => { n += 1; throw new ErroIA('invalido', 'formato'); }, [1, 1], () => {}, async () => {}), /formato/);
  assert.equal(n, 1, 'formato inválido não repete');
  n = 0;
  await assert.rejects(lerComTentativas(async () => { n += 1; throw new ErroIA('timeout', 'demorou'); }, [1], () => {}, async () => {}), /demorou/);
  assert.equal(n, 2, 'limite de tentativas respeitado');
});

/* ------------------------------ 2.3 encerramento ≠ bloqueio ------------------------------ */
test('atendimento concluído: a mesma pessoa escreve 1 minuto depois e um NOVO atendimento começa (menu de novo, histórico mantido)', async () => {
  const { receber, waStore, respostas, conv, db, auditados, espere } = montar();
  await receber('oi'); // saudação + menu
  const menuAntes = respostas().length;
  await espere(5);
  waStore.mudarAtendimento(conv().id, 'concluido', { usuarioId: 1 });
  await espere(5);
  const totalMsgs = db.prepare('SELECT COUNT(*) n FROM wa_mensagens').get().n;
  await receber('oi, outra coisa');
  const c = conv();
  assert.equal(c.atendimento, 'ia');
  assert.ok(c.atend_inicio, 'início do novo atendimento registrado');
  assert.equal(c.atend_assunto, null, 'assunto do atendimento anterior não é reaproveitado');
  assert.equal(respostas().length, menuAntes + 1, 'respondeu (o menu igual ao anterior não é "repetido")');
  assert.match(respostas().pop(), /Para direcionarmos seu atendimento/, JSON.stringify({ c, m: db.prepare('SELECT id, origem, tipo, created_at FROM wa_mensagens').all() }));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM wa_mensagens').get().n, totalMsgs + 2, 'histórico anterior preservado');
  assert.ok(db.prepare("SELECT 1 FROM wa_eventos WHERE tipo = 'reaberta'").get());
  await espere(5);
  assert.ok(auditados.some((a) => a.acao === 'wa_reabrir'), 'novo atendimento auditado');
});

test('limite de respostas conta só o atendimento atual: atendimento anterior cheio não bloqueia o novo', async () => {
  const { receber, waStore, respostas, conv, db } = montar();
  await receber('oi');
  const id = conv().id;
  const antigo = new Date(Date.now() - 3 * 3600000).toISOString();
  const ins = db.prepare("INSERT INTO wa_mensagens (conversa_id, direcao, tipo, texto, status, origem, ocorrida_em, created_at) VALUES (?, 'out', 'text', ?, 'enviada', 'ia', ?, ?)");
  for (let i = 0; i < 45; i++) ins.run(id, `resposta antiga ${i}`, antigo, antigo);
  waStore.mudarAtendimento(id, 'concluido', { usuarioId: 1 });
  const antes = respostas().length;
  await receber('olá de novo');
  assert.equal(respostas().length, antes + 1, 'o novo atendimento é respondido');
});

/* ------------------------------ 2.4 IA ⇄ equipe, repetidas vezes ------------------------------ */
test('equipe assume → IA para na hora; devolve → IA volta e responde a mensagem pendente; várias vezes seguidas', async () => {
  const { receber, chegar, waStore, ia, respostas, conv, espere, auditados } = montar();
  await receber('oi');
  const id = conv().id;
  for (let ciclo = 1; ciclo <= 3; ciclo++) {
    waStore.mudarAtendimento(id, 'humano', { usuarioId: 1 });
    const antes = respostas().length;
    await receber(`pergunta durante o humano ${ciclo}`);
    assert.equal(respostas().length, antes, `ciclo ${ciclo}: IA quieta com o humano`);
    waStore.mudarAtendimento(id, 'ia', { usuarioId: 1 });
    await espere(30); // devolução agenda o tratamento da mensagem pendente
    assert.equal(conv().atendimento, 'ia');
    assert.equal(respostas().length, antes + 1, `ciclo ${ciclo}: IA voltou e respondeu a pendente`);
    chegar(`nova pergunta ${ciclo}`);
    await ia.executarAutomatico(id);
    assert.equal(respostas().length, antes + 2, `ciclo ${ciclo}: IA segue respondendo`);
  }
  await espere(5);
  assert.ok(auditados.filter((a) => a.acao === 'wa_reabrir').length === 0, 'devolução manual não é auditada como sistema (a rota audita com o usuário)');
});

test('equipe assume ENQUANTO a IA redige: a resposta pronta não é enviada', async () => {
  const { receber, waStore, respostas, conv, estado } = montar();
  await receber('oi');
  const antes = respostas().length;
  estado.antesDeRedigir = () => waStore.mudarAtendimento(conv().id, 'humano', { usuarioId: 1 });
  await receber('quero falar sobre encomendas');
  assert.equal(respostas().length, antes, 'nada enviado depois que a equipe assumiu');
  assert.equal(conv().atendimento, 'humano');
});

test('resposta pelo celular assume (auditado) e volta sozinha para a IA depois da pausa (auditado)', async () => {
  const { receber, waStore, conv, db, auditados, setSetting, respostas } = montar();
  await receber('oi');
  const antiga = new Date(Date.now() - 40 * 60000).toISOString();
  waStore.ingerir({ jid: '5564999990000@s.whatsapp.net', telefone: '5564999990000', externoId: 'CEL1', texto: 'Oi, sou eu da equipe', tipo: 'text', quando: antiga, deMim: true });
  await new Promise((ok) => setImmediate(ok));
  assert.equal(conv().atendimento, 'humano');
  assert.ok(auditados.some((a) => a.acao === 'wa_assumir' && /celular/.test(a.det)));
  db.prepare('UPDATE wa_conversas SET atend_em = ?').run(antiga);
  setSetting('ia_humano_pausa_min', '30');
  const antes = respostas().length;
  await receber('ainda tem alguém aí?');
  await new Promise((ok) => setImmediate(ok));
  assert.equal(conv().atendimento, 'ia');
  assert.equal(respostas().length, antes + 1);
  assert.ok(auditados.some((a) => a.acao === 'wa_devolver_ia' && /automaticamente/.test(a.det)));
});

/* ------------------------------ 2.5 falha do Gemini e reinício ------------------------------ */
test('Gemini falha uma vez: nova tentativa sem duplicar; reinício: varredura recupera; duas varreduras não duplicam', async () => {
  const { chegar, receber, ia, respostas, conv, estado, espere, db } = montar({ repetir: '30' });
  await receber('oi');
  estado.falhar = 1;
  const r = chegar('quero saber das encomendas');
  await ia.executarAutomatico(r.conversaId);
  assert.equal(conv().ia_estado, 'tentando');
  await espere(120);
  assert.equal(conv().ia_estado, 'respondida');
  const n = respostas().length;
  // "Reinício": mensagem nova sem tratamento (temporizador perdido) → a varredura recupera uma vez só.
  chegar('e o preço?');
  db.prepare('UPDATE wa_mensagens SET created_at = ? WHERE id = (SELECT MAX(id) FROM wa_mensagens)').run(new Date(Date.now() - 60000).toISOString());
  const a = ia.recuperarPendentes();
  const b = ia.recuperarPendentes();
  assert.equal(a.length, 1); assert.equal(b.length, 0, 'a segunda varredura não pega a mesma conversa em andamento');
  await espere(50);
  assert.equal(respostas().length, n + 1, 'respondeu uma vez');
});

test('concorrência: mensagens chegando durante o processamento são tratadas depois, sem resposta duplicada', async () => {
  const { chegar, ia, respostas, estado, espere } = montar();
  estado.atrasoMs = 40;
  const r = chegar('oi');
  const p1 = ia.executarAutomatico(r.conversaId);
  const p2 = ia.executarAutomatico(r.conversaId); // chamada em paralelo: não processa duas vezes
  chegar('quero saber do clube');
  const p3 = ia.executarAutomatico(r.conversaId);
  await Promise.all([p1, p2, p3]);
  await espere(250);
  const enviadas = respostas();
  assert.equal(new Set(enviadas).size, enviadas.length, 'nenhuma resposta repetida');
  assert.ok(enviadas.length >= 1 && enviadas.length <= 2);
});

/* ------------------------------------ 3. origem "site" ------------------------------------ */
test('contato pelo botão do site: origem registrada, MENU GERAL, nada de documentos de motorista nem cadastro criado', async () => {
  const { receber, respostas, conv, estado, db, setSetting } = montar();
  setSetting('ia_criar_cadastro', '1');
  // A análise erra e acha que é cadastro de motorista (o problema relatado).
  estado.analise = { resumo: 'veio do site', perfil: 'motorista', campos: { nome: 'Cliente' }, atendimento: { opcao: 'cadastro', transferir: false } };
  await receber('Olá! Vim pelo site da Fortaleza Move.');
  const c = conv();
  assert.equal(c.origem_contato, 'Site', 'origem guardada para relatórios');
  assert.equal(c.atend_assunto, null, 'origem não vira assunto');
  const m = respostas().pop();
  assert.match(m, /Para direcionarmos seu atendimento/, 'menu geral');
  assert.doesNotMatch(m, /CNH|CRLV|antecedentes|documento/i, 'nada de documentação de motorista');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM motoristas').get().n, 0, 'nenhum cadastro de motorista criado');
  // Quando a pessoa escolhe a opção 1, aí sim o fluxo de cadastro começa.
  estado.redacao = { resposta: 'Ótimo! Para o cadastro, envie a foto da sua CNH.' };
  await receber('1');
  assert.equal(conv().atend_assunto, 'cadastro');
  assert.match(respostas().pop(), /CNH/);
});

test('origem e intenção: outras origens também não decidem o assunto; intenção clara decide', () => {
  const C = require('../src/ia/central');
  assert.equal(C.origemDoContato('Olá! Vim pelo site da Fortaleza Move.'), 'Site');
  assert.equal(C.origemDoContato('bom dia, vi no instagram'), 'Instagram');
  assert.equal(C.semIntencao('Olá! Vim pelo site da Fortaleza Move.'), true);
  assert.equal(C.semIntencao('Olá! Quero saber mais sobre a Fortaleza Move.'), true);
  assert.equal(C.semIntencao('bom dia, vi no instagram'), true);
  assert.equal(C.semIntencao('Vim pelo site, quero ser motorista'), false);
  assert.equal(C.semIntencao('Quero saber mais sobre corridas e encomendas'), false);
});

/* ------------------------------ 4. sete documentos pela conversa ------------------------------ */
test('documentos pela conversa: só completa com os 7 itens (fotos do veículo separadas) e nunca aprova', async () => {
  const { receber, respostas, conv, estado, db } = montar();
  await receber('oi');
  estado.analise = { resumo: 'docs', perfil: 'motorista', campos: {}, atendimento: { opcao: 'cadastro', transferir: false } };
  const itens = ['Tipo: CNH\nCategoria: B', 'Tipo: CRLV', 'Tipo: Comprovante de endereço', 'Tipo: Certidão de antecedentes criminais', 'Tipo: Foto do veículo (frente)', 'Tipo: Foto do veículo (lado)'];
  for (const t of itens) await receber(`[documento] 📎 ${t}`, { tipo: 'image' });
  assert.equal(conv().atendimento, 'ia', '6 de 7: continua pedindo');
  assert.match(respostas().pop(), /foto da traseira do veículo/);
  await receber('[imagem] 📎 Tipo: Foto do veículo (traseira)', { tipo: 'image' });
  assert.equal(conv().atendimento, 'aguardando', 'com os 7, vai para análise da equipe');
  const ultima = respostas().pop();
  assert.match(ultima, /aguardando análise/);
  assert.doesNotMatch(ultima, /aprovad/i);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM motoristas WHERE situacao IN ('Aprovado', 'Contratado')").get().n, 0);
});

/* ------------------------- 13/11: documento só conta com ARQUIVO guardado ------------------------- */
test('documento sem armazenamento ligado: não finge que guardou — confirma o recebimento e passa para a equipe', async () => {
  const { receber, ia, respostas, conv, db } = montar();
  await receber('oi');
  ia.definirRecebidos(null); // arquivo digital desligado (sem FM_DOCS_KEY ou sem Etapa 2)
  await receber('[imagem] 📎 Tipo: CNH\nCategoria da CNH: B');
  assert.equal(conv().atendimento, 'aguardando');
  assert.match(conv().atend_motivo, /arquivo não foi guardado/);
  assert.match(respostas().join('\n'), /Recebemos o seu documento/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM motoristas').get().n, 0);
});

test('arquivo recusado: pede para reenviar em formato aceito; pendente de classificação: avisa que a equipe confere', async () => {
  const { receber, ia, respostas, conv, db } = montar();
  await receber('oi');
  const base = recebidosFalsoDe(db);
  ia.definirRecebidos({ ...base, daMensagem: () => ({ situacao: 'recusado', categoria: null }) });
  await receber('[documento] arquivo.pdf');
  assert.match(respostas().pop(), /Não consegui receber esse arquivo/);
  assert.equal(conv().atendimento, 'ia');
  ia.definirRecebidos({ ...base, daMensagem: () => ({ situacao: 'pendente_classificacao', categoria: null }) });
  await receber('[imagem] 📎 Tipo: Foto do veículo\nCor: Prata');
  const m = respostas().pop();
  assert.match(m, /Nossa equipe vai conferir qual documento é esse arquivo/);
  assert.match(m, /Agora, envie também a foto da CNH/);
});
function recebidosFalsoDe(db) { return recebidosFalso(db); }

test('os 4 botões do site: todos registram origem "Site"; só "Quero ser motorista" abre o cadastro; "Vim pelo site" recebe o menu', async () => {
  const casos = [
    ['Olá! Vim pelo site da Fortaleza Move.', 'cadastro', null],
    ['Olá! Quero ser motorista da Fortaleza Move.', 'cadastro', 'cadastro'],
    ['Olá! Quero saber mais sobre corridas e encomendas da Fortaleza Move.', 'encomendas', 'encomendas'],
    ['Olá! Tenho um comércio e quero entregas pela Fortaleza Move.', 'encomendas', 'encomendas']
  ];
  for (const [texto, opcaoDaIA, esperado] of casos) {
    const { receber, conv, estado, respostas } = montar();
    estado.analise = { resumo: 'x', perfil: 'desconhecido', campos: {}, atendimento: { opcao: opcaoDaIA, transferir: false } };
    estado.redacao = { resposta: 'Certo! Vou te ajudar com isso.' };
    await receber(texto);
    assert.equal(conv().origem_contato, 'Site', texto);
    assert.equal(conv().atend_assunto || null, esperado, texto);
    const m = respostas().pop();
    if (!esperado) assert.match(m, /Para direcionarmos seu atendimento/, texto);
    if (esperado !== 'cadastro') assert.doesNotMatch(m, /CNH|antecedentes|CRLV/, texto);
  }
});
