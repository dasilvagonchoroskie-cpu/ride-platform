'use strict';
// Central de Atendimento Inteligente: modelos de mensagem editáveis, menu inicial, assuntos e motivos de transferência.
// Lógica pura (testável): recebe getSetting/setSetting; não fala com IA nem com WhatsApp.

const ESTADOS = {
  ia: 'IA atendendo',
  aguardando: 'Aguardando atendimento humano',
  humano: 'Atendimento humano',
  concluido: 'Concluído'
};

// Opções do menu, organizadas por PÚBLICO (13/11, pedido do dono): passageiros e clientes (1-2), comércios (3), motoristas (4-5), outros (6).
// O número digitado pelo cliente escolhe o assunto.
const ASSUNTOS = {
  passageiro: { numero: '1', nome: 'Atendimento ao passageiro' },
  encomendas: { numero: '2', nome: 'Encomendas (enviar ou receber)' },
  comercio: { numero: '3', nome: 'Comércios' },
  cadastro: { numero: '4', nome: 'Cadastro de motorista e veículo' },
  clube: { numero: '5', nome: 'Clube de Vantagens para motoristas' },
  outros: { numero: '6', nome: 'Outros assuntos' }
};
const ASSUNTO_IDS = Object.keys(ASSUNTOS);

// "Encomendas" (opção 2) e "Comércios" (opção 3) têm um segundo menu cada. Enquanto o segundo menu está aberto, o assunto do
// atendimento (atend_assunto) é "<pai>_menu" e 1-3 escolhem a opção DELE; escolhida a opção, o assunto vira um dos abaixo e os
// números voltam a valer para o menu principal.
const SUBASSUNTOS = {
  encomendas_solicitar: { pai: 'encomendas', numero: '1', nome: 'Encomendas — quero solicitar uma coleta e entrega', modelo: 'abertura_encomendas' },
  encomendas_aguardando: { pai: 'encomendas', numero: '2', nome: 'Encomendas — aguardo uma encomenda', modelo: 'abertura_encomendas_aguardando' },
  encomendas_outros: { pai: 'encomendas', numero: '3', nome: 'Encomendas — outras informações', modelo: 'abertura_encomendas_outros' },
  comercio_cadastrado: { pai: 'comercio', numero: '1', nome: 'Comércios — já sou comerciante cadastrado', modelo: 'abertura_comercio_cadastrado' },
  comercio_cadastrar: { pai: 'comercio', numero: '2', nome: 'Comércios — quero cadastrar meu comércio', modelo: 'abertura_comercio' },
  comercio_outros: { pai: 'comercio', numero: '3', nome: 'Comércios — outras informações', modelo: 'abertura_comercio_outros' }
};
const SUBASSUNTO_IDS = Object.keys(SUBASSUNTOS);
const MENUS_SUB = { encomendas: 'menu_encomendas', comercio: 'menu_comercio' };
const LEGADO = { comercio_aguardando: 'encomendas_aguardando' }; // atendimentos abertos na rc.5/rc.6
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const normalizarAssunto = (id) => (tem(LEGADO, id) ? LEGADO[id] : id);
/** Assunto "pai" (cadastro, passageiro, encomendas, clube, comercio, outros) de qualquer valor de atend_assunto. */
function assuntoBase(id) {
  id = normalizarAssunto(id);
  if (tem(SUBASSUNTOS, id)) return SUBASSUNTOS[id].pai;
  if (typeof id === 'string' && id.endsWith('_menu') && tem(MENUS_SUB, id.slice(0, -5))) return id.slice(0, -5);
  return id;
}
/** Dentro de um segundo menu (aberto ou já escolhido): a análise da IA não troca o assunto. */
const emSubfluxo = (id) => typeof id === 'string' && /_/.test(normalizarAssunto(id));
function nomeDoAssunto(id) {
  id = normalizarAssunto(id);
  if (tem(SUBASSUNTOS, id)) return SUBASSUNTOS[id].nome;
  const base = assuntoBase(id);
  return tem(ASSUNTOS, base) ? ASSUNTOS[base].nome : '';
}
/** Chave de FLUXOS que vale para um assunto (a própria, ou a do pai quando só o pai tem fluxo). */
function fluxoDe(id) {
  id = normalizarAssunto(id);
  if (tem(FLUXOS, id)) return id;
  const base = assuntoBase(id);
  return tem(FLUXOS, base) ? base : null;
}

// Como a IA deve conduzir cada assunto (instrução do sistema, confiável). As informações oficiais vêm da
// "base de conhecimento" editável; sem informação, a IA encaminha para a equipe em vez de inventar.
const FLUXOS = {
  cadastro: 'Oriente sobre o cadastro de motorista. Os 7 itens obrigatórios são: foto da CNH; documento do veículo (CRLV ou equivalente aceito); comprovante de residência; certidão de antecedentes criminais; foto do veículo de frente; foto do veículo de lado; foto do veículo de traseira (as três fotos são itens separados). Peça o que ainda faltar, um ou dois de cada vez. Quando chegarem, apenas confirme o RECEBIMENTO (nunca diga que foram analisados ou aprovados). Aprovação e cadastro oficial são sempre da equipe: nunca diga que o cadastro foi feito ou aprovado, nem que a pessoa já pode rodar, e não indique link, loja de aplicativos ou formulário de cadastro.',
  passageiro: 'Oriente sobre o uso do aplicativo e viagens e ajude com problemas comuns usando só as informações oficiais. Reclamações que precisem de providência vão para a equipe.',
  encomendas: 'Atenda quem quer enviar ou receber uma encomenda. Descubra se a pessoa quer solicitar uma coleta e entrega, aguarda uma encomenda que ainda não chegou ou tem outra dúvida. Nunca informe preço, prazo, disponibilidade ou condições que não estejam nas informações oficiais: orçamento e confirmação são com a equipe.',
  encomendas_solicitar: 'A pessoa quer solicitar uma coleta e entrega. Entenda o que ela quer enviar, de onde sai e para onde vai. Nunca informe preço, prazo, disponibilidade ou condições que não estejam nas informações oficiais: orçamento e confirmação são com a equipe.',
  encomendas_aguardando: 'A pessoa é cliente (de um comércio ou de quem enviou) e aguarda uma encomenda ou entrega que ainda não chegou. Você não consegue consultar pedidos nem rastrear entregas: nunca diga onde está a encomenda nem informe previsão. Reúna: nome do comércio ou de quem enviou, o que estava esperando, o endereço de entrega (rua e bairro) e quando foi feito o pedido, com cordialidade, e encaminhe para a equipe verificar. Se houver reclamação ou urgência, encaminhe.',
  encomendas_outros: 'A pessoa tem outra dúvida sobre coleta e entrega de encomendas. Responda só com as informações oficiais; sem informação, encaminhe para a equipe.',
  clube: 'Explique os benefícios do Clube de Vantagens, a carteirinha digital e as regras de quem pode participar, só com as informações oficiais. Casos que dependem de análise individual vão para a equipe.',
  comercio: 'Atenda comerciantes que procuram a Fortaleza Move. Descubra se a pessoa é comerciante já cadastrado, quer cadastrar um comércio para pedir entregas ou tem outra dúvida. (Quem apenas AGUARDA uma encomenda de um comércio é cliente: use o assunto de encomendas.) Nunca informe preço, taxa, região, prazo ou condição comercial que não esteja nas informações oficiais: valores, contratos e parcerias são com a equipe.',
  comercio_cadastrado: 'A pessoa diz ser comerciante já cadastrado. Entenda o nome do estabelecimento e o que ela precisa (pedido, dúvida, problema). Você não consegue consultar cadastro nem pedidos: não confirme dados, valores ou prazos; reúna o que ela precisa e encaminhe para a equipe.',
  comercio_cadastrar: 'A pessoa quer cadastrar um comércio para pedir entregas. Reúna: nome do estabelecimento, cidade e endereço, o que vende ou costuma entregar e quantas entregas faz por dia ou por semana. Não prometa aprovação, preço, taxa ou prazo; depois de reunir os dados, diga que a equipe entrará em contato. Não indique link, loja de aplicativos ou formulário de cadastro.',
  comercio_outros: 'A pessoa tem outra dúvida como comerciante ou interessada em cadastrar um comércio. Responda só com as informações oficiais; sem informação, encaminhe para a equipe.',
  outros: 'Entenda o motivo do contato e responda só quando houver informação oficial confiável; senão, encaminhe para a equipe.'
};

const MOTIVOS_TRANSFERENCIA = {
  pediu_humano: 'O cliente pediu atendimento humano',
  aprovacao: 'Precisa de aprovação ou autorização',
  documentos: 'Documentos para análise',
  documento_sem_arquivo: 'Documento recebido, mas o arquivo não foi guardado (conferir no celular)',
  reclamacao: 'Reclamação que precisa de providência',
  valores: 'Negociação ou definição de valores',
  sem_informacao: 'A IA não tem informação suficiente para responder com segurança',
  falha_ia: 'A IA não conseguiu responder (falha ou limite do serviço de IA)'
};

const MENU_NOVO = 'Para direcionarmos seu atendimento, escolha uma das opções:\n\n*Passageiros e clientes*\n1. Atendimento ao passageiro.\n2. Enviar ou receber uma encomenda.\n\n*Comércios*\n3. Sou comerciante ou quero entregas para o meu comércio.\n\n*Motoristas*\n4. Cadastro de motorista e veículo.\n5. Clube de Vantagens para motoristas.\n\n*Outros*\n6. Outros assuntos.\n\nDigite o número da opção desejada.';
const MODELOS_PADRAO = {
  saudacao: { nome: 'Saudação inicial', texto: 'Olá! Seja bem-vindo(a) à Fortaleza Move!\n\nAgradecemos pelo seu contato. Será um prazer ajudar você!' },
  // 13/11 (pedido do dono): quem já falou com a Fortaleza Move antes recebe uma saudação de retorno a cada novo atendimento.
  saudacao_retorno: { nome: 'Saudação de retorno (novo atendimento de quem já falou conosco)', texto: 'Olá! A Fortaleza Move agradece por entrar em contato conosco novamente. Em que podemos ajudar desta vez?' },
  menu: { nome: 'Apresentação do menu', texto: MENU_NOVO },
  confirmacao_documentos: { nome: 'Confirmação de recebimento de documentos', texto: 'Recebemos o seu documento. Obrigado!' },
  confirmacao_informacoes: { nome: 'Confirmação de recebimento de informações', texto: 'Recebemos as suas informações. Obrigado!' },
  transferencia: { nome: 'Aviso de transferência para atendimento humano', texto: 'Sua solicitação foi encaminhada para nossa equipe de atendimento. Em breve, você receberá um retorno. Agradecemos pelo contato!' },
  espera: { nome: 'Aviso de espera', texto: 'Sua solicitação já está com a nossa equipe. Assim que possível, um atendente vai continuar a conversa. Obrigado pela paciência!' },
  encerramento: { nome: 'Mensagem de encerramento', texto: 'A Fortaleza Move agradece pelo seu contato! Foi um prazer atendê-lo(a).\n\n{site_oficial}\n\nConte sempre com a Fortaleza Move!' },
  site: { nome: 'Divulgação do site oficial', texto: 'Aproveite para conhecer nosso site oficial e conferir informações sobre a plataforma, nossos serviços, benefícios e canais de suporte.\n\nAcesse: {site}' },
  // 12/11 noite (pedido do dono): retorno rápido enquanto a IA processa, e aviso honesto quando um áudio não pôde ser ouvido.
  recebimento: { nome: 'Confirmação rápida de recebimento (enquanto a IA processa)', texto: 'Recebemos a sua mensagem! Estamos verificando e já respondemos.' },
  audio_nao_compreendido: { nome: 'Áudio que não pôde ser ouvido', texto: 'Desculpe, não consegui ouvir o seu áudio. Pode escrever a sua mensagem, por favor?' },
  // 13/11: arquivo que não pôde ser aceito (formato, tamanho ou PDF com conteúdo ativo). Nada é guardado.
  // 13/11: resposta imediata e profissional quando a pessoa escolhe uma opção do menu (antes de qualquer redação da IA).
  abertura_cadastro: { nome: 'Opção 4 escolhida (cadastro de motorista e veículo)', texto: 'Ótimo! Para a avaliação do seu cadastro de motorista, a nossa equipe precisa de 7 itens: foto da CNH, documento do veículo (CRLV), comprovante de residência, certidão de antecedentes criminais e três fotos do veículo (frente, lado e traseira).\n\nPode começar enviando a foto da sua CNH.' },
  abertura_passageiro: { nome: 'Opção 1 escolhida (atendimento ao passageiro)', texto: 'Certo! Conte, por favor, como podemos ajudar com a sua viagem ou com o aplicativo.' },
  abertura_encomendas: { nome: 'Encomendas, opção 1 (quero solicitar uma coleta e entrega)', texto: 'Certo! Para a coleta e entrega, informe, por favor:\n\n• o que deseja enviar;\n• o endereço de coleta;\n• o endereço de entrega.\n\nCom essas informações, a nossa equipe dá sequência ao seu pedido.' },
  abertura_clube: { nome: 'Opção 5 escolhida (Clube de Vantagens)', texto: 'Certo! Conte, por favor, o que você gostaria de saber sobre o Clube de Vantagens para motoristas.' },
  abertura_outros: { nome: 'Opção 6 escolhida (outros assuntos)', texto: 'Certo! Escreva, por favor, o assunto do seu contato para direcionarmos o seu atendimento.' },
  // 13/11: botão "Tenho um comércio e quero entregas" do site.
  abertura_comercio: { nome: 'Comércios, opção 2 e botão do site "Tenho um comércio e quero entregas"', texto: 'Que bom ter você por aqui! A Fortaleza Move tem atendimento para comércios que precisam de coleta e entrega.\n\nPara a nossa equipe preparar o seu atendimento, informe, por favor:\n\n• o nome do estabelecimento;\n• a cidade e o endereço;\n• o que você vende ou costuma entregar;\n• quantas entregas faz, em média, por dia ou por semana.\n\nCom essas informações, a nossa equipe entra em contato para combinar os detalhes.' },
  // Opção 2 (encomendas) e opção 3 (comércios) abrem um segundo menu cada; as respostas seguintes são as opções desses menus.
  voltar_menu: { nome: 'Aviso para voltar ao menu (final das respostas das opções)', texto: 'Para voltar ao menu inicial, digite 0.' },
  menu_encomendas: { nome: 'Opção 2 escolhida (encomendas): segundo menu', texto: 'Certo! Sobre encomendas, escolha uma das opções:\n\n1. Quero solicitar uma coleta e entrega.\n2. Estou aguardando uma encomenda que ainda não chegou.\n3. Outras informações sobre entregas.\n\n0. Voltar ao menu inicial.\n\nDigite o número da opção desejada.' },
  abertura_encomendas_aguardando: { nome: 'Encomendas, opção 2 (aguardando uma encomenda)', texto: 'Certo! Para a nossa equipe verificar a sua encomenda, informe, por favor:\n\n• o nome do comércio ou de quem enviou;\n• o que você está aguardando;\n• o endereço de entrega (rua e bairro);\n• quando o pedido foi feito.\n\nCom essas informações, a nossa equipe verifica e retorna para você.' },
  abertura_encomendas_outros: { nome: 'Encomendas, opção 3 (outras informações)', texto: 'Certo! Escreva, por favor, o que você gostaria de saber sobre coleta e entrega de encomendas.' },
  menu_comercio: { nome: 'Opção 3 escolhida (comércios): segundo menu', texto: 'Certo! Sobre comércios, escolha uma das opções:\n\n1. Já sou comerciante cadastrado.\n2. Quero cadastrar o meu comércio para pedir entregas.\n3. Outras informações para comércios.\n\n0. Voltar ao menu inicial.\n\nDigite o número da opção desejada.' },
  abertura_comercio_cadastrado: { nome: 'Comércios, opção 1 (já sou comerciante cadastrado)', texto: 'Certo! Informe, por favor, o nome do seu estabelecimento e como podemos ajudar.\n\nCom essas informações, a nossa equipe dá sequência ao seu atendimento.' },
  abertura_comercio_outros: { nome: 'Comércios, opção 3 (outras informações)', texto: 'Certo! Escreva, por favor, o que você gostaria de saber como comerciante ou sobre o cadastro do seu comércio.' },
  documento_recusado: { nome: 'Arquivo de documento não aceito', texto: 'Não consegui receber esse arquivo. Pode enviar de novo como foto (JPG ou PNG) ou PDF, com até 10 MB, por favor?' }
};
// Menus salvos SEM alteração em versões anteriores (padrão antigo de 5 opções; menus de 6 opções da rc.5/rc.6) passam a usar o
// novo padrão: senão o número digitado pelo cliente não bateria com o texto que ele viu. Texto editado pelo dono nunca é tocado.
const MENU_V1 = 'Para direcionarmos seu atendimento, escolha uma das opções:\n\n1. Cadastro de motorista e veículo.\n2. Atendimento ao passageiro.\n3. Coleta e entrega de encomendas.\n4. Clube de Vantagens para motoristas.\n5. Outros assuntos.\n\nDigite o número da opção desejada.';
const MENU_V2 = 'Para direcionarmos seu atendimento, escolha uma das opções:\n\n1. Cadastro de motorista e veículo.\n2. Atendimento ao passageiro.\n3. Coleta e entrega de encomendas.\n4. Clube de Vantagens para motoristas.\n5. Comércio e entregas.\n6. Outros assuntos.\n\nDigite o número da opção desejada.';
const MENU_COMERCIO_V2 = 'Certo! Sobre comércio e entregas, escolha uma das opções:\n\n1. Já sou comerciante cadastrado.\n2. Quero cadastrar o meu comércio.\n3. Estou aguardando uma encomenda ou entrega.\n4. Outras informações.\n\n0. Voltar ao menu inicial.\n\nDigite o número da opção desejada.';
const TEXTOS_ANTIGOS = { menu: [MENU_V1, MENU_V2], menu_comercio: [MENU_COMERCIO_V2] };
const MODELO_IDS = Object.keys(MODELOS_PADRAO);
const MAX_MODELO = 1500;
const MAX_INFO = 4000;
// Conhecimento extra (não são opções do menu): a IA usa quando o cliente pergunta desses assuntos.
const INFO_EXTRAS = { entregadores: 'Cadastro de entregadores', comerciantes: 'Comerciantes (comércios que pedem entregas)' };
const INFO_ORDEM = [
  ['geral', 'Informações gerais da empresa'], ['cadastro', 'Cadastro de motoristas'], ['entregadores', 'Cadastro de entregadores'],
  ['encomendas', 'Encomendas e entregas'], ['clube', 'Clube de Vantagens'], ['comerciantes', 'Comerciantes'],
  ['passageiro', 'Passageiros'], ['outros', 'Outros assuntos de atendimento']
];

function criarCentral({ getSetting, setSetting }) {
  function lerSalvos() {
    try { const v = JSON.parse(getSetting('central_modelos', '{}')); return v && typeof v === 'object' ? v : {}; } catch (err) { return {}; }
  }

  function modelos() {
    const salvos = lerSalvos();
    return MODELO_IDS.map((id) => {
      const s = Object.prototype.hasOwnProperty.call(salvos, id) && salvos[id] && typeof salvos[id] === 'object' ? salvos[id] : {};
      let texto = typeof s.texto === 'string' && s.texto.trim() ? s.texto : MODELOS_PADRAO[id].texto;
      if (tem(TEXTOS_ANTIGOS, id) && TEXTOS_ANTIGOS[id].some((antigo) => texto.replace(/\r\n/g, '\n').trim() === antigo)) texto = MODELOS_PADRAO[id].texto;
      return {
        id, nome: MODELOS_PADRAO[id].nome,
        texto,
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

  // Base de conhecimento: informações oficiais por assunto (o que a IA pode afirmar). Além dos assuntos do menu, há
  // "entregadores" e "comerciantes" (só conhecimento: o menu do WhatsApp não muda). Nada é preenchido automaticamente.
  function informacoes() {
    const r = {};
    for (const id of ASSUNTO_IDS) r[id] = getSetting(`central_info_${id}`, '');
    for (const id of Object.keys(INFO_EXTRAS)) r[id] = getSetting(`central_info_${id}`, '');
    r.geral = getSetting('central_info_geral', '');
    return r;
  }
  /** Quais assuntos já têm conteúdo oficial e quais dependem do dono (para a tela e o relatório). */
  function situacaoInformacoes() {
    const info = informacoes();
    return INFO_ORDEM.map(([id, nome]) => ({ id, nome, preenchida: String(info[id] || '').trim().length > 0 }));
  }
  function salvarInformacoes(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Formato inválido.');
    for (const id of [...ASSUNTO_IDS, ...Object.keys(INFO_EXTRAS), 'geral']) {
      if (!Object.prototype.hasOwnProperty.call(obj, id)) continue;
      const t = String(obj[id] || '').replace(/\r\n/g, '\n').trim();
      if (t.length > MAX_INFO) throw new Error(`As informações passaram de ${MAX_INFO} caracteres.`);
      setSetting(`central_info_${id}`, t);
    }
  }

  return { modelos, texto, salvarModelos, siteUrl, salvarSite, informacoes, salvarInformacoes, situacaoInformacoes };
}

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// "1", "opção 2", "3." → assunto. Só quando a mensagem é basicamente o número. Com um segundo menu aberto (atend_assunto
// "encomendas_menu" ou "comercio_menu"), 1 a 3 escolhem a opção DELE; qualquer outro número volta a valer para o menu principal.
function opcaoDoMenu(texto, assuntoAtual) {
  const t = semAcento(texto).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(?:opcao |numero |op )?([1-6])$/.exec(t);
  if (!m) return null;
  if (typeof assuntoAtual === 'string' && assuntoAtual.endsWith('_menu') && tem(MENUS_SUB, assuntoAtual.slice(0, -5))) {
    const pai = assuntoAtual.slice(0, -5);
    const sub = SUBASSUNTO_IDS.find((id) => SUBASSUNTOS[id].pai === pai && SUBASSUNTOS[id].numero === m[1]);
    if (sub) return sub;
  }
  return ASSUNTO_IDS.find((id) => ASSUNTOS[id].numero === m[1]) || null;
}

// "0" volta ao menu inicial (de qualquer opção ou do segundo menu), como "menu".
const pediuMenu = (texto) => /^(0|menu|opcoes|ver (o )?menu|mostrar (o )?menu|voltar( ao menu( inicial)?)?|inicio)$/.test(semAcento(texto).replace(/[^\w\s]/g, '').trim());

// ORIGEM do contato ≠ INTENÇÃO (12/11 noite). "Olá! Vim pelo site da Fortaleza Move." diz de onde a pessoa veio, não o que
// ela quer: não pode virar cadastro de motorista. A origem fica registrada (relatórios) e a conversa recebe o menu geral.
// Textos prontos dos 4 botões de WhatsApp do site público (repo fortaleza-move-site, conferidos em 13/11/2026): todos
// identificam a ORIGEM "Site"; só "Vim pelo site" é sem intenção (os outros três já dizem o que a pessoa quer).
const TEXTOS_DO_SITE = [
  /^ola!? vim pelo site da fortaleza move\.?$/,
  /^ola!? quero ser motorista da fortaleza move\.?$/,
  /^ola!? quero saber mais sobre corridas e encomendas da fortaleza move\.?$/,
  /^ola!? tenho um comercio e quero entregas pela fortaleza move\.?$/
];
const ORIGENS_CONTATO = [
  ['Site', (t) => TEXTOS_DO_SITE.some((re) => re.test(t.trim()))],
  ['Site', /\b(vim|cheguei|venho|vindo|achei|encontrei|vi)\b[^.!?\n]{0,25}\b(pelo|do|no|atraves do|via)\s+(seu |o |nosso )?site\b|\bpelo site\b/],
  ['Instagram', /\b(vim|cheguei|vi|achei)\b[^.!?\n]{0,25}\b(pelo|do|no)\s+(insta|instagram)\b/],
  ['Facebook', /\b(vim|cheguei|vi|achei)\b[^.!?\n]{0,25}\b(pelo|do|no)\s+(face|facebook)\b/],
  ['TikTok', /\b(vim|cheguei|vi|achei)\b[^.!?\n]{0,25}\b(pelo|do|no)\s+tik ?tok\b/],
  ['Indicação', /\b(fui indicad[oa]|me indicaram|indicacao de)\b/]
];
// O que responder a cada botão do site (texto pronto e fixo, sem depender da IA).
const BOTOES_SITE = [
  { re: /^ola!? vim pelo site da fortaleza move\.?$/, modelo: 'menu' },
  { re: /^ola!? quero ser motorista da fortaleza move\.?$/, modelo: 'abertura_cadastro', assunto: 'cadastro' },
  { re: /^ola!? quero saber mais sobre corridas e encomendas da fortaleza move\.?$/, modelo: 'menu' },
  { re: /^ola!? tenho um comercio e quero entregas pela fortaleza move\.?$/, modelo: 'abertura_comercio', assunto: 'comercio_cadastrar' }
];
const botaoDoSite = (texto) => BOTOES_SITE.find((b) => b.re.test(semAcento(texto).trim())) || null;
/** Texto pronto de um dos botões de WhatsApp do site (a pessoa clicou no site de novo). */
const ehBotaoDoSite = (texto) => TEXTOS_DO_SITE.some((re) => re.test(semAcento(texto).trim()));
function origemDoContato(texto) {
  const t = semAcento(texto);
  const achada = ORIGENS_CONTATO.find(([, re]) => (typeof re === 'function' ? re(t) : re.test(t)));
  return achada ? achada[0] : null;
}
// Mensagem sem intenção clara: só saudação, origem do contato ou "quero saber mais" genérico (sem citar um serviço).
const SERVICO_CITADO = /\b(motorista|dirigir|cadastr|cnh|crlv|carro|veiculo|moto(boy|queiro)?|entreg|encomend|pacote|coleta|passageir|corrida|viagem|clube|vantage|carteirinha|comerci|loja|parceri|reclama|problema|ajuda com|pagamento|valor|preco)/;
function semIntencao(texto) {
  const t = semAcento(texto).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return true;
  if (SERVICO_CITADO.test(t)) return false;
  const resto = t
    .replace(/\b(ola|oi|oie|opa|bom dia|boa tarde|boa noite|tudo bem|tudo bom|e ai|eai|hello|ei|salve|blz|beleza|td bem)\b/g, ' ')
    .replace(/\b(vim|cheguei|venho|vindo|achei|encontrei|vi)\b( (pelo|do|no|atraves do|via))? (seu |o |nosso )?(site|insta|instagram|face|facebook|tik ?tok|anuncio|propaganda)\b/g, ' ')
    .replace(/\bpelo site\b/g, ' ')
    .replace(/\b(quero|queria|gostaria de|gostaria|preciso)( de)? (saber|conhecer|entender|informac(ao|oes)|mais informac(ao|oes))( mais)?( sobre)?( a| o| os| as)?( fortaleza ?move| plataforma| empresa| voces| servicos| aplicativo| app)?\b/g, ' ')
    .replace(/\b(da|de|a|o|fortaleza ?move|move|fortaleza|plataforma|por favor|pf|pfv|obrigad[oa]|aqui|ai)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return resto.length === 0;
}

// Pedido explícito de falar com uma pessoa (reforço sem IA).
const pediuHumano = (texto) => /\b(atendente|atendimento humano|falar com (um|uma|alguem|algu[eé]m|uma pessoa|pessoa|humano|gente)|pessoa de verdade|ser humano|humano por favor)\b/.test(semAcento(texto));

module.exports = { botaoDoSite, ehBotaoDoSite, origemDoContato, semIntencao, INFO_EXTRAS, INFO_ORDEM, ESTADOS, ASSUNTOS, ASSUNTO_IDS, SUBASSUNTOS, SUBASSUNTO_IDS, MENUS_SUB, assuntoBase, emSubfluxo, fluxoDe, nomeDoAssunto, FLUXOS, MOTIVOS_TRANSFERENCIA, MODELOS_PADRAO, MODELO_IDS, criarCentral, opcaoDoMenu, pediuMenu, pediuHumano };
