'use strict';
// Rotas /api/wa/*. Todas exigem sessão (registradas depois do requireAuth).
// Perfis: admin e gestor atendem (ver, responder, vincular, criar tarefa); só admin liga/pareia/desconecta,
// ignora contato e exclui conversa (privacidade).
const { isValidWaPhone, toWaPhone, displayPhone } = require('./phone');
const { VINCULOS, MAX_TEXTO } = require('./store');

const { ESTADOS } = require('../ia/central');

function registrar(router, { service, fail, audit, requireAdmin, ENTITIES, entities, db, central }) {
  const store = service.store;
  const idDe = (req) => Number(req.params.id);
  const ID_INVALIDO = (res) => fail(res, 400, 'invalid_id', 'Identificador inválido.');

  const publica = (c) => ({ ...c, telefone_exibicao: displayPhone(c.telefone), atendimento_nome: ESTADOS[c.atendimento] || ESTADOS.ia });

  /* ------------------------------- conexão ------------------------------- */
  router.get('/wa/status', (req, res) => {
    const e = service.estado();
    const base = { ativo: e.ativo, state: e.canal.state, nao_lidas: store.contarNaoLidas() };
    if (req.user.role !== 'admin') return res.json(base);
    res.json({ ...base, phone: e.canal.phone, phone_exibicao: displayPhone(e.canal.phone), detail: e.canal.detail, fila: e.fila });
  });

  router.post('/wa/ativar', requireAdmin, async (req, res) => {
    const ativo = req.body.ativo === true;
    try { await service.definirAtivo(ativo); } catch (err) { return fail(res, 500, 'wa_error', err.message); }
    audit(req, ativo ? 'wa_ativar' : 'wa_desativar', 'whatsapp', null, ativo ? 'WhatsApp ativado' : 'WhatsApp desativado');
    res.json({ ok: true, ...service.estado() });
  });

  router.post('/wa/parear', requireAdmin, async (req, res) => {
    if (!isValidWaPhone(req.body.telefone)) return fail(res, 422, 'invalid_phone', 'Informe o número do WhatsApp com DDD (ex.: 85 99999-0000).');
    const telefone = toWaPhone(req.body.telefone);
    try {
      const r = await service.parear(telefone);
      audit(req, 'wa_parear', 'whatsapp', null, `Código de pareamento gerado para ${displayPhone(telefone)}`);
      res.json({ code: r.code, telefone_exibicao: displayPhone(telefone) });
    } catch (err) {
      fail(res, 502, 'wa_pair_failed', err.message || 'Não foi possível gerar o código.');
    }
  });

  router.post('/wa/desconectar', requireAdmin, async (req, res) => {
    try { await service.desconectar(); } catch (err) { return fail(res, 500, 'wa_error', err.message); }
    audit(req, 'wa_desconectar', 'whatsapp', null, 'WhatsApp desconectado e sessão apagada');
    res.json({ ok: true });
  });

  /* ------------------------------- conversas ------------------------------ */
  router.get('/wa/conversas', (req, res) => {
    const r = store.listarConversas({
      situacao: req.query.situacao, atendimento: req.query.atendimento, naoLidas: req.query.nao_lidas === '1', q: req.query.q,
      responsavelId: req.query.responsavel_id, page: req.query.page, size: req.query.size
    });
    res.json({ ...r, items: r.items.map(publica), contagem: store.contarPorAtendimento() });
  });

  router.get('/wa/conversas/:id', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    const c = store.obterConversa(id);
    if (!c) return fail(res, 404, 'not_found', 'Conversa não encontrada.');
    res.json({ item: publica(c), eventos: store.listarEventos(id) });
  });

  router.get('/wa/conversas/:id/mensagens', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    if (!store.obterConversa(id)) return fail(res, 404, 'not_found', 'Conversa não encontrada.');
    res.json({ items: store.listarMensagens(id, { depois: req.query.depois }) });
  });

  router.post('/wa/conversas/:id/mensagens', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    const c = store.obterConversa(id);
    if (!c) return fail(res, 404, 'not_found', 'Conversa não encontrada.');
    if (c.ignorado) return fail(res, 409, 'ignored', 'Este contato está ignorado.');
    if (!service.conectado()) return fail(res, 409, 'wa_offline', 'O WhatsApp está desconectado. Peça a um administrador para reconectar.');
    const r = store.enfileirar({ conversaId: id, texto: req.body.texto, usuarioId: req.user.id });
    if (r.erro) return fail(res, r.status || 422, 'invalid', r.erro);
    // Quem responde pelo CRM assume a conversa: a IA para de responder até alguém devolver.
    if (c.atendimento !== 'humano' && c.atendimento !== 'concluido') {
      store.mudarAtendimento(id, 'humano', { usuarioId: req.user.id, detalhe: 'Respondeu pelo CRM' });
    }
    service.cutucar();
    res.status(201).json({ item: r.mensagem });
  });

  router.post('/wa/mensagens/:id/reenviar', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    if (!service.conectado()) return fail(res, 409, 'wa_offline', 'O WhatsApp está desconectado.');
    const r = store.reenviar(id);
    if (r.erro) return fail(res, r.status || 422, 'invalid', r.erro);
    service.cutucar();
    res.json({ ok: true });
  });

  router.post('/wa/conversas/:id/lida', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    store.marcarLida(id);
    res.json({ ok: true });
  });

  router.patch('/wa/conversas/:id', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    const r = store.atualizarConversa(id, {
      situacao: req.body.situacao,
      responsavelId: req.body.responsavel_id === undefined ? undefined
        : (req.body.responsavel_id === null || req.body.responsavel_id === '' ? null : Number(req.body.responsavel_id))
    });
    if (r.erro) return fail(res, r.status || 422, 'invalid', r.erro);
    res.json({ item: publica(store.obterConversa(id)) });
  });

  // Ações do atendimento: assumir (humano), devolver para a IA, concluir (com mensagem de encerramento opcional).
  router.post('/wa/conversas/:id/atendimento', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    const c = store.obterConversa(id);
    if (!c) return fail(res, 404, 'not_found', 'Conversa não encontrada.');
    const acao = String(req.body.acao || '');
    if (acao === 'assumir') {
      store.mudarAtendimento(id, 'humano', { usuarioId: req.user.id, detalhe: c.atend_motivo ? `Motivo: ${c.atend_motivo}` : '' });
      audit(req, 'wa_assumir', 'wa_conversas', id, 'Atendimento assumido');
    } else if (acao === 'devolver') {
      store.mudarAtendimento(id, 'ia', { usuarioId: req.user.id, detalhe: 'Devolvida para o atendimento automático' });
      audit(req, 'wa_devolver_ia', 'wa_conversas', id, 'Conversa devolvida para a IA');
    } else if (acao === 'concluir') {
      let enviou = false;
      if (req.body.enviar_encerramento === true) {
        const texto = central ? central.texto('encerramento') : '';
        if (!texto) return fail(res, 409, 'sem_modelo', 'A mensagem de encerramento está desativada em Modelos de Comunicação da IA.');
        if (c.ignorado) return fail(res, 409, 'ignored', 'Este contato está ignorado.');
        if (!service.conectado()) return fail(res, 409, 'wa_offline', 'O WhatsApp está desconectado. Conclua sem a mensagem ou reconecte.');
        const r = store.enfileirar({ conversaId: id, texto, usuarioId: req.user.id });
        if (r.erro) return fail(res, r.status || 422, 'invalid', r.erro);
        enviou = true;
        service.cutucar();
      }
      store.mudarAtendimento(id, 'concluido', { usuarioId: req.user.id, detalhe: enviou ? 'Concluído com mensagem de encerramento' : 'Concluído' });
      audit(req, 'wa_concluir', 'wa_conversas', id, enviou ? 'Atendimento concluído (encerramento enviado)' : 'Atendimento concluído');
    } else {
      return fail(res, 422, 'invalid', 'Ação inválida.');
    }
    res.json({ item: publica(store.obterConversa(id)), eventos: store.listarEventos(id) });
  });

  router.post('/wa/conversas/:id/vincular', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    const c = store.obterConversa(id);
    if (!c) return fail(res, 404, 'not_found', 'Conversa não encontrada.');
    const tipo = String(req.body.tipo || '');
    if (tipo && !Object.prototype.hasOwnProperty.call(VINCULOS, tipo)) return fail(res, 422, 'invalid', 'Tipo de cadastro inválido.');
    const r = store.definirVinculo(c.contato_id, tipo, req.body.id);
    if (r.erro) return fail(res, 422, 'invalid', r.erro);
    audit(req, 'wa_vincular', 'wa_contatos', c.contato_id, tipo ? `Conversa vinculada a ${tipo} #${Number(req.body.id)}` : 'Vínculo removido');
    res.json({ item: publica(store.obterConversa(id)) });
  });

  // Cria uma tarefa a partir da conversa (já vinculada ao cadastro, quando houver).
  router.post('/wa/conversas/:id/tarefa', (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    const c = store.obterConversa(id);
    if (!c) return fail(res, 404, 'not_found', 'Conversa não encontrada.');
    const quem = c.vinculo_nome || c.nome || displayPhone(c.telefone) || 'contato';
    const corpo = {
      titulo: String(req.body.titulo || '').trim() || `Retornar WhatsApp: ${quem}`.slice(0, 120),
      data_vencimento: req.body.data_vencimento,
      prioridade: req.body.prioridade || 'Média',
      situacao: 'Pendente',
      observacoes: `Origem: conversa de WhatsApp com ${quem}${c.telefone ? ` (${displayPhone(c.telefone)})` : ''}.`
    };
    if (c.vinculo_tipo) { corpo.entidade_tipo = c.vinculo_tipo; corpo.entidade_id = c.vinculo_id; }
    const r = entities.createEntity(ENTITIES.tarefas, corpo, req);
    if (r.errors) return res.status(r.status).json({ error: { code: 'validation', message: 'Verifique os campos destacados.', fields: r.errors } });
    res.status(201).json({ item: r.item });
  });

  /* ------------------------ privacidade (somente admin) ------------------- */
  router.post('/wa/contatos/:id/ignorar', requireAdmin, (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    if (!store.ignorarContato(id)) return fail(res, 404, 'not_found', 'Contato não encontrado.');
    audit(req, 'wa_ignorar', 'wa_contatos', id, 'Contato ignorado e conversa apagada');
    res.json({ ok: true });
  });

  router.delete('/wa/conversas/:id', requireAdmin, (req, res) => {
    const id = idDe(req);
    if (!Number.isInteger(id)) return ID_INVALIDO(res);
    if (!store.excluirConversa(id)) return fail(res, 404, 'not_found', 'Conversa não encontrada.');
    audit(req, 'wa_excluir_conversa', 'wa_conversas', id, 'Conversa de WhatsApp excluída');
    res.json({ ok: true });
  });

  void db; void MAX_TEXTO;
}

module.exports = { registrar };
