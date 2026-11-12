'use strict';
// Gestão de documentos (M4): arquivo digital por função (motorista, entregador, parceiro do Clube, comércio).
//
// Regras:
// - O documento pertence à FICHA DA FUNÇÃO (função + número da ficha). A mesma pessoa/empresa com várias funções tem os
//   documentos de cada função separados; nada é copiado.
// - A situação de cada documento é independente: Não enviado, Pendente de conferência, Conferido, Rejeitado, Necessita
//   atualização. Conferir NUNCA muda a situação da função (contratado, ativo, encerrado): só os campos de documentos.
// - Cada arquivo enviado é uma versão imutável; substituir cria outra e mantém as anteriores. Nada é apagado sozinho.
// - O arquivo é cifrado antes de sair do servidor (cifra.js) e guardado no armazenamento privado (armazenamento.js).
// - Todo acesso (ver, baixar, negado) vira evento do documento e linha da auditoria. A permissão é decidida aqui, no servidor.
const crypto = require('crypto');
const cifra = require('./cifra');
const { validarArquivo, nomeSeguro, maxBytes, TIPOS } = require('./validacao');
const { novaChave } = require('./armazenamento');
const policy = require('../policy');
const { FUNCOES } = require('../titulares');

class ErroDoc extends Error {
  constructor(status, code, mensagem, extra = {}) { super(mensagem); this.status = status; this.code = code; Object.assign(this, extra); }
}

const DOC_FUNCOES = ['motorista', 'entregador', 'parceiro_clube', 'comercio'];
const COMUNS_PESSOA = [['cnh', 'CNH'], ['crlv', 'CRLV'], ['comprovante_endereco', 'Comprovante de endereço'], ['outros', 'Outro documento']];
const COMUNS_EMPRESA = [['cartao_cnpj', 'Cartão CNPJ'], ['contrato_social', 'Contrato social / documento da empresa'], ['comprovante_endereco', 'Comprovante de endereço da empresa'],
  ['alvara', 'Alvará de funcionamento'], ['documento_responsavel', 'Documento do responsável'], ['outros', 'Outro documento']];
const CATEGORIAS = { motorista: COMUNS_PESSOA, entregador: COMUNS_PESSOA, parceiro_clube: COMUNS_EMPRESA, comercio: COMUNS_EMPRESA };

const SITUACOES = {
  nao_enviado: 'Não enviado', pendente: 'Pendente de conferência', conferido: 'Conferido', rejeitado: 'Rejeitado', necessita_atualizacao: 'Necessita atualização'
};
const GERAL = {
  sem_exigencia: 'Sem documentos exigidos', nao_enviados: 'Não enviados', incompletos: 'Incompletos',
  pendentes_conferencia: 'Pendentes de conferência', com_pendencias: 'Com pendências (rejeitado / atualizar)', conferidos: 'Conferidos'
};
// Campos antigos da ficha do motorista/entregador (preenchidos também pela IA a partir do WhatsApp).
const LEGADO = { cnh: 'doc_cnh', crlv: 'doc_crlv', comprovante_endereco: 'doc_endereco' };

const DECISOES_PENDENTES = [
  { chave: 'versoes', texto: 'Manter os documentos ORIGINAIS em todas as substituições? (hoje: todas as versões são mantidas; nada é apagado)' },
  { chave: 'armazenamento', texto: 'Qual será o armazenamento definitivo dos arquivos e sua configuração? (pasta em disco persistente da Hostinger ou Supabase Storage privado)' },
  { chave: 'gestor', texto: 'Quais documentos o gestor poderá visualizar e baixar? (hoje: nenhum arquivo; só a situação)' },
  { chave: 'cpf_cnpj', texto: 'Quais dados de CPF/CNPJ serão exigidos e guardados em cada cadastro? (hoje: coleta desligada)' },
  { chave: 'retencao', texto: 'Por quanto tempo documentos e cadastros encerrados serão mantidos? (hoje: sem prazo; nenhuma exclusão automática)' }
];

function createDocumentos({ db, armazenamento, ENTITIES, entities, audit, getSetting, setSetting, todayISO, isDateISO, localDate }) {
  const agora = () => new Date().toISOString();
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const temTabela = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  const ativo = () => process.env.FM_ETAPA2 === '1' && temTabela('documentos') && temTabela('documento_versoes');
  const quem = (req) => ({ id: req && req.user ? req.user.id || null : null, nome: req && req.user ? req.user.nome || 'Sistema' : 'Sistema' });
  const role = (req) => (req && req.user ? req.user.role : null);

  /* ------------------------------ funções e fichas ------------------------------ */
  const tabelaDe = (funcao) => FUNCOES[funcao].tabela;
  const defDe = (funcao) => (hasOwn(ENTITIES, tabelaDe(funcao)) ? ENTITIES[tabelaDe(funcao)] : null);
  const funcoesDisponiveis = () => DOC_FUNCOES.filter((f) => defDe(f) && temTabela(tabelaDe(f)));
  function exigirFuncao(funcao) {
    if (!DOC_FUNCOES.includes(funcao) || !funcoesDisponiveis().includes(funcao)) throw new ErroDoc(422, 'funcao_invalida', 'Função inválida para documentos.');
    return funcao;
  }
  function registro(funcao, id) {
    const def = defDe(funcao);
    if (!def || !temTabela(def.table)) return null;
    return db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(id) || null;
  }
  const tituloRegistro = (funcao, id) => {
    const r = registro(funcao, id);
    const def = defDe(funcao);
    return r && def ? String(r[def.columns[0]] || `#${id}`) : `#${id} (ficha encerrada)`;
  };
  const rotuloCategoria = (funcao, cat) => (CATEGORIAS[funcao].find(([c]) => c === cat) || [cat, cat])[1];

  /* --------------------------------- política --------------------------------- */
  function politica() {
    let salva = {};
    try { salva = JSON.parse(getSetting('docs_politica', '') || '{}'); } catch (e) { salva = {}; }
    const P = policy.DOCS_POLITICA_PADRAO;
    return {
      obrigatorios: Object.fromEntries(DOC_FUNCOES.map((f) => [f, Array.isArray(salva.obrigatorios && salva.obrigatorios[f]) ? salva.obrigatorios[f].filter((c) => CATEGORIAS[f].some(([x]) => x === c && c !== 'outros')) : P.obrigatorios[f]])),
      gestor: {
        anexar: salva.gestor && typeof salva.gestor.anexar === 'boolean' ? salva.gestor.anexar : P.gestor.anexar,
        conferir: salva.gestor && typeof salva.gestor.conferir === 'boolean' ? salva.gestor.conferir : P.gestor.conferir,
        categorias_visiveis: Array.isArray(salva.gestor && salva.gestor.categorias_visiveis) ? salva.gestor.categorias_visiveis.filter((c) => todasCategorias().includes(c)) : P.gestor.categorias_visiveis
      },
      exclusao_definitiva: salva.exclusao_definitiva === true,
      cpf_cnpj: { cpf: salva.cpf_cnpj && salva.cpf_cnpj.cpf === 'opcional' ? 'opcional' : 'desligado', cnpj: salva.cpf_cnpj && salva.cpf_cnpj.cnpj === 'opcional' ? 'opcional' : 'desligado' },
      confirmada_em: salva.confirmada_em || null
    };
  }
  const todasCategorias = () => [...new Set(DOC_FUNCOES.flatMap((f) => CATEGORIAS[f].map(([c]) => c)))];

  function salvarPolitica(req, corpo) {
    if (role(req) !== 'admin') throw new ErroDoc(403, 'forbidden', 'Somente o administrador altera a política de documentos.');
    const atual = politica();
    const novo = JSON.parse(JSON.stringify(atual));
    const c = corpo || {};
    if (c.obrigatorios !== undefined) {
      if (!c.obrigatorios || typeof c.obrigatorios !== 'object') throw new ErroDoc(422, 'invalido', 'Lista de documentos exigidos inválida.');
      for (const [f, lista] of Object.entries(c.obrigatorios)) {
        if (!DOC_FUNCOES.includes(f)) throw new ErroDoc(422, 'invalido', `Função desconhecida: ${f}.`);
        if (!Array.isArray(lista) || lista.some((x) => !CATEGORIAS[f].some(([k]) => k === x && k !== 'outros'))) throw new ErroDoc(422, 'invalido', `Categoria inválida para ${FUNCOES[f].rotulo}.`);
        novo.obrigatorios[f] = [...new Set(lista)];
      }
    }
    if (c.gestor !== undefined) {
      const g = c.gestor || {};
      if (g.anexar !== undefined) { if (typeof g.anexar !== 'boolean') throw new ErroDoc(422, 'invalido', 'Valor inválido.'); novo.gestor.anexar = g.anexar; }
      if (g.conferir !== undefined) { if (typeof g.conferir !== 'boolean') throw new ErroDoc(422, 'invalido', 'Valor inválido.'); novo.gestor.conferir = g.conferir; }
      if (g.categorias_visiveis !== undefined) {
        if (!Array.isArray(g.categorias_visiveis) || g.categorias_visiveis.some((x) => !todasCategorias().includes(x))) throw new ErroDoc(422, 'invalido', 'Categoria inválida na lista do gestor.');
        novo.gestor.categorias_visiveis = [...new Set(g.categorias_visiveis)];
      }
    }
    if (c.exclusao_definitiva !== undefined) { if (typeof c.exclusao_definitiva !== 'boolean') throw new ErroDoc(422, 'invalido', 'Valor inválido.'); novo.exclusao_definitiva = c.exclusao_definitiva; }
    if (c.cpf_cnpj !== undefined) {
      for (const k of ['cpf', 'cnpj']) {
        const v = c.cpf_cnpj && c.cpf_cnpj[k];
        if (v === undefined) continue;
        if (!['desligado', 'opcional'].includes(v)) throw new ErroDoc(422, 'invalido', 'Use "desligado" ou "opcional" (a exigência obrigatória ainda não está definida).');
        novo.cpf_cnpj[k] = v;
      }
    }
    novo.confirmada_em = agora();
    setSetting('docs_politica', JSON.stringify(novo));
    const mudou = ['obrigatorios', 'gestor', 'exclusao_definitiva', 'cpf_cnpj'].filter((k) => JSON.stringify(atual[k]) !== JSON.stringify(novo[k]));
    audit(req, 'doc_politica', 'documentos', null, `Política de documentos alterada: ${mudou.join(', ') || 'confirmada sem mudanças'}`);
    return politica();
  }

  const decisoesPendentes = (pol = politica()) => (pol.confirmada_em ? [] : DECISOES_PENDENTES);

  // Proteção contra perda de chave (12/11): guarda só a IMPRESSÃO DIGITAL da FM_DOCS_KEY usada nos arquivos. Se a chave mudar
  // por engano (sem FM_DOCS_KEY_ANTERIOR com a antiga), o envio é bloqueado com aviso — misturar chaves deixaria os arquivos
  // antigos ilegíveis. Troca planejada: antiga em FM_DOCS_KEY_ANTERIOR (a impressão é atualizada no primeiro envio).
  function conferirChave() {
    const atual = cifra.impressao();
    if (!atual) return { ok: false };
    const salva = getSetting('docs_chave_impressao', '');
    const temArquivos = !!db.prepare('SELECT 1 FROM documento_versoes LIMIT 1').get();
    if (!salva || salva === atual || !temArquivos) return { ok: true, registrar: salva !== atual };
    if (cifra.impressao('FM_DOCS_KEY_ANTERIOR') === salva) return { ok: true, registrar: true, troca: true };
    return { ok: false, motivo: 'A chave FM_DOCS_KEY é diferente da usada nos documentos já guardados. Restaure a chave correta (ou informe a antiga em FM_DOCS_KEY_ANTERIOR) antes de enviar novos arquivos.' };
  }

  function estadoArmazenamento() {
    const arm = armazenamento.pronto();
    const chave = cifra.configurada();
    const ck = chave ? conferirChave() : { ok: false };
    return {
      tipo: armazenamento.nome, chave_configurada: chave, chave_confere: chave ? ck.ok : null, armazenamento_pronto: arm.ok,
      pronto: chave && ck.ok && arm.ok,
      motivo: !chave ? 'Chave de cifra dos documentos (FM_DOCS_KEY) não configurada.' : (!ck.ok ? ck.motivo : (arm.ok ? null : arm.motivo)),
      max_mb: Math.round(maxBytes() / 1048576), formatos: Object.keys(TIPOS).map((t) => t.toUpperCase())
    };
  }

  /* ----------------------------------- eventos ----------------------------------- */
  function evento(docId, versaoId, tipo, detalhe, req) {
    const u = quem(req);
    db.prepare('INSERT INTO documento_eventos (documento_id, versao_id, tipo, detalhe, usuario_id, usuario_nome, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(docId, versaoId || null, tipo, detalhe ? String(detalhe).slice(0, 500) : null, u.id, u.nome, agora());
  }

  /* ------------------------------- situação geral ------------------------------- */
  function geralDe(funcao, linhas, pol = politica()) {
    const exigidos = pol.obrigatorios[funcao] || [];
    const porCat = new Map(linhas.map((d) => [d.categoria, d]));
    if (!exigidos.length) return { codigo: 'sem_exigencia', rotulo: GERAL.sem_exigencia, exigidos: 0, enviados: 0, conferidos: 0 };
    const st = exigidos.map((c) => (porCat.get(c) ? porCat.get(c).situacao : 'nao_enviado'));
    const enviados = st.filter((s) => s !== 'nao_enviado').length;
    const conferidos = st.filter((s) => s === 'conferido').length;
    let codigo;
    if (st.some((s) => s === 'rejeitado' || s === 'necessita_atualizacao')) codigo = 'com_pendencias';
    else if (enviados === 0) codigo = 'nao_enviados';
    else if (enviados < st.length) codigo = 'incompletos';
    else if (conferidos < st.length) codigo = 'pendentes_conferencia';
    else codigo = 'conferidos';
    return { codigo, rotulo: GERAL[codigo], exigidos: st.length, enviados, conferidos };
  }

  /* ------------------------------ formatos de saída ------------------------------ */
  const versaoAtual = (d) => (d.versao_atual_id ? db.prepare('SELECT * FROM documento_versoes WHERE id = ?').get(d.versao_atual_id) : null);
  function publico(d, req, pol) {
    const v = versaoAtual(d);
    const r = role(req);
    return {
      id: d.id, uid: d.uid, funcao: d.funcao, registro_id: d.registro_id, categoria: d.categoria, categoria_rotulo: rotuloCategoria(d.funcao, d.categoria),
      titulo: d.titulo || null, situacao: d.situacao, situacao_rotulo: SITUACOES[d.situacao],
      obrigatorio: (pol.obrigatorios[d.funcao] || []).includes(d.categoria),
      versao_atual: v ? { numero: v.numero, data_envio: v.data_envio, incluido_em: v.incluido_em, incluido_por_nome: v.incluido_por_nome, tamanho: v.tamanho, tipo_mime: v.tipo_mime, extensao: v.extensao, nome_original: v.nome_original } : null,
      total_versoes: db.prepare('SELECT COUNT(*) n FROM documento_versoes WHERE documento_id = ?').get(d.id).n,
      conferido_por_nome: d.conferido_por_nome || null, conferido_em: d.conferido_em || null, observacoes: d.observacoes || null,
      pode: { ver: !!v && policy.docsVerArquivo(r, d.categoria, pol), conferir: !!v && policy.docsConferir(r, d.categoria, pol) }
    };
  }

  /* ------------------------------------ consultas ------------------------------------ */
  function listar(req, funcao, registroId) {
    exigirFuncao(funcao);
    const id = Number(registroId);
    if (!Number.isInteger(id) || id < 1) throw new ErroDoc(422, 'invalido', 'Ficha inválida.');
    const pol = politica();
    const linhas = db.prepare('SELECT * FROM documentos WHERE funcao = ? AND registro_id = ? AND excluido_em IS NULL ORDER BY id').all(funcao, id);
    const itens = [];
    // Espaços exigidos que ainda não têm documento aparecem como "Não enviado".
    for (const cat of pol.obrigatorios[funcao]) {
      const d = linhas.find((x) => x.categoria === cat);
      itens.push(d ? publico(d, req, pol) : {
        id: null, funcao, registro_id: id, categoria: cat, categoria_rotulo: rotuloCategoria(funcao, cat), titulo: null, situacao: 'nao_enviado', situacao_rotulo: SITUACOES.nao_enviado,
        obrigatorio: true, versao_atual: null, total_versoes: 0, conferido_por_nome: null, conferido_em: null, observacoes: null, pode: { ver: false, conferir: false }
      });
    }
    for (const d of linhas) if (!pol.obrigatorios[funcao].includes(d.categoria)) itens.push(publico(d, req, pol));
    const reg = registro(funcao, id);
    return {
      funcao, funcao_rotulo: FUNCOES[funcao].rotulo, registro_id: id, registro_existe: !!reg, registro_titulo: tituloRegistro(funcao, id),
      geral: geralDe(funcao, linhas, pol), itens,
      categorias: CATEGORIAS[funcao].map(([chave, rotulo]) => ({ chave, rotulo })),
      pode: { anexar: !!reg && policy.docsAnexar(role(req), pol), excluir_definitivo: policy.docsExcluirDefinitivo(role(req)) && pol.exclusao_definitiva },
      armazenamento: estadoArmazenamento()
    };
  }

  /** Lista geral (tela "Documentos"): filtros por situação, função, categoria e busca pelo nome da ficha. */
  function consultar(req, { situacao, funcao, categoria, q, de, ate, page = 1, limite = 30, tudo = false } = {}) {
    const pol = politica();
    const where = ['d.excluido_em IS NULL'];
    const params = [];
    if (situacao) {
      if (!hasOwn(SITUACOES, situacao)) throw new ErroDoc(422, 'invalido', 'Situação inválida.');
      where.push('d.situacao = ?'); params.push(situacao);
    }
    if (funcao) { exigirFuncao(funcao); where.push('d.funcao = ?'); params.push(funcao); }
    if (categoria) { if (!todasCategorias().includes(categoria)) throw new ErroDoc(422, 'invalido', 'Categoria inválida.'); where.push('d.categoria = ?'); params.push(categoria); }
    // Período pela data CIVIL de Fortaleza (UTC-3), a mesma do cartão "enviados no período" (regra 10: nada de cortar UTC).
    if (de && /^\d{4}-\d{2}-\d{2}$/.test(String(de))) { where.push("date(d.criado_em, '-3 hours') >= ?"); params.push(String(de)); }
    if (ate && /^\d{4}-\d{2}-\d{2}$/.test(String(ate))) { where.push("date(d.criado_em, '-3 hours') <= ?"); params.push(String(ate)); }
    const termo = String(q || '').trim().slice(0, 60);
    if (termo) {
      const padrao = `%${entities.likeEscape(termo)}%`;
      const blocos = ["d.titulo LIKE ? ESCAPE '\\'"];
      const ps = [padrao];
      for (const f of funcoesDisponiveis()) {
        const def = defDe(f);
        const col = def.columns[0];
        if (!/^[a-z_]+$/.test(col)) continue;
        blocos.push(`(d.funcao = '${f}' AND d.registro_id IN (SELECT id FROM ${def.table} WHERE ${col} LIKE ? ESCAPE '\\'))`);
        ps.push(padrao);
      }
      where.push(`(${blocos.join(' OR ')})`); params.push(...ps);
    }
    const base = `FROM documentos d WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) n ${base}`).get(...params).n;
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = tudo ? 5000 : limite;
    const rows = db.prepare(`SELECT d.* ${base} ORDER BY d.atualizado_em DESC, d.id DESC LIMIT ? OFFSET ?`).all(...params, lim, tudo ? 0 : (pg - 1) * lim);
    return {
      total, page: pg, pages: Math.max(1, Math.ceil(total / lim)),
      items: rows.map((d) => ({ ...publico(d, req, pol), funcao_rotulo: FUNCOES[d.funcao].rotulo, registro_titulo: tituloRegistro(d.funcao, d.registro_id), registro_existe: !!registro(d.funcao, d.registro_id) }))
    };
  }

  function contagens() {
    if (!ativo()) return null;
    const n = (sql, ...p) => db.prepare(sql).get(...p).n;
    return {
      pendentes: n("SELECT COUNT(*) n FROM documentos WHERE situacao = 'pendente' AND excluido_em IS NULL"),
      atencao: n("SELECT COUNT(*) n FROM documentos WHERE situacao IN ('rejeitado', 'necessita_atualizacao') AND excluido_em IS NULL"),
      conferidos: n("SELECT COUNT(*) n FROM documentos WHERE situacao = 'conferido' AND excluido_em IS NULL"),
      total: n('SELECT COUNT(*) n FROM documentos WHERE excluido_em IS NULL')
    };
  }

  /** Relatório de resumo: situação atual dos documentos + quantos foram enviados no período (data local, fuso de Fortaleza). */
  function resumoPeriodo(de, ate) {
    const linhas = db.prepare('SELECT situacao, criado_em FROM documentos WHERE excluido_em IS NULL').all();
    const por = { nao_enviado: 0, pendente: 0, conferido: 0, rejeitado: 0, necessita_atualizacao: 0 };
    let enviados = 0;
    for (const l of linhas) {
      por[l.situacao] = (por[l.situacao] || 0) + 1;
      const d = localDate(l.criado_em);
      if (d >= de && d <= ate) enviados += 1;
    }
    return { total: linhas.length, enviados_no_periodo: enviados, por_situacao: por };
  }

  /** Resumo por função para a ficha central (pessoa/empresa): só situação geral, sem arquivo. */
  function resumoDasFuncoes(vinculos) {
    const pol = politica();
    return vinculos.filter((v) => DOC_FUNCOES.includes(v.funcao)).map((v) => {
      const linhas = db.prepare('SELECT * FROM documentos WHERE funcao = ? AND registro_id = ? AND excluido_em IS NULL').all(v.funcao, v.registro_id);
      return { funcao: v.funcao, registro_id: v.registro_id, ativo: v.ativo, total: linhas.length, geral: geralDe(v.funcao, linhas, pol) };
    });
  }

  /* --------------------------- campos antigos da ficha --------------------------- */
  // Mantém os campos de documentos da ficha do motorista/entregador (doc_cnh, doc_crlv, doc_endereco e o resumo) coerentes
  // com o arquivo digital, SÓ para a categoria mexida. Nunca toca na situação da função (contratado etc.).
  function sincronizarLegado(funcao, registroId, categoria) {
    if (!hasOwn(LEGADO, categoria) || !['motorista', 'entregador'].includes(funcao)) return;
    const def = defDe(funcao);
    const row = registro(funcao, registroId);
    if (!row || !def) return;
    const d = db.prepare('SELECT situacao FROM documentos WHERE funcao = ? AND registro_id = ? AND categoria = ? AND excluido_em IS NULL').get(funcao, registroId, categoria);
    const sit = d ? d.situacao : 'nao_enviado';
    const valor = sit === 'conferido' ? 'Conferido' : sit === 'pendente' ? 'Recebido — conferir' : 'Não enviado';
    const estado = { ...row, [LEGADO[categoria]]: valor };
    const campos = Object.values(LEGADO);
    const ok = (v) => v === 'Recebido — conferir' || v === 'Conferido';
    const recebidos = campos.filter((c) => ok(estado[c])).length;
    const conferidos = campos.filter((c) => estado[c] === 'Conferido').length;
    const resumo = conferidos === 3 ? 'Conferidos' : recebidos === 3 ? 'Recebidos — conferir' : recebidos > 0 ? 'Incompletos' : 'Não enviados';
    db.prepare(`UPDATE ${def.table} SET ${LEGADO[categoria]} = ?, documentos = ?, updated_at = ? WHERE id = ?`).run(valor, resumo, agora(), registroId);
  }

  // Registro no acompanhamento da ficha da função (sem mudar a situação dela).
  function acompanhamento(req, funcao, registroId, texto) {
    const def = defDe(funcao);
    const row = registro(funcao, registroId);
    if (!def || !def.interactions || !row) return;
    entities.logInteraction(def.table, registroId, req, texto, row[def.statusField], row[def.statusField], 'Documentos');
  }

  /* ------------------------------------ anexar ------------------------------------ */
  function exigirPronto() {
    const e = estadoArmazenamento();
    if (!e.pronto) throw new ErroDoc(503, 'armazenamento_indisponivel', `Armazenamento de documentos indisponível: ${e.motivo}`);
    const ck = conferirChave();
    if (ck.registrar) setSetting('docs_chave_impressao', cifra.impressao());
  }

  /**
   * Anexa um arquivo: primeira versão de um documento da ficha ou nova versão de um documento existente (documento_id).
   * Não faz nada pela metade: se o banco falhar depois de gravar o arquivo, o arquivo é removido.
   */
  async function anexar(req, { funcao, registro_id: registroId, categoria, titulo, data_envio: dataEnvio, observacoes, nome, conteudo, documento_id: documentoId }) {
    const pol = politica();
    if (!policy.docsAnexar(role(req), pol)) throw new ErroDoc(403, 'forbidden', 'Seu perfil não pode anexar documentos.');
    exigirPronto();
    let doc = null;
    if (documentoId) {
      doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(Number(documentoId));
      if (!doc) throw new ErroDoc(404, 'not_found', 'Documento não encontrado.');
      if (doc.excluido_em) throw new ErroDoc(409, 'excluido', 'Este documento foi excluído definitivamente.');
      funcao = doc.funcao; registroId = doc.registro_id; categoria = doc.categoria;
    }
    exigirFuncao(funcao);
    const rid = Number(registroId);
    if (!Number.isInteger(rid) || rid < 1) throw new ErroDoc(422, 'invalido', 'Ficha inválida.');
    if (!registro(funcao, rid)) throw new ErroDoc(404, 'not_found', 'Ficha não encontrada (ou já excluída).');
    if (!CATEGORIAS[funcao].some(([c]) => c === categoria)) throw new ErroDoc(422, 'invalido', 'Categoria de documento inválida para esta função.');
    const tit = String(titulo || '').trim();
    if (categoria === 'outros' && !doc && (tit.length < 3 || tit.length > 80)) throw new ErroDoc(422, 'invalido', 'Dê um nome ao documento (3 a 80 caracteres).');
    const envio = dataEnvio ? String(dataEnvio) : todayISO();
    if (!isDateISO(envio) || envio > todayISO()) throw new ErroDoc(422, 'invalido', 'Data de envio inválida (não pode ser futura).');
    const obs = String(observacoes || '').trim().slice(0, 500);
    const v = validarArquivo(conteudo, nome);
    if (!v.ok) throw new ErroDoc(422, 'arquivo_invalido', v.erro);

    if (!doc && categoria !== 'outros') doc = db.prepare('SELECT * FROM documentos WHERE funcao = ? AND registro_id = ? AND categoria = ? AND excluido_em IS NULL').get(funcao, rid, categoria) || null;
    const novoDoc = !doc;
    const uid = doc ? doc.uid : crypto.randomUUID();
    const numero = doc ? db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 n FROM documento_versoes WHERE documento_id = ?').get(doc.id).n : 1;
    const { blob, chaveEmbrulhada } = cifra.cifrar(conteudo, uid, numero);
    const chave = novaChave();
    await armazenamento.gravar(chave, blob);
    const u = quem(req);
    const t = agora();
    let resultado;
    try {
      resultado = db.transaction(() => {
        let id = doc && doc.id;
        if (novoDoc) {
          id = Number(db.prepare(`INSERT INTO documentos (uid, funcao, registro_id, categoria, titulo, situacao, observacoes, criado_em, atualizado_em, criado_por, criado_por_nome)
            VALUES (?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?)`).run(uid, funcao, rid, categoria, categoria === 'outros' ? tit : null, obs || null, t, t, u.id, u.nome).lastInsertRowid);
        }
        const vid = Number(db.prepare(`INSERT INTO documento_versoes (documento_id, numero, armazenamento, chave_armazenamento, nome_original, tipo_mime, extensao, tamanho, sha256,
          chave_embrulhada, data_envio, incluido_em, incluido_por, incluido_por_nome, observacao_envio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, numero, armazenamento.nome, chave, nomeSeguro(nome), v.mime, v.ext, conteudo.length, cifra.sha256(conteudo), chaveEmbrulhada, envio, t, u.id, u.nome, obs || null).lastInsertRowid);
        // Versão nova = precisa de nova conferência; a conferência anterior fica registrada nos eventos.
        db.prepare("UPDATE documentos SET situacao = 'pendente', versao_atual_id = ?, conferido_por = NULL, conferido_por_nome = NULL, conferido_em = NULL, atualizado_em = ?, observacoes = COALESCE(?, observacoes) WHERE id = ?")
          .run(vid, t, novoDoc ? null : (obs || null), id);
        evento(id, vid, novoDoc ? 'enviado' : 'substituido', `versão ${numero} (${v.ext.toUpperCase()}, ${conteudo.length} bytes)${obs ? `: ${obs}` : ''}`, req);
        sincronizarLegado(funcao, rid, categoria);
        return { id, vid };
      })();
    } catch (err) {
      await armazenamento.remover(chave).catch(() => {});
      if (/UNIQUE/i.test(String(err.message))) throw new ErroDoc(409, 'conflito', 'Outro envio deste documento aconteceu ao mesmo tempo. Tente de novo.');
      throw err;
    }
    const rotulo = rotuloCategoria(funcao, categoria);
    acompanhamento(req, funcao, rid, `Documento ${rotulo}: ${novoDoc ? 'enviado' : `nova versão (v${numero})`} por ${u.nome}; aguarda conferência.`);
    audit(req, novoDoc ? 'doc_enviar' : 'doc_substituir', 'documentos', resultado.id, `${rotulo} v${numero} (${v.ext}) da ficha ${funcao} #${rid}`);
    return { documento: publico(db.prepare('SELECT * FROM documentos WHERE id = ?').get(resultado.id), req, pol), versao: numero };
  }

  /* ------------------------------------ acesso ------------------------------------ */
  function documentoOuErro(id) {
    const d = db.prepare('SELECT * FROM documentos WHERE id = ?').get(Number(id));
    if (!d) throw new ErroDoc(404, 'not_found', 'Documento não encontrado.');
    return d;
  }

  /** Abre o arquivo para visualizar ou baixar (confere permissão, integridade e registra o acesso). */
  async function obterArquivo(req, id, { versao, acao = 'baixar' } = {}) {
    const d = documentoOuErro(id);
    const pol = politica();
    if (d.excluido_em) throw new ErroDoc(410, 'excluido', 'Este documento foi excluído definitivamente.');
    if (!policy.docsVerArquivo(role(req), d.categoria, pol)) {
      evento(d.id, null, 'acesso_negado', `tentativa de ${acao === 'ver' ? 'visualizar' : 'baixar'} sem permissão`, req);
      audit(req, 'doc_acesso_negado', 'documentos', d.id, `Acesso negado ao arquivo (${d.categoria})`);
      throw new ErroDoc(403, 'forbidden', 'Seu perfil não pode abrir este documento.');
    }
    const ver = versao ? db.prepare('SELECT * FROM documento_versoes WHERE documento_id = ? AND numero = ?').get(d.id, Number(versao)) : versaoAtual(d);
    if (!ver) throw new ErroDoc(404, 'not_found', 'Versão não encontrada.');
    if (ver.arquivo_removido_em) throw new ErroDoc(410, 'removido', 'O arquivo desta versão foi removido definitivamente.');
    exigirPronto();
    const bruto = await armazenamento.ler(ver.chave_armazenamento);
    const falha = (motivo) => {
      evento(d.id, ver.id, 'integridade_falhou', motivo, req);
      audit(req, 'doc_integridade', 'documentos', d.id, `Falha de integridade na versão ${ver.numero}: ${motivo}`);
      return new ErroDoc(500, 'integridade', 'Não foi possível abrir o arquivo com segurança (integridade). O administrador foi avisado no histórico.');
    };
    if (!bruto) throw falha('arquivo ausente no armazenamento');
    let conteudo;
    try { conteudo = cifra.decifrar(bruto, ver.chave_embrulhada, d.uid, ver.numero); } catch (e) { throw falha(e.code === 'adulterado' ? 'conteúdo alterado ou corrompido' : (e.code || 'erro ao abrir')); }
    if (conteudo.length !== ver.tamanho || cifra.sha256(conteudo) !== ver.sha256) throw falha('hash diferente do registrado');
    evento(d.id, ver.id, acao === 'ver' ? 'visualizado' : 'baixado', `versão ${ver.numero}`, req);
    audit(req, acao === 'ver' ? 'doc_visualizar' : 'doc_baixar', 'documentos', d.id, `${rotuloCategoria(d.funcao, d.categoria)} v${ver.numero}`);
    return { conteudo, mime: ver.tipo_mime, nomeDownload: `${d.categoria}_v${ver.numero}.${ver.extensao}`, versao: ver.numero };
  }

  /* ----------------------------------- conferência ----------------------------------- */
  const RESULTADOS = { conferido: 'Conferido', rejeitado: 'Rejeitado', necessita_atualizacao: 'Necessita atualização' };
  function conferir(req, id, { resultado, observacoes } = {}) {
    const d = documentoOuErro(id);
    const pol = politica();
    if (d.excluido_em) throw new ErroDoc(410, 'excluido', 'Este documento foi excluído definitivamente.');
    if (!policy.docsConferir(role(req), d.categoria, pol)) {
      evento(d.id, null, 'acesso_negado', 'tentativa de conferir sem permissão', req);
      audit(req, 'doc_acesso_negado', 'documentos', d.id, `Conferência negada (${d.categoria})`);
      throw new ErroDoc(403, 'forbidden', 'Seu perfil não pode conferir este documento.');
    }
    if (!hasOwn(RESULTADOS, resultado)) throw new ErroDoc(422, 'invalido', 'Resultado inválido (conferido, rejeitado ou necessita atualização).');
    if (!d.versao_atual_id) throw new ErroDoc(409, 'sem_arquivo', 'Não há arquivo enviado para conferir.');
    const obs = String(observacoes || '').trim().slice(0, 500);
    if (resultado !== 'conferido' && obs.length < 3) throw new ErroDoc(422, 'invalido', 'Explique o motivo (rejeitado ou necessita atualização).');
    const u = quem(req);
    const t = agora();
    db.transaction(() => {
      db.prepare('UPDATE documentos SET situacao = ?, conferido_por = ?, conferido_por_nome = ?, conferido_em = ?, observacoes = COALESCE(?, observacoes), atualizado_em = ? WHERE id = ?')
        .run(resultado, u.id, u.nome, t, obs || null, t, d.id);
      evento(d.id, d.versao_atual_id, resultado, obs || null, req);
      sincronizarLegado(d.funcao, d.registro_id, d.categoria);
    })();
    const rotulo = rotuloCategoria(d.funcao, d.categoria);
    acompanhamento(req, d.funcao, d.registro_id, `Documento ${rotulo}: ${RESULTADOS[resultado].toLowerCase()} por ${u.nome}.`);
    audit(req, `doc_${resultado}`, 'documentos', d.id, `${rotulo}: ${RESULTADOS[resultado]}`);
    return publico(db.prepare('SELECT * FROM documentos WHERE id = ?').get(d.id), req, pol);
  }

  function observar(req, id, { observacoes, titulo } = {}) {
    const d = documentoOuErro(id);
    if (!['admin', 'gestor'].includes(role(req))) throw new ErroDoc(403, 'forbidden', 'Sem permissão.');
    if (d.excluido_em) throw new ErroDoc(410, 'excluido', 'Este documento foi excluído definitivamente.');
    const sets = []; const params = [];
    if (observacoes !== undefined) {
      const o = String(observacoes || '').trim();
      if (o.length > 500) throw new ErroDoc(422, 'invalido', 'Observação muito longa (máximo 500 caracteres).');
      sets.push('observacoes = ?'); params.push(o || null);
    }
    if (titulo !== undefined) {
      if (d.categoria !== 'outros') throw new ErroDoc(422, 'invalido', 'Só documentos "outros" têm nome livre.');
      const tt = String(titulo || '').trim();
      if (tt.length < 3 || tt.length > 80) throw new ErroDoc(422, 'invalido', 'Nome do documento: 3 a 80 caracteres.');
      sets.push('titulo = ?'); params.push(tt);
    }
    if (!sets.length) throw new ErroDoc(422, 'invalido', 'Nada para alterar.');
    db.prepare(`UPDATE documentos SET ${sets.join(', ')}, atualizado_em = ? WHERE id = ?`).run(...params, agora(), d.id);
    evento(d.id, null, 'observacao', observacoes !== undefined ? 'observação editada' : 'nome alterado', req);
    audit(req, 'doc_observar', 'documentos', d.id, 'Observação/nome do documento alterado');
    return publico(db.prepare('SELECT * FROM documentos WHERE id = ?').get(d.id), req, politica());
  }

  /** Detalhe + histórico de versões e de eventos (sem chaves nem nomes internos). */
  function historico(req, id) {
    const d = documentoOuErro(id);
    const pol = politica();
    const admin = role(req) === 'admin';
    const versoes = db.prepare('SELECT * FROM documento_versoes WHERE documento_id = ? ORDER BY numero DESC').all(d.id).map((v) => ({
      numero: v.numero, atual: v.id === d.versao_atual_id, data_envio: v.data_envio, incluido_em: v.incluido_em, incluido_por_nome: v.incluido_por_nome,
      tamanho: v.tamanho, tipo_mime: v.tipo_mime, extensao: v.extensao, nome_original: v.nome_original, observacao_envio: v.observacao_envio,
      sha256: admin ? v.sha256 : null, arquivo_removido_em: v.arquivo_removido_em || null,
      pode_ver: !v.arquivo_removido_em && !d.excluido_em && policy.docsVerArquivo(role(req), d.categoria, pol)
    }));
    const eventos = db.prepare('SELECT id, versao_id, tipo, detalhe, usuario_nome, criado_em FROM documento_eventos WHERE documento_id = ? ORDER BY id DESC LIMIT 300').all(d.id);
    return {
      documento: { ...publico(d, req, pol), funcao_rotulo: FUNCOES[d.funcao].rotulo, registro_titulo: tituloRegistro(d.funcao, d.registro_id), excluido_em: d.excluido_em || null },
      versoes, eventos
    };
  }

  /* -------------------------------- exclusão definitiva -------------------------------- */
  // Só o administrador, só com a política ligada, com confirmação explícita e motivo. Remove os ARQUIVOS (todas as versões);
  // o registro do documento, as versões (sem arquivo) e todo o histórico continuam, para a auditoria e a retenção.
  async function excluirDefinitivo(req, id, { confirmo, motivo } = {}) {
    const d = documentoOuErro(id);
    const pol = politica();
    if (!policy.docsExcluirDefinitivo(role(req))) throw new ErroDoc(403, 'forbidden', 'Somente o administrador pode excluir documentos definitivamente.');
    if (!pol.exclusao_definitiva) throw new ErroDoc(409, 'politica_nao_definida', 'A exclusão definitiva está desligada: a política de retenção ainda não foi aprovada.');
    if (d.excluido_em) throw new ErroDoc(409, 'excluido', 'Este documento já foi excluído.');
    if (confirmo !== true) throw new ErroDoc(422, 'confirm_required', 'É necessário confirmar a exclusão de forma explícita.');
    const mot = String(motivo || '').trim();
    if (mot.length < 10) throw new ErroDoc(422, 'invalido', 'Informe o motivo da exclusão (mínimo 10 caracteres).');
    const versoes = db.prepare('SELECT * FROM documento_versoes WHERE documento_id = ? AND arquivo_removido_em IS NULL').all(d.id);
    for (const v of versoes) await armazenamento.remover(v.chave_armazenamento);
    const u = quem(req); const t = agora();
    db.transaction(() => {
      for (const v of versoes) db.prepare('UPDATE documento_versoes SET arquivo_removido_em = ?, arquivo_removido_por_nome = ? WHERE id = ?').run(t, u.nome, v.id);
      db.prepare("UPDATE documentos SET excluido_em = ?, excluido_por_nome = ?, excluido_motivo = ?, situacao = 'nao_enviado', versao_atual_id = NULL, atualizado_em = ? WHERE id = ?").run(t, u.nome, mot.slice(0, 300), t, d.id);
      evento(d.id, null, 'exclusao_definitiva', `${versoes.length} arquivo(s) removido(s). Motivo: ${mot.slice(0, 300)}`, req);
      sincronizarLegado(d.funcao, d.registro_id, d.categoria);
    })();
    acompanhamento(req, d.funcao, d.registro_id, `Documento ${rotuloCategoria(d.funcao, d.categoria)} excluído definitivamente por ${u.nome} (motivo registrado).`);
    audit(req, 'doc_excluir_definitivo', 'documentos', d.id, `${rotuloCategoria(d.funcao, d.categoria)}: ${versoes.length} arquivo(s) removido(s)`);
    return { ok: true, arquivos_removidos: versoes.length };
  }

  return {
    ativo, ErroDoc, CATEGORIAS, SITUACOES, GERAL, DOC_FUNCOES, funcoesDisponiveis, politica, salvarPolitica, decisoesPendentes, estadoArmazenamento,
    listar, consultar, contagens, resumoPeriodo, resumoDasFuncoes, anexar, obterArquivo, conferir, observar, historico, excluirDefinitivo,
    geralDe, tituloRegistro, rotuloCategoria
  };
}

module.exports = { createDocumentos, ErroDoc, CATEGORIAS, SITUACOES, GERAL, DOC_FUNCOES, DECISOES_PENDENTES };
