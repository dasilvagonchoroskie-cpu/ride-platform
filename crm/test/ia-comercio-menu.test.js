'use strict';
// Menu por público (passageiros e clientes / comércios / motoristas / outros) e segundos menus de encomendas (2) e comércios (3) (13/11/2026, pedido do dono). Mesma montagem de ia-vida-real (modelo falso que erra
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


const MENU_ENC = /Sobre encomendas, escolha uma das opções/;
const MENU_COM = /Sobre comércios, escolha uma das opções/;

test('menu principal separa por público; 2 abre o segundo menu de encomendas e 3 o de comércios (mesmo com a análise errando para "cadastro")', async () => {
  const { receber, daIA, conv } = montar();
  await receber('Oi');
  const menu = daIA()[0];
  assert.match(menu, /\*Passageiros e clientes\*\n1\. Atendimento ao passageiro\.\n2\. Enviar ou receber uma encomenda\./);
  assert.match(menu, /\*Comércios\*\n3\. Sou comerciante ou quero entregas para o meu comércio\./);
  assert.match(menu, /\*Motoristas\*\n4\. Cadastro de motorista e veículo\.\n5\. Clube de Vantagens para motoristas\./);
  assert.match(menu, /\*Outros\*\n6\. Outros assuntos\./);
  assert.doesNotMatch(menu, /Coleta e entrega de encomendas|Comércio e entregas/, 'sem a repetição de coleta/entrega que confundia');
  await receber('2');
  assert.match(daIA().pop(), MENU_ENC);
  assert.equal(conv().atend_assunto, 'encomendas_menu');
  await receber('0');
  await receber('3');
  assert.match(daIA().pop(), MENU_COM);
  assert.equal(conv().atend_assunto, 'comercio_menu');
  assert.equal(conv().atendimento, 'ia');
});

test('segundo menu de encomendas (cliente): 1 solicitar, 2 aguardando, 3 outras informações', async () => {
  const esperado = [
    ['1', 'encomendas_solicitar', /Para a coleta e entrega, informe/],
    ['2', 'encomendas_aguardando', /Para a nossa equipe verificar a sua encomenda/],
    ['3', 'encomendas_outros', /o que você gostaria de saber sobre coleta e entrega de encomendas/]
  ];
  for (const [num, assunto, re] of esperado) {
    const { receber, daIA, conv } = montar();
    await receber('Oi'); await receber('2'); await receber(num);
    assert.match(daIA().pop(), re, `opção ${num}`);
    assert.equal(conv().atend_assunto, assunto);
    assert.equal(conv().atendimento, 'ia', 'não vai para a equipe só por escolher a opção');
  }
});

test('segundo menu de comércios (comerciante): 1 cadastrado, 2 cadastrar, 3 outras informações', async () => {
  const esperado = [
    ['1', 'comercio_cadastrado', /nome do seu estabelecimento e como podemos ajudar/],
    ['2', 'comercio_cadastrar', /nome do estabelecimento;/],
    ['3', 'comercio_outros', /como comerciante ou sobre o cadastro do seu comércio/]
  ];
  for (const [num, assunto, re] of esperado) {
    const { receber, daIA, conv } = montar();
    await receber('Oi'); await receber('3'); await receber(num);
    assert.match(daIA().pop(), re, `opção ${num}`);
    assert.equal(conv().atend_assunto, assunto);
    assert.equal(conv().atendimento, 'ia');
  }
});

test('depois de escolher no segundo menu, os números voltam a valer para o menu principal e a análise não troca o assunto', async () => {
  const { receber, daIA, conv } = montar();
  await receber('Oi'); await receber('2'); await receber('2');
  assert.equal(conv().atend_assunto, 'encomendas_aguardando');
  await receber('estou esperando uma pizza da Pizzaria Fictícia, rua das Flores');
  assert.equal(conv().atend_assunto, 'encomendas_aguardando', 'a análise (que diz cadastro) não muda o assunto');
  await receber('4');
  assert.match(daIA().pop(), /7 itens/, '4 agora é o menu principal (cadastro de motorista)');
  assert.equal(conv().atend_assunto, 'cadastro');
});

test('digitar texto com o segundo menu aberto não troca o assunto; números 4 a 6 voltam ao menu principal', async () => {
  const { receber, daIA, conv } = montar();
  await receber('Oi'); await receber('3');
  await receber('quero entregas para a minha loja');
  assert.equal(conv().atend_assunto, 'comercio_menu');
  await receber('1');
  assert.equal(conv().atend_assunto, 'comercio_cadastrado');
  const m = montar();
  await m.receber('Oi'); await m.receber('2'); await m.receber('6');
  assert.equal(m.conv().atend_assunto, 'outros', '6 dentro do menu de encomendas = menu principal (outros)');
});

test('conversa antiga com assunto "comercio_aguardando" (rc.5/rc.6) é entendida como encomendas_aguardando', () => {
  const C = require('../src/ia/central');
  assert.equal(C.assuntoBase('comercio_aguardando'), 'encomendas');
  assert.equal(C.nomeDoAssunto('comercio_aguardando'), C.SUBASSUNTOS.encomendas_aguardando.nome);
  assert.equal(C.fluxoDe('comercio_aguardando'), 'encomendas_aguardando');
  assert.equal(C.fluxoDe('encomendas_menu'), 'encomendas');
});

test('botão do site "Tenho um comércio" vira comercio_cadastrar; novo atendimento recomeça pelo menu por público', async () => {
  const { receber, daIA, conv, concluir } = montar();
  await receber('Olá! Tenho um comércio e quero entregas pela Fortaleza Move.');
  assert.equal(conv().atend_assunto, 'comercio_cadastrar');
  concluir();
  await receber('Olá! Vim pelo site da Fortaleza Move.');
  assert.match(daIA().pop(), /\*Outros\*\n6\. Outros assuntos\./);
  assert.equal(conv().atend_assunto, null);
  await receber('6');
  assert.match(daIA().pop(), /Escreva, por favor, o assunto do seu contato/);
});

test('menus salvos SEM alteração (padrões antigos) passam a usar os novos; texto editado pelo dono não muda', () => {
  const { criarCentral, MODELOS_PADRAO } = require('../src/ia/central');
  const mem = {};
  const central = criarCentral({ getSetting: (k, d) => (k in mem ? mem[k] : d), setSetting: (k, v) => { mem[k] = v; } });
  const v1 = 'Para direcionarmos seu atendimento, escolha uma das opções:\r\n\r\n1. Cadastro de motorista e veículo.\r\n2. Atendimento ao passageiro.\r\n3. Coleta e entrega de encomendas.\r\n4. Clube de Vantagens para motoristas.\r\n5. Outros assuntos.\r\n\r\nDigite o número da opção desejada.';
  const v2 = 'Para direcionarmos seu atendimento, escolha uma das opções:\n\n1. Cadastro de motorista e veículo.\n2. Atendimento ao passageiro.\n3. Coleta e entrega de encomendas.\n4. Clube de Vantagens para motoristas.\n5. Comércio e entregas.\n6. Outros assuntos.\n\nDigite o número da opção desejada.';
  const com2 = 'Certo! Sobre comércio e entregas, escolha uma das opções:\n\n1. Já sou comerciante cadastrado.\n2. Quero cadastrar o meu comércio.\n3. Estou aguardando uma encomenda ou entrega.\n4. Outras informações.\n\n0. Voltar ao menu inicial.\n\nDigite o número da opção desejada.';
  for (const antigo of [v1, v2]) {
    mem.central_modelos = JSON.stringify({ menu: { texto: antigo, ativo: true } });
    assert.equal(central.texto('menu'), MODELOS_PADRAO.menu.texto);
  }
  mem.central_modelos = JSON.stringify({ menu_comercio: { texto: com2, ativo: true } });
  assert.equal(central.texto('menu_comercio'), MODELOS_PADRAO.menu_comercio.texto);
  mem.central_modelos = JSON.stringify({ menu: { texto: 'Menu do dono: 1. A 2. B', ativo: true } });
  assert.equal(central.texto('menu'), 'Menu do dono: 1. A 2. B');
});

test('opção 0 volta ao menu inicial dos segundos menus e de qualquer opção; os números voltam a valer para o menu principal', async () => {
  const { receber, daIA, conv } = montar();
  await receber('Oi'); await receber('3');
  assert.match(daIA().pop(), /0\. Voltar ao menu inicial\./);
  await receber('0');
  assert.match(daIA().pop(), /\*Outros\*\n6\. Outros assuntos\./, '0 reabre o menu inicial');
  assert.equal(conv().atend_assunto, null);
  await receber('4');
  assert.match(daIA().pop(), /7 itens/, 'depois do 0, o 4 é cadastro de motorista');
  assert.match(daIA().pop(), /Para voltar ao menu inicial, digite 0\./);
  await receber('0');
  assert.match(daIA().pop(), /Para direcionarmos seu atendimento/);
  assert.equal(conv().atendimento, 'ia', '0 nunca manda para a equipe');
});
