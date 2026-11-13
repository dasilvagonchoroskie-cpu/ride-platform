'use strict';
// Assistente de IA: analisa conversas do WhatsApp (resumo, assunto, urgência, dados do cadastro, resposta sugerida)
// e, se o administrador permitir, aplica os dados nos cadastros. Só envia mensagem sozinha com "responde sozinha" ligado
// (Central de Atendimento: saudação, menu, fluxos por assunto, transferência para a equipe).
const { ErroIA, PROVEDORES, ehProvedor, urlBaseValida } = require('./provider');
const P = require('./prompt');
const { displayPhone } = require('../whatsapp/phone');

const MODELO_PADRAO = 'claude-haiku-5-5';
// Padrão para instalação nova: o Gemini tem plano grátis sem cartão.
const PROVEDOR_PADRAO = 'gemini';
const tipoParaPerfil = { motoristas: 'motorista', passageiros: 'passageiro', parceiros: 'parceiro' };
const preenchido = (v) => v !== null && v !== undefined && String(v).trim() !== '';

const { extrairDadosDocumentos, normalizarCategoria, normalizarPlaca, tipoDocumento, documentosRecebidos } = require('./documentos');
const C = require('./central');
const { DOCUMENTOS_MOTORISTA } = require('../defs');

// Motivos de a IA não responder, em português (aparecem no painel da conversa e no registro do servidor).
const MOTIVOS = {
  sem_resposta: 'a IA não sugeriu resposta', ja_respondida: 'a última mensagem já tinha resposta',
  analise_desatualizada: 'chegou mensagem nova durante a análise', humano_assumiu: 'a equipe respondeu há menos de 15 min',
  limite_conversa: 'limite de respostas da IA nesta conversa', limite_dia: 'limite diário de respostas da IA', repetida: 'seria repetida',
  falha_redacao: 'a IA não conseguiu redigir', filtro_numero: 'bloqueada: continha número de documento', filtro_link_ou_email: 'bloqueada: continha link ou e-mail',
  filtro_dado_interno: 'bloqueada: repetia anotação interna', filtro_longa: 'bloqueada: longa demais', filtro_vazia: 'a IA não sugeriu resposta',
  atendimento_humano: 'conversa em atendimento humano', aguardando_humano: 'aguardando atendimento humano (aviso de espera já enviado)',
  em_andamento: 'outra resposta em andamento', concluida: 'atendimento concluído',
  limite_atendimento: 'limite de respostas da IA neste atendimento', mudou_estado: 'a equipe assumiu durante o processamento',
  audio_pendente: 'áudio ainda sendo ouvido'
};

function createIaService({ db, waStore, entities, ENTITIES, audit, getSetting, setSetting, cofre, provider, todayISO, nowISO, log = console }) {
  let provedor = provider;
  const travas = new Set();
  const respondendo = new Set();
  const central = C.criarCentral({ getSetting, setSetting });
  const timers = new Map();
  const ackTimers = new Map();
  // Áudios/mídias que ainda estão sendo lidos (a IA espera a leitura antes de decidir; a varredura não atropela).
  const midiasEmLeitura = new Set();

  // Mensagens "de verdade" da conversa: sem as confirmações rápidas de recebimento (tipo 'aviso'), que não são resposta.
  const mensagensReais = (conversaId, limite) => waStore.listarMensagens(conversaId, { limite: Math.min(300, limite + 20) }).filter((m) => m.tipo !== 'aviso').slice(-limite);
  // Início do atendimento ATUAL: um atendimento concluído não pesa sobre o próximo (limites, "repetida", menu).
  const inicioDe = (conv) => (conv && (conv.atend_inicio || conv.created_at)) || '';
  // Texto do cliente sem o rótulo de mídia ("[mensagem de voz] 🎤 ...").
  const textoPuro = (t) => String(t || '').replace(/^\[[^\]]{1,40}\]\s*/, '').replace(/^[🎤📎]\s*/u, '');
  function semIntencaoNoAtendimento(conv, mensagens) {
    const inicio = inicioDe(conv);
    const doCliente = mensagens.filter((m) => m.direcao === 'in' && String(m.created_at || '') >= inicio);
    if (!doCliente.length) return false;
    return doCliente.every((m) => m.tipo === 'text' || !m.tipo ? C.semIntencao(textoPuro(m.texto)) : false);
  }

  // Provedor ativo (Anthropic, DeepSeek, OpenAI...). Cada provedor guarda o próprio modelo e a própria chave.
  const provedorAtual = () => {
    const id = getSetting('ia_provedor', process.env.IA_PROVEDOR || PROVEDOR_PADRAO);
    return ehProvedor(id) ? id : PROVEDOR_PADRAO;
  };
  const obterModelo = (id = provedorAtual()) => {
    const salvo = getSetting(`ia_modelo_${id}`, '') || (id === 'anthropic' ? getSetting('ia_modelo', '') : '');
    if (salvo) return salvo;
    const doAmbiente = (process.env.IA_PROVEDOR || PROVEDOR_PADRAO) === id ? String(process.env.IA_MODELO || '').trim() : '';
    return doAmbiente || PROVEDORES[id].modelo;
  };
  const obterUrlBase = (id = provedorAtual()) => (id === 'personalizado'
    ? getSetting('ia_url_base', process.env.IA_URL_BASE || '') : PROVEDORES[id].urlBase);
  // Tudo que o provedor real precisa para uma chamada (a chave só circula dentro do servidor).
  const dadosDe = (id) => ({ id, tipo: PROVEDORES[id].tipo, urlBase: obterUrlBase(id), modelo: obterModelo(id), chave: cofre.ler(id) });
  const reservaAtual = () => {
    const r = getSetting('ia_reserva', '');
    return r && ehProvedor(r) && r !== provedorAtual() ? r : '';
  };
  const resolverProvedor = () => {
    const id = provedorAtual();
    const reserva = reservaAtual();
    return { ...dadosDe(id), reserva: reserva ? dadosDe(reserva) : null };
  };

  /* ------------------------------------ uso / configuração ------------------------------------ */
  function usoDoDia() {
    const r = db.prepare(
      `SELECT COUNT(*) n, COALESCE(SUM(tokens_entrada + tokens_saida), 0) t FROM ia_analises WHERE date(criado_em, '-3 hours') = ?`
    ).get(todayISO());
    return { analises: r.n, tokens: r.t };
  }

  function transcricoesDoDia() {
    try {
      return db.prepare(`SELECT COUNT(*) n FROM ia_transcricoes WHERE ok = 1 AND date(criado_em, '-3 hours') = ?`).get(todayISO()).n;
    } catch (err) { return 0; }
  }

  function config() {
    const id = provedorAtual();
    return {
      provedor: id,
      provedorNome: PROVEDORES[id].nome,
      urlBase: obterUrlBase(id),
      reserva: reservaAtual(),
      provedores: Object.entries(PROVEDORES).map(([pid, d]) => ({
        id: pid, nome: d.nome, modelo: obterModelo(pid), url_base: d.urlBase || null,
        gratis: !!d.gratis, onde_chave: d.ondeChave || null, aviso: d.aviso || null,
        chave_configurada: !!cofre.ler(pid), chave_final4: cofre.final4(pid), chave_origem: cofre.origem(pid)
      })),
      ativo: getSetting('ia_ativo', '0') === '1',
      modo: getSetting('ia_modo', 'sugerir') === 'automatico' ? 'automatico' : 'sugerir',
      criarCadastro: getSetting('ia_criar_cadastro', '0') === '1',
      responder: getSetting('ia_responder', '0') === '1',
      limiteDia: Number(getSetting('ia_limite_dia', '150')) || 150,
      // Minutos sem resposta da equipe para a conversa voltar sozinha para a IA (0 = só pelo botão).
      humanoPausa: Math.max(0, Number(getSetting('ia_humano_pausa_min', '30')) || 0),
      transcrever: getSetting('ia_transcrever', '1') === '1',
      transcricoesHoje: transcricoesDoDia(),
      modelo: obterModelo(id),
      chaveConfigurada: !!cofre.ler(id),
      chaveFinal4: cofre.final4(id),
      chaveOrigem: cofre.origem(id),
      uso: usoDoDia()
    };
  }

  function salvarConfig(p) {
    if (p.provedor !== undefined) {
      if (!ehProvedor(p.provedor)) throw new ErroIA('invalido', 'Provedor de IA inválido.');
      setSetting('ia_provedor', p.provedor);
    }
    if (p.reserva !== undefined) {
      if (p.reserva !== '' && !ehProvedor(p.reserva)) throw new ErroIA('invalido', 'Provedor reserva inválido.');
      setSetting('ia_reserva', p.reserva);
    }
    if (p.urlBase !== undefined) {
      const u = String(p.urlBase).trim().replace(/\/+$/, '');
      if (u && !urlBaseValida(u)) throw new ErroIA('invalido', 'Endereço inválido. Use um endereço https:// (ex.: https://api.exemplo.com/v1).');
      setSetting('ia_url_base', u);
    }
    if (p.ativo !== undefined) setSetting('ia_ativo', p.ativo ? '1' : '0');
    if (p.modo !== undefined) {
      if (p.modo !== 'sugerir' && p.modo !== 'automatico') throw new ErroIA('invalido', 'Modo inválido.');
      setSetting('ia_modo', p.modo);
    }
    if (p.transcrever !== undefined) setSetting('ia_transcrever', p.transcrever ? '1' : '0');
    if (p.responder !== undefined) setSetting('ia_responder', p.responder ? '1' : '0');
    if (p.criarCadastro !== undefined) setSetting('ia_criar_cadastro', p.criarCadastro ? '1' : '0');
    if (p.humanoPausa !== undefined) {
      const n = Math.round(Number(p.humanoPausa));
      if (!Number.isFinite(n) || n < 0 || n > 1440) throw new ErroIA('invalido', 'O tempo para voltar para a IA deve ficar entre 0 e 1440 minutos.');
      setSetting('ia_humano_pausa_min', String(n));
    }
    if (p.limiteDia !== undefined) {
      const n = Math.round(Number(p.limiteDia));
      if (!Number.isFinite(n) || n < 1 || n > 2000) throw new ErroIA('invalido', 'O limite diário deve estar entre 1 e 2000.');
      setSetting('ia_limite_dia', String(n));
    }
    if (p.modelo !== undefined) {
      const m = String(p.modelo).trim();
      if (m && !/^[a-zA-Z0-9._:\/-]{3,100}$/.test(m)) throw new ErroIA('invalido', 'Nome de modelo inválido.');
      setSetting(`ia_modelo_${provedorAtual()}`, m);
    }
  }

  /* ----------------------------------------- análises ----------------------------------------- */
  function lerAnalise(linha) {
    if (!linha) return null;
    let resultado = {};
    try { resultado = JSON.parse(linha.resultado); } catch (err) { /* análise corrompida: mostra vazia */ }
    return { ...linha, resultado };
  }

  function ultimaAnalise(conversaId) {
    return lerAnalise(db.prepare('SELECT * FROM ia_analises WHERE conversa_id = ? ORDER BY id DESC LIMIT 1').get(conversaId));
  }

  function valoresAtuais(tipo, id) {
    const def = ENTITIES[tipo];
    const linha = db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(id) || {};
    const atual = {};
    for (const k of P.CAMPOS_IA[tipo]) if (preenchido(linha[k])) atual[k] = String(linha[k]).slice(0, 100);
    return { linha, atual };
  }

  async function analisar(conversaId, { forcar = false, usuarioId = null, origem = 'manual' } = {}) {
    const cfg = config();
    if (!cfg.ativo) throw new ErroIA('desativada', 'A IA está desativada. Um administrador pode ativar em Configurações.');
    if (!cofre.ler(cfg.provedor)) throw new ErroIA('sem_chave', 'A chave da IA não está configurada. Um administrador deve informá-la em Configurações.');
    if (cfg.provedor === 'personalizado' && !cfg.urlBase) throw new ErroIA('url_invalida', 'Informe o endereço da IA em Configurações.');
    const conv = waStore.obterConversa(conversaId);
    if (!conv) throw new ErroIA('nao_encontrada', 'Conversa não encontrada.', 404);
    const mensagens = mensagensReais(conversaId, 60);
    if (!mensagens.length) throw new ErroIA('sem_mensagens', 'A conversa ainda não tem mensagens.');
    const ultimoId = mensagens[mensagens.length - 1].id;

    const anterior = ultimaAnalise(conversaId);
    // Reaproveita a última análise se nada mudou (nem mensagem nova, nem áudio transcrito depois dela).
    const transcritoDepois = anterior ? db.prepare(
      `SELECT 1 FROM ia_transcricoes t JOIN wa_mensagens m ON m.id = t.mensagem_id
       WHERE m.conversa_id = ? AND t.ok = 1 AND t.criado_em > ? LIMIT 1`
    ).get(conversaId, anterior.criado_em) : null;
    if (anterior && anterior.mensagem_ate_id === ultimoId && !forcar && !transcritoDepois) return { ...anterior, reaproveitada: true };
    if (travas.has(conversaId)) throw new ErroIA('em_andamento', 'Já existe uma análise em andamento para esta conversa.');
    if (cfg.uso.analises >= cfg.limiteDia) throw new ErroIA('limite_diario', `Limite diário de análises de IA atingido (${cfg.limiteDia}). Um administrador pode aumentar em Configurações.`);

    travas.add(conversaId);
    try {
      const tipoAlvo = conv.vinculo_tipo || null;
      let vinculo = null;
      if (tipoAlvo) vinculo = { tipo: tipoAlvo, atual: valoresAtuais(tipoAlvo, conv.vinculo_id).atual };
      const camposEspec = tipoAlvo ? P.especificarCampos(tipoAlvo, ENTITIES[tipoAlvo]) : [];
      const { system, user } = P.montarPrompt({ contato: { nome: conv.nome }, vinculo, tipoAlvo, camposEspec, mensagens });

      const resp = await provedor.completar({ system, user, maxTokens: 1200 });
      let bruto;
      try { bruto = P.extrairJson(resp.texto); } catch (err) { throw new ErroIA('resposta_invalida', 'A IA respondeu em formato inesperado. Tente de novo.'); }

      const chavesPermitidas = tipoAlvo ? P.CAMPOS_IA[tipoAlvo] : P.CHAVES_SEM_CADASTRO;
      const resultado = P.validarResultado(bruto, { chavesPermitidas });
      // Reforço sem IA: dados de CNH/CRLV lidos (📎) que a IA não devolveu entram aqui; e valores no formato do cadastro.
      const perfilFinal = tipoAlvo ? tipoParaPerfil[tipoAlvo] : resultado.perfil;
      if (perfilFinal === 'motorista' || (!tipoAlvo && resultado.perfil === 'desconhecido')) {
        const doc = extrairDadosDocumentos(mensagens);
        for (const [k, v] of Object.entries(doc)) if (chavesPermitidas.includes(k) && !resultado.campos[k]) resultado.campos[k] = v;
        if (Object.keys(doc).length && resultado.perfil === 'desconhecido' && !tipoAlvo) resultado.perfil = 'motorista';
      }
      if (resultado.campos.cnh_categoria) {
        const c = normalizarCategoria(resultado.campos.cnh_categoria);
        if (c) resultado.campos.cnh_categoria = c; else delete resultado.campos.cnh_categoria;
      }
      if (resultado.campos.placa) resultado.campos.placa = normalizarPlaca(resultado.campos.placa) || resultado.campos.placa;
      if (tipoAlvo) resultado.perfil = tipoParaPerfil[tipoAlvo]; // com cadastro vinculado, o perfil é o do cadastro
      // Origem do contato NÃO é intenção (12/11 noite): "Vim pelo site" não faz de ninguém candidato a motorista. Enquanto o
      // cliente (neste atendimento) só cumprimentou ou disse de onde veio, perfil e assunto ficam indefinidos.
      if (!tipoAlvo && semIntencaoNoAtendimento(conv, mensagens)) {
        resultado.perfil = 'desconhecido';
        resultado.campos = {};
        if (resultado.atendimento) resultado.atendimento.opcao = 'indefinido';
      }

      const info = db.prepare(
        `INSERT INTO ia_analises (conversa_id, mensagem_ate_id, origem, resultado, modelo, tokens_entrada, tokens_saida, criado_por, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(conversaId, ultimoId, origem, JSON.stringify(resultado), resp.modelo || null, resp.tokensEntrada || 0, resp.tokensSaida || 0, usuarioId, nowISO());
      return lerAnalise(db.prepare('SELECT * FROM ia_analises WHERE id = ?').get(info.lastInsertRowid));
    } finally {
      travas.delete(conversaId);
    }
  }

  /* ------------------------------ aplicar no cadastro / criar cadastro ------------------------------ */
  function aplicar(conversaId, { criar = false } = {}, req) {
    const analise = ultimaAnalise(conversaId);
    if (!analise) return { erro: 'Analise a conversa primeiro.', status: 409 };
    const conv = waStore.obterConversa(conversaId);
    if (!conv) return { erro: 'Conversa não encontrada.', status: 404 };
    const campos = analise.resultado.campos || {};
    const saida = { preenchidos: [], criado: null, faltando: [] };

    if (conv.vinculo_tipo) {
      const def = ENTITIES[conv.vinculo_tipo];
      const { linha } = valoresAtuais(conv.vinculo_tipo, conv.vinculo_id);
      const corpo = {};
      for (const chave of P.CAMPOS_IA[conv.vinculo_tipo]) {
        if (!Object.prototype.hasOwnProperty.call(campos, chave)) continue;
        if (preenchido(linha[chave])) continue;            // nunca sobrescreve o que já existe
        const { values, errors } = entities.validate(def, { [chave]: campos[chave] }, { partial: true, current: linha });
        if (errors[chave] || values[chave] === undefined) continue; // valor inválido para o campo: descarta
        corpo[chave] = values[chave];
      }
      if (Object.keys(corpo).length) {
        const r = entities.updateEntity(def, conv.vinculo_id, corpo, req);
        if (r.errors || r.error) return { erro: 'Não foi possível atualizar o cadastro.', status: 422 };
        saida.preenchidos = Object.keys(corpo);
        audit(req, 'ia_preencher', def.table, conv.vinculo_id, `Assistente de IA preencheu campos vazios: ${saida.preenchidos.join(', ')} (conversa #${conversaId})`);
      }
      if (conv.vinculo_tipo === 'motoristas') saida.documentos = marcarDocumentos(conversaId, conv.vinculo_id, req);
    } else if (criar) {
      const tipo = P.PERFIL_TIPO[analise.resultado.perfil];
      if (!tipo) return { erro: 'A IA não identificou se é motorista, passageiro ou parceiro.', status: 422 };
      const def = ENTITIES[tipo];
      const corpo = {};
      for (const chave of P.CAMPOS_IA[tipo]) if (campos[chave]) corpo[chave] = campos[chave];
      // O que a IA chama de "nome" vira o nome do estabelecimento no cadastro de parceiros.
      if (tipo === 'parceiros' && !corpo.nome_estabelecimento && campos.nome) corpo.nome_estabelecimento = campos.nome;
      const chaveNome = tipo === 'parceiros' ? 'nome_estabelecimento' : 'nome';
      if (!corpo[chaveNome] && conv.nome) corpo[chaveNome] = conv.nome;
      if (conv.telefone) corpo.telefone = displayPhone(conv.telefone);
      if (tipo === 'motoristas') corpo.documentos = 'Não enviados';
      // Padrões seguros dos campos obrigatórios que não dependem de interpretar a conversa.
      for (const f of def.fields) {
        if (!f.required || corpo[f.key] !== undefined) continue;
        if (f.type === 'date' && /^data_(primeiro_)?contato$/.test(f.key)) corpo[f.key] = todayISO();
        else if (f.key === 'origem' && f.type === 'select') corpo[f.key] = f.options.includes('WhatsApp') ? 'WhatsApp' : f.options[0];
        else if (f.key === def.statusField) corpo[f.key] = def.statuses[0];
      }
      const faltando = def.fields.filter((f) => f.required && !preenchido(corpo[f.key])).map((f) => f.label);
      if (faltando.length) { saida.faltando = faltando; return { ...saida, erro: `Faltam dados para criar o cadastro: ${faltando.join(', ')}.`, status: 422 }; }
      const r = entities.createEntity(def, corpo, req);
      if (r.errors) {
        saida.faltando = Object.keys(r.errors);
        return { ...saida, erro: 'Os dados encontrados não bastam para criar o cadastro.', status: 422 };
      }
      waStore.definirVinculo(conv.contato_id, tipo, r.item.id);
      saida.criado = { tipo, id: r.item.id };
      audit(req, 'ia_criar_cadastro', def.table, r.item.id, `Assistente de IA criou o cadastro a partir da conversa #${conversaId}`);
      if (tipo === 'motoristas') saida.documentos = marcarDocumentos(conversaId, r.item.id, req);
    }

    const resumo = saida.criado ? `criou ${saida.criado.tipo} #${saida.criado.id}` : (saida.preenchidos.length ? `preencheu: ${saida.preenchidos.join(', ')}` : 'nada a preencher');
    db.prepare('UPDATE ia_analises SET aplicado_em = ?, aplicado_resumo = ? WHERE id = ?').run(nowISO(), resumo, analise.id);
    return saida;
  }

  // Ficha do motorista: marca cada um dos 7 itens que chegou pela conversa (CNH, CRLV, comprovante de residência,
  // antecedentes e as 3 fotos do veículo) como "Recebido — conferir" (nunca desfaz "Conferido"), resume a situação e avança a
  // etapa: algum item → "Cadastro em andamento"; os 7 → "Cadastro em análise". Aprovar e contratar é sempre da equipe.
  const CAMPO_DOC = Object.fromEntries(DOCUMENTOS_MOTORISTA.map((d) => [d.tipo, d.campo]));
  const TOTAL_DOCS = DOCUMENTOS_MOTORISTA.length;
  const ETAPAS_INICIAIS = ['Novo interessado', 'Primeiro contato realizado', 'Aguardando retorno'];
  function marcarDocumentos(conversaId, motoristaId, req) {
    const def = ENTITIES.motoristas;
    const { linha } = valoresAtuais('motoristas', motoristaId);
    if (!linha || !linha.id) return null;
    const rec = documentosRecebidos(waStore.listarMensagens(conversaId, { limite: 500 }));
    const corpo = {};
    for (const [tipo, campo] of Object.entries(CAMPO_DOC)) {
      if (rec[tipo] && (!preenchido(linha[campo]) || linha[campo] === 'Não enviado')) corpo[campo] = 'Recebido — conferir';
    }
    const estado = { ...linha, ...corpo };
    const ok = (v) => v === 'Recebido — conferir' || v === 'Conferido';
    const recebidos = Object.values(CAMPO_DOC).filter((c) => ok(estado[c])).length;
    const conferidos = Object.values(CAMPO_DOC).filter((c) => estado[c] === 'Conferido').length;
    const geral = conferidos === TOTAL_DOCS ? 'Conferidos' : recebidos === TOTAL_DOCS ? 'Recebidos — conferir' : recebidos > 0 ? 'Incompletos' : 'Não enviados';
    if (linha.documentos !== 'Conferidos' && linha.documentos !== geral) corpo.documentos = geral;
    let novaEtapa = null;
    if (recebidos === TOTAL_DOCS && [...ETAPAS_INICIAIS, 'Cadastro em andamento'].includes(linha.situacao)) novaEtapa = 'Cadastro em análise';
    else if (recebidos > 0 && ETAPAS_INICIAIS.includes(linha.situacao)) novaEtapa = 'Cadastro em andamento';
    if (novaEtapa) corpo.situacao = novaEtapa;
    if (!Object.keys(corpo).length) return { recebidos, situacao: linha.situacao };
    const r = entities.updateEntity(def, motoristaId, corpo, req);
    if (r.errors || r.error) return null;
    if (novaEtapa) {
      entities.logInteraction('motoristas', motoristaId, req, `Etapa atualizada automaticamente: ${recebidos} de ${TOTAL_DOCS} documentos recebidos pelo WhatsApp (conferir na ficha).`, linha.situacao, novaEtapa, 'WhatsApp');
    }
    audit(req, 'ia_documentos', 'motoristas', motoristaId, `Documentos marcados pelo servidor: ${Object.keys(corpo).join(', ')}`);
    return { recebidos, situacao: novaEtapa || linha.situacao };
  }

  /* ------------------------------------------ automático ------------------------------------------ */
  const reqIA = () => ({ app: { locals: { db } }, user: { id: null, nome: 'Assistente IA' }, headers: {}, ip: '', socket: {} });

  /* ------------------------- estado do processamento e recuperação (12/11) ------------------------- */
  // Problema real observado em produção (12/11, 12:27): o provedor de IA devolveu erro 5xx, a falha só foi para o log e a
  // conversa ficou como "IA atendendo" sem resposta. Agora cada mensagem do cliente é acompanhada até a resposta ou a falha:
  //  - erro passageiro do provedor (fora do ar, tempo esgotado, sem cota, rede, resposta estranha) → nova tentativa com espera;
  //  - esgotadas as tentativas, ou quando a IA não pode responder (limites, filtro de segurança) → transfere para a equipe
  //    com o modelo de transferência e o motivo "A IA não conseguiu responder" (notificação urgente);
  //  - mensagens que ficaram sem tratamento (reinício do servidor, temporizador perdido) são recuperadas pela varredura.
  // Nada de texto do cliente no estado: só códigos.
  const PASSAGEIROS = new Set(['indisponivel', 'timeout', 'rede', 'limite_provedor', 'resposta_invalida', 'falha_redacao', 'em_andamento', 'erro']);
  // Motivos em que a IA fica quieta de propósito (não é falha).
  const QUIETOS = new Set(['atendimento_humano', 'concluida', 'ja_respondida', 'aguardando_humano', 'analise_desatualizada', 'humano_assumiu', 'em_andamento']);
  const esperasRepetir = () => String(process.env.IA_REPETIR_MS !== undefined ? process.env.IA_REPETIR_MS : '30000,120000,300000').split(',').filter((x) => x.trim() !== '').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  const RECUPERAR_HORAS = Number(process.env.IA_RECUPERAR_HORAS) || 12;
  const processando = new Set();

  function marcarEstado(conversaId, estado, { erro = null, msgId, tentativas, proxima = null } = {}) {
    const sets = ['ia_estado = ?', 'ia_estado_em = ?', 'ia_erro = ?', 'ia_proxima = ?'];
    const params = [estado, nowISO(), erro ? String(erro).slice(0, 60) : null, proxima];
    if (msgId !== undefined) { sets.push('ia_msg_id = ?'); params.push(msgId); }
    if (tentativas !== undefined) { sets.push('ia_tentativas = ?'); params.push(tentativas); }
    try { db.prepare(`UPDATE wa_conversas SET ${sets.join(', ')} WHERE id = ?`).run(...params, conversaId); } catch (err) { log.error(`[ia] estado da conversa ${conversaId}: ${err.message}`); }
  }
  // Última mensagem REAL da conversa (a confirmação rápida não conta como resposta).
  const ultimaDoCliente = (conversaId) => db.prepare("SELECT id, direcao, tipo, texto, created_at FROM wa_mensagens WHERE conversa_id = ? AND tipo <> 'aviso' ORDER BY id DESC LIMIT 1").get(conversaId);
  // Áudio que não pôde ser ouvido (leitura falhou, desligada, sem fala ou acima do limite): sem transcrição 🎤 e fora de leitura.
  const audioIlegivel = (m) => !!m && m.direcao === 'in' && m.tipo === 'audio' && !/🎤/u.test(String(m.texto || '')) && !midiasEmLeitura.has(m.id);

  // Áudio que a IA não conseguiu ouvir: diz isso com franqueza e pede o texto (nunca finge que entendeu). Se o último aviso
  // da IA já foi esse, passa para a equipe (alguém ouve o áudio no celular).
  function responderAudioIlegivel(conversaId, cfg) {
    const conv = waStore.obterConversa(conversaId);
    if (!conv || conv.atendimento !== 'ia') return null; // humano/concluído/aguardando: segue o fluxo normal
    if (!cfg.responder) { marcarEstado(conversaId, 'sem_acao', { erro: 'audio_ilegivel' }); return { tratada: true }; }
    const texto = central.texto('audio_nao_compreendido');
    const inicio = inicioDe(conv);
    const ultimaIA = db.prepare("SELECT texto FROM wa_mensagens WHERE conversa_id = ? AND origem = 'ia' AND tipo <> 'aviso' AND created_at >= ? ORDER BY id DESC LIMIT 1").get(conversaId, inicio);
    if (!texto || (ultimaIA && ultimaIA.texto === texto)) { transferirPorFalha(conversaId, 'audio_ilegivel'); return { tratada: true }; }
    const r = waStore.enfileirar({ conversaId, texto, usuarioId: null, origem: 'ia' });
    if (r.erro) { log.error(`[ia] conversa ${conversaId}: aviso de áudio não enfileirado (${r.erro})`); return null; }
    marcarEstado(conversaId, 'respondida', { erro: 'audio_ilegivel' });
    log.log(`[ia] conversa ${conversaId}: áudio não pôde ser ouvido; cliente avisado e convidado a escrever`);
    return { tratada: true };
  }

  // A IA não vai responder esta mensagem: passa para a equipe (só se ninguém respondeu e a conversa ainda está com a IA).
  function transferirPorFalha(conversaId, codigo) {
    const conv = waStore.obterConversa(conversaId);
    const ult = ultimaDoCliente(conversaId);
    if (!conv || conv.atendimento !== 'ia' || !ult || ult.direcao !== 'in') return false;
    const rotulo = C.MOTIVOS_TRANSFERENCIA.falha_ia;
    waStore.mudarAtendimento(conversaId, 'aguardando', { motivo: rotulo, detalhe: `${rotulo} [${codigo}]` });
    audit(reqIA(), 'wa_transferir', 'wa_conversas', conversaId, `IA transferiu para atendimento humano: falha da IA (${codigo})`);
    const aviso = central.texto('transferencia');
    if (aviso) { const r = waStore.enfileirar({ conversaId, texto: aviso, usuarioId: null, origem: 'ia' }); if (r && r.erro) log.error(`[ia] conversa ${conversaId}: aviso de transferência não enfileirado (${r.erro})`); }
    marcarEstado(conversaId, 'transferida_falha', { erro: codigo });
    log.log(`[ia] conversa ${conversaId}: transferida para a equipe por falha da IA (${codigo})`);
    return true;
  }

  function agendarTentativa(conversaId, tentativa, codigo, opcoes) {
    const esperas = esperasRepetir();
    if (tentativa >= esperas.length) return false;
    const ms = esperas[tentativa];
    marcarEstado(conversaId, 'tentando', { erro: codigo, tentativas: tentativa + 1, proxima: new Date(Date.now() + ms).toISOString() });
    clearTimeout(timers.get(conversaId));
    const t = setTimeout(() => { timers.delete(conversaId); executarAutomatico(conversaId, { ...opcoes, tentativa: tentativa + 1 }); }, ms);
    if (t.unref) t.unref();
    timers.set(conversaId, t);
    log.log(`[ia] conversa ${conversaId}: nova tentativa ${tentativa + 1}/${esperas.length} em ${Math.round(ms / 1000)} s (${codigo})`);
    return true;
  }

  const deNovoDepois = new Set();
  async function executarAutomatico(conversaId, { forcar = false, tentativa = 0 } = {}) {
    // Mensagem nova chegou enquanto a anterior ainda era tratada: trata de novo logo depois (não perde a mensagem).
    if (processando.has(conversaId)) { deNovoDepois.add(conversaId); return; }
    const cfg = config();
    if (!cfg.ativo || cfg.modo !== 'automatico') return;
    const ult = ultimaDoCliente(conversaId);
    if (!cfg.chaveConfigurada) {
      if (ult && ult.direcao === 'in' && !(cfg.responder && transferirPorFalha(conversaId, 'sem_chave'))) marcarEstado(conversaId, 'sem_chave', { erro: 'sem_chave', msgId: ult.id });
      return;
    }
    // Áudio ainda sendo ouvido: quem termina a leitura chama a IA de novo.
    if (ult && ult.direcao === 'in' && midiasEmLeitura.has(ult.id)) return;
    processando.add(conversaId);
    const msgId = ult ? ult.id : null;
    const comecou = Date.now();
    const desdeMsg = () => (ult && ult.created_at ? Math.round((Date.now() - Date.parse(ult.created_at)) / 1000) : null);
    marcarEstado(conversaId, 'processando', { msgId, ...(tentativa === 0 ? { tentativas: 0 } : {}) });
    try {
      if (audioIlegivel(ult) && responderAudioIlegivel(conversaId, cfg)) return;
      // Um contato sozinho não esgota a cota de todos: no máximo ANALISES_CONVERSA_DIA análises automáticas por conversa/dia.
      // Conta só o atendimento atual (um atendimento anterior não bloqueia o novo) + um teto de 24 h contra laço.
      const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const inicioAt = inicioDe(waStore.obterConversa(conversaId));
      const feitas = db.prepare("SELECT COUNT(*) n FROM ia_analises WHERE conversa_id = ? AND origem = 'automatica' AND criado_em >= ?").get(conversaId, desde).n;
      const noAtendimento = db.prepare("SELECT COUNT(*) n FROM ia_analises WHERE conversa_id = ? AND origem = 'automatica' AND criado_em >= ?").get(conversaId, inicioAt).n;
      if (feitas >= ANALISES_CONVERSA_DIA || noAtendimento >= ANALISES_ATENDIMENTO) {
        log.log(`[ia] conversa ${conversaId}: limite de análises automáticas do dia para este contato`);
        if (!(cfg.responder && transferirPorFalha(conversaId, 'limite_analises_conversa'))) marcarEstado(conversaId, 'limite', { erro: 'limite_analises_conversa' });
        return;
      }
      const a = await analisar(conversaId, { origem: 'automatica', forcar: forcar || tentativa > 0 });
      const ap = aplicar(conversaId, { criar: cfg.criarCadastro }, reqIA());
      let resp = 'resposta automática desligada';
      let estadoFinal = 'analisada';
      if (cfg.responder) {
        const r = await responderAutomatico(conversaId, { aplicacao: ap });
        resp = r.enviada ? `respondeu${r.tipo ? ` (${r.tipo})` : ''}${r.transferida ? `; transferida: ${r.transferida}` : ''}` : `não respondeu: ${MOTIVOS[r.motivo] || r.motivo}`;
        if (!r.enviada) {
          const atual = ultimaAnalise(conversaId);
          if (atual) db.prepare('UPDATE ia_analises SET aplicado_resumo = ? WHERE id = ?').run(`${atual.aplicado_resumo || ''}; ${resp}`.replace(/^; /, '').slice(0, 200), atual.id);
        }
        if (r.enviada) estadoFinal = r.transferida ? 'transferida' : 'respondida';
        else if (r.transferida) estadoFinal = 'transferida';
        else if (r.motivo === 'falha_redacao') { const e = new ErroIA('falha_redacao', 'A IA não conseguiu redigir a resposta.'); throw e; }
        else if (QUIETOS.has(r.motivo)) estadoFinal = 'sem_acao';
        else {
          // limites, filtro de segurança, resposta vazia ou repetida: a IA não vai responder esta mensagem → equipe.
          transferirPorFalha(conversaId, r.motivo);
          estadoFinal = null;
        }
      }
      if (estadoFinal) marcarEstado(conversaId, estadoFinal);
      // Registro sem dados pessoais: só nomes de campos e decisões.
      log.log(`[ia] conversa ${conversaId}: perfil=${a.resultado.perfil} campos=[${Object.keys(a.resultado.campos || {}).join(',')}] `
        + `${ap.erro ? `cadastro: ${ap.erro}` : (ap.criado ? `criou ${ap.criado.tipo}` : `preencheu=[${(ap.preenchidos || []).join(',')}]`)}; ${resp}`
        + `; processamento ${((Date.now() - comecou) / 1000).toFixed(1)} s${desdeMsg() !== null ? `, ${desdeMsg()} s desde a mensagem` : ''}`);
    } catch (err) {
      const codigo = (err && err.codigo) || 'erro';
      // Falha da IA nunca atrapalha o recebimento: registra, tenta de novo quando é passageira e, no fim, passa para a equipe.
      log.error(`[ia] análise automática da conversa ${conversaId}: ${err.message}${tentativa ? ` (tentativa ${tentativa})` : ''} — ${((Date.now() - comecou) / 1000).toFixed(1)} s`);
      if (PASSAGEIROS.has(codigo) && agendarTentativa(conversaId, tentativa, codigo, { forcar })) return;
      if (cfg.responder && transferirPorFalha(conversaId, codigo)) return;
      marcarEstado(conversaId, 'falhou', { erro: codigo });
    } finally {
      processando.delete(conversaId);
      if (deNovoDepois.delete(conversaId)) {
        const u = ultimaDoCliente(conversaId);
        if (u && u.direcao === 'in' && u.id !== msgId) setImmediate(() => executarAutomatico(conversaId));
      }
    }
  }

  // Varredura: mensagens do cliente em conversas com a IA que ficaram sem tratamento (servidor reiniciou, temporizador perdido,
  // tentativa vencida). Idempotente: só pega a conversa cuja ÚLTIMA mensagem é do cliente e ainda não foi tratada.
  function recuperarPendentes() {
    const cfg = config();
    if (!cfg.ativo || cfg.modo !== 'automatico' || !cfg.chaveConfigurada) return [];
    const atraso = atrasoMs();
    const agora = Date.now();
    const limiteAntigo = new Date(agora - RECUPERAR_HORAS * 3600 * 1000).toISOString();
    const maduro = new Date(agora - atraso - 5000).toISOString();
    const travado = new Date(agora - 5 * 60 * 1000).toISOString();
    const linhas = db.prepare(`
      SELECT c.id, c.ia_estado, c.ia_msg_id, c.ia_proxima, c.ia_estado_em, c.ia_tentativas, m.id AS ult_id, m.direcao, m.created_at
        FROM wa_conversas c JOIN wa_mensagens m ON m.id = (SELECT MAX(id) FROM wa_mensagens WHERE conversa_id = c.id AND tipo <> 'aviso')
       WHERE c.atendimento = 'ia' AND m.direcao = 'in' AND m.created_at >= ? AND m.created_at <= ?`).all(limiteAntigo, maduro);
    const feitas = [];
    for (const l of linhas) {
      if (processando.has(l.id) || timers.has(l.id) || midiasEmLeitura.has(l.ult_id)) continue;
      const nova = !l.ia_msg_id || l.ia_msg_id < l.ult_id;
      const tentativaVencida = l.ia_estado === 'tentando' && l.ia_proxima && l.ia_proxima <= new Date(agora).toISOString();
      const presa = l.ia_estado === 'processando' && l.ia_estado_em && l.ia_estado_em <= travado;
      if (!(nova || tentativaVencida || presa)) continue;
      feitas.push(l.id);
      executarAutomatico(l.id, nova ? {} : { tentativa: Math.max(1, Number(l.ia_tentativas) || 1), forcar: true });
    }
    if (feitas.length) log.log(`[ia] recuperação: ${feitas.length} conversa(s) com mensagem pendente`);
    return feitas;
  }
  let varredura = null;
  function iniciarRecuperacao(intervaloMs = Number(process.env.IA_VARREDURA_MS) || 60000) {
    if (varredura) return;
    const rodar = () => { try { recuperarPendentes(); } catch (err) { log.error(`[ia] recuperação: ${err.message}`); } };
    const primeira = setTimeout(rodar, Math.min(intervaloMs, 20000));
    if (primeira.unref) primeira.unref();
    varredura = setInterval(rodar, intervaloMs);
    if (varredura.unref) varredura.unref();
  }
  function pararRecuperacao() { clearInterval(varredura); varredura = null; for (const t of timers.values()) clearTimeout(t); timers.clear(); }

  // Reprocessar pela tela (equipe): trata de novo a última mensagem do cliente.
  async function reprocessar(conversaId) {
    const conv = waStore.obterConversa(conversaId);
    if (!conv) throw new ErroIA('nao_encontrada', 'Conversa não encontrada.', 404);
    const cfg = config();
    if (!cfg.ativo || cfg.modo !== 'automatico') throw new ErroIA('desativada', 'A IA automática está desligada. Um administrador pode ligar em Configurações.');
    if (conv.atendimento !== 'ia') throw new ErroIA('nao_ia', 'Devolva a conversa para a IA antes de reprocessar.', 409);
    const ult = ultimaDoCliente(conversaId);
    if (!ult || ult.direcao !== 'in') throw new ErroIA('ja_respondida', 'A última mensagem já foi respondida.', 409);
    clearTimeout(timers.get(conversaId)); timers.delete(conversaId);
    await executarAutomatico(conversaId, { forcar: true });
    return waStore.obterConversa(conversaId);
  }

  // Resposta automática (só se o administrador ligar). Travas de segurança:
  //  - só responde se a última mensagem da conversa é do cliente e a análise cobre essa mensagem;
  //  - se uma pessoa da equipe respondeu nos últimos 15 min (CRM ou celular), a IA fica quieta (humano assumiu);
  //  - no máximo RESPOSTAS_CONVERSA_DIA respostas da IA por conversa em 24 h e RESPOSTAS_DIA no total por dia;
  //  - não repete a mesma frase que acabou de mandar.
  // Limites (12/11 noite): por ATENDIMENTO (um concluído não bloqueia o seguinte) + teto de 24 h por conversa contra laço.
  const RESPOSTAS_ATENDIMENTO = Number(process.env.IA_RESPOSTAS_ATENDIMENTO) || 40;
  const RESPOSTAS_CONVERSA_DIA = Number(process.env.IA_RESPOSTAS_CONVERSA_DIA) || 80;
  const RESPOSTAS_DIA = Number(process.env.IA_RESPOSTAS_DIA) || 300;
  const ANALISES_ATENDIMENTO = Number(process.env.IA_ANALISES_ATENDIMENTO) || 60;
  const ANALISES_CONVERSA_DIA = Number(process.env.IA_ANALISES_CONVERSA_DIA) || 120;
  const atrasoMs = () => (process.env.IA_ATRASO_MS !== undefined ? Number(process.env.IA_ATRASO_MS) : 7000);
  async function responderAutomatico(conversaId, opcoes = {}) {
    if (respondendo.has(conversaId)) return { motivo: 'em_andamento' };
    respondendo.add(conversaId);
    try { return await responderCentral(conversaId, opcoes); } finally { respondendo.delete(conversaId); }
  }

  // Central de Atendimento: decide entre saudação + menu, confirmação de documento, transferência para a equipe,
  // aviso de espera e a resposta redigida pela IA. Os textos fixos vêm dos "Modelos de Comunicação da IA".
  async function responderCentral(conversaId, { aplicacao } = {}) {
    let conv = waStore.obterConversa(conversaId);
    if (!conv) return { motivo: 'sem_resposta' };
    if (conv.atendimento === 'humano') {
      // Volta sozinha para a IA quando a equipe ficou um tempo sem responder (ex.: respondeu uma vez pelo celular e saiu).
      const pausa = config().humanoPausa;
      const ultimaEquipe = db.prepare("SELECT MAX(ocorrida_em) t FROM wa_mensagens WHERE conversa_id = ? AND direcao = 'out' AND origem IN ('crm', 'celular')").get(conversaId).t;
      const referencia = [ultimaEquipe, conv.atend_em].filter(Boolean).sort().pop() || '';
      if (!pausa || referencia > new Date(Date.now() - pausa * 60000).toISOString()) return { motivo: 'atendimento_humano' };
      waStore.mudarAtendimento(conversaId, 'ia', { detalhe: `Voltou para a IA após ${pausa} min sem resposta da equipe` });
      conv = waStore.obterConversa(conversaId);
    }
    if (conv.atendimento === 'concluido') return { motivo: 'concluida' };
    const a = ultimaAnalise(conversaId);
    if (!a) return { motivo: 'sem_resposta' };
    const msgs = mensagensReais(conversaId, 30);
    const ultima = msgs[msgs.length - 1];
    const inicio = inicioDe(conv);
    if (!ultima || ultima.direcao !== 'in') return { motivo: 'ja_respondida' };
    if (a.mensagem_ate_id !== ultima.id) return { motivo: 'analise_desatualizada' };
    // Trava antiga de 15 min: só vale para resposta da equipe DEPOIS da última mudança de estado. Se a conversa foi
    // devolvida para a IA (botão ou volta automática), a IA responde na hora.
    const limite = [new Date(Date.now() - 15 * 60 * 1000).toISOString(), conv.atendimento === 'ia' && conv.atend_em ? conv.atend_em : ''].sort().pop();
    if (msgs.some((m) => m.direcao === 'out' && m.origem !== 'ia' && m.ocorrida_em > limite)) return { motivo: 'humano_assumiu' };
    const dia = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const naConversa = db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE conversa_id = ? AND origem = 'ia' AND tipo <> 'aviso' AND created_at >= ?").get(conversaId, dia).n;
    if (naConversa >= RESPOSTAS_CONVERSA_DIA) return { motivo: 'limite_conversa' };
    const noAtendimento = db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE conversa_id = ? AND origem = 'ia' AND tipo <> 'aviso' AND created_at >= ?").get(conversaId, inicio).n;
    if (noAtendimento >= RESPOSTAS_ATENDIMENTO) return { motivo: 'limite_atendimento' };
    const total = db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE origem = 'ia' AND tipo <> 'aviso' AND created_at >= ?").get(dia).n;
    if (total >= RESPOSTAS_DIA) return { motivo: 'limite_dia' };

    // "Repetida" só dentro do atendimento atual: o menu do atendimento anterior não impede o menu do novo.
    const ultimaIA = [...msgs].reverse().find((m) => m.origem === 'ia' && String(m.created_at || '') >= inicio);
    const novoAtendimento = !!conv.atend_inicio && !msgs.some((m) => m.origem === 'ia' && String(m.created_at || '') >= conv.atend_inicio);
    const enviar = (partes, extra = {}) => {
      const texto = partes.filter(Boolean).join('\n\n').trim();
      if (!texto) return { motivo: 'sem_resposta' };
      if (ultimaIA && ultimaIA.texto === texto) return { motivo: 'repetida' };
      // Confere de novo ANTES de enviar (a redação leva segundos): se a equipe assumiu ou concluiu nesse meio-tempo, a IA
      // não fala; se chegou mensagem nova do cliente, esta resposta ficou velha (a nova será tratada em seguida).
      const agoraConv = waStore.obterConversa(conversaId);
      const esperado = extra.transferida || extra.tipo === 'espera' ? 'aguardando' : 'ia';
      if (!agoraConv || agoraConv.atendimento !== esperado) return { motivo: 'mudou_estado' };
      if (!extra.transferida && extra.tipo !== 'espera') {
        const ult = ultimaDoCliente(conversaId);
        if (ult && ult.id !== ultima.id) return { motivo: 'analise_desatualizada' };
      }
      const r = waStore.enfileirar({ conversaId, texto, usuarioId: null, origem: 'ia' });
      if (r.erro) return { motivo: r.erro };
      db.prepare('UPDATE ia_analises SET aplicado_resumo = ? WHERE id = ?')
        .run(`${a.aplicado_resumo ? `${a.aplicado_resumo}; ` : ''}respondeu automaticamente${extra.tipo ? ` (${extra.tipo})` : ''}`.slice(0, 200), a.id);
      return { enviada: true, ...extra };
    };
    const transferir = (motivo, partes) => {
      const rotulo = C.MOTIVOS_TRANSFERENCIA[motivo] || C.MOTIVOS_TRANSFERENCIA.sem_informacao;
      waStore.mudarAtendimento(conversaId, 'aguardando', { motivo: rotulo });
      audit(reqIA(), 'wa_transferir', 'wa_conversas', conversaId, `IA transferiu para atendimento humano: ${rotulo}`);
      const r = enviar([...partes, central.texto('transferencia')], { tipo: 'transferência', transferida: motivo });
      return r.enviada ? r : { ...r, transferida: motivo };
    };

    // Já transferida: a IA não responde; manda no máximo um aviso de espera por período de espera.
    if (conv.atendimento === 'aguardando') {
      const aviso = central.texto('espera');
      if (!aviso || !waStore.marcarEspera(conversaId)) return { motivo: 'aguardando_humano' };
      return enviar([aviso], { tipo: 'espera' });
    }

    const textoUlt = String(ultima.texto || '');
    const at = a.resultado.atendimento || {};
    // Origem ≠ intenção: enquanto o cliente só cumprimentou ou disse de onde veio (ex.: "Vim pelo site"), o assunto não é
    // deduzido pela IA e ele recebe o menu geral. O fluxo de cadastro só começa quando ele escolhe ou diz que quer.
    const intencaoClara = !semIntencaoNoAtendimento(conv, msgs);
    const assunto = C.opcaoDoMenu(textoUlt) || (intencaoClara && at.opcao && at.opcao !== 'indefinido' ? at.opcao : null) || conv.atend_assunto || null;
    if (assunto && assunto !== conv.atend_assunto) waStore.definirAssunto(conversaId, assunto);

    const partes = [];
    const jaSaudou = !!conv.saudado_em;
    if (!jaSaudou && waStore.marcarSaudado(conversaId)) partes.push(central.texto('saudacao'));

    const motivoTransf = C.pediuHumano(textoUlt) ? 'pediu_humano' : (at.transferir ? at.motivo_transferencia : null);
    if (motivoTransf) return transferir(motivoTransf, partes);

    // Documento recebido (foto/PDF lido): confirma o RECEBIMENTO uma vez; com CNH e CRLV, o cadastro vai para análise.
    const ehDocumento = /📎/u.test(textoUlt) && (tipoDocumento(textoUlt) !== null || Object.keys(extrairDadosDocumentos([ultima])).length > 0);
    const confirmaDoc = ehDocumento ? central.texto('confirmacao_documentos') : '';
    if (confirmaDoc) {
      // O que já chegou: documentos lidos nesta conversa + o que a ficha do motorista já registra.
      const rec = documentosRecebidos(waStore.listarMensagens(conversaId, { limite: 500 }));
      const linha = conv.vinculo_tipo === 'motoristas' ? valoresAtuais('motoristas', conv.vinculo_id).linha : {};
      const tem = (tipo, campo) => !!rec[tipo] || ['Recebido — conferir', 'Conferido'].includes(linha[campo]);
      // Os 7 itens obrigatórios; nada conta como completo enquanto faltar um. Pede até 2 por vez (mensagem curta).
      const faltaTodos = DOCUMENTOS_MOTORISTA.filter((d) => !tem(d.tipo, d.campo)).map((d) => d.pedido);
      const falta = faltaTodos.slice(0, 2);
      if (!falta.length) return transferir('documentos', [...partes, `${confirmaDoc} Com isso, seu cadastro está aguardando análise da nossa equipe.`]);
      const lista = falta.length > 1 ? `${falta.slice(0, -1).join(', ')} e ${falta[falta.length - 1]}` : falta[0];
      const resto = faltaTodos.length > falta.length ? ` Depois disso, ainda faltarão ${faltaTodos.length - falta.length} item(ns) da lista.` : '';
      return enviar([...partes, `${confirmaDoc} Agora, envie também ${lista}.${resto}`], { tipo: 'confirmação de documento' });
    }

    // Menu: no primeiro contato sem assunto claro, ou quando o cliente pede.
    const menu = central.texto('menu');
    if (menu && (C.pediuMenu(textoUlt) || ((!jaSaudou || novoAtendimento) && !assunto))) return enviar([...partes, menu], { tipo: 'menu' });

    // Informações novas aplicadas ao cadastro: confirmação padrão (uma vez por informação nova).
    const novos = ((aplicacao && aplicacao.preenchidos) || []).filter((k) => !['observacoes', 'proxima_acao'].includes(k));
    const confirmaInfo = novos.length || (aplicacao && aplicacao.criado) ? central.texto('confirmacao_informacoes') : '';
    if (confirmaInfo) partes.push(confirmaInfo);

    // Resposta redigida (segunda chamada, sem nenhum dado do cadastro).
    let faltando = []; const internos = [];
    if (conv.vinculo_tipo) {
      const { linha } = valoresAtuais(conv.vinculo_tipo, conv.vinculo_id);
      const def = ENTITIES[conv.vinculo_tipo];
      faltando = (P.CAMPOS_IA[conv.vinculo_tipo] || []).filter((k) => !preenchido(linha[k]) && !['observacoes', 'proxima_acao'].includes(k))
        .map((k) => (def.fields.find((f) => f.key === k) || {}).label).filter(Boolean);
      for (const k of ['observacoes', 'proxima_acao', 'condicoes']) if (preenchido(linha[k])) internos.push(String(linha[k]));
    }
    internos.push(...[a.resultado.resumo, a.resultado.proxima_acao].filter(Boolean));
    // Redação do atendimento ATUAL (a conversa anterior, já concluída, não volta como assunto pendente).
    const doAtendimento = msgs.filter((m) => String(m.created_at || '') >= inicio);
    const { system, user } = P.montarPromptResposta({
      mensagens: doAtendimento.length ? doAtendimento : msgs.slice(-1), perfil: a.resultado.perfil, faltando, assunto,
      informacoes: central.informacoes(), jaSaudou: jaSaudou || partes.length > 0, confirmacaoEnviada: !!confirmaInfo
    });
    let r;
    try {
      const resp = await provedor.completar({ system, user, maxTokens: 500 });
      r = P.validarResposta(P.extrairJson(resp.texto));
    } catch (err) {
      return partes.length ? enviar(partes, { tipo: 'saudação' }) : { motivo: 'falha_redacao' };
    }
    if (r.transferir) return transferir(r.motivo, partes);
    if (!r.texto) return partes.length ? enviar(partes, { tipo: 'saudação' }) : { motivo: 'sem_resposta' };
    const filtro = P.respostaSegura(r.texto, { internos });
    if (!filtro.ok) {
      const motivo = `filtro_${filtro.motivo}`;
      return partes.length ? { ...enviar(partes, { tipo: 'saudação' }), motivo } : { motivo };
    }
    return enviar([...partes, r.texto]);
  }

  // Espera a pessoa terminar de escrever (várias mensagens seguidas) antes de gastar uma análise.
  function agendarAutomatico(conversaId, opcoes = {}) {
    const cfg = config();
    if (!cfg.ativo || cfg.modo !== 'automatico') return;
    clearTimeout(timers.get(conversaId));
    const atraso = atrasoMs();
    const t = setTimeout(() => { timers.delete(conversaId); executarAutomatico(conversaId, opcoes); }, atraso);
    if (t.unref) t.unref();
    timers.set(conversaId, t);
  }

  /* ------------------- chegada da mensagem: origem + confirmação rápida (12/11 noite) ------------------- */
  // O cliente não fica sem retorno: se a resposta de verdade não sair em IA_CONFIRMACAO_MS (padrão 6 s), vai UMA confirmação
  // de recebimento por vez de fala do cliente (modelo "recebimento"). Ela é tipo 'aviso': não conta como resposta, não
  // notifica, não muda a lista; a resposta definitiva vem depois. Com a IA desligada, sem chave ou fora do atendimento
  // da IA, nada é enviado.
  const confirmacaoMs = () => (process.env.IA_CONFIRMACAO_MS !== undefined ? Number(process.env.IA_CONFIRMACAO_MS) : 6000);
  function registrarChegada(conversaId, mensagemId) {
    try {
      const conv = waStore.obterConversa(conversaId);
      if (conv && !conv.origem_contato && mensagemId) {
        const m = db.prepare('SELECT texto FROM wa_mensagens WHERE id = ?').get(mensagemId);
        const origem = C.origemDoContato(m && m.texto);
        if (origem) db.prepare('UPDATE wa_conversas SET origem_contato = ? WHERE id = ? AND origem_contato IS NULL').run(origem, conversaId);
      }
    } catch (err) { log.error(`[ia] origem da conversa ${conversaId}: ${err.message}`); }
    const ms = confirmacaoMs();
    if (!(ms > 0) || ackTimers.has(conversaId)) return;
    const t = setTimeout(() => {
      ackTimers.delete(conversaId);
      try { enviarConfirmacao(conversaId); } catch (err) { log.error(`[ia] confirmação da conversa ${conversaId}: ${err.message}`); }
    }, ms);
    if (t.unref) t.unref();
    ackTimers.set(conversaId, t);
  }
  function enviarConfirmacao(conversaId) {
    const cfg = config();
    if (!cfg.ativo || cfg.modo !== 'automatico' || !cfg.responder || !cfg.chaveConfigurada) return { motivo: 'desligada' };
    const conv = waStore.obterConversa(conversaId);
    if (!conv || conv.atendimento !== 'ia') return { motivo: 'fora_da_ia' };
    const ult = ultimaDoCliente(conversaId);
    if (!ult || ult.direcao !== 'in') return { motivo: 'ja_respondida' };
    const ultSaida = db.prepare("SELECT MAX(id) id FROM wa_mensagens WHERE conversa_id = ? AND direcao = 'out' AND tipo <> 'aviso'").get(conversaId).id || 0;
    if (db.prepare("SELECT 1 FROM wa_mensagens WHERE conversa_id = ? AND tipo = 'aviso' AND id > ? LIMIT 1").get(conversaId, ultSaida)) return { motivo: 'ja_confirmada' };
    const texto = central.texto('recebimento');
    if (!texto) return { motivo: 'modelo_desligado' };
    const dia = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    if (db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE origem = 'ia' AND created_at >= ?").get(dia).n >= RESPOSTAS_DIA * 2) return { motivo: 'limite_dia' };
    const r = waStore.enfileirar({ conversaId, texto, usuarioId: null, origem: 'ia', tipo: 'aviso' });
    if (r.erro) return { motivo: r.erro };
    log.log(`[ia] conversa ${conversaId}: confirmação de recebimento enviada (resposta ainda em processamento)`);
    return { enviada: true };
  }
  /** Leitura de mídia em andamento (o transcritor avisa o começo e o fim). */
  function marcarLeitura(mensagemId, emAndamento) {
    if (emAndamento) midiasEmLeitura.add(Number(mensagemId)); else midiasEmLeitura.delete(Number(mensagemId));
  }

  /* --------------------- troca de atendimento (IA ⇄ equipe), repetível sem reiniciar --------------------- */
  // Equipe assumiu ou concluiu → a IA para NA HORA (tentativas e confirmações pendentes canceladas; o envio confere o estado
  // de novo). Devolvida à IA → volta a responder; se a última mensagem é do cliente e ninguém respondeu, ela responde.
  // Mudanças feitas pelo sistema (celular, volta automática, novo atendimento) ficam na auditoria.
  if (typeof waStore.ouvir === 'function') waStore.ouvir((evt) => {
    if (!evt || evt.tipo !== 'atendimento') return;
    const id = evt.conversaId;
    try {
      if (evt.para === 'humano' || evt.para === 'concluido') {
        clearTimeout(timers.get(id)); timers.delete(id);
        clearTimeout(ackTimers.get(id)); ackTimers.delete(id);
        deNovoDepois.delete(id);
        const c = waStore.obterConversa(id);
        if (c && ['tentando', 'processando'].includes(c.ia_estado) && !processando.has(id)) marcarEstado(id, 'sem_acao', { erro: evt.para === 'humano' ? 'humano_assumiu' : 'concluida' });
      }
      if (evt.para === 'ia' && (evt.de === 'humano' || evt.de === 'aguardando') && !processando.has(id)) {
        const u = ultimaDoCliente(id);
        if (u && u.direcao === 'in' && String(u.created_at || '') >= new Date(Date.now() - RECUPERAR_HORAS * 3600000).toISOString()) agendarAutomatico(id);
      }
      if (!evt.usuarioId) {
        const r = reqIA();
        if (evt.para === 'humano') audit(r, 'wa_assumir', 'wa_conversas', id, 'Atendimento humano: a equipe respondeu pelo celular (IA parou)');
        else if (evt.para === 'ia' && evt.de === 'humano') audit(r, 'wa_devolver_ia', 'wa_conversas', id, 'Conversa voltou para a IA automaticamente (equipe sem responder)');
        else if (evt.para === 'ia' && evt.de === 'concluido') audit(r, 'wa_reabrir', 'wa_conversas', id, 'Novo atendimento: o cliente voltou a escrever depois do encerramento');
      }
    } catch (err) { log.error(`[ia] troca de atendimento da conversa ${id}: ${err.message}`); }
  });

  async function testar() {
    const r = await provedor.completar({ system: 'Responda apenas com a palavra OK.', user: 'Teste de conexão.', maxTokens: 20 });
    return { ok: /ok/i.test(r.texto), modelo: r.modelo, reserva: r.reserva || null };
  }

  const usarProvedor = (novo) => { provedor = novo; };

  return { central, obterModelo, config, salvarConfig, analisar, ultimaAnalise, aplicar, agendarAutomatico, executarAutomatico, responderAutomatico, testar, usarProvedor, usoDoDia, resolverProvedor, provedorAtual,
    recuperarPendentes, iniciarRecuperacao, pararRecuperacao, reprocessar, registrarChegada, enviarConfirmacao, marcarLeitura };
}

module.exports = { createIaService, MODELO_PADRAO, PROVEDOR_PADRAO };
