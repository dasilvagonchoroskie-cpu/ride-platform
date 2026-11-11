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

// Motivos de a IA não responder, em português (aparecem no painel da conversa e no registro do servidor).
const MOTIVOS = {
  sem_resposta: 'a IA não sugeriu resposta', ja_respondida: 'a última mensagem já tinha resposta',
  analise_desatualizada: 'chegou mensagem nova durante a análise', humano_assumiu: 'a equipe respondeu há menos de 15 min',
  limite_conversa: 'limite de respostas da IA nesta conversa', limite_dia: 'limite diário de respostas da IA', repetida: 'seria repetida',
  falha_redacao: 'a IA não conseguiu redigir', filtro_numero: 'bloqueada: continha número de documento', filtro_link_ou_email: 'bloqueada: continha link ou e-mail',
  filtro_dado_interno: 'bloqueada: repetia anotação interna', filtro_longa: 'bloqueada: longa demais', filtro_vazia: 'a IA não sugeriu resposta',
  atendimento_humano: 'conversa em atendimento humano', aguardando_humano: 'aguardando atendimento humano (aviso de espera já enviado)',
  em_andamento: 'outra resposta em andamento', concluida: 'atendimento concluído'
};

function createIaService({ db, waStore, entities, ENTITIES, audit, getSetting, setSetting, cofre, provider, todayISO, nowISO, log = console }) {
  let provedor = provider;
  const travas = new Set();
  const respondendo = new Set();
  const central = C.criarCentral({ getSetting, setSetting });
  const timers = new Map();

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
    const mensagens = waStore.listarMensagens(conversaId, { limite: 60 });
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

  // Ficha do motorista: marca cada documento que chegou pela conversa (CNH, CRLV, comprovante de endereço) como
  // "Recebido — conferir" (nunca desfaz "Conferido"), resume a situação dos documentos e avança a etapa do cadastro:
  // algum documento → "Cadastro em andamento"; os três → "Cadastro em análise". Aprovar e contratar é sempre da equipe.
  const CAMPO_DOC = { cnh: 'doc_cnh', crlv: 'doc_crlv', endereco: 'doc_endereco' };
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
    const geral = conferidos === 3 ? 'Conferidos' : recebidos === 3 ? 'Recebidos — conferir' : recebidos > 0 ? 'Incompletos' : 'Não enviados';
    if (linha.documentos !== 'Conferidos' && linha.documentos !== geral) corpo.documentos = geral;
    let novaEtapa = null;
    if (recebidos === 3 && [...ETAPAS_INICIAIS, 'Cadastro em andamento'].includes(linha.situacao)) novaEtapa = 'Cadastro em análise';
    else if (recebidos > 0 && ETAPAS_INICIAIS.includes(linha.situacao)) novaEtapa = 'Cadastro em andamento';
    if (novaEtapa) corpo.situacao = novaEtapa;
    if (!Object.keys(corpo).length) return { recebidos, situacao: linha.situacao };
    const r = entities.updateEntity(def, motoristaId, corpo, req);
    if (r.errors || r.error) return null;
    if (novaEtapa) {
      entities.logInteraction('motoristas', motoristaId, req, `Etapa atualizada automaticamente: ${recebidos} de 3 documentos recebidos pelo WhatsApp (conferir na ficha).`, linha.situacao, novaEtapa, 'WhatsApp');
    }
    audit(req, 'ia_documentos', 'motoristas', motoristaId, `Documentos marcados pelo servidor: ${Object.keys(corpo).join(', ')}`);
    return { recebidos, situacao: novaEtapa || linha.situacao };
  }

  /* ------------------------------------------ automático ------------------------------------------ */
  const reqIA = () => ({ app: { locals: { db } }, user: { id: null, nome: 'Assistente IA' }, headers: {}, ip: '', socket: {} });

  async function executarAutomatico(conversaId, { forcar = false } = {}) {
    try {
      const cfg = config();
      if (!cfg.ativo || cfg.modo !== 'automatico' || !cfg.chaveConfigurada) return;
      // Um contato sozinho não esgota a cota de todos: no máximo ANALISES_CONVERSA_DIA análises automáticas por conversa/dia.
      const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const feitas = db.prepare("SELECT COUNT(*) n FROM ia_analises WHERE conversa_id = ? AND origem = 'automatica' AND criado_em >= ?").get(conversaId, desde).n;
      if (feitas >= ANALISES_CONVERSA_DIA) { log.log(`[ia] conversa ${conversaId}: limite de análises automáticas do dia para este contato`); return; }
      const a = await analisar(conversaId, { origem: 'automatica', forcar });
      const ap = aplicar(conversaId, { criar: cfg.criarCadastro }, reqIA());
      let resp = 'resposta automática desligada';
      if (cfg.responder) {
        const r = await responderAutomatico(conversaId, { aplicacao: ap });
        resp = r.enviada ? `respondeu${r.tipo ? ` (${r.tipo})` : ''}${r.transferida ? `; transferida: ${r.transferida}` : ''}` : `não respondeu: ${MOTIVOS[r.motivo] || r.motivo}`;
        if (!r.enviada) {
          const atual = ultimaAnalise(conversaId);
          if (atual) db.prepare('UPDATE ia_analises SET aplicado_resumo = ? WHERE id = ?').run(`${atual.aplicado_resumo || ''}; ${resp}`.replace(/^; /, '').slice(0, 200), atual.id);
        }
      }
      // Registro sem dados pessoais: só nomes de campos e decisões.
      log.log(`[ia] conversa ${conversaId}: perfil=${a.resultado.perfil} campos=[${Object.keys(a.resultado.campos || {}).join(',')}] `
        + `${ap.erro ? `cadastro: ${ap.erro}` : (ap.criado ? `criou ${ap.criado.tipo}` : `preencheu=[${(ap.preenchidos || []).join(',')}]`)}; ${resp}`);
    } catch (err) {
      // Falha da IA nunca atrapalha o atendimento: só fica no log.
      log.error(`[ia] análise automática da conversa ${conversaId}: ${err.message}`);
    }
  }

  // Resposta automática (só se o administrador ligar). Travas de segurança:
  //  - só responde se a última mensagem da conversa é do cliente e a análise cobre essa mensagem;
  //  - se uma pessoa da equipe respondeu nos últimos 15 min (CRM ou celular), a IA fica quieta (humano assumiu);
  //  - no máximo RESPOSTAS_CONVERSA_DIA respostas da IA por conversa em 24 h e RESPOSTAS_DIA no total por dia;
  //  - não repete a mesma frase que acabou de mandar.
  const RESPOSTAS_CONVERSA_DIA = Number(process.env.IA_RESPOSTAS_CONVERSA_DIA) || 15;
  const RESPOSTAS_DIA = Number(process.env.IA_RESPOSTAS_DIA) || 300;
  const ANALISES_CONVERSA_DIA = Number(process.env.IA_ANALISES_CONVERSA_DIA) || 25;
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
    const msgs = waStore.listarMensagens(conversaId, { limite: 30 });
    const ultima = msgs[msgs.length - 1];
    if (!ultima || ultima.direcao !== 'in') return { motivo: 'ja_respondida' };
    if (a.mensagem_ate_id !== ultima.id) return { motivo: 'analise_desatualizada' };
    // Trava antiga de 15 min: só vale para resposta da equipe DEPOIS da última mudança de estado. Se a conversa foi
    // devolvida para a IA (botão ou volta automática), a IA responde na hora.
    const limite = [new Date(Date.now() - 15 * 60 * 1000).toISOString(), conv.atendimento === 'ia' && conv.atend_em ? conv.atend_em : ''].sort().pop();
    if (msgs.some((m) => m.direcao === 'out' && m.origem !== 'ia' && m.ocorrida_em > limite)) return { motivo: 'humano_assumiu' };
    const dia = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const naConversa = db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE conversa_id = ? AND origem = 'ia' AND created_at >= ?").get(conversaId, dia).n;
    if (naConversa >= RESPOSTAS_CONVERSA_DIA) return { motivo: 'limite_conversa' };
    const total = db.prepare("SELECT COUNT(*) n FROM wa_mensagens WHERE origem = 'ia' AND created_at >= ?").get(dia).n;
    if (total >= RESPOSTAS_DIA) return { motivo: 'limite_dia' };

    const ultimaIA = [...msgs].reverse().find((m) => m.origem === 'ia');
    const enviar = (partes, extra = {}) => {
      const texto = partes.filter(Boolean).join('\n\n').trim();
      if (!texto) return { motivo: 'sem_resposta' };
      if (ultimaIA && ultimaIA.texto === texto) return { motivo: 'repetida' };
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
    const assunto = C.opcaoDoMenu(textoUlt) || (at.opcao && at.opcao !== 'indefinido' ? at.opcao : null) || conv.atend_assunto || null;
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
      const falta = [];
      if (!tem('cnh', 'doc_cnh')) falta.push('a foto da CNH');
      if (!tem('crlv', 'doc_crlv')) falta.push('a foto do documento do veículo (CRLV)');
      if (!tem('endereco', 'doc_endereco')) falta.push('um comprovante de endereço (conta de luz, água ou internet)');
      if (!falta.length) return transferir('documentos', [...partes, `${confirmaDoc} Com isso, seu cadastro está aguardando análise da nossa equipe.`]);
      const lista = falta.length > 1 ? `${falta.slice(0, -1).join(', ')} e ${falta[falta.length - 1]}` : falta[0];
      return enviar([...partes, `${confirmaDoc} Agora, envie também ${lista}.`], { tipo: 'confirmação de documento' });
    }

    // Menu: no primeiro contato sem assunto claro, ou quando o cliente pede.
    const menu = central.texto('menu');
    if (menu && (C.pediuMenu(textoUlt) || (!jaSaudou && !assunto))) return enviar([...partes, menu], { tipo: 'menu' });

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
    const { system, user } = P.montarPromptResposta({
      mensagens: msgs, perfil: a.resultado.perfil, faltando, assunto,
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
    const atraso = process.env.IA_ATRASO_MS !== undefined ? Number(process.env.IA_ATRASO_MS) : 15000;
    const t = setTimeout(() => { timers.delete(conversaId); executarAutomatico(conversaId, opcoes); }, atraso);
    if (t.unref) t.unref();
    timers.set(conversaId, t);
  }

  async function testar() {
    const r = await provedor.completar({ system: 'Responda apenas com a palavra OK.', user: 'Teste de conexão.', maxTokens: 20 });
    return { ok: /ok/i.test(r.texto), modelo: r.modelo, reserva: r.reserva || null };
  }

  const usarProvedor = (novo) => { provedor = novo; };

  return { central, obterModelo, config, salvarConfig, analisar, ultimaAnalise, aplicar, agendarAutomatico, executarAutomatico, responderAutomatico, testar, usarProvedor, usoDoDia, resolverProvedor, provedorAtual };
}

module.exports = { createIaService, MODELO_PADRAO, PROVEDOR_PADRAO };
