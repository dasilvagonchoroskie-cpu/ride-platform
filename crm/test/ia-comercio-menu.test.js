'use strict';
// Menu 5 "Comércio e entregas" e segundo menu (13/11/2026, pedido do dono). Mesma montagem de ia-vida-real (modelo falso que erra
// de propósito: sempre diz 'cadastro'). Conversa ligada a uma ficha, com histórico longo:
// longo: pedidos de atendente, transferências, encerramentos). O modelo falso aqui se comporta como o Gemini real: se o
// texto que ele recebe tiver um pedido de atendente, ele manda transferir. Antes da correção, o histórico antigo fazia o novo
// atendimento ("Vim pelo site") cair direto na equipe. SIMULAÇÃO: não substitui o teste com o WhatsApp e o Gemini reais.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { recebidosFalso, tipoDoTexto } = require('./apoio/recebidos-falso');

function montar() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-real-'));
  process.env.FM_DATA_DIR = dir;
  process.env.IA_ATRASO_MS = '0';
  process.env.IA_CONFIRMACAO_MS = '0';
  process.env.IA_REPETIR_MS = '0,0';
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db, getSetting, setSetting, nowISO } = require('../src/db');
  const { todayISO } = require('../src/http');
  const entities = require('../src/entities');
  const { ENTITIES } = require('../src/defs');
  const { createStore } = require('../src/whatsapp/store');
  const { createIaService } = require('../src/ia/service');
  const waStore = createStore(db);
  const vistos = [];
  const provider = {
    completar: async ({ system, user }) => {
      const redigir = /Central de Atendimento/.test(system);
      vistos.push({ redigir, user });
      if (redigir) return { texto: JSON.stringify({ resposta: 'Certo! Pode me contar mais, por favor?' }), modelo: 'falso' };
      // Como o modelo real: qualquer pedido de atendente no texto recebido → transferir.
      const pediu = /atendente|falar com (uma )?pessoa/i.test(user);
      return { texto: JSON.stringify({ resumo: 'x', perfil: 'motorista', campos: {}, atendimento: { opcao: 'cadastro', transferir: pediu, motivo_transferencia: pediu ? 'pediu_humano' : undefined } }), modelo: 'falso' };
    }
  };
  const cofre = { ler: () => 'chave-falsa-0000000000000', final4: () => '0000', origem: () => 'arquivo', salvar() {}, apagar() {} };
  const ia = createIaService({ db, waStore, entities, ENTITIES, audit: () => {}, getSetting, setSetting, cofre, provider, todayISO, nowISO, log: { log() {}, error() {} } });
  ia.definirRecebidos(recebidosFalso(db));
  setSetting('ia_ativo', '1'); setSetting('ia_modo', 'automatico'); setSetting('ia_responder', '1');
  const t = nowISO();
  db.prepare("INSERT INTO users (id, nome, email, senha_hash, role, created_at, updated_at) VALUES (1, 'Dono Fictício', 'dono@x.com', 'x', 'admin', ?, ?)").run(t, t);
  const motoristaId = db.prepare("INSERT INTO motoristas (nome, telefone, cidade, data_primeiro_contato, origem, situacao, created_at, updated_at) VALUES ('Fulano Fictício', '5564999990009', 'Goiatuba', '2026-11-12', 'WhatsApp', 'Novo interessado', ?, ?)").run(t, t).lastInsertRowid;
  let n = 0;
  const receber = async (texto, extra = {}) => {
    n += 1;
    const r = waStore.ingerir({ jid: '5564999990009@s.whatsapp.net', telefone: '5564999990009', nome: 'Fulano Fictício', externoId: `R${n}`, texto, tipo: tipoDoTexto(texto), quando: new Date(Date.now() + n).toISOString(), deMim: false, ...extra });
    if (n === 1) waStore.definirVinculo(waStore.obterConversa(r.conversaId).contato_id, 'motoristas', motoristaId);
    ia.registrarChegada(r.conversaId, r.mensagemId);
    await ia.executarAutomatico(r.conversaId);
    await new Promise((ok) => setTimeout(ok, 3));
    return r;
  };
  const daIA = () => db.prepare("SELECT texto FROM wa_mensagens WHERE origem = 'ia' AND tipo <> 'aviso' ORDER BY id").all().map((m) => m.texto);
  const conv = () => db.prepare('SELECT * FROM wa_conversas').get();
  const concluir = () => waStore.mudarAtendimento(conv().id, 'concluido', { usuarioId: 1 });
  return { receber, daIA, conv, concluir, vistos, db, waStore };
}


const SUBMENU = /Sobre comércio e entregas, escolha uma das opções/;

test('menu principal tem 6 itens e o 5 abre o segundo menu de comércio (mesmo com a análise errando para "cadastro")', async () => {
  const { receber, daIA, conv } = montar();
  await receber('Oi');
  assert.match(daIA()[0], /5\. Comércio e entregas\.\n6\. Outros assuntos\./);
  await receber('5');
  assert.match(daIA().pop(), SUBMENU);
  assert.equal(conv().atend_assunto, 'comercio');
  assert.equal(conv().atendimento, 'ia');
});

test('segundo menu: 1 cadastrado, 2 cadastrar, 3 aguardando encomenda, 4 outras informações', async () => {
  const esperado = [
    ['1', 'comercio_cadastrado', /nome do seu estabelecimento e como podemos ajudar/],
    ['2', 'comercio_cadastrar', /nome do estabelecimento;/],
    ['3', 'comercio_aguardando', /Para a nossa equipe verificar a sua encomenda/],
    ['4', 'comercio_outros', /o que você gostaria de saber sobre comércio e entregas/]
  ];
  for (const [num, assunto, re] of esperado) {
    const { receber, daIA, conv } = montar();
    await receber('Oi');
    await receber('5');
    await receber(num);
    assert.match(daIA().pop(), re, `opção ${num}`);
    assert.equal(conv().atend_assunto, assunto);
    assert.equal(conv().atendimento, 'ia', 'não vai para a equipe só por escolher a opção');
  }
});

test('depois de escolher no segundo menu, os números voltam a valer para o menu principal e a análise não troca o assunto', async () => {
  const { receber, daIA, conv } = montar();
  await receber('Oi'); await receber('5'); await receber('3');
  assert.equal(conv().atend_assunto, 'comercio_aguardando');
  await receber('estou esperando uma pizza da Pizzaria Fictícia, rua das Flores');
  assert.equal(conv().atend_assunto, 'comercio_aguardando', 'a análise (que diz cadastro) não muda o assunto');
  await receber('1');
  assert.match(daIA().pop(), /7 itens/, '1 agora é o menu principal (cadastro de motorista)');
  assert.equal(conv().atend_assunto, 'cadastro');
});

test('botão do site "Tenho um comércio" vira comércio_cadastrar; novo atendimento recomeça pelo menu de 6 itens', async () => {
  const { receber, daIA, conv, concluir } = montar();
  await receber('Olá! Tenho um comércio e quero entregas pela Fortaleza Move.');
  assert.equal(conv().atend_assunto, 'comercio_cadastrar');
  concluir();
  await receber('Olá! Vim pelo site da Fortaleza Move.');
  assert.match(daIA().pop(), /6\. Outros assuntos\./);
  assert.equal(conv().atend_assunto, null);
  await receber('6');
  assert.match(daIA().pop(), /Escreva, por favor, o assunto do seu contato/);
});

test('menu salvo sem alteração (padrão antigo de 5 opções) passa a usar o novo; menu editado pelo dono não muda', () => {
  const { criarCentral, MODELOS_PADRAO } = require('../src/ia/central');
  const mem = {};
  const central = criarCentral({ getSetting: (k, d) => (k in mem ? mem[k] : d), setSetting: (k, v) => { mem[k] = v; } });
  const antigo = 'Para direcionarmos seu atendimento, escolha uma das opções:\r\n\r\n1. Cadastro de motorista e veículo.\r\n2. Atendimento ao passageiro.\r\n3. Coleta e entrega de encomendas.\r\n4. Clube de Vantagens para motoristas.\r\n5. Outros assuntos.\r\n\r\nDigite o número da opção desejada.';
  mem.central_modelos = JSON.stringify({ menu: { texto: antigo, ativo: true } });
  assert.equal(central.texto('menu'), MODELOS_PADRAO.menu.texto);
  mem.central_modelos = JSON.stringify({ menu: { texto: 'Menu do dono: 1. A 2. B', ativo: true } });
  assert.equal(central.texto('menu'), 'Menu do dono: 1. A 2. B');
});
