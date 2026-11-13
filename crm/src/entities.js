'use strict';

const { db, nowISO } = require('./db');
const { ENTITIES } = require('./defs');
const { isDateISO, audit } = require('./http');

const MAX_NUMBER = 1e12; // teto geral para campos numéricos (evita Infinity/notação científica nos totais)

const likeEscape = (text) => String(text).replace(/[\\%_]/g, (c) => `\\${c}`);

function resolveOptions(def, field, current) {
  let options = field.options || [];
  if (def.confirmStatus && field.key === def.statusField && !(current && current[def.statusField] === def.confirmStatus)) {
    options = options.filter((o) => o !== def.confirmStatus);
  }
  return options;
}

function validate(def, body, options = {}) {
  const partial = !!options.partial;
  const current = options.current || null;
  const values = {};
  const errors = {};

  for (const field of def.fields) {
    const provided = Object.prototype.hasOwnProperty.call(body, field.key);
    if (partial && !provided) continue;
    const raw = body[field.key];
    let value;

    if (field.type === 'number') {
      if (raw === '' || raw === null || raw === undefined) {
        if (field.required) { errors[field.key] = 'Campo obrigatório.'; continue; }
        value = 0;
      } else {
        value = Number(raw);
        if (!Number.isFinite(value)) { errors[field.key] = 'Informe um número válido.'; continue; }
        if (field.min !== undefined && value < field.min) { errors[field.key] = 'Valor inválido.'; continue; }
        const teto = field.max !== undefined ? field.max : MAX_NUMBER;
        if (value > teto) { errors[field.key] = 'Valor acima do limite permitido.'; continue; }
        value = Math.round(value * 100) / 100;
      }
    } else if (field.type === 'relation') {
      if (raw === '' || raw === null || raw === undefined) value = null;
      else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0) { errors[field.key] = 'Registro relacionado inválido.'; continue; }
        value = n;
      }
    } else {
      value = raw === null || raw === undefined ? '' : String(raw).trim();
      if (value === '') {
        if (field.required) { errors[field.key] = 'Campo obrigatório.'; continue; }
        value = field.type === 'date' ? null : '';
      } else if (field.type === 'date') {
        if (!isDateISO(value)) { errors[field.key] = 'Data inválida.'; continue; }
      } else if (field.type === 'select') {
        const options = resolveOptions(def, field, current);
        if (!options.includes(value)) { errors[field.key] = 'Opção inválida.'; continue; }
      } else if (field.type === 'tel') {
        if (value.replace(/\D/g, '').length < 8) { errors[field.key] = 'Telefone inválido.'; continue; }
      }
      if (field.max && typeof value === 'string' && value.length > field.max) {
        errors[field.key] = `Máximo de ${field.max} caracteres.`;
        continue;
      }
    }

    values[field.key] = value;
  }

  return { values, errors };
}

/** Monta o WHERE da listagem (busca, selects, etapa, período, responsável). Usado pela lista da tela e pelas exportações. */
function montarFiltro(def, query) {
  const where = ['1 = 1'];
  const params = [];

  const q = String(query.q || '').trim();
  if (q && def.searchFields && def.searchFields.length) {
    where.push('(' + def.searchFields.map((f) => `${f} LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
    def.searchFields.forEach(() => params.push(`%${likeEscape(q)}%`));
  }

  for (const field of def.fields) {
    if (field.type === 'select' && query[`f_${field.key}`]) {
      // Vários valores separados por "|" (cartões do painel: ex. "Aberto|Em andamento"). Sempre parametrizado.
      const valores = String(query[`f_${field.key}`]).split('|').map((v) => v.trim()).filter(Boolean).slice(0, 12);
      if (valores.length > 1) {
        where.push(`${field.key} IN (${valores.map(() => '?').join(',')})`);
        params.push(...valores);
      } else if (valores.length === 1) {
        where.push(`${field.key} = ?`);
        params.push(valores[0]);
      }
    }
  }

  // Etapa: "andamento" (nem fechado nem perdido) ou "fechados" (verde: contratado / parceria fechada / cadastrado).
  const fechados = def.fechados || [];
  const encerrados = [...fechados, ...(def.perdidos || [])];
  if (query.etapa === 'fechados' && fechados.length) {
    where.push(`${def.statusField} IN (${fechados.map(() => '?').join(',')})`);
    params.push(...fechados);
  } else if (query.etapa === 'andamento' && encerrados.length) {
    where.push(`(${def.statusField} IS NULL OR ${def.statusField} NOT IN (${encerrados.map(() => '?').join(',')}))`);
    params.push(...encerrados);
  }

  // Mesmo critério dos relatórios: campanhas sem data planejada usam a data de publicação.
  const dateExpr = def.table === 'campanhas' ? 'COALESCE(data_publicacao, data_planejada)' : def.dateField;
  if (query.de && isDateISO(query.de)) { where.push(`${dateExpr} >= ?`); params.push(query.de); }
  if (query.ate && isDateISO(query.ate)) { where.push(`${dateExpr} <= ?`); params.push(query.ate); }
  // Só filtra por responsável nos módulos que têm essa coluna (nos demais o filtro era um erro 500).
  if (query.responsavel && def.fields.some((f) => f.key === 'responsavel')) {
    where.push("responsavel LIKE ? ESCAPE '\\'");
    params.push(`%${likeEscape(query.responsavel)}%`);
  }

  return { where, params };
}

function listEntity(def, query) {
  const { where, params } = montarFiltro(def, query);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM ${def.table} WHERE ${where.join(' AND ')}`).get(...params).c;

  const sortable = new Set([...def.fields.map((f) => f.key), 'id', 'created_at', 'updated_at']);
  const requested = String(query.sort || '');
  const sort = sortable.has(requested) ? requested : (def.orderField || def.dateField);
  const requestedDir = String(query.dir || '').toLowerCase();
  const defaultDir = sort === (def.orderField || def.dateField) ? (def.orderDir || 'desc') : 'desc';
  const dir = (requestedDir === 'asc' || requestedDir === 'desc' ? requestedDir : defaultDir) === 'asc' ? 'ASC' : 'DESC';
  const size = Math.min(200, Math.max(1, parseInt(query.size, 10) || 20));
  const pages = Math.max(1, Math.ceil(total / size));
  // Página além do fim (ex.: depois de excluir o último item da última página) volta para a última página.
  const page = Math.min(pages, Math.max(1, parseInt(query.page, 10) || 1));
  const orderBy = sort === 'id' ? 'id' : `${sort} IS NULL, ${sort}`;

  const items = db.prepare(
    `SELECT * FROM ${def.table} WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy} ${dir}, id DESC LIMIT ? OFFSET ?`
  ).all(...params, size, (page - 1) * size);

  return { items, total, page, size, pages };
}

function logInteraction(entity, id, req, resumo, anterior, nova, canal) {
  db.prepare(
    `INSERT INTO interacoes (entity, entity_id, data, canal, resumo, situacao_anterior, situacao_nova, created_by, created_by_nome, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entity, id, new Date().toISOString(), canal || 'Interno', resumo,
    anterior || null, nova || null,
    req.user ? req.user.id : null, req.user ? req.user.nome : null, nowISO()
  );
}

// Regras entre campos. Tarefa vinculada: o módulo precisa ser informado e o registro precisa existir.
function checkRelations(def, merged) {
  if (def.table !== 'tarefas' || !merged.entidade_id) return {};
  const tipo = merged.entidade_tipo || '';
  if (!tipo || !Object.prototype.hasOwnProperty.call(ENTITIES, tipo)) {
    return { entidade_tipo: 'Informe o módulo do registro relacionado.' };
  }
  const found = db.prepare(`SELECT 1 FROM ${ENTITIES[tipo].table} WHERE id = ?`).get(merged.entidade_id);
  return found ? {} : { entidade_id: 'O registro relacionado não existe mais.' };
}

function createEntity(def, body, req) {
  const { values, errors } = validate(def, body);
  Object.assign(errors, Object.keys(errors).length ? {} : checkRelations(def, values));
  if (Object.keys(errors).length) return { status: 422, errors };

  const cols = [];
  const marks = [];
  const params = [];
  for (const field of def.fields) {
    cols.push(field.key);
    marks.push('?');
    params.push(values[field.key]);
  }
  cols.push('created_at', 'updated_at', 'created_by');
  marks.push('?', '?', '?');
  const now = nowISO();
  params.push(now, now, req.user ? req.user.id : null);

  const info = db.prepare(
    `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${marks.join(', ')})`
  ).run(...params);

  audit(req, 'criar', def.table, info.lastInsertRowid, `Cadastro criado em ${def.label}`);
  return { status: 201, item: db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(info.lastInsertRowid) };
}

function clearConfirmation(def, id) {
  db.prepare(`UPDATE ${def.table} SET confirmado_em = NULL, confirmado_por = NULL WHERE id = ?`).run(id);
}

function updateEntity(def, id, body, req) {
  const current = db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(id);
  if (!current) return { status: 404, error: 'Registro não encontrado.' };

  const { values, errors } = validate(def, body, { partial: true, current });
  if (!Object.keys(errors).length) Object.assign(errors, checkRelations(def, { ...current, ...values }));
  if (Object.keys(errors).length) return { status: 422, errors };

  const keys = Object.keys(values);
  if (!keys.length) return { status: 400, error: 'Nenhum campo para atualizar.' };

  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const statusMudou = !!(def.statusField && values[def.statusField] && values[def.statusField] !== current[def.statusField]);
  db.transaction(() => {
    db.prepare(`UPDATE ${def.table} SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => values[k]), nowISO(), id);
    // Saiu de "Parceria confirmada": a data/autor da confirmação deixam de valer (senão os relatórios contam como confirmada).
    if (statusMudou && def.confirmStatus && current[def.statusField] === def.confirmStatus) clearConfirmation(def, id);
    if (statusMudou) {
      logInteraction(def.table, id, req, `Situação alterada: ${current[def.statusField]} → ${values[def.statusField]}`, current[def.statusField], values[def.statusField]);
    }
  })();

  const changed = keys.filter((k) => String(current[k] ?? '') !== String(values[k] ?? ''));
  audit(req, 'editar', def.table, id, changed.length
    ? `Registro atualizado em ${def.label}. Campos alterados: ${changed.join(', ')}`
    : `Registro salvo em ${def.label} sem alteração de valores`);
  return { status: 200, item: db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(id) };
}

function deleteEntity(def, id, req) {
  const current = db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(id);
  if (!current) return { status: 404, error: 'Registro não encontrado.' };
  db.transaction(() => {
    db.prepare(`DELETE FROM ${def.table} WHERE id = ?`).run(id);
    db.prepare('DELETE FROM interacoes WHERE entity = ? AND entity_id = ?').run(def.table, id);
    // Tarefas vinculadas ao registro excluído não podem apontar para um registro que não existe mais.
    db.prepare("UPDATE tarefas SET entidade_tipo = '', entidade_id = NULL WHERE entidade_tipo = ? AND entidade_id = ?").run(def.table, id);
  })();
  const label = String(current[def.columns[0]] || '').replace(/[\r\n\t]/g, ' ').slice(0, 120);
  audit(req, 'excluir', def.table, id, `Registro excluído de ${def.label}${label ? `: ${label}` : ''}`);
  return { status: 200 };
}

module.exports = {
  montarFiltro, ENTITIES, clearConfirmation, likeEscape, validate, listEntity, createEntity, updateEntity, deleteEntity, logInteraction, resolveOptions };
