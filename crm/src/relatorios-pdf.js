'use strict';
// Relatórios em PDF de todos os setores do CRM. Um gerador central (src/pdf/) + um modelo por setor aqui.
//
// criarRelatoriosPdf({ db, ENTITIES, entities, getSetting, todayISO, localDate, reportSummary, cenarioCompleto, computeCenario })
//   .gerar(tipo, query, usuario) → { buffer, arquivo, linhas, resumo }   (lança ErroRelatorio com status/mensagem)
//
// Tipos: um módulo (motoristas, entregadores, passageiros, parceiros, atendimentos, campanhas, tarefas), `resumo`
// (relatório do período), `financeiro` (cenários + simulações), `cenario` (um cenário, com ?id=).
// Os filtros são os MESMOS da lista na tela (busca, selects, etapa, período, responsável): o PDF sai como a lista está.
// Sem registro, o PDF sai assim mesmo, dizendo claramente que não há registros (e com os filtros que foram aplicados).
const fs = require('fs');
const path = require('path');
const { gerarRelatorio } = require('./pdf/relatorio');

const LIMITE_LINHAS = 5000;
let LOGO = null;
function logo() {
  if (LOGO === null) {
    try { LOGO = fs.readFileSync(path.join(__dirname, '..', 'public', 'icons', 'logo.png')); } catch (err) { LOGO = false; }
  }
  return LOGO || null;
}

class ErroRelatorio extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

const fmtData = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const fmtInt = (n) => new Intl.NumberFormat('pt-BR').format(Math.round(Number(n) || 0));
const fmtMoeda = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
const fmtPct = (n) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(n) || 0)}%`;
const vazioSe = (v) => (v === null || v === undefined ? '' : v);

/** Contagem por valor de uma coluna, do maior para o menor (nome vazio vira "Não informado"). */
function contar(linhas, campo, limite = 12) {
  const mapa = new Map();
  for (const l of linhas) { const k = String(vazioSe(l[campo]) || '').trim() || 'Não informado'; mapa.set(k, (mapa.get(k) || 0) + 1); }
  const itens = [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([chave, total]) => ({ chave, total }));
  if (itens.length <= limite) return itens;
  const resto = itens.slice(limite - 1).reduce((s, i) => s + i.total, 0);
  return [...itens.slice(0, limite - 1), { chave: 'Outros', total: resto }];
}

/* ------------------------- modelos por módulo (colunas) ------------------------ */
const MODELOS = {
  motoristas: {
    titulo: 'Relatório de Motoristas',
    colunas: [
      { titulo: 'Nome', peso: 2.3, v: (r) => r.nome }, { titulo: 'Telefone', peso: 1.35, v: (r) => r.telefone },
      { titulo: 'Cidade', peso: 1.1, v: (r) => r.cidade }, { titulo: 'Situação', peso: 1.5, v: (r) => r.situacao },
      { titulo: 'Documentos', peso: 1.5, v: (r) => r.documentos }, { titulo: 'Veículo / placa', peso: 1.7, v: (r) => [r.veiculo, r.placa].filter(Boolean).join(' · ') },
      { titulo: '1º contato', peso: 1, v: (r) => fmtData(r.data_primeiro_contato) }, { titulo: 'Contratado em', peso: 1, v: (r) => fmtData(r.contratado_em) }
    ],
    distribuicoes: [['Por situação', 'situacao'], ['Por origem do contato', 'origem'], ['Por cidade', 'cidade']]
  },
  entregadores: {
    titulo: 'Relatório de Entregadores e Motociclistas',
    colunas: [
      { titulo: 'Nome', peso: 2.2, v: (r) => r.nome }, { titulo: 'Modalidade', peso: 1.6, v: (r) => r.modalidade }, { titulo: 'Telefone', peso: 1.35, v: (r) => r.telefone },
      { titulo: 'Cidade', peso: 1.1, v: (r) => r.cidade }, { titulo: 'Situação', peso: 1.5, v: (r) => r.situacao },
      { titulo: 'Documentos', peso: 1.5, v: (r) => r.documentos }, { titulo: 'Veículo / placa', peso: 1.6, v: (r) => [r.veiculo, r.placa].filter(Boolean).join(' · ') },
      { titulo: '1º contato', peso: 1, v: (r) => fmtData(r.data_primeiro_contato) }, { titulo: 'Contratado em', peso: 1, v: (r) => fmtData(r.contratado_em) }
    ],
    distribuicoes: [['Por situação', 'situacao'], ['Por modalidade', 'modalidade'], ['Por origem do contato', 'origem']]
  },
  passageiros: {
    titulo: 'Relatório de Passageiros',
    colunas: [
      { titulo: 'Nome', peso: 2.4, v: (r) => r.nome }, { titulo: 'Telefone', peso: 1.4, v: (r) => r.telefone }, { titulo: 'Cidade', peso: 1.2, v: (r) => r.cidade },
      { titulo: 'Situação', peso: 1.7, v: (r) => r.situacao }, { titulo: 'Origem', peso: 1.4, v: (r) => r.origem },
      { titulo: '1º contato', peso: 1, v: (r) => fmtData(r.data_primeiro_contato) }, { titulo: 'Próxima ação', peso: 2, v: (r) => r.proxima_acao }
    ],
    distribuicoes: [['Por situação', 'situacao'], ['Por origem do contato', 'origem'], ['Por cidade', 'cidade']]
  },
  parceiros: {
    titulo: 'Relatório de Parceiros do Clube de Vantagens',
    colunas: [
      { titulo: 'Estabelecimento', peso: 2.2, v: (r) => r.nome_estabelecimento }, { titulo: 'Categoria', peso: 1.5, v: (r) => r.categoria },
      { titulo: 'Responsável', peso: 1.5, v: (r) => r.responsavel }, { titulo: 'Telefone', peso: 1.3, v: (r) => r.telefone }, { titulo: 'Cidade', peso: 1.1, v: (r) => r.cidade },
      { titulo: 'Situação', peso: 1.5, v: (r) => r.situacao }, { titulo: 'Benefício', peso: 2, v: (r) => r.beneficio }, { titulo: 'Contato', peso: 1, v: (r) => fmtData(r.data_contato) }
    ],
    distribuicoes: [['Por situação', 'situacao'], ['Por categoria', 'categoria'], ['Por cidade', 'cidade']]
  },
  comercios: {
    titulo: 'Relatório de Comércios Parceiros (entregas)',
    colunas: [
      { titulo: 'Comércio', peso: 2.2, v: (r) => r.nome_estabelecimento + (r.razao_social ? ` (${r.razao_social})` : '') }, { titulo: 'Categoria', peso: 1.6, v: (r) => r.categoria },
      { titulo: 'Responsável', peso: 1.5, v: (r) => r.responsavel }, { titulo: 'Telefone', peso: 1.3, v: (r) => r.telefone }, { titulo: 'Cidade', peso: 1.1, v: (r) => r.cidade },
      { titulo: 'Situação', peso: 1.6, v: (r) => r.situacao }, { titulo: 'Volume de entregas', peso: 1.4, v: (r) => r.volume_entregas },
      { titulo: '1º contato', peso: 1, v: (r) => fmtData(r.data_primeiro_contato) }, { titulo: 'Ativo desde', peso: 1, v: (r) => fmtData(r.ativado_em) }
    ],
    distribuicoes: [['Por situação', 'situacao'], ['Por categoria', 'categoria'], ['Por volume de entregas', 'volume_entregas']]
  },
  atendimentos: {
    titulo: 'Relatório de Atendimento',
    colunas: [
      { titulo: 'Data', peso: 1, v: (r) => fmtData(r.data) }, { titulo: 'Tipo', peso: 1.2, v: (r) => r.tipo }, { titulo: 'Assunto', peso: 3, v: (r) => r.assunto },
      { titulo: 'Pessoa', peso: 1.7, v: (r) => r.pessoa }, { titulo: 'Prioridade', peso: 1, v: (r) => r.prioridade }, { titulo: 'Situação', peso: 1.4, v: (r) => r.situacao },
      { titulo: 'Responsável', peso: 1.5, v: (r) => r.responsavel }
    ],
    distribuicoes: [['Por situação', 'situacao'], ['Por tipo', 'tipo'], ['Por prioridade', 'prioridade']]
  },
  campanhas: {
    titulo: 'Relatório de Marketing e Divulgação',
    colunas: [
      { titulo: 'Título', peso: 2.8, v: (r) => r.titulo }, { titulo: 'Tipo', peso: 1.2, v: (r) => r.tipo }, { titulo: 'Canal', peso: 1.4, v: (r) => r.canal },
      { titulo: 'Situação', peso: 1.2, v: (r) => r.situacao }, { titulo: 'Data', peso: 1, v: (r) => fmtData(r.data_publicacao || r.data_planejada) },
      { titulo: 'Investimento', peso: 1.2, alinhar: 'direita', v: (r) => (r.investimento === null || r.investimento === undefined ? '' : fmtMoeda(r.investimento)) },
      { titulo: 'Alcance', peso: 1, alinhar: 'direita', v: (r) => (r.alcance === null || r.alcance === undefined ? '' : fmtInt(r.alcance)) },
      { titulo: 'Engajamento', peso: 1.1, alinhar: 'direita', v: (r) => (r.engajamento === null || r.engajamento === undefined ? '' : fmtInt(r.engajamento)) }
    ],
    distribuicoes: [['Por situação', 'situacao'], ['Por canal', 'canal'], ['Por tipo', 'tipo']]
  },
  tarefas: {
    titulo: 'Relatório de Tarefas',
    colunas: [
      { titulo: 'Título', peso: 3, v: (r) => r.titulo }, { titulo: 'Responsável', peso: 1.6, v: (r) => r.responsavel }, { titulo: 'Prioridade', peso: 1, v: (r) => r.prioridade },
      { titulo: 'Situação', peso: 1.3, v: (r) => r.situacao }, { titulo: 'Vencimento', peso: 1, v: (r) => fmtData(r.data_vencimento) }
    ],
    distribuicoes: [['Por situação', 'situacao'], ['Por prioridade', 'prioridade'], ['Por responsável', 'responsavel']]
  }
};

// Módulos que listam pessoas (dado pessoal): só o administrador exporta. Os demais o gestor também pode (ver policy).
const TOM_SITUACAO = (def, situacao) => {
  if ((def.fechados || []).includes(situacao)) return 'verde';
  if ((def.perdidos || []).includes(situacao) || situacao === 'Cancelada' || situacao === 'Cancelado') return 'vermelho';
  return null;
};

function criarRelatoriosPdf({ db, ENTITIES, entities, getSetting, todayISO, reportSummary, cenarioCompleto, computeCenario }) {
  const org = () => ({ nome: getSetting('org_nome', 'Fortaleza Move'), slogan: getSetting('slogan', '') });
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function descreverFiltros(def, q) {
    const f = [];
    if (q.de || q.ate) f.push([`Período (${def.dateFieldLabel || 'data'})`, `${q.de ? fmtData(q.de) : 'início'} a ${q.ate ? fmtData(q.ate) : 'hoje'}`]);
    else f.push(['Período', 'todo o histórico']);
    if (String(q.q || '').trim()) f.push(['Busca', `“${String(q.q).trim().slice(0, 60)}”`]);
    for (const campo of def.fields) if (campo.type === 'select' && q[`f_${campo.key}`]) f.push([campo.label, String(q[`f_${campo.key}`]).slice(0, 60)]);
    if (q.etapa === 'andamento') f.push(['Etapa', 'Em andamento']);
    else if (q.etapa === 'fechados') f.push(['Etapa', 'Fechados (verde)']);
    if (q.responsavel && def.fields.some((x) => x.key === 'responsavel')) f.push(['Responsável', String(q.responsavel).slice(0, 60)]);
    if (f.length === 1 && !q.de && !q.ate) f.push(['Situação / busca', 'sem filtros: todos os registros']);
    return f;
  }

  /* ------------------------------- módulos ------------------------------- */
  function modulo(tipo, q, usuario) {
    const def = ENTITIES[tipo];
    const modelo = MODELOS[tipo];
    const { where, params } = entities.montarFiltro(def, q);
    const ordem = def.table === 'campanhas' ? 'COALESCE(data_publicacao, data_planejada)' : (def.orderField || def.dateField);
    const dir = def.orderDir === 'asc' ? 'ASC' : 'DESC';
    const total = db.prepare(`SELECT COUNT(*) c FROM ${def.table} WHERE ${where.join(' AND ')}`).get(...params).c;
    const rows = db.prepare(`SELECT * FROM ${def.table} WHERE ${where.join(' AND ')} ORDER BY ${ordem} IS NULL, ${ordem} ${dir}, id DESC LIMIT ?`).all(...params, LIMITE_LINHAS);
    const st = def.statusField;
    const conta = (lista) => rows.filter((r) => lista.includes(r[st])).length;
    const ind = [{ rotulo: 'Total de registros', valor: fmtInt(total) }];
    const blocos = [];
    if ((def.fechados || []).length) {
      const fech = conta(def.fechados); const perd = conta(def.perdidos || []);
      ind.push({ rotulo: 'Em andamento', valor: fmtInt(rows.length - fech - perd) });
      ind.push({ rotulo: def.fechados.join(' / '), valor: fmtInt(fech), tom: 'verde' });
      ind.push({ rotulo: (def.perdidos || []).join(' / ') || 'Perdidos', valor: fmtInt(perd), tom: 'vermelho' });
      if (tipo === 'motoristas' || tipo === 'entregadores') {
        ind.push({ rotulo: 'Documentos a conferir', valor: fmtInt(rows.filter((r) => ['Aprovado', 'Contratado'].includes(r.situacao) && r.documentos !== 'Conferidos').length), tom: 'dourado' });
      }
    }
    if (tipo === 'atendimentos') {
      ind.push({ rotulo: 'Pendentes', valor: fmtInt(rows.filter((r) => ['Aberto', 'Em andamento', 'Aguardando retorno'].includes(r.situacao)).length), tom: 'dourado' });
      ind.push({ rotulo: 'Resolvidos', valor: fmtInt(rows.filter((r) => r.situacao === 'Resolvido').length), tom: 'verde' });
      ind.push({ rotulo: 'Prioridade alta / urgente', valor: fmtInt(rows.filter((r) => ['Alta', 'Urgente'].includes(r.prioridade)).length), tom: 'vermelho' });
    }
    if (tipo === 'tarefas') {
      const hoje = todayISO();
      ind.push({ rotulo: 'Concluídas', valor: fmtInt(conta(['Concluída'])), tom: 'verde' });
      ind.push({ rotulo: 'Pendentes / em andamento', valor: fmtInt(conta(['Pendente', 'Em andamento'])), tom: 'dourado' });
      ind.push({ rotulo: 'Atrasadas', valor: fmtInt(rows.filter((r) => ['Pendente', 'Em andamento'].includes(r.situacao) && r.data_vencimento < hoje).length), tom: 'vermelho' });
    }
    if (tipo === 'campanhas') {
      ind.push({ rotulo: 'Investimento somado', valor: fmtMoeda(rows.reduce((s, r) => s + (Number(r.investimento) || 0), 0)) });
      ind.push({ rotulo: 'Alcance somado', valor: fmtInt(rows.reduce((s, r) => s + (Number(r.alcance) || 0), 0)) });
      ind.push({ rotulo: 'Engajamento somado', valor: fmtInt(rows.reduce((s, r) => s + (Number(r.engajamento) || 0), 0)) });
    }
    blocos.push({ tipo: 'indicadores', itens: ind });
    if (rows.length) blocos.push({ tipo: 'distribuicoes', titulo: 'Resumo', colunas: 3, itens: modelo.distribuicoes.map(([titulo, campo]) => ({ titulo, itens: contar(rows, campo) })) });

    const totais = tipo === 'campanhas'
      ? [`Total: ${fmtInt(rows.length)}`, '', '', '', '', fmtMoeda(rows.reduce((s, r) => s + (Number(r.investimento) || 0), 0)), fmtInt(rows.reduce((s, r) => s + (Number(r.alcance) || 0), 0)), fmtInt(rows.reduce((s, r) => s + (Number(r.engajamento) || 0), 0))]
      : [`Total: ${fmtInt(rows.length)} ${rows.length === 1 ? 'registro' : 'registros'}`, ...modelo.colunas.slice(1).map(() => '')];
    blocos.push({
      tipo: 'tabela',
      titulo: def.label,
      colunas: modelo.colunas.map((c) => ({ titulo: c.titulo, peso: c.peso, alinhar: c.alinhar })),
      linhas: rows.map((r) => ({ celulas: modelo.colunas.map((c) => c.v(r)), tom: TOM_SITUACAO(def, r[st]) })),
      totais: rows.length ? totais : null,
      vazio: 'Nenhum registro encontrado para os filtros aplicados.',
      observacao: total > rows.length ? `Mostrando os ${fmtInt(rows.length)} primeiros de ${fmtInt(total)} registros. Refine os filtros para ver os demais.` : ((def.fechados || []).length ? 'Linhas em verde: fechados. Linhas em vermelho: não prosseguiram ou cancelados.' : null)
    });
    return {
      relatorio: { titulo: modelo.titulo, subtitulo: `Lista conforme os filtros da tela · ${fmtInt(total)} ${total === 1 ? 'registro' : 'registros'}`, paisagem: true, filtros: descreverFiltros(def, q), blocos },
      linhas: rows.length, arquivo: tipo, resumo: `${modelo.titulo} (${fmtInt(rows.length)} linhas)`
    };
  }

  /* -------------------------------- resumo ------------------------------- */
  function resumo(q) {
    const de = q.de; const ate = q.ate;
    const s = reportSummary(de, ate);
    const grupo = (t, i) => ({ titulo: t, itens: i || [] });
    const blocos = [];
    blocos.push({ tipo: 'indicadores', titulo: 'Resumo do período', itens: [
      { rotulo: 'Motoristas', valor: fmtInt(s.motoristas.total) },
      ...(s.entregadores ? [{ rotulo: 'Entregadores', valor: fmtInt(s.entregadores.total) }] : []),
      { rotulo: 'Passageiros', valor: fmtInt(s.passageiros.total) },
      { rotulo: 'Parceiros', valor: fmtInt(s.parceiros.total) },
      { rotulo: 'Parcerias confirmadas', valor: fmtInt(s.parceiros.confirmados), tom: 'verde' },
      { rotulo: 'Campanhas', valor: fmtInt(s.campanhas.total) },
      { rotulo: 'Atendimentos', valor: fmtInt(s.atendimentos.total) },
      { rotulo: 'Atendimentos pendentes', valor: fmtInt(s.atendimentos.pendentes), tom: 'dourado' },
      { rotulo: 'Tarefas', valor: fmtInt(s.tarefas.total) },
      { rotulo: 'Tarefas atrasadas', valor: fmtInt(s.tarefas.atrasadas), tom: s.tarefas.atrasadas ? 'vermelho' : null }
    ] });
    blocos.push({ tipo: 'distribuicoes', titulo: 'Motoristas, entregadores e passageiros', colunas: 3, itens: [
      grupo('Motoristas por situação', s.motoristas.por_situacao),
      ...(s.entregadores ? [grupo('Entregadores por situação', s.entregadores.por_situacao), grupo('Entregadores por modalidade', s.entregadores.por_modalidade)] : []),
      grupo('Passageiros por situação', s.passageiros.por_situacao)
    ] });
    blocos.push({ tipo: 'distribuicoes', titulo: 'Parceiros, atendimento e tarefas', colunas: 3, itens: [
      grupo('Parceiros por categoria', s.parceiros.por_categoria), grupo('Atendimentos por tipo', s.atendimentos.por_tipo),
      grupo('Atendimentos por prioridade', s.atendimentos.por_prioridade), grupo('Tarefas por situação', s.tarefas.por_situacao)
    ] });
    blocos.push({ tipo: 'indicadores', titulo: 'Marketing e divulgação', itens: [
      { rotulo: 'Investimento', valor: fmtMoeda(s.campanhas.investimento) }, { rotulo: 'Alcance somado', valor: fmtInt(s.campanhas.alcance) }, { rotulo: 'Engajamento somado', valor: fmtInt(s.campanhas.engajamento) }
    ] });
    blocos.push({ tipo: 'distribuicoes', colunas: 2, itens: [grupo('Campanhas por canal', s.campanhas.por_canal), grupo('Campanhas por situação', s.campanhas.por_situacao)] });
    blocos.push({
      tipo: 'tabela', titulo: 'Simulações financeiras registradas',
      colunas: [{ titulo: 'Data', peso: 1 }, { titulo: 'Cenário', peso: 2.5 }, { titulo: 'Corridas/mês', peso: 1.2, alinhar: 'direita' }, { titulo: 'Receita estimada', peso: 1.4, alinhar: 'direita' }, { titulo: 'Resultado estimado', peso: 1.4, alinhar: 'direita' }, { titulo: 'Responsável', peso: 1.5 }],
      linhas: s.simulacoes.items.map((i) => ({ celulas: [fmtData(String(i.created_at).slice(0, 10)), i.cenario, fmtInt(i.corridas), fmtMoeda(i.receita), fmtMoeda(i.resultado), i.autor || ''], tom: i.resultado < 0 ? 'vermelho' : null })),
      totais: s.simulacoes.items.length ? [`Total: ${fmtInt(s.simulacoes.total)}`, '', '', fmtMoeda(s.simulacoes.receita_total), '', ''] : null,
      vazio: 'Nenhuma simulação salva no período.',
      observacao: 'Valores de simulação são estimativas baseadas em premissas configuráveis; não representam receita realizada.'
    });
    return {
      relatorio: { titulo: 'Relatório geral do período', subtitulo: 'Totais por módulo, considerando a data de cada registro dentro do período', paisagem: false, filtros: [['Período', `${fmtData(de)} a ${fmtData(ate)}`]], blocos },
      linhas: null, arquivo: 'resumo', resumo: 'Relatório geral do período'
    };
  }

  /* ------------------------------ financeiro ----------------------------- */
  const parse = (t) => { try { return JSON.parse(t || '{}'); } catch (err) { return {}; } };
  function financeiro(q) {
    const cenarios = db.prepare('SELECT * FROM cenarios ORDER BY id').all().map(cenarioCompleto);
    const sims = db.prepare("SELECT * FROM simulacoes WHERE date(created_at, '-3 hours') BETWEEN ? AND ? ORDER BY id DESC LIMIT ?").all(q.de, q.ate, LIMITE_LINHAS);
    const incompleto = (c) => !(Number(c.resultado.custos_total) > 0);
    const blocos = [];
    blocos.push({ tipo: 'indicadores', itens: [
      { rotulo: 'Cenários', valor: fmtInt(cenarios.length) },
      { rotulo: 'Cenários incompletos (sem custos)', valor: fmtInt(cenarios.filter(incompleto).length), tom: cenarios.some(incompleto) ? 'dourado' : null },
      { rotulo: 'Simulações no período', valor: fmtInt(sims.length) }
    ] });
    blocos.push({
      tipo: 'tabela', titulo: '1. Cenários (premissas, receita, custos e resultado)',
      colunas: [{ titulo: 'Cenário', peso: 2.2 }, { titulo: 'Motoristas', peso: 1, alinhar: 'direita' }, { titulo: 'Corridas/dia', peso: 1, alinhar: 'direita' }, { titulo: 'Dias', peso: 0.7, alinhar: 'direita' },
        { titulo: 'Valor médio', peso: 1.1, alinhar: 'direita' }, { titulo: 'Comissão', peso: 0.9, alinhar: 'direita' }, { titulo: 'Receita/mês', peso: 1.3, alinhar: 'direita' },
        { titulo: 'Custos/mês', peso: 1.3, alinhar: 'direita' }, { titulo: 'Resultado', peso: 1.3, alinhar: 'direita' }, { titulo: 'Situação', peso: 1.4 }],
      linhas: cenarios.map((c) => ({
        celulas: [c.nome, fmtInt(c.motoristas_ativos), String(c.corridas_motorista_dia).replace('.', ','), fmtInt(c.dias_operacao), fmtMoeda(c.valor_medio_corrida), fmtPct(c.comissao_pct),
          fmtMoeda(c.resultado.receita_plataforma), fmtMoeda(c.resultado.custos_total), incompleto(c) ? 'incompleto' : fmtMoeda(c.resultado.resultado_operacional), incompleto(c) ? 'Simulação incompleta (sem custos)' : 'Completa'],
        tom: incompleto(c) ? 'dourado' : (c.resultado.resultado_operacional < 0 ? 'vermelho' : null)
      })),
      vazio: 'Nenhum cenário cadastrado.',
      observacao: 'Sem custos informados, o resultado é só a receita projetada: não é lucro. Valores são estimativas, não receita realizada.'
    });
    blocos.push({
      tipo: 'tabela', titulo: '2. Simulações registradas no período',
      colunas: [{ titulo: 'Data', peso: 1 }, { titulo: 'Cenário', peso: 2.2 }, { titulo: 'Corridas/mês', peso: 1.1, alinhar: 'direita' }, { titulo: 'Faturamento bruto', peso: 1.3, alinhar: 'direita' },
        { titulo: 'Receita', peso: 1.2, alinhar: 'direita' }, { titulo: 'Repasse motoristas', peso: 1.3, alinhar: 'direita' }, { titulo: 'Custos', peso: 1.1, alinhar: 'direita' }, { titulo: 'Resultado', peso: 1.2, alinhar: 'direita' }, { titulo: 'Responsável', peso: 1.4 }],
      linhas: sims.map((s) => { const r = parse(s.resultados); return { celulas: [fmtData(String(s.created_at).slice(0, 10)), s.cenario_nome, fmtInt(r.corridas_mes), fmtMoeda(r.faturamento_bruto), fmtMoeda(r.receita_plataforma), fmtMoeda(r.repasse_motoristas), fmtMoeda(r.custos_total), fmtMoeda(r.resultado_operacional), s.created_by_nome || ''], tom: r.resultado_operacional < 0 ? 'vermelho' : null }; }),
      totais: sims.length ? [`Total: ${fmtInt(sims.length)}`, '', '', fmtMoeda(sims.reduce((a, s) => a + (parse(s.resultados).faturamento_bruto || 0), 0)), fmtMoeda(sims.reduce((a, s) => a + (parse(s.resultados).receita_plataforma || 0), 0)), fmtMoeda(sims.reduce((a, s) => a + (parse(s.resultados).repasse_motoristas || 0), 0)), fmtMoeda(sims.reduce((a, s) => a + (parse(s.resultados).custos_total || 0), 0)), fmtMoeda(sims.reduce((a, s) => a + (parse(s.resultados).resultado_operacional || 0), 0)), ''] : null,
      vazio: 'Nenhuma simulação salva no período.'
    });
    return {
      relatorio: { titulo: 'Planejamento financeiro', subtitulo: 'Cenários e simulações de receita e resultado da plataforma', paisagem: true, filtros: [['Período das simulações', `${fmtData(q.de)} a ${fmtData(q.ate)}`]], blocos },
      linhas: null, arquivo: 'financeiro', resumo: `Planejamento financeiro (${cenarios.length} cenários, ${sims.length} simulações)`
    };
  }

  function cenario(q) {
    const id = Number(q.id);
    const row = Number.isInteger(id) ? db.prepare('SELECT * FROM cenarios WHERE id = ?').get(id) : null;
    if (!row) throw new ErroRelatorio(404, 'Cenário não encontrado.');
    const c = cenarioCompleto(row); const r = c.resultado; const sem = !(Number(r.custos_total) > 0);
    const blocos = [];
    if (sem) blocos.push({ tipo: 'nota', texto: 'Simulação incompleta: nenhum custo mensal foi informado. Sem custos, o resultado é só a receita projetada — não é lucro.' });
    blocos.push({ tipo: 'pares', titulo: 'Premissas', itens: [['Motoristas ativos', fmtInt(c.motoristas_ativos)], ['Corridas por motorista/dia', String(c.corridas_motorista_dia).replace('.', ',')], ['Dias de operação no mês', fmtInt(c.dias_operacao)], ['Valor médio da corrida', fmtMoeda(c.valor_medio_corrida)], ['Comissão da plataforma', fmtPct(c.comissao_pct)], ...(c.descricao ? [['Descrição', c.descricao]] : [])] });
    blocos.push({ tipo: 'indicadores', titulo: '1. Receita (projeção)', itens: [{ rotulo: 'Corridas por mês', valor: fmtInt(r.corridas_mes) }, { rotulo: 'Faturamento bruto', valor: fmtMoeda(r.faturamento_bruto) }, { rotulo: 'Repasse aos motoristas', valor: fmtMoeda(r.repasse_motoristas) }, { rotulo: 'Receita da plataforma', valor: fmtMoeda(r.receita_plataforma), tom: 'verde' }] });
    blocos.push({ tipo: 'tabela', titulo: '2. Custos mensais', colunas: [{ titulo: 'Custo', peso: 4 }, { titulo: 'Valor mensal', peso: 1.5, alinhar: 'direita' }], linhas: c.custos.map((k) => ({ celulas: [k.descricao, fmtMoeda(k.valor)] })), totais: c.custos.length ? ['Total de custos', fmtMoeda(r.custos_total)] : null, vazio: 'Nenhum custo mensal informado.' });
    if (!sem) {
      blocos.push({ tipo: 'indicadores', titulo: '3. Resultado', itens: [{ rotulo: 'Resultado operacional', valor: fmtMoeda(r.resultado_operacional), tom: r.resultado_operacional < 0 ? 'vermelho' : 'verde' }, { rotulo: 'Margem sobre a receita', valor: fmtPct(r.margem_pct) }, { rotulo: 'Custo por corrida', valor: fmtMoeda(r.custo_por_corrida) }, { rotulo: 'Ponto de equilíbrio', valor: r.ponto_equilibrio_corridas === null ? '—' : `${fmtInt(r.ponto_equilibrio_corridas)} corridas` }] });
    }
    blocos.push({ tipo: 'nota', texto: 'Valores estimados com base nas premissas acima; não representam receita realizada.' });
    return {
      relatorio: { titulo: `Cenário: ${c.nome}`, subtitulo: 'Planejamento financeiro · premissas, receita, custos e resultado', paisagem: false, filtros: [], blocos },
      linhas: null, arquivo: `cenario_${c.id}`, resumo: `Cenário financeiro #${c.id}`
    };
  }

  /** Quais tipos existem agora (entregadores só com a Etapa 2). */
  const tiposValidos = () => [...Object.keys(MODELOS).filter((t) => hasOwn(ENTITIES, t)), 'resumo', 'financeiro', 'cenario'];

  function gerar(tipo, query, usuario) {
    const t = String(tipo || '');
    if (!tiposValidos().includes(t)) throw new ErroRelatorio(400, 'Tipo de relatório inválido.');
    const q = { ...query };
    const hoje = todayISO();
    // Relatórios por período usam o mês atual quando o período não vem; as listas dos módulos usam todo o histórico.
    if (['resumo', 'financeiro'].includes(t)) {
      q.de = /^\d{4}-\d{2}-\d{2}$/.test(String(q.de || '')) ? q.de : `${hoje.slice(0, 7)}-01`;
      q.ate = /^\d{4}-\d{2}-\d{2}$/.test(String(q.ate || '')) ? q.ate : hoje;
    }
    const r = hasOwn(MODELOS, t) ? modulo(t, q, usuario) : t === 'resumo' ? resumo(q) : t === 'financeiro' ? financeiro(q) : cenario(q);
    const agora = new Date();
    const buffer = gerarRelatorio({ ...r.relatorio, org: org(), logo: logo(), rodape: { gerado_por: usuario && usuario.nome, gerado_em: agora } });
    const carimbo = new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    return { buffer, arquivo: `fortaleza-move_${r.arquivo}_${carimbo}.pdf`, linhas: r.linhas, resumo: r.resumo };
  }

  return { gerar, tiposValidos, ErroRelatorio };
}

module.exports = { criarRelatoriosPdf, ErroRelatorio, MODELOS, contar, fmtData, fmtMoeda };
