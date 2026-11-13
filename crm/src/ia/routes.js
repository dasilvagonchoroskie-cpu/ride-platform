'use strict';
// Rotas da IA. Atender (analisar, aplicar) é de admin e gestor; configurar (chave, modo, limites) é só do admin.
const { ErroIA, ehProvedor } = require('./provider');

const STATUS_HTTP = {
  desativada: 409, sem_chave: 422, limite_diario: 429, em_andamento: 409, sem_mensagens: 409, nao_encontrada: 404,
  chave_invalida: 502, sem_saldo: 502, url_invalida: 422, modelo_invalido: 502, limite_provedor: 503, indisponivel: 503, timeout: 504, rede: 502,
  resposta_invalida: 502, resposta_vazia: 502, requisicao_invalida: 502, invalido: 422, nao_ia: 409, ja_respondida: 409
};

function registrar(router, { ia, cofre, fail, audit, requireAdmin }) {
  const idDe = (req) => Number(req.params.id);
  const ID_INVALIDO = (res) => fail(res, 400, 'invalid_id', 'Identificador inválido.');
  const erroIA = (res, err) => {
    if (err instanceof ErroIA) return fail(res, STATUS_HTTP[err.codigo] || 502, `ia_${err.codigo}`, err.message);
    return fail(res, 500, 'ia_error', 'Erro inesperado na IA.');
  };

  router.get('/ia/status', (req, res) => {
    const c = ia.config();
    const base = { ativo: c.ativo, modo: c.modo, pronta: c.ativo && c.chaveConfigurada, responder: c.ativo && c.modo === 'automatico' && c.responder };
    if (req.user.role !== 'admin') return res.json(base);
    res.json({ ...base, provedor: c.provedor, reserva: c.reserva, provedor_nome: c.provedorNome, url_base: c.urlBase, provedores: c.provedores,
      criar_cadastro: c.criarCadastro, responder: c.responder, limite_dia: c.limiteDia, humano_pausa: c.humanoPausa, transcrever: c.transcrever, transcricoes_hoje: c.transcricoesHoje, modelo: c.modelo, chave_configurada: c.chaveConfigurada,
      chave_final4: c.chaveFinal4, chave_origem: c.chaveOrigem, uso: c.uso });
  });

  router.post('/ia/config', requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      // A chave vale para o provedor escolhido nesta mesma requisição (ou o atual): nunca vai para outro provedor.
      if (b.provedor !== undefined && !ehProvedor(b.provedor)) throw new ErroIA('invalido', 'Provedor de IA inválido.');
      if (b.reserva !== undefined && (typeof b.reserva !== 'string' || (b.reserva !== '' && !ehProvedor(b.reserva)))) throw new ErroIA('invalido', 'Provedor reserva inválido.');
      const prov = b.provedor !== undefined ? b.provedor : ia.provedorAtual();
      if (b.remover_chave === true) cofre.apagar(prov);
      else if (b.chave !== undefined && String(b.chave).trim() !== '') cofre.gravar(b.chave, prov);
      ia.salvarConfig({
        provedor: b.provedor,
        reserva: b.reserva,
        urlBase: b.url_base,
        ativo: b.ativo === undefined ? undefined : b.ativo === true,
        modo: b.modo,
        criarCadastro: b.criar_cadastro === undefined ? undefined : b.criar_cadastro === true,
        transcrever: b.transcrever === undefined ? undefined : b.transcrever === true,
        responder: b.responder === undefined ? undefined : b.responder === true,
        limiteDia: b.limite_dia,
        humanoPausa: b.humano_pausa,
        modelo: b.modelo
      });
    } catch (err) {
      return fail(res, 422, 'ia_invalido', err.message || 'Configuração inválida.');
    }
    // A chave nunca entra no texto da auditoria.
    audit(req, 'ia_config', 'ia', null, `Configuração da IA alterada (${ia.config().provedorNome})${req.body && req.body.chave ? ' (chave atualizada)' : ''}${req.body && req.body.remover_chave ? ' (chave removida)' : ''}`);
    const c = ia.config();
    res.json({ ok: true, ativo: c.ativo, modo: c.modo, provedor: c.provedor, criar_cadastro: c.criarCadastro, responder: c.responder, limite_dia: c.limiteDia, transcrever: c.transcrever, transcricoes_hoje: c.transcricoesHoje, modelo: c.modelo,
      chave_configurada: c.chaveConfigurada, chave_final4: c.chaveFinal4, chave_origem: c.chaveOrigem });
  });

  router.post('/ia/testar', requireAdmin, async (req, res) => {
    try { res.json(await ia.testar()); } catch (err) { erroIA(res, err); }
  });

  /* ---------------------- Modelos de Comunicação da IA (Central) ---------------------- */
  // Todos que atendem podem ver; só o administrador edita.
  router.get('/ia/modelos', (req, res) => {
    res.json({ modelos: ia.central.modelos(), site_url: ia.central.siteUrl(), informacoes: ia.central.informacoes(), informacoes_situacao: ia.central.situacaoInformacoes() });
  });

  router.put('/ia/modelos', requireAdmin, (req, res) => {
    const b = req.body || {};
    try {
      if (b.modelos !== undefined) ia.central.salvarModelos(b.modelos);
      if (b.site_url !== undefined) ia.central.salvarSite(b.site_url);
      if (b.informacoes !== undefined) ia.central.salvarInformacoes(b.informacoes);
    } catch (err) {
      return fail(res, 422, 'invalid', err.message);
    }
    audit(req, 'ia_modelos', 'ia', null, 'Modelos de Comunicação da IA alterados');
    res.json({ ok: true, modelos: ia.central.modelos(), site_url: ia.central.siteUrl(), informacoes: ia.central.informacoes(), informacoes_situacao: ia.central.situacaoInformacoes() });
  });

  router.post('/wa/conversas/:id/analisar', async (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    try {
      const a = await ia.analisar(id, { forcar: req.body && req.body.forcar === true, usuarioId: req.user.id });
      res.json({ item: a });
    } catch (err) { erroIA(res, err); }
  });

  // Tratar de novo a última mensagem do cliente (falhou, ficou pendente). Admin e gestor, como "Assumir"/"Devolver".
  router.post('/wa/conversas/:id/ia/reprocessar', async (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    try {
      const conversa = await ia.reprocessar(id);
      audit(req, 'ia_reprocessar', 'wa_conversas', id, `IA reprocessou a última mensagem: ${conversa && conversa.ia_estado ? conversa.ia_estado : 'sem estado'}`);
      res.json({ ok: true, ia_estado: conversa.ia_estado, ia_erro: conversa.ia_erro, atendimento: conversa.atendimento });
    } catch (err) { erroIA(res, err); }
  });

  router.get('/wa/conversas/:id/analise', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    res.json({ item: ia.ultimaAnalise(id) });
  });

  router.post('/wa/conversas/:id/aplicar', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    const r = ia.aplicar(id, { criar: req.body && req.body.criar === true }, req);
    if (r.erro) return res.status(r.status || 422).json({ error: { code: 'ia_aplicar', message: r.erro, faltando: r.faltando || [] } });
    res.json({ ok: true, ...r });
  });
}

module.exports = { registrar, STATUS_HTTP };
