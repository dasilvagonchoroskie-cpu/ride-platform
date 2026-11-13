'use strict';
// Avaliação de candidatos (Etapa 2, 12/11/2026, pedido do dono).
//  - Uma candidatura por ficha de motorista/entregador. A ETAPA da avaliação é independente da situação de contratação da
//    ficha e do simples envio de documentos (documento recebido nunca aprova ninguém).
//  - DECISÃO FINAL (aprovado/recusado) só do administrador (o proprietário), com confirmação; recusa exige motivo.
//    Aprovar aqui NÃO contrata a ficha nem libera o motorista no aplicativo: contratar continua no botão da ficha e liberar
//    no aplicativo continua na Central da plataforma.
//  - Avaliador de cadastros (perfil `avaliador`, ex.: o doutor Jean): consulta candidatos das funções liberadas, vê os dados
//    necessários à avaliação (sem telefone/e-mail/anotações internas), abre os documentos liberados e registra PARECERES.
//    Não decide, não exclui, não altera documentos, não exporta. Todo acesso dele fica na auditoria.
//  - Pareceres e histórico são permanentes (gatilhos na migração 006): corrigir = novo parecer que substitui o anterior.

const ETAPAS = {
  cadastro_recebido: 'Cadastro recebido',
  documentacao_pendente: 'Documentação pendente',
  documentacao_recebida: 'Documentação recebida',
  documentacao_em_analise: 'Documentação em análise',
  complementacao_necessaria: 'Necessita complementação',
  avaliacao_presencial_pendente: 'Avaliação presencial pendente',
  avaliacao_presencial_realizada: 'Avaliação presencial realizada',
  aprovado: 'Aprovado (decisão do proprietário)',
  recusado: 'Recusado (decisão do proprietário)'
};
const ETAPAS_FINAIS = new Set(['aprovado', 'recusado']);
// O sistema só mexe sozinho nestas (pelo envio de documentos); daí em diante, só pessoas.
const ETAPAS_AUTOMATICAS = new Set(['cadastro_recebido', 'documentacao_pendente', 'documentacao_recebida']);
const SITUACOES_PARECER = {
  favoravel: 'Favorável', favoravel_com_ressalvas: 'Favorável com ressalvas', desfavoravel: 'Desfavorável', pendente_informacao: 'Pendente de informação'
};
const VERIFICACOES = {
  nao_realizada: 'Não realizada', sem_restricao: 'Realizada — sem restrição', com_restricao: 'Realizada — com restrição', inconclusiva: 'Realizada — inconclusiva'
};
const FUNCOES_CAND = { motorista: { tabela: 'motoristas', rotulo: 'Motorista', entidade: 'motoristas' }, entregador: { tabela: 'entregadores', rotulo: 'Entregador', entidade: 'entregadores' } };
// O que o avaliador vê da ficha (minimização, LGPD): nada de telefone, e-mail, endereço, anotações ou próximos passos internos.
const CAMPOS_AVALIADOR = ['nome', 'cidade', 'veiculo', 'placa', 'cnh_categoria', 'modalidade', 'origem', 'data_primeiro_contato', 'situacao', 'documentos'];
const CAMPOS_EQUIPE = [...CAMPOS_AVALIADOR, 'telefone', 'contratado_em'];

class ErroCand extends Error {
  constructor(status, code, mensagem) { super(mensagem); this.status = status; this.code = code; }
}

function createCandidaturas({ db, audit, docs, getSetting }) {
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const agora = () => new Date().toISOString();
  const quem = (req) => ({ id: req && req.user ? req.user.id || null : null, nome: req && req.user ? req.user.nome || 'Sistema' : 'Sistema' });
  const perfil = (req) => (req && req.user ? req.user.role : null);
  const temTabela = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  const ativo = () => process.env.FM_ETAPA2 === '1' && temTabela('candidaturas');
  const exigirAtivo = () => { if (!ativo()) throw new ErroCand(404, 'not_found', 'Não encontrado.'); };

  /** Funções que o avaliador pode consultar (política de documentos, só o administrador altera). Padrão: motorista. */
  function escopoAvaliador() {
    const pol = docs && docs.ativo() ? docs.politica() : null;
    const f = pol && pol.avaliador ? pol.avaliador.funcoes : ['motorista'];
    return f.filter((x) => hasOwn(FUNCOES_CAND, x));
  }
  /** O avaliador pode ver esta ficha? Só se for de função liberada E tiver candidatura aberta (consultado pelos documentos). */
  function noEscopoAvaliador(funcao, registroId) {
    if (!ativo() || !escopoAvaliador().includes(funcao)) return false;
    return !!db.prepare('SELECT 1 FROM candidaturas WHERE funcao = ? AND registro_id = ?').get(funcao, Number(registroId));
  }

  function exigirPerfil(req, ...perfis) {
    if (!perfis.includes(perfil(req))) throw new ErroCand(403, 'forbidden', 'Seu perfil não tem permissão para esta ação.');
  }
  const funcaoOk = (f) => { if (!hasOwn(FUNCOES_CAND, f)) throw new ErroCand(422, 'invalido', 'Função inválida (use motorista ou entregador).'); };
  const ficha = (funcao, id) => (temTabela(FUNCOES_CAND[funcao].tabela) ? db.prepare(`SELECT * FROM ${FUNCOES_CAND[funcao].tabela} WHERE id = ?`).get(Number(id)) : null);

  function evento(candId, tipo, { de = null, para = null, detalhe = null } = {}, req) {
    const u = quem(req);
    db.prepare('INSERT INTO candidatura_eventos (candidatura_id, tipo, de, para, detalhe, usuario_id, usuario_nome, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(candId, tipo, de, para, detalhe ? String(detalhe).slice(0, 500) : null, u.id, u.nome, agora());
  }
  function candOuErro(id) {
    const c = db.prepare('SELECT * FROM candidaturas WHERE id = ?').get(Number(id));
    if (!c) throw new ErroCand(404, 'not_found', 'Candidatura não encontrada.');
    return c;
  }
  function exigirAcesso(req, c) {
    const p = perfil(req);
    if (p === 'admin' || p === 'gestor') return;
    if (p === 'avaliador' && escopoAvaliador().includes(c.funcao)) return;
    throw new ErroCand(403, 'forbidden', 'Seu perfil não pode consultar esta candidatura.');
  }

  /** Abre (ou devolve) a candidatura de uma ficha. Equipe (admin e gestor) ou o próprio sistema (integração). */
  function abrir(req, funcao, registroId, { origem = 'crm', sistema = false } = {}) {
    exigirAtivo();
    if (!sistema) exigirPerfil(req, 'admin', 'gestor');
    funcaoOk(funcao);
    const rid = Number(registroId);
    if (!Number.isInteger(rid) || rid < 1 || !ficha(funcao, rid)) throw new ErroCand(404, 'not_found', 'Ficha não encontrada.');
    const existe = db.prepare('SELECT * FROM candidaturas WHERE funcao = ? AND registro_id = ?').get(funcao, rid);
    if (existe) return { candidatura: existe, criada: false };
    const t = agora();
    const u = quem(req);
    const id = Number(db.prepare('INSERT INTO candidaturas (funcao, registro_id, etapa, etapa_em, etapa_por_nome, origem, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(funcao, rid, 'cadastro_recebido', t, u.nome, origem === 'aplicativo' ? 'aplicativo' : 'crm', t, t).lastInsertRowid);
    evento(id, 'aberta', { para: 'cadastro_recebido', detalhe: origem === 'aplicativo' ? 'Cadastro recebido do aplicativo do motorista' : 'Avaliação aberta no CRM' }, req);
    audit(req, 'candidatura_abrir', 'candidaturas', id, `Avaliação aberta para ${FUNCOES_CAND[funcao].rotulo} #${rid} (${origem})`);
    atualizarPelosDocumentos(funcao, rid, req);
    return { candidatura: candOuErro(id), criada: true };
  }

  /** Documentos recebidos/atualizados: move SÓ entre as etapas iniciais (nunca decide, nunca volta etapas avançadas). */
  function atualizarPelosDocumentos(funcao, registroId, req) {
    if (!ativo()) return null;
    const c = db.prepare('SELECT * FROM candidaturas WHERE funcao = ? AND registro_id = ?').get(funcao, Number(registroId));
    if (!c || !ETAPAS_AUTOMATICAS.has(c.etapa)) return c ? c.etapa : null;
    const exigidos = docs && docs.ativo() ? (docs.politica().obrigatorios[funcao] || []) : [];
    const temDoc = (cat) => !!db.prepare("SELECT 1 FROM documentos WHERE funcao = ? AND registro_id = ? AND categoria = ? AND excluido_em IS NULL AND versao_atual_id IS NOT NULL").get(funcao, Number(registroId), cat);
    const algum = temTabela('documentos') && !!db.prepare('SELECT 1 FROM documentos WHERE funcao = ? AND registro_id = ? AND excluido_em IS NULL AND versao_atual_id IS NOT NULL').get(funcao, Number(registroId));
    let nova = c.etapa;
    if (exigidos.length && temTabela('documentos') && exigidos.every(temDoc)) nova = 'documentacao_recebida';
    else if (algum || c.etapa !== 'cadastro_recebido') nova = 'documentacao_pendente';
    if (nova !== c.etapa) {
      db.prepare('UPDATE candidaturas SET etapa = ?, etapa_em = ?, etapa_por_nome = ?, atualizado_em = ? WHERE id = ?').run(nova, agora(), 'Sistema (documentos)', agora(), c.id);
      evento(c.id, 'etapa', { de: c.etapa, para: nova, detalhe: 'Atualizada pelo envio de documentos' }, req);
    }
    return nova;
  }

  function resumoParecer(p, completo) {
    const base = { id: p.id, autor_nome: p.autor_nome, autor_perfil: p.autor_perfil, situacao: p.situacao, situacao_rotulo: SITUACOES_PARECER[p.situacao], criado_em: p.criado_em, substitui_id: p.substitui_id };
    if (!completo) return base;
    return { ...base, verificacao: p.verificacao, verificacao_rotulo: VERIFICACOES[p.verificacao], verificacao_fonte: p.verificacao_fonte, parecer: p.parecer, pendencias: p.pendencias, observacoes: p.observacoes };
  }
  const podeLerPareceres = (req) => ['admin', 'avaliador'].includes(perfil(req));

  function dadosDaFicha(req, c) {
    const f = ficha(c.funcao, c.registro_id);
    if (!f) return null;
    const campos = perfil(req) === 'avaliador' ? CAMPOS_AVALIADOR : CAMPOS_EQUIPE;
    const out = { id: f.id };
    for (const k of campos) if (hasOwn(f, k)) out[k] = f[k];
    return out;
  }

  function publico(req, c, { lista = false } = {}) {
    const f = ficha(c.funcao, c.registro_id);
    const ult = db.prepare('SELECT * FROM candidatura_pareceres WHERE candidatura_id = ? ORDER BY id DESC LIMIT 1').get(c.id);
    const n = db.prepare('SELECT COUNT(*) n FROM candidatura_pareceres WHERE candidatura_id = ?').get(c.id).n;
    return {
      id: c.id, funcao: c.funcao, funcao_rotulo: FUNCOES_CAND[c.funcao].rotulo, registro_id: c.registro_id, nome: f ? f.nome : '(ficha excluída)',
      cidade: f ? f.cidade || null : null, etapa: c.etapa, etapa_rotulo: ETAPAS[c.etapa], etapa_em: c.etapa_em, origem: c.origem,
      decisao: c.decisao, decidido_em: c.decidido_em, decidido_por_nome: c.decidido_por_nome,
      decisao_motivo: lista ? undefined : (perfil(req) === 'gestor' && c.decisao === 'recusado' ? null : c.decisao_motivo),
      pareceres: n, ultimo_parecer: ult ? resumoParecer(ult, false) : null,
      documentos_resumo: f ? f.documentos || null : null, criado_em: c.criado_em, atualizado_em: c.atualizado_em
    };
  }

  function listar(req, { etapa, funcao, q, pendentes, page = 1 } = {}) {
    exigirAtivo();
    exigirPerfil(req, 'admin', 'gestor', 'avaliador');
    const where = [];
    const params = [];
    let funcoes = Object.keys(FUNCOES_CAND).filter((f) => temTabela(FUNCOES_CAND[f].tabela));
    if (perfil(req) === 'avaliador') funcoes = funcoes.filter((f) => escopoAvaliador().includes(f));
    if (funcao) { funcaoOk(funcao); funcoes = funcoes.filter((f) => f === funcao); }
    if (!funcoes.length) return { items: [], total: 0, page: 1, pages: 1, etapas: ETAPAS };
    where.push(`c.funcao IN (${funcoes.map(() => '?').join(',')})`); params.push(...funcoes);
    if (etapa) { if (!hasOwn(ETAPAS, etapa)) throw new ErroCand(422, 'invalido', 'Etapa inválida.'); where.push('c.etapa = ?'); params.push(etapa); }
    if (pendentes === '1' || pendentes === true) where.push("c.etapa NOT IN ('aprovado', 'recusado')");
    const busca = String(q || '').trim().slice(0, 80);
    // Busca pelo nome nas duas tabelas (nomes de tabela fixos acima).
    const joins = funcoes.map((f) => `SELECT id, '${f}' AS fn, nome FROM ${FUNCOES_CAND[f].tabela}`).join(' UNION ALL ');
    if (busca) { where.push('r.nome LIKE ?'); params.push(`%${busca.replace(/[%_]/g, (m) => `\\${m}`)}%`); }
    const sqlBase = `FROM candidaturas c LEFT JOIN (${joins}) r ON r.id = c.registro_id AND r.fn = c.funcao WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) n ${sqlBase.replace("r.nome LIKE ?", "r.nome LIKE ? ESCAPE '\\'")}`).get(...params).n;
    const tam = 30;
    const pg = Math.max(1, Math.min(Number(page) || 1, Math.max(1, Math.ceil(total / tam))));
    const linhas = db.prepare(`SELECT c.* ${sqlBase.replace("r.nome LIKE ?", "r.nome LIKE ? ESCAPE '\\'")} ORDER BY CASE WHEN c.etapa IN ('aprovado','recusado') THEN 1 ELSE 0 END, c.atualizado_em DESC LIMIT ? OFFSET ?`)
      .all(...params, tam, (pg - 1) * tam);
    const contagem = Object.fromEntries(db.prepare(`SELECT etapa, COUNT(*) n FROM candidaturas WHERE funcao IN (${funcoes.map(() => '?').join(',')}) GROUP BY etapa`).all(...funcoes).map((r) => [r.etapa, r.n]));
    return { items: linhas.map((c) => publico(req, c, { lista: true })), total, page: pg, pages: Math.max(1, Math.ceil(total / tam)), etapas: ETAPAS, contagem };
  }

  function detalhe(req, id) {
    exigirAtivo();
    const c = candOuErro(id);
    exigirAcesso(req, c);
    const pareceres = db.prepare('SELECT * FROM candidatura_pareceres WHERE candidatura_id = ? ORDER BY id DESC').all(c.id);
    const eventos = db.prepare('SELECT id, tipo, de, para, detalhe, usuario_nome, criado_em FROM candidatura_eventos WHERE candidatura_id = ? ORDER BY id DESC LIMIT 200').all(c.id)
      // O gestor não lê o conteúdo dos pareceres; no histórico vê só que houve parecer.
      .map((e) => (perfil(req) === 'gestor' && e.tipo === 'parecer' ? { ...e, detalhe: 'Parecer registrado' } : e));
    let documentos = null;
    if (docs && docs.ativo()) { try { documentos = docs.listar(req, c.funcao, c.registro_id); } catch (err) { documentos = { erro: err.message }; } }
    if (perfil(req) === 'avaliador') audit(req, 'candidatura_ver', 'candidaturas', c.id, `Avaliador consultou a candidatura (${FUNCOES_CAND[c.funcao].rotulo} #${c.registro_id})`);
    const p = perfil(req);
    return {
      candidatura: publico(req, c),
      candidato: dadosDaFicha(req, c),
      documentos,
      pareceres: pareceres.map((x) => resumoParecer(x, podeLerPareceres(req))),
      eventos,
      pode: {
        mudar_etapa: (p === 'admin' || p === 'gestor') && !c.decisao,
        decidir: p === 'admin' && !c.decisao,
        reabrir: p === 'admin' && !!c.decisao,
        parecer: p === 'admin' || p === 'avaliador',
        abrir_ficha: p === 'admin' || p === 'gestor'
      },
      etapas: ETAPAS, situacoes_parecer: SITUACOES_PARECER, verificacoes: VERIFICACOES
    };
  }

  function mudarEtapa(req, id, { etapa, observacao } = {}) {
    exigirAtivo();
    exigirPerfil(req, 'admin', 'gestor');
    const c = candOuErro(id);
    if (!hasOwn(ETAPAS, etapa) || ETAPAS_FINAIS.has(etapa)) throw new ErroCand(422, 'invalido', 'Etapa inválida. Aprovar ou recusar é a decisão final (só o administrador).');
    if (c.decisao) throw new ErroCand(409, 'decidida', 'Esta candidatura já tem decisão final. O administrador pode reabrir a avaliação.');
    if (etapa === c.etapa) return detalhe(req, c.id);
    const obs = String(observacao || '').trim().slice(0, 500);
    const u = quem(req);
    db.prepare('UPDATE candidaturas SET etapa = ?, etapa_em = ?, etapa_por_nome = ?, atualizado_em = ? WHERE id = ?').run(etapa, agora(), u.nome, agora(), c.id);
    evento(c.id, 'etapa', { de: c.etapa, para: etapa, detalhe: obs || null }, req);
    audit(req, 'candidatura_etapa', 'candidaturas', c.id, `Etapa: ${ETAPAS[c.etapa]} → ${ETAPAS[etapa]}`);
    return detalhe(req, c.id);
  }

  /** Decisão final: SÓ o administrador (o proprietário). Nunca automática. */
  function decidir(req, id, { decisao, motivo, confirmo } = {}) {
    exigirAtivo();
    exigirPerfil(req, 'admin');
    const c = candOuErro(id);
    if (!['aprovado', 'recusado'].includes(decisao)) throw new ErroCand(422, 'invalido', 'Decisão inválida (aprovado ou recusado).');
    if (confirmo !== true) throw new ErroCand(422, 'confirmacao', 'Confirme a decisão final.');
    if (c.decisao) throw new ErroCand(409, 'decidida', 'Esta candidatura já tem decisão final.');
    const m = String(motivo || '').trim();
    if (decisao === 'recusado' && m.length < 5) throw new ErroCand(422, 'invalido', 'Informe o motivo da recusa (pelo menos 5 caracteres).');
    if (m.length > 1000) throw new ErroCand(422, 'invalido', 'Motivo muito longo (máximo 1000 caracteres).');
    const u = quem(req);
    const t = agora();
    db.prepare('UPDATE candidaturas SET etapa = ?, etapa_em = ?, etapa_por_nome = ?, decisao = ?, decisao_motivo = ?, decidido_por = ?, decidido_por_nome = ?, decidido_em = ?, atualizado_em = ? WHERE id = ?')
      .run(decisao, t, u.nome, decisao, m || null, u.id, u.nome, t, t, c.id);
    evento(c.id, 'decisao', { de: c.etapa, para: decisao, detalhe: m || null }, req);
    audit(req, 'candidatura_decidir', 'candidaturas', c.id, `Decisão final: ${decisao} (${FUNCOES_CAND[c.funcao].rotulo} #${c.registro_id})`);
    return detalhe(req, c.id);
  }

  function reabrir(req, id, { motivo, confirmo, etapa = 'avaliacao_presencial_realizada' } = {}) {
    exigirAtivo();
    exigirPerfil(req, 'admin');
    const c = candOuErro(id);
    if (!c.decisao) throw new ErroCand(409, 'aberta', 'Esta candidatura não tem decisão final.');
    if (confirmo !== true) throw new ErroCand(422, 'confirmacao', 'Confirme a reabertura.');
    const m = String(motivo || '').trim();
    if (m.length < 5 || m.length > 1000) throw new ErroCand(422, 'invalido', 'Informe o motivo da reabertura (5 a 1000 caracteres).');
    if (!hasOwn(ETAPAS, etapa) || ETAPAS_FINAIS.has(etapa)) throw new ErroCand(422, 'invalido', 'Etapa inválida.');
    const u = quem(req);
    db.prepare('UPDATE candidaturas SET etapa = ?, etapa_em = ?, etapa_por_nome = ?, decisao = NULL, decisao_motivo = NULL, decidido_por = NULL, decidido_por_nome = NULL, decidido_em = NULL, atualizado_em = ? WHERE id = ?')
      .run(etapa, agora(), u.nome, agora(), c.id);
    evento(c.id, 'reaberta', { de: c.decisao, para: etapa, detalhe: m }, req);
    audit(req, 'candidatura_reabrir', 'candidaturas', c.id, `Decisão final desfeita (${c.decisao}); avaliação reaberta`);
    return detalhe(req, c.id);
  }

  function texto(v, max, nome, { min = 0 } = {}) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (s.length < min) throw new ErroCand(422, 'invalido', `${nome}: escreva pelo menos ${min} caracteres.`);
    if (s.length > max) throw new ErroCand(422, 'invalido', `${nome}: no máximo ${max} caracteres.`);
    return s || null;
  }

  /** Parecer do avaliador (ou do administrador). Independente da decisão final. Permanente. */
  function registrarParecer(req, id, corpo = {}) {
    exigirAtivo();
    exigirPerfil(req, 'admin', 'avaliador');
    const c = candOuErro(id);
    exigirAcesso(req, c);
    if (c.decisao) throw new ErroCand(409, 'decidida', 'A decisão final já foi tomada; novos pareceres não são aceitos.');
    if (!hasOwn(SITUACOES_PARECER, corpo.situacao)) throw new ErroCand(422, 'invalido', 'Escolha a conclusão do parecer.');
    const verificacao = corpo.verificacao === undefined ? 'nao_realizada' : corpo.verificacao;
    if (!hasOwn(VERIFICACOES, verificacao)) throw new ErroCand(422, 'invalido', 'Verificação inválida.');
    const fonte = texto(corpo.verificacao_fonte, 200, 'Fonte da verificação');
    if (verificacao !== 'nao_realizada' && !fonte) throw new ErroCand(422, 'invalido', 'Informe a fonte consultada na verificação (ex.: certidão do tribunal estadual).');
    const parecer = texto(corpo.parecer, 4000, 'Parecer', { min: 10 });
    const pendencias = texto(corpo.pendencias, 2000, 'Pendências');
    const observacoes = texto(corpo.observacoes, 2000, 'Observações');
    if (corpo.situacao === 'pendente_informacao' && !pendencias) throw new ErroCand(422, 'invalido', 'Liste as pendências identificadas.');
    let substitui = null;
    if (corpo.substitui_id !== undefined && corpo.substitui_id !== null && corpo.substitui_id !== '') {
      const ant = db.prepare('SELECT id FROM candidatura_pareceres WHERE id = ? AND candidatura_id = ?').get(Number(corpo.substitui_id), c.id);
      if (!ant) throw new ErroCand(422, 'invalido', 'O parecer a corrigir não é desta candidatura.');
      substitui = ant.id;
    }
    const u = quem(req);
    const pid = Number(db.prepare(`INSERT INTO candidatura_pareceres (candidatura_id, autor_id, autor_nome, autor_perfil, situacao, verificacao, verificacao_fonte, parecer, pendencias, observacoes, substitui_id, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(c.id, u.id, u.nome, perfil(req), corpo.situacao, verificacao, fonte, parecer, pendencias, observacoes, substitui, agora()).lastInsertRowid);
    db.prepare('UPDATE candidaturas SET atualizado_em = ? WHERE id = ?').run(agora(), c.id);
    evento(c.id, 'parecer', { detalhe: `Parecer ${SITUACOES_PARECER[corpo.situacao]}${substitui ? ` (corrige o parecer #${substitui})` : ''}` }, req);
    // Auditoria só com a conclusão: o texto do parecer não vai para a trilha geral (dado pessoal).
    audit(req, 'candidatura_parecer', 'candidaturas', c.id, `Parecer registrado: ${SITUACOES_PARECER[corpo.situacao]}`);
    return { parecer_id: pid, ...detalhe(req, c.id) };
  }

  function daFicha(funcao, registroId) {
    if (!ativo() || !hasOwn(FUNCOES_CAND, funcao)) return null;
    const c = db.prepare('SELECT * FROM candidaturas WHERE funcao = ? AND registro_id = ?').get(funcao, Number(registroId));
    return c ? { id: c.id, etapa: c.etapa, etapa_rotulo: ETAPAS[c.etapa], decisao: c.decisao } : null;
  }

  return { ativo, abrir, listar, detalhe, mudarEtapa, decidir, reabrir, registrarParecer, atualizarPelosDocumentos, noEscopoAvaliador, escopoAvaliador, daFicha, ErroCand, ETAPAS, FUNCOES_CAND };
}

module.exports = { createCandidaturas, ErroCand, ETAPAS, SITUACOES_PARECER, VERIFICACOES, CAMPOS_AVALIADOR };
