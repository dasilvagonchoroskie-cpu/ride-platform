'use strict';
// Assistente de IA: analisa conversas do WhatsApp (resumo, assunto, urgência, dados do cadastro, resposta sugerida)
// e, se o administrador permitir, aplica os dados nos cadastros. A IA NUNCA envia mensagem sozinha.
const { ErroIA, PROVEDORES, ehProvedor, urlBaseValida } = require('./provider');
const P = require('./prompt');
const { displayPhone } = require('../whatsapp/phone');

const MODELO_PADRAO = 'claude-haiku-5-5';
// Padrão para instalação nova: o Gemini tem plano grátis sem cartão.
const PROVEDOR_PADRAO = 'gemini';
const tipoParaPerfil = { motoristas: 'motorista', passageiros: 'passageiro', parceiros: 'parceiro' };
const preenchido = (v) => v !== null && v !== undefined && String(v).trim() !== '';

function createIaService({ db, waStore, entities, ENTITIES, audit, getSetting, setSetting, cofre, provider, todayISO, nowISO, log = console }) {
  let provedor = provider;
  const travas = new Set();
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
      limiteDia: Number(getSetting('ia_limite_dia', '150')) || 150,
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
    if (p.criarCadastro !== undefined) setSetting('ia_criar_cadastro', p.criarCadastro ? '1' : '0');
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
    if (anterior && anterior.mensagem_ate_id === ultimoId && !forcar) return { ...anterior, reaproveitada: true };
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

      const chavesPermitidas = tipoAlvo ? P.CAMPOS_IA[tipoAlvo] : ['nome', 'cidade', 'proxima_acao'];
      const resultado = P.validarResultado(bruto, { chavesPermitidas });
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
    }

    const resumo = saida.criado ? `criou ${saida.criado.tipo} #${saida.criado.id}` : (saida.preenchidos.length ? `preencheu: ${saida.preenchidos.join(', ')}` : 'nada a preencher');
    db.prepare('UPDATE ia_analises SET aplicado_em = ?, aplicado_resumo = ? WHERE id = ?').run(nowISO(), resumo, analise.id);
    return saida;
  }

  /* ------------------------------------------ automático ------------------------------------------ */
  const reqIA = () => ({ app: { locals: { db } }, user: { id: null, nome: 'Assistente IA' }, headers: {}, ip: '', socket: {} });

  async function executarAutomatico(conversaId) {
    try {
      const cfg = config();
      if (!cfg.ativo || cfg.modo !== 'automatico' || !cfg.chaveConfigurada) return;
      await analisar(conversaId, { origem: 'automatica' });
      aplicar(conversaId, { criar: cfg.criarCadastro }, reqIA());
    } catch (err) {
      // Falha da IA nunca atrapalha o atendimento: só fica no log.
      log.error(`[ia] análise automática da conversa ${conversaId}: ${err.message}`);
    }
  }

  // Espera a pessoa terminar de escrever (várias mensagens seguidas) antes de gastar uma análise.
  function agendarAutomatico(conversaId) {
    const cfg = config();
    if (!cfg.ativo || cfg.modo !== 'automatico') return;
    clearTimeout(timers.get(conversaId));
    const atraso = process.env.IA_ATRASO_MS !== undefined ? Number(process.env.IA_ATRASO_MS) : 15000;
    const t = setTimeout(() => { timers.delete(conversaId); executarAutomatico(conversaId); }, atraso);
    if (t.unref) t.unref();
    timers.set(conversaId, t);
  }

  async function testar() {
    const r = await provedor.completar({ system: 'Responda apenas com a palavra OK.', user: 'Teste de conexão.', maxTokens: 20 });
    return { ok: /ok/i.test(r.texto), modelo: r.modelo, reserva: r.reserva || null };
  }

  const usarProvedor = (novo) => { provedor = novo; };

  return { config, salvarConfig, analisar, ultimaAnalise, aplicar, agendarAutomatico, executarAutomatico, testar, usarProvedor, usoDoDia, resolverProvedor, provedorAtual };
}

module.exports = { createIaService, MODELO_PADRAO, PROVEDOR_PADRAO };
