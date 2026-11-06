'use strict';
// Central de Atendimento Inteligente: modelos de mensagem editáveis, menu inicial, assuntos e motivos de transferência.
// Lógica pura (testável): recebe getSetting/setSetting; não fala com IA nem com WhatsApp.

const ESTADOS = {
  ia: 'IA atendendo',
  aguardando: 'Aguardando atendimento humano',
  humano: 'Atendimento humano',
  concluido: 'Concluído'
};

// Opções do menu (o número digitado pelo cliente escolhe o assunto).
const ASSUNTOS = {
  cadastro: { numero: '1', nome: 'Cadastro de motorista e veículo' },
  passageiro: { numero: '2', nome: 'Atendimento ao passageiro' },
  encomendas: { numero: '3', nome: 'Coleta e entrega de encomendas' },
  clube: { numero: '4', nome: 'Clube de Vantagens para motoristas' },
  outros: { numero: '5', nome: 'Outros assuntos' }
};
const ASSUNTO_IDS = Object.keys(ASSUNTOS);

// Como a IA deve conduzir cada assunto (instrução do sistema, confiável). As informações oficiais vêm da
// "base de conhecimento" editável; sem informação, a IA encaminha para a equipe em vez de inventar.
const FLUXOS = {
  cadastro: 'Oriente sobre o cadastro de motorista. Peça os documentos: foto da CNH e do documento do veículo (CRLV), um de cada vez se ainda faltarem. Quando chegarem, apenas confirme o RECEBIMENTO (nunca diga que foram analisados ou aprovados). Aprovação ou reprovação é sempre da equipe.',
  passageiro: 'Oriente sobre o uso do aplicativo e viagens e ajude com problemas comuns usando só as informações oficiais. Reclamações que precisem de providência vão para a equipe.',
  encomendas: 'Explique o serviço de coleta e entrega só com as informações oficiais. Entenda o que a pessoa quer enviar ou receber (o quê, de onde, para onde). Nunca informe preço, prazo, disponibilidade ou condições que não estejam nas informações oficiais: orçamento e confirmação são com a equipe.',
  clube: 'Explique os benefícios do Clube de Vantagens, a carteirinha digital e as regras de quem pode participar, só com as informações oficiais. Casos que dependem de análise individual vão para a equipe.',
  outros: 'Entenda o motivo do contato e responda só quando houver informação oficial confiável; senão, encaminhe para a equipe.'
};

const MOTIVOS_TRANSFERENCIA = {
  pediu_humano: 'O cliente pediu atendimento humano',
  aprovacao: 'Precisa de aprovação ou autorização',
  documentos: 'Documentos para análise',
  reclamacao: 'Reclamação que precisa de providência',
  valores: 'Negociação ou definição de valores',
  sem_informacao: 'A IA não tem informação suficiente para responder com segurança'
};

const MODELOS_PADRAO = {
  saudacao: { nome: 'Saudação inicial', texto: 'Olá! Seja bem-vindo(a) à Fortaleza Move!\n\nAgradecemos pelo seu contato. Será um prazer ajudar você!' },
  menu: { nome: 'Apresentação do menu', texto: 'Para direcionarmos seu atendimento, escolha uma das opções:\n\n1. Cadastro de motorista e veículo.\n2. Atendimento ao passageiro.\n3. Coleta e entrega de encomendas.\n4. Clube de Vantagens para motoristas.\n5. Outros assuntos.\n\nDigite o número da opção desejada.' },
  confirmacao_documentos: { nome: 'Confirmação de recebimento de documentos', texto: 'Recebemos o seu documento. Obrigado!' },
  confirmacao_informacoes: { nome: 'Confirmação de recebimento de informações', texto: 'Recebemos as suas informações. Obrigado!' },
  transferencia: { nome: 'Aviso de transferência para atendimento humano', texto: 'Sua solicitação foi encaminhada para nossa equipe de atendimento. Em breve, você receberá um retorno. Agradecemos pelo contato!' },
  espera: { nome: 'Aviso de espera', texto: 'Sua solicitação já está com a nossa equipe. Assim que possível, um atendente vai continuar a conversa. Obrigado pela paciência!' },
  encerramento: { nome: 'Mensagem de encerramento', texto: 'A Fortaleza Move agradece pelo seu contato! Foi um prazer atendê-lo(a).\n\n{site_oficial}\n\nConte sempre com a Fortaleza Move!' },
  site: { nome: 'Divulgação do site oficial', texto: 'Aproveite para conhecer nosso site oficial e conferir informações sobre a plataforma, nossos serviços, benefícios e canais de suporte.\n\nAcesse: {site}' }
};
const MODELO_IDS = Object.keys(MODELOS_PADRAO);
const MAX_MODELO = 1500;
const MAX_INFO = 4000;

function criarCentral({ getSetting, setSetting }) {
  function lerSalvos() {
    try { const v = JSON.parse(getSetting('central_modelos', '{}')); return v && typeof v === 'object' ? v : {}; } catch (err) { return {}; }
  }

  function modelos() {
    const salvos = lerSalvos();
    return MODELO_IDS.map((id) => {
      const s = Object.prototype.hasOwnProperty.call(salvos, id) && salvos[id] && typeof salvos[id] === 'object' ? salvos[id] : {};
      return {
        id, nome: MODELOS_PADRAO[id].nome,
        texto: typeof s.texto === 'string' && s.texto.trim() ? s.texto : MODELOS_PADRAO[id].texto,
        ativo: s.ativo === undefined ? true : !!s.ativo,
        padrao: MODELOS_PADRAO[id].texto
      };
    });
  }

  const siteUrl = () => getSetting('central_site_url', '');

  // Texto final de um modelo (ou '' se estiver desativado). {site_oficial} vira o bloco do site (se houver site e o
  // modelo "site" estiver ativo); {site} vira o endereço. Linhas em branco repetidas são juntadas.
  function texto(id) {
    const m = modelos().find((x) => x.id === id);
    if (!m || !m.ativo) return '';
    const url = siteUrl();
    const blocoSite = () => {
      const s = modelos().find((x) => x.id === 'site');
      return url && s && s.ativo ? s.texto.replace(/\{site\}/g, url) : '';
    };
    let t = m.texto;
    if (id === 'site') t = url ? t.replace(/\{site\}/g, url) : '';
    t = t.replace(/\{site_oficial\}/g, blocoSite).replace(/\{site\}/g, url);
    return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function salvarModelos(lista) {
    if (!Array.isArray(lista)) throw new Error('Formato inválido.');
    const salvos = lerSalvos();
    for (const item of lista) {
      if (!item || !Object.prototype.hasOwnProperty.call(MODELOS_PADRAO, item.id)) throw new Error('Modelo desconhecido.');
      const t = typeof item.texto === 'string' ? item.texto.replace(/\r\n/g, '\n').trim() : '';
      if (t.length > MAX_MODELO) throw new Error(`O texto de "${MODELOS_PADRAO[item.id].nome}" passou de ${MAX_MODELO} caracteres.`);
      salvos[item.id] = { texto: t || MODELOS_PADRAO[item.id].texto, ativo: item.ativo !== false };
    }
    setSetting('central_modelos', JSON.stringify(salvos));
  }

  function salvarSite(url) {
    const u = String(url || '').trim();
    if (u && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(u)) throw new Error('Endereço do site inválido. Use https:// (ex.: https://fortalezamove.com.br).');
    setSetting('central_site_url', u);
  }

  // Base de conhecimento: informações oficiais por assunto (o que a IA pode afirmar).
  function informacoes() {
    const r = {};
    for (const id of ASSUNTO_IDS) r[id] = getSetting(`central_info_${id}`, '');
    r.geral = getSetting('central_info_geral', '');
    return r;
  }
  function salvarInformacoes(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Formato inválido.');
    for (const id of [...ASSUNTO_IDS, 'geral']) {
      if (!Object.prototype.hasOwnProperty.call(obj, id)) continue;
      const t = String(obj[id] || '').replace(/\r\n/g, '\n').trim();
      if (t.length > MAX_INFO) throw new Error(`As informações passaram de ${MAX_INFO} caracteres.`);
      setSetting(`central_info_${id}`, t);
    }
  }

  return { modelos, texto, salvarModelos, siteUrl, salvarSite, informacoes, salvarInformacoes };
}

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// "1", "opção 2", "3." → assunto. Só quando a mensagem é basicamente o número.
function opcaoDoMenu(texto) {
  const t = semAcento(texto).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(?:opcao |numero |op )?([1-5])$/.exec(t);
  if (!m) return null;
  return ASSUNTO_IDS.find((id) => ASSUNTOS[id].numero === m[1]) || null;
}

const pediuMenu = (texto) => /^(menu|opcoes|ver (o )?menu|mostrar (o )?menu|voltar( ao menu)?|inicio)$/.test(semAcento(texto).replace(/[^\w\s]/g, '').trim());

// Pedido explícito de falar com uma pessoa (reforço sem IA).
const pediuHumano = (texto) => /\b(atendente|atendimento humano|falar com (um|uma|alguem|algu[eé]m|uma pessoa|pessoa|humano|gente)|pessoa de verdade|ser humano|humano por favor)\b/.test(semAcento(texto));

module.exports = { ESTADOS, ASSUNTOS, ASSUNTO_IDS, FLUXOS, MOTIVOS_TRANSFERENCIA, MODELOS_PADRAO, MODELO_IDS, criarCentral, opcaoDoMenu, pediuMenu, pediuHumano };
