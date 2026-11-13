'use strict';
// Preparação para a operação real (13/11/2026, pedido do dono): contato pessoal (família/amigos no número do atendimento),
// conversa informal/pergunta inesperada e a barreira contra confirmar cadastro/aprovação ou prometer o que não foi liberado.
// SIMULADO: provedor de IA e canal falsos. Não comprova o funcionamento com o WhatsApp e o Gemini reais.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { recebidosFalso, tipoDoTexto } = require('./apoio/recebidos-falso');

function montar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-oper-'));
  process.env.FM_DATA_DIR = dir;
  process.env.IA_ATRASO_MS = '0';
  process.env.IA_CONFIRMACAO_MS = '20';
  process.env.IA_REPETIR_MS = '0,0';
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db, getSetting, setSetting, nowISO } = require('../src/db');
  const { todayISO } = require('../src/http');
  const entities = require('../src/entities');
  const { ENTITIES } = require('../src/defs');
  const { createStore } = require('../src/whatsapp/store');
  const { createIaService } = require('../src/ia/service');
  const waStore = createStore(db);
  const estado = {
    analise: { resumo: 'x', perfil: 'desconhecido', campos: {}, atendimento: { opcao: 'indefinido', transferir: false } },
    redacao: { resposta: 'Certo! Posso ajudar com isso.' }, chamadas: 0, prompts: []
  };
  const provider = {
    completar: async ({ system, user }) => {
      estado.chamadas += 1;
      const redigir = /Central de Atendimento/.test(system);
      estado.prompts.push({ redigir, system, user });
      return { texto: JSON.stringify(redigir ? estado.redacao : estado.analise), modelo: 'falso', tokensEntrada: 1, tokensSaida: 1 };
    }
  };
  const cofre = { ler: () => 'chave-falsa-0000000000000', final4: () => '0000', origem: () => 'arquivo', salvar() {}, apagar() {} };
  const ia = createIaService({ db, waStore, entities, ENTITIES, audit: () => {}, getSetting, setSetting, cofre, provider, todayISO, nowISO, log: { log() {}, error() {} } });
  ia.definirRecebidos(recebidosFalso(db));
  setSetting('ia_ativo', '1'); setSetting('ia_modo', 'automatico'); setSetting('ia_responder', '1');
  db.prepare("INSERT INTO users (id, nome, email, senha_hash, role, created_at, updated_at) VALUES (1, 'Dono Fictício', 'dono@x.com', 'x', 'admin', ?, ?)").run(nowISO(), nowISO());
  let n = 0;
  const receber = async (texto) => {
    n += 1;
    const r = waStore.ingerir({ jid: '5564999990001@s.whatsapp.net', telefone: '5564999990001', nome: 'Tia Fictícia', externoId: `P${n}`, texto, tipo: tipoDoTexto(texto), quando: new Date(Date.now() + n).toISOString(), deMim: false });
    ia.registrarChegada(r.conversaId, r.mensagemId);
    await ia.executarAutomatico(r.conversaId);
    return r;
  };
  const daIA = () => db.prepare("SELECT texto, tipo FROM wa_mensagens WHERE origem = 'ia' ORDER BY id").all();
  const conv = () => db.prepare('SELECT * FROM wa_conversas').get();
  const espere = (ms) => new Promise((ok) => setTimeout(ok, ms));
  return { db, ia, waStore, receber, daIA, conv, estado, espere };
}

test('contato pessoal: a IA não analisa, não confirma, não responde e não cria cadastro; desmarcado, volta a atender', async () => {
  const { receber, waStore, daIA, conv, estado, espere, ia, db } = montar();
  const r = await receber('Oi');
  assert.ok(daIA().length > 0, 'contato comum recebe o atendimento da IA');
  const antes = daIA().length;
  const chamadas = estado.chamadas;
  assert.equal(waStore.definirPessoal(waStore.obterConversa(r.conversaId).contato_id, true), true);
  assert.equal(waStore.obterConversa(r.conversaId).pessoal, 1);
  await receber('Filho, vem almoçar domingo? Traz o carregador do celular');
  await espere(60); // passa do tempo da confirmação rápida
  assert.equal(daIA().length, antes, 'nenhuma mensagem nova da IA (nem a confirmação rápida)');
  assert.equal(estado.chamadas, chamadas, 'nenhuma chamada ao Gemini (não gasta cota)');
  assert.equal(conv().ia_erro, 'contato_pessoal');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM passageiros').get().n + db.prepare('SELECT COUNT(*) n FROM motoristas').get().n, 0, 'nenhum cadastro criado');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE direcao = 'in'").get().n, 2, 'a mensagem continua guardada');
  assert.deepEqual(ia.recuperarPendentes(), [], 'a varredura não insiste na conversa pessoal');
  waStore.definirPessoal(waStore.obterConversa(r.conversaId).contato_id, false);
  await receber('Ah, e como funciona o Clube de Vantagens?');
  assert.ok(daIA().length > antes, 'desmarcado: a IA volta a atender');
});

test('prompt da redação: regras de conversa informal, pergunta inesperada, cadastro não confirmado e sem link de cadastro', async () => {
  const P = require('../src/ia/prompt');
  const s = P.SISTEMA_RESPOSTA;
  assert.match(s, /Conversa informal/);
  assert.match(s, /Pergunta inesperada/);
  assert.match(s, /"já pode"/);
  assert.match(s, /Não indique link, loja de aplicativos, formulário/);
  assert.match(s, /Nunca invente informação/);
  const C = require('../src/ia/central');
  assert.match(C.FLUXOS.cadastro, /nunca diga que o cadastro foi feito ou aprovado/);
});

test('barreira: resposta da IA que confirma cadastro/aprovação ou promete não é enviada; frases neutras passam', async () => {
  const P = require('../src/ia/prompt');
  for (const t of ['Seu cadastro foi aprovado!', 'Você já pode começar a rodar hoje.', 'Você está aprovado, parabéns',
    'Garantimos corridas todos os dias.', 'Sua documentação está completa e confirmada.', 'Sua conta foi liberada.']) {
    assert.deepEqual(P.respostaSegura(t), { ok: false, motivo: 'promessa' }, t);
  }
  for (const t of ['Seu cadastro ainda não foi aprovado; a equipe vai analisar.', 'Recebemos seus documentos e a equipe vai analisar.',
    'A aprovação é feita pela nossa equipe.', 'Oi! Tudo bem por aqui. Posso ajudar com algo da Fortaleza Move?']) {
    assert.deepEqual(P.respostaSegura(t), { ok: true }, t);
  }
  const { receber, daIA, estado } = montar();
  await receber('4'); // escolhe cadastro de motorista
  const antes = daIA().length;
  estado.redacao = { resposta: 'Pronto, seu cadastro foi aprovado e você já pode rodar!' };
  const r = await receber('E aí, já posso começar?');
  assert.ok(!daIA().slice(antes).some((m) => /aprovado|já pode/.test(m.texto)), 'a promessa não foi enviada ao cliente');
  assert.ok(r);
});

/* --------------- 13/11 (teste real do dono): novo atendimento, saudação de retorno, abertura da opção --------------- */
test('conversa parada há mais de 12 h (sem ninguém concluir): a próxima mensagem abre NOVO atendimento com saudação de retorno + menu', async () => {
  const { receber, daIA, conv, db, waStore } = montar();
  await receber('Oi'); // 1º contato da vida: saudação inicial + menu
  assert.match(daIA()[0].texto, /^Olá! Seja bem-vindo/);
  await receber('4');
  assert.equal(conv().atend_assunto, 'cadastro');
  // Simula: ficou parada 13 h (a conversa continua "com a IA", ninguém concluiu)
  db.prepare('UPDATE wa_conversas SET ultima_em = ?').run(new Date(Date.now() - 13 * 3600000).toISOString());
  await receber('Olá! Vim pelo site da Fortaleza Move.');
  const ultima = daIA().pop().texto;
  assert.match(ultima, /^Olá! A Fortaleza Move agradece por entrar em contato conosco novamente/, 'saudação de retorno');
  assert.match(ultima, /Para direcionarmos seu atendimento/, 'e o menu');
  assert.equal(conv().atend_assunto, null, 'o assunto antigo (cadastro) não é reaproveitado');
  const ev = db.prepare("SELECT tipo, detalhe FROM wa_eventos WHERE tipo = 'reaberta'").all();
  assert.ok(ev.some((e) => /mais de 12 h sem conversa/.test(e.detalhe)), 'fica registrado no histórico');
  assert.ok(waStore);
});

test('clicou de novo no botão do site no meio de um atendimento: novo atendimento com saudação de retorno + menu', async () => {
  const { receber, daIA, conv } = montar();
  await receber('Oi');
  await receber('2');
  assert.match(daIA().pop().texto, /Sobre encomendas, escolha uma das opções/, 'opção 2: segundo menu de encomendas');
  await receber('1');
  assert.match(daIA().pop().texto, /^Certo! Para a coleta e entrega/, 'opção 2.1: abertura profissional da opção');
  await receber('Olá! Vim pelo site da Fortaleza Move.');
  const ultima = daIA().pop().texto;
  assert.match(ultima, /^Olá! A Fortaleza Move agradece por entrar em contato conosco novamente/);
  assert.match(ultima, /4\. Cadastro de motorista e veículo\./);
  assert.equal(conv().atend_assunto, null);
});

test('encerramento automático: conversa com a IA parada vira concluída; transferida aguardando a equipe não', async () => {
  const { receber, ia, conv, db, waStore } = montar();
  await receber('Oi');
  db.prepare('UPDATE wa_conversas SET ultima_em = ?').run(new Date(Date.now() - 13 * 3600000).toISOString());
  assert.equal(ia.encerrarInativas().length, 1);
  assert.equal(conv().atendimento, 'concluido');
  assert.match(db.prepare("SELECT detalhe FROM wa_eventos WHERE tipo = 'concluida'").get().detalhe, /automaticamente após 12 h/);
  // Volta a escrever: novo atendimento; depois, transferida e parada → continua aguardando a equipe.
  await receber('quero falar com um atendente');
  assert.equal(conv().atendimento, 'aguardando');
  db.prepare('UPDATE wa_conversas SET ultima_em = ?').run(new Date(Date.now() - 13 * 3600000).toISOString());
  assert.equal(ia.encerrarInativas().length, 0);
  assert.equal(conv().atendimento, 'aguardando');
  assert.ok(waStore);
});

test('configuração 0 desliga o novo atendimento por tempo e o encerramento automático', async () => {
  const { receber, ia, conv, db } = montar();
  ia.salvarConfig({ novoAtendimentoHoras: 0 });
  await receber('Oi');
  await receber('1');
  db.prepare('UPDATE wa_conversas SET ultima_em = ?').run(new Date(Date.now() - 48 * 3600000).toISOString());
  assert.equal(ia.encerrarInativas().length, 0);
  await receber('E aí, como faço para chamar uma corrida?');
  assert.equal(conv().atend_assunto, 'passageiro', 'continua o mesmo atendimento');
  assert.throws(() => ia.salvarConfig({ novoAtendimentoHoras: 500 }), /entre 0 e 168/);
});

test('filtro de anotação interna: trecho que também está na conversa ou no menu não bloqueia a resposta (falso positivo de 13/11)', () => {
  const P = require('../src/ia/prompt');
  const internos = ['Cliente escolheu a opção coleta e entrega de encomendas e quer enviar uma caixa'];
  const t = 'Certo! Para a coleta e entrega de encomendas, me diga o endereço de coleta.';
  assert.deepEqual(P.respostaSegura(t, { internos }), { ok: false, motivo: 'dado_interno' }, 'sem os textos públicos, bloqueava');
  assert.deepEqual(P.respostaSegura(t, { internos, publicos: ['3. Coleta e entrega de encomendas.'] }), { ok: true });
  assert.deepEqual(P.respostaSegura('Anotação: cliente devedor de multa antiga', { internos: ['cliente devedor de multa antiga na Central'], publicos: ['oi'] }),
    { ok: false, motivo: 'dado_interno' }, 'anotação de verdade continua bloqueada');
});
