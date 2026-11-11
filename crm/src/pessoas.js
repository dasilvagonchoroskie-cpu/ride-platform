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

// Pessoa e empresa usam a mesma lógica; só mudam a tabela e os campos.
const TIPOS = {
  pessoa: { tabela: 'pessoas', nome: 'nome', rotulo: 'Pessoa', campoNomeFuncao: 'nome', completar: ['telefone', 'email', 'cidade'] },
  empresa: { tabela: 'empresas', nome: 'nome_fantasia', rotulo: 'Empresa', campoNomeFuncao: 'nome_estabelecimento', completar: ['telefone', 'email', 'cidade', 'endereco', 'razao_social'] }
};

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
      criado_em: row.created_at || null,
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

  const publica = (p, tipo = 'pessoa') => ({
    id: p.id, uid: p.uid, tipo, nome: p[TIPOS[tipo].nome], telefone: p.telefone, telefone_final: finalTelefone(p.telefone), email: p.email,
    cidade: p.cidade, situacao: p.situacao, mesclada_em_id: p.mesclada_em_id,
    ...(tipo === 'pessoa' ? { tem_cpf: !!p.cpf_indice } : { razao_social: p.razao_social || null, endereco: p.endereco || null, tem_cnpj: !!p.cnpj_indice }),
    criado_em: p.criado_em, atualizado_em: p.atualizado_em
  });

  function obterTitular(tipo, id) {
    const p = db.prepare(`SELECT * FROM ${TIPOS[tipo].tabela} WHERE id = ?`).get(Number(id));
    if (!p) throw new ErroPessoa(404, tipo === 'pessoa' ? 'Pessoa não encontrada.' : 'Empresa não encontrada.');
    return p;
  }
  const obterPessoa = (id) => obterTitular('pessoa', id);

  /**
   * Históricos ORIGINAIS de cada função (nada é copiado nem substituído: lê direto de onde sempre esteve, pela
   * tabela + número da ficha, que nunca mudam): acompanhamentos (`interacoes`), tarefas ligadas, conversas do
   * WhatsApp do contato ligado à ficha (com contagem de mensagens) e, só para o administrador, a auditoria.
   * Vale também para fichas ENCERRADAS (ex.: a ficha repetida de uma junção).
   */
  function historicoFuncoes(vinculos, { admin = false } = {}) {
    return vinculos.map((v) => {
      const t = v.registro_tabela;
      const id = v.registro_id;
      const interacoes = db.prepare('SELECT id, data, canal, resumo, situacao_anterior, situacao_nova, created_by_nome AS autor FROM interacoes WHERE entity = ? AND entity_id = ? ORDER BY data DESC, id DESC LIMIT 200').all(t, id);
      const tarefas = db.prepare('SELECT id, titulo, situacao, data_vencimento, prioridade FROM tarefas WHERE entidade_tipo = ? AND entidade_id = ? ORDER BY data_vencimento DESC, id DESC LIMIT 100').all(t, id);
      const conversas = temTabela('wa_contatos') ? db.prepare(`SELECT c.id, c.situacao, c.ultima_em, c.created_at AS desde,
          (SELECT COUNT(*) FROM wa_mensagens m WHERE m.conversa_id = c.id) AS mensagens
        FROM wa_conversas c JOIN wa_contatos k ON k.id = c.contato_id WHERE k.vinculo_tipo = ? AND k.vinculo_id = ? ORDER BY c.id`).all(t, id) : [];
      const auditoria = admin ? db.prepare('SELECT id, action, detail, user_nome, created_at FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT 100').all(t, id) : null;
      return { funcao: v.funcao, rotulo: v.rotulo, registro_tabela: t, registro_id: id, ativo: v.ativo, criado_em_registro: v.registro.criado_em || null, interacoes, tarefas, conversas, auditoria };
    });
  }

  /* ------------------------------- consultas ------------------------------- */
  function listar(opcoes = {}) { return listarTitulares('pessoa', opcoes); }
  function listarTitulares(tipo, { q = '', page = 1, limite = 30 } = {}) {
    const T = TIPOS[tipo];
    const termo = nomeNormal(String(q || '').slice(0, 80));
    const dig = String(q || '').replace(/\D/g, '');
    const pg = Math.max(1, parseInt(page, 10) || 1);
    // Busca sem acento e sem maiúscula ("joao" acha "João"), por nome ou por parte do telefone.
    // O volume é o de uma operação interna (milhares de cadastros): filtrar aqui é simples e rápido.
    let rows = db.prepare(`SELECT * FROM ${T.tabela} WHERE situacao = 'ativa' ORDER BY ${T.nome} COLLATE NOCASE`).all();
    if (termo || dig.length >= 4) {
      rows = rows.filter((p) => (termo && nomeNormal(p[T.nome]).includes(termo)) || (dig.length >= 4 && String(p.telefone || '').includes(dig)));
    }
    const total = rows.length;
    const pagina = rows.slice((pg - 1) * limite, pg * limite);
    return { total, page: pg, pages: Math.max(1, Math.ceil(total / limite)), items: pagina.map((p) => ({ ...publica(p, tipo), funcoes: vinculosDe(tipo, p.id) })) };
  }

  function ficha(id, opcoes = {}) { return fichaTitular('pessoa', id, opcoes); }
  function fichaTitular(tipo, id, { admin = false } = {}) {
    const p = obterTitular(tipo, id);
    if (p.situacao === 'mesclada') return { mesclada: true, mesclada_em_id: p.mesclada_em_id, [tipo]: publica(p, tipo) };
    // Histórico do cadastro: eventos deste titular e dos que foram juntados nele.
    const juntadas = db.prepare(`SELECT id FROM ${TIPOS[tipo].tabela} WHERE mesclada_em_id = ?`).all(p.id).map((r) => r.id);
    const ids = [p.id, ...juntadas];
    const eventos = db.prepare(`SELECT e.id, e.titular_id, e.evento, e.detalhe, e.criado_em, u.nome AS usuario FROM titulares_eventos e
      LEFT JOIN users u ON u.id = e.usuario_id WHERE e.titular_tipo = ? AND e.titular_id IN (${ids.map(() => '?').join(',')}) ORDER BY e.id DESC LIMIT 100`).all(tipo, ...ids);
    const todos = vinculosDe(tipo, p.id, { incluirEncerrados: true });
    return {
      [tipo]: publica(p, tipo),
      funcoes: todos.filter((v) => v.ativo),
      funcoes_encerradas: todos.filter((v) => !v.ativo),
      eventos,
      historico_funcoes: historicoFuncoes(todos, { admin }),
      possiveis_duplicados: p.telefone_chave ? verificarTelefoneTitular(tipo, p.telefone, { exceto: p.id }) : [],
      funcoes_disponiveis: catalogo().filter((f) => f.titular === tipo)
        .map((f) => ({ ...f, ja_tem: todos.some((v) => v.ativo && v.funcao === f.funcao) }))
    };
  }

  /** Possíveis cadastros da mesma pessoa pelo telefone (só AVISO: nunca associa sozinho). */
  function verificarTelefone(telefone, opcoes = {}) { return verificarTelefoneTitular('pessoa', telefone, opcoes); }
  function verificarTelefoneTitular(tipo, telefone, { exceto = null } = {}) {
    const chave = chaveTelefone(telefone);
    if (!chave) return [];
    return db.prepare(`SELECT * FROM ${TIPOS[tipo].tabela} WHERE telefone_chave = ? AND situacao = 'ativa' AND id IS NOT ? ORDER BY id LIMIT 10`).all(chave, exceto)
      .map((p) => ({ id: p.id, nome: p[TIPOS[tipo].nome], cidade: p.cidade, telefone_final: finalTelefone(p.telefone),
        funcoes: vinculosDe(tipo, p.id).map((v) => ({ funcao: v.funcao, rotulo: v.rotulo, situacao: v.registro.situacao })) }));
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

  /** "Adicionar função": a ficha nova nasce com nome, telefone e cidade do titular (o resto vem do formulário). */
  function adicionarFuncao(pessoaId, funcao, dados, req) { return adicionarFuncaoTitular('pessoa', pessoaId, funcao, dados, req); }
  function adicionarFuncaoTitular(tipo, titularId, funcao, dados, req) {
    const T = TIPOS[tipo];
    const p = obterTitular(tipo, titularId);
    if (p.situacao !== 'ativa') throw new ErroPessoa(409, 'Este cadastro foi juntado a outro. Abra o cadastro principal.');
    if (!FUNCOES[funcao] || FUNCOES[funcao].titular !== tipo) throw new ErroPessoa(422, `Função incompatível com ${T.rotulo.toLowerCase()}.`);
    if (!disponivel(funcao)) throw new ErroPessoa(422, `A função ${FUNCOES[funcao].rotulo} ainda não está disponível.`);
    const body = { ...(dados && typeof dados === 'object' ? dados : {}) };
    if (!body[T.campoNomeFuncao]) body[T.campoNomeFuncao] = p[T.nome];
    if (!body.telefone) body.telefone = p.telefone || '';
    if (!body.cidade && p.cidade) body.cidade = p.cidade;
    const r = criarRegistro(FUNCOES[funcao].tabela, body, req, { titularId: p.id });
    audit(req, 'adicionar_funcao', T.tabela, p.id, `Função ${FUNCOES[funcao].rotulo} adicionada (registro #${r.item.id})`);
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
  function duplicados() { return duplicadosTitulares('pessoa'); }
  function duplicadosTitulares(tipo) {
    const T = TIPOS[tipo];
    const ativas = db.prepare(`SELECT * FROM ${T.tabela} WHERE situacao = 'ativa'`).all();
    const grupos = [];
    const vistos = new Set();
    const porTel = new Map();
    for (const p of ativas) if (p.telefone_chave) { if (!porTel.has(p.telefone_chave)) porTel.set(p.telefone_chave, []); porTel.get(p.telefone_chave).push(p); }
    for (const lista of porTel.values()) {
      if (lista.length < 2) continue;
      lista.forEach((p) => vistos.add(p.id));
      grupos.push({ motivo: 'mesmo_telefone', mesmo_nome: new Set(lista.map((p) => nomeNormal(p[T.nome]))).size === 1, [tipo === 'pessoa' ? 'pessoas' : 'empresas']: lista.map((p) => resumoTitular(tipo, p)) });
    }
    const porNome = new Map();
    for (const p of ativas) { const n = nomeNormal(p[T.nome]); if (n.length >= 5) { if (!porNome.has(n)) porNome.set(n, []); porNome.get(n).push(p); } }
    for (const lista of porNome.values()) {
      const novos = lista.filter((p) => !vistos.has(p.id));
      if (lista.length < 2 || !novos.length) continue;
      grupos.push({ motivo: 'mesmo_nome', mesmo_nome: true, [tipo === 'pessoa' ? 'pessoas' : 'empresas']: lista.map((p) => resumoTitular(tipo, p)) });
    }
    return { total_grupos: grupos.length, grupos };
  }
  function resumoTitular(tipo, p) {
    return { id: p.id, nome: p[TIPOS[tipo].nome], cidade: p.cidade, telefone_final: finalTelefone(p.telefone), email: p.email ? '(informado)' : null,
      criado_em: p.criado_em, funcoes: vinculosDe(tipo, p.id).map((v) => ({ funcao: v.funcao, rotulo: v.rotulo, registro_id: v.registro_id, situacao: v.registro.situacao, titulo: v.registro.titulo })) };
  }

  /**
   * Junta `juntar` em `manter` (só admin, confirmação explícita). Nada é apagado:
   * - função que só uma das duas tem: o vínculo passa para a que fica;
   * - função que as duas têm: o administrador escolhe o registro principal (`principais[funcao] = registro_id`); o outro
   *   vínculo é ENCERRADO (o registro e o histórico continuam existindo e aparecem na ficha como encerrados);
   * - campos vazios da que fica são completados com os da outra (só os vazios);
   * - a juntada vira "mesclada" e aponta para a que ficou.
   */
  function juntar(dados, req) { return juntarTitulares('pessoa', dados, req); }
  function juntarTitulares(tipo, { manterId, juntarId, principais = {}, confirmo }, req) {
    const T = TIPOS[tipo];
    if (confirmo !== true) throw new ErroPessoa(422, 'Confirme explicitamente a junção dos cadastros.');
    const a = obterTitular(tipo, manterId);
    const b = obterTitular(tipo, juntarId);
    if (a.id === b.id) throw new ErroPessoa(422, 'Escolha dois cadastros diferentes.');
    if (a.situacao !== 'ativa' || b.situacao !== 'ativa') throw new ErroPessoa(409, 'Só cadastros ativos podem ser juntados.');
    const va = vinculosDe(tipo, a.id);
    const vb = vinculosDe(tipo, b.id);
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
      db.prepare('UPDATE vinculos SET titular_id = ? WHERE titular_tipo = ? AND titular_id = ?').run(a.id, tipo, b.id);
      for (const campo of T.completar) {
        if (!a[campo] && b[campo]) { db.prepare(`UPDATE ${T.tabela} SET ${campo} = ? WHERE id = ?`).run(b[campo], a.id); preenchidos.push(campo); }
      }
      if (!a.telefone_chave && b.telefone_chave) db.prepare(`UPDATE ${T.tabela} SET telefone_chave = ? WHERE id = ?`).run(b.telefone_chave, a.id);
      db.prepare(`UPDATE ${T.tabela} SET situacao = 'mesclada', mesclada_em_id = ?, atualizado_em = ? WHERE id = ?`).run(a.id, t, b.id);
      db.prepare(`UPDATE ${T.tabela} SET atualizado_em = ? WHERE id = ?`).run(t, a.id);
      evento(tipo, a.id, 'juntada', `Recebeu o cadastro #${b.id}${conflitos.length ? `; registros principais escolhidos para: ${conflitos.map((f) => FUNCOES[f].rotulo).join(', ')}` : ''}${preenchidos.length ? `; campos completados: ${preenchidos.join(', ')}` : ''}`, req);
      evento(tipo, b.id, 'mesclada', `Juntado ao cadastro #${a.id}`, req);
    })();
    audit(req, 'juntar', T.tabela, a.id, `Cadastros de ${T.rotulo.toLowerCase()} juntados: #${b.id} → #${a.id}${conflitos.length ? ` (funções repetidas: ${conflitos.join(', ')})` : ''}`);
    return fichaTitular(tipo, a.id, { admin: true });
  }

  return {
    ativa, catalogo, criarRegistro, aoExcluirRegistro, FUNCAO_DA_TABELA,
    // pessoas (M1)
    listar, ficha, verificarTelefone, adicionarFuncao, duplicados, juntar,
    // genéricos (pessoa | empresa)
    listarTitulares, fichaTitular, verificarTelefoneTitular, adicionarFuncaoTitular, duplicadosTitulares, juntarTitulares
  };
}

module.exports = { createPessoas, ErroPessoa };
