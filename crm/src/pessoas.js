'use strict';
// Etapa 2 — ficha central de pessoas e empresas (usa as tabelas da migração 001: pessoas, empresas, vinculos,
// titulares_eventos). Tudo aqui só funciona com FM_ETAPA2=1 e as migrações aplicadas (ativa()).
//
// Regras:
// - Cada função (motorista, passageiro, entregador, parceiro do Clube, comércio) continua sendo um registro funcional
//   próprio (situação, histórico, documentos). A pessoa/empresa só agrupa esses registros. Aprovar numa função nunca
//   mexe nas outras.
// - Nada é associado sozinho quando há dúvida: o telefone repetido gera AVISO; quem decide é o usuário.
// - Juntar duplicados é só do administrador, com confirmação explícita; nada é apagado (a pessoa juntada fica
//   "mesclada" apontando para a que ficou; vínculos e históricos passam para ela; registros funcionais repetidos são
//   encerrados, não excluídos).
const crypto = require('crypto');
const { chaveTelefone, nomeNormal, finalTelefone, FUNCOES } = require('./titulares');
const { toWaPhone } = require('./whatsapp/phone');

const FUNCAO_DA_TABELA = Object.fromEntries(Object.entries(FUNCOES).map(([f, v]) => [v.tabela, f]));

class ErroPessoa extends Error {
  constructor(status, mensagem, extra = {}) { super(mensagem); this.status = status; Object.assign(this, extra); }
}

function createPessoas({ db, entities, ENTITIES, audit }) {
  const agora = () => new Date().toISOString();
  const temTabela = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  const ativa = () => process.env.FM_ETAPA2 === '1' && temTabela('pessoas') && temTabela('vinculos');
  const defDaTabela = (t) => (Object.prototype.hasOwnProperty.call(ENTITIES, t) ? ENTITIES[t] : null);
  const disponivel = (funcao) => !!(FUNCOES[funcao] && defDaTabela(FUNCOES[funcao].tabela) && temTabela(FUNCOES[funcao].tabela));

  function catalogo() {
    return Object.entries(FUNCOES).map(([funcao, f]) => ({ funcao, rotulo: f.rotulo, titular: f.titular, tabela: f.tabela, disponivel: disponivel(funcao) }));
  }

  function evento(tipo, id, ev, detalhe, req) {
    db.prepare('INSERT INTO titulares_eventos (titular_tipo, titular_id, evento, detalhe, usuario_id, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tipo, id, ev, detalhe || null, req && req.user ? req.user.id : null, agora());
  }

  // Resumo do registro funcional (o que aparece no cartão da função na ficha central).
  function resumoRegistro(tabela, id) {
    const def = defDaTabela(tabela);
    if (!def || !temTabela(def.table)) return { removido: true };
    const row = db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(id);
    if (!row) return { removido: true };
    const situacao = row[def.statusField] || '';
    return {
      titulo: row[def.columns[0]] || `#${id}`,
      situacao,
      fechado: (def.fechados || []).includes(situacao),
      perdido: (def.perdidos || []).includes(situacao),
      documentos: row.documentos || null,
      atualizado_em: row.updated_at || null,
      contratado_em: row.contratado_em || null,
      confirmado_em: row.confirmado_em || null
    };
  }

  function vinculosDe(tipo, id, { incluirEncerrados = false } = {}) {
    const rows = db.prepare(`SELECT * FROM vinculos WHERE titular_tipo = ? AND titular_id = ? ${incluirEncerrados ? '' : 'AND ativo = 1'} ORDER BY ativo DESC, id`).all(tipo, id);
    return rows.map((v) => ({
      vinculo_id: v.id, funcao: v.funcao, rotulo: FUNCOES[v.funcao] ? FUNCOES[v.funcao].rotulo : v.funcao,
      registro_tabela: v.registro_tabela, registro_id: v.registro_id, ativo: !!v.ativo,
      criado_em: v.criado_em, encerrado_em: v.encerrado_em, motivo_encerramento: v.motivo_encerramento,
      registro: resumoRegistro(v.registro_tabela, v.registro_id)
    }));
  }

  const publica = (p) => ({
    id: p.id, uid: p.uid, nome: p.nome, telefone: p.telefone, telefone_final: finalTelefone(p.telefone), email: p.email,
    cidade: p.cidade, situacao: p.situacao, mesclada_em_id: p.mesclada_em_id, tem_cpf: !!p.cpf_indice,
    criado_em: p.criado_em, atualizado_em: p.atualizado_em
  });

  function obterPessoa(id) {
    const p = db.prepare('SELECT * FROM pessoas WHERE id = ?').get(Number(id));
    if (!p) throw new ErroPessoa(404, 'Pessoa não encontrada.');
    return p;
  }

  /* ------------------------------- consultas ------------------------------- */
  function listar({ q = '', page = 1, limite = 30 } = {}) {
    const termo = String(q || '').trim().slice(0, 80);
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const where = ["situacao = 'ativa'"];
    const params = [];
    if (termo) {
      const dig = termo.replace(/\D/g, '');
      const cond = ['nome LIKE ? ESCAPE \'\\\''];
      params.push(`%${entities.likeEscape(termo)}%`);
      if (dig.length >= 4) { cond.push('telefone LIKE ?'); params.push(`%${dig}%`); }
      where.push(`(${cond.join(' OR ')})`);
    }
    const total = db.prepare(`SELECT COUNT(*) c FROM pessoas WHERE ${where.join(' AND ')}`).get(...params).c;
    const rows = db.prepare(`SELECT * FROM pessoas WHERE ${where.join(' AND ')} ORDER BY nome COLLATE NOCASE LIMIT ? OFFSET ?`).all(...params, limite, (pg - 1) * limite);
    return { total, page: pg, pages: Math.max(1, Math.ceil(total / limite)), items: rows.map((p) => ({ ...publica(p), funcoes: vinculosDe('pessoa', p.id) })) };
  }

  function ficha(id) {
    const p = obterPessoa(id);
    if (p.situacao === 'mesclada') return { mesclada: true, mesclada_em_id: p.mesclada_em_id, pessoa: publica(p) };
    // Histórico: eventos desta pessoa e das que foram juntadas nela.
    const juntadas = db.prepare("SELECT id FROM pessoas WHERE mesclada_em_id = ?").all(p.id).map((r) => r.id);
    const ids = [p.id, ...juntadas];
    const eventos = db.prepare(`SELECT e.id, e.titular_id, e.evento, e.detalhe, e.criado_em, u.nome AS usuario FROM titulares_eventos e
      LEFT JOIN users u ON u.id = e.usuario_id WHERE e.titular_tipo = 'pessoa' AND e.titular_id IN (${ids.map(() => '?').join(',')}) ORDER BY e.id DESC LIMIT 100`).all(...ids);
    const todos = vinculosDe('pessoa', p.id, { incluirEncerrados: true });
    return {
      pessoa: publica(p),
      funcoes: todos.filter((v) => v.ativo),
      funcoes_encerradas: todos.filter((v) => !v.ativo),
      eventos,
      possiveis_duplicados: p.telefone_chave ? verificarTelefone(p.telefone, { exceto: p.id }) : [],
      funcoes_disponiveis: catalogo().filter((f) => f.titular === 'pessoa')
        .map((f) => ({ ...f, ja_tem: todos.some((v) => v.ativo && v.funcao === f.funcao) }))
    };
  }

  /** Possíveis cadastros da mesma pessoa pelo telefone (só AVISO: nunca associa sozinho). */
  function verificarTelefone(telefone, { exceto = null } = {}) {
    const chave = chaveTelefone(telefone);
    if (!chave) return [];
    return db.prepare("SELECT * FROM pessoas WHERE telefone_chave = ? AND situacao = 'ativa' AND id IS NOT ? ORDER BY id LIMIT 10").all(chave, exceto)
      .map((p) => ({ id: p.id, nome: p.nome, cidade: p.cidade, telefone_final: finalTelefone(p.telefone),
        funcoes: vinculosDe('pessoa', p.id).map((v) => ({ funcao: v.funcao, rotulo: v.rotulo, situacao: v.registro.situacao })) }));
  }

  /* --------------------- criar registro funcional + vínculo --------------------- */
  /**
   * Cria o registro da função (validação normal do módulo) e o liga ao titular, numa transação só.
   * pessoa_id informado → usa essa pessoa (o usuário escolheu); sem ele → pessoa nova. Nunca associa por conta própria.
   */
  function criarRegistro(tabela, body, req, { titularId = null } = {}) {
    const funcao = FUNCAO_DA_TABELA[tabela];
    const def = defDaTabela(tabela);
    if (!funcao || !def) throw new ErroPessoa(422, 'Este módulo não tem ficha central.');
    const tipo = FUNCOES[funcao].titular;
    let resultado = null;
    db.transaction(() => {
      let titular = titularId;
      if (titular) {
        const t = db.prepare(`SELECT * FROM ${tipo === 'pessoa' ? 'pessoas' : 'empresas'} WHERE id = ?`).get(Number(titular));
        if (!t || t.situacao !== 'ativa') throw new ErroPessoa(404, tipo === 'pessoa' ? 'Pessoa não encontrada.' : 'Empresa não encontrada.');
        const tem = db.prepare('SELECT registro_id FROM vinculos WHERE titular_tipo = ? AND titular_id = ? AND funcao = ? AND ativo = 1').get(tipo, t.id, funcao);
        if (tem) throw new ErroPessoa(409, `Este cadastro já tem a função ${FUNCOES[funcao].rotulo} (registro #${tem.registro_id}).`, { registro_id: tem.registro_id });
        titular = t.id;
      }
      const r = entities.createEntity(def, body, req);
      if (r.errors || r.error) throw new ErroPessoa(r.status || 422, 'validacao', { resultado: r });
      if (!titular) {
        const nome = tipo === 'pessoa' ? r.item.nome : r.item.nome_estabelecimento;
        const tel = toWaPhone(r.item.telefone) || null;
        const ins = tipo === 'pessoa'
          ? db.prepare('INSERT INTO pessoas (uid, nome, telefone, telefone_chave, cidade, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
          : db.prepare('INSERT INTO empresas (uid, nome_fantasia, telefone, telefone_chave, cidade, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
        titular = Number(ins.run(crypto.randomUUID(), nome, tel, chaveTelefone(r.item.telefone), r.item.cidade || null, agora(), agora()).lastInsertRowid);
        evento(tipo, titular, 'criado', `Cadastro criado junto com a função ${FUNCOES[funcao].rotulo}`, req);
      }
      db.prepare('INSERT INTO vinculos (titular_tipo, titular_id, funcao, registro_tabela, registro_id, ativo, criado_em) VALUES (?, ?, ?, ?, ?, 1, ?)')
        .run(tipo, titular, funcao, tabela, r.item.id, agora());
      evento(tipo, titular, 'funcao_adicionada', `${FUNCOES[funcao].rotulo} (registro #${r.item.id})`, req);
      resultado = { ...r, titular: { tipo, id: titular } };
    })();
    return resultado;
  }

  /** "Adicionar função": a ficha nova nasce com nome, telefone e cidade da pessoa (o resto vem do formulário). */
  function adicionarFuncao(pessoaId, funcao, dados, req) {
    const p = obterPessoa(pessoaId);
    if (p.situacao !== 'ativa') throw new ErroPessoa(409, 'Este cadastro foi juntado a outro. Abra o cadastro principal.');
    if (!FUNCOES[funcao] || FUNCOES[funcao].titular !== 'pessoa') throw new ErroPessoa(422, 'Função incompatível com pessoa.');
    if (!disponivel(funcao)) throw new ErroPessoa(422, `A função ${FUNCOES[funcao].rotulo} ainda não está disponível.`);
    const body = { ...(dados && typeof dados === 'object' ? dados : {}) };
    if (!body.nome) body.nome = p.nome;
    if (!body.telefone) body.telefone = p.telefone || '';
    if (!body.cidade && p.cidade) body.cidade = p.cidade;
    const r = criarRegistro(FUNCOES[funcao].tabela, body, req, { titularId: p.id });
    audit(req, 'adicionar_funcao', 'pessoas', p.id, `Função ${FUNCOES[funcao].rotulo} adicionada (registro #${r.item.id})`);
    return r;
  }

  /** Registro funcional excluído (só admin): o vínculo é encerrado, o histórico da pessoa continua. */
  function aoExcluirRegistro(tabela, id, req) {
    const v = db.prepare('SELECT * FROM vinculos WHERE registro_tabela = ? AND registro_id = ? AND ativo = 1').get(tabela, id);
    if (!v) return;
    db.prepare('UPDATE vinculos SET ativo = 0, encerrado_em = ?, motivo_encerramento = ? WHERE id = ?').run(agora(), 'registro excluído', v.id);
    evento(v.titular_tipo, v.titular_id, 'funcao_encerrada', `${FUNCOES[v.funcao] ? FUNCOES[v.funcao].rotulo : v.funcao} (registro #${id} excluído)`, req);
  }

  /* ------------------------------ duplicados ------------------------------ */
  function duplicados() {
    const ativas = db.prepare("SELECT * FROM pessoas WHERE situacao = 'ativa'").all();
    const grupos = [];
    const vistos = new Set();
    const porTel = new Map();
    for (const p of ativas) if (p.telefone_chave) { if (!porTel.has(p.telefone_chave)) porTel.set(p.telefone_chave, []); porTel.get(p.telefone_chave).push(p); }
    for (const lista of porTel.values()) {
      if (lista.length < 2) continue;
      lista.forEach((p) => vistos.add(p.id));
      grupos.push({ motivo: 'mesmo_telefone', mesmo_nome: new Set(lista.map((p) => nomeNormal(p.nome))).size === 1, pessoas: lista.map(resumoPessoa) });
    }
    const porNome = new Map();
    for (const p of ativas) { const n = nomeNormal(p.nome); if (n.length >= 5) { if (!porNome.has(n)) porNome.set(n, []); porNome.get(n).push(p); } }
    for (const lista of porNome.values()) {
      const novos = lista.filter((p) => !vistos.has(p.id));
      if (lista.length < 2 || !novos.length) continue;
      grupos.push({ motivo: 'mesmo_nome', mesmo_nome: true, pessoas: lista.map(resumoPessoa) });
    }
    return { total_grupos: grupos.length, grupos };
  }
  function resumoPessoa(p) {
    return { id: p.id, nome: p.nome, cidade: p.cidade, telefone_final: finalTelefone(p.telefone), email: p.email ? '(informado)' : null,
      criado_em: p.criado_em, funcoes: vinculosDe('pessoa', p.id).map((v) => ({ funcao: v.funcao, rotulo: v.rotulo, registro_id: v.registro_id, situacao: v.registro.situacao, titulo: v.registro.titulo })) };
  }

  /**
   * Junta `juntar` em `manter` (só admin, confirmação explícita). Nada é apagado:
   * - função que só uma das duas tem: o vínculo passa para a que fica;
   * - função que as duas têm: o administrador escolhe o registro principal (`principais[funcao] = registro_id`); o outro
   *   vínculo é ENCERRADO (o registro e o histórico continuam existindo e aparecem na ficha como encerrados);
   * - campos vazios da que fica são completados com os da outra (só os vazios);
   * - a juntada vira "mesclada" e aponta para a que ficou.
   */
  function juntar({ manterId, juntarId, principais = {}, confirmo }, req) {
    if (confirmo !== true) throw new ErroPessoa(422, 'Confirme explicitamente a junção dos cadastros.');
    const a = obterPessoa(manterId);
    const b = obterPessoa(juntarId);
    if (a.id === b.id) throw new ErroPessoa(422, 'Escolha dois cadastros diferentes.');
    if (a.situacao !== 'ativa' || b.situacao !== 'ativa') throw new ErroPessoa(409, 'Só cadastros ativos podem ser juntados.');
    const va = vinculosDe('pessoa', a.id);
    const vb = vinculosDe('pessoa', b.id);
    const conflitos = va.filter((x) => vb.some((y) => y.funcao === x.funcao)).map((x) => x.funcao);
    for (const f of conflitos) {
      const escolhido = Number(principais && principais[f]);
      const opcoes = [va.find((x) => x.funcao === f).registro_id, vb.find((x) => x.funcao === f).registro_id];
      if (!opcoes.includes(escolhido)) {
        throw new ErroPessoa(422, `Os dois cadastros têm a função ${FUNCOES[f].rotulo}: escolha qual registro continua como principal.`, { conflitos, opcoes: { [f]: opcoes } });
      }
    }
    const preenchidos = [];
    db.transaction(() => {
      const t = agora();
      for (const f of conflitos) {
        const escolhido = Number(principais[f]);
        const descartado = [...va, ...vb].find((x) => x.funcao === f && x.registro_id !== escolhido);
        db.prepare('UPDATE vinculos SET ativo = 0, encerrado_em = ?, motivo_encerramento = ? WHERE id = ?')
          .run(t, `duplicado — juntado ao registro #${escolhido}`, descartado.vinculo_id);
      }
      // Todos os vínculos (ativos e encerrados) da juntada passam para a que fica: o histórico de funções vai junto.
      db.prepare("UPDATE vinculos SET titular_id = ? WHERE titular_tipo = 'pessoa' AND titular_id = ?").run(a.id, b.id);
      for (const campo of ['telefone', 'email', 'cidade']) {
        if (!a[campo] && b[campo]) { db.prepare(`UPDATE pessoas SET ${campo} = ? WHERE id = ?`).run(b[campo], a.id); preenchidos.push(campo); }
      }
      if (!a.telefone_chave && b.telefone_chave) db.prepare('UPDATE pessoas SET telefone_chave = ? WHERE id = ?').run(b.telefone_chave, a.id);
      db.prepare("UPDATE pessoas SET situacao = 'mesclada', mesclada_em_id = ?, atualizado_em = ? WHERE id = ?").run(a.id, t, b.id);
      db.prepare('UPDATE pessoas SET atualizado_em = ? WHERE id = ?').run(t, a.id);
      evento('pessoa', a.id, 'juntada', `Recebeu o cadastro #${b.id}${conflitos.length ? `; registros principais escolhidos para: ${conflitos.map((f) => FUNCOES[f].rotulo).join(', ')}` : ''}${preenchidos.length ? `; campos completados: ${preenchidos.join(', ')}` : ''}`, req);
      evento('pessoa', b.id, 'mesclada', `Juntado ao cadastro #${a.id}`, req);
    })();
    audit(req, 'juntar', 'pessoas', a.id, `Cadastros de pessoa juntados: #${b.id} → #${a.id}${conflitos.length ? ` (funções repetidas: ${conflitos.join(', ')})` : ''}`);
    return ficha(a.id);
  }

  return { ativa, catalogo, listar, ficha, verificarTelefone, criarRegistro, adicionarFuncao, aoExcluirRegistro, duplicados, juntar, FUNCAO_DA_TABELA };
}

module.exports = { createPessoas, ErroPessoa };
