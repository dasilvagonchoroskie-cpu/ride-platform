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
  await receber('1'); // escolhe cadastro de motorista
  const antes = daIA().length;
  estado.redacao = { resposta: 'Pronto, seu cadastro foi aprovado e você já pode rodar!' };
  const r = await receber('E aí, já posso começar?');
  assert.ok(!daIA().slice(antes).some((m) => /aprovado|já pode/.test(m.texto)), 'a promessa não foi enviada ao cliente');
  assert.ok(r);
});
