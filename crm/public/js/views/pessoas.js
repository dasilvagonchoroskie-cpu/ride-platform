// Etapa 2 — Pessoas: ficha central de cada pessoa e as suas funções (motorista, passageiro, entregador…).
// Cada função continua com a sua própria ficha, situação e histórico; esta tela só reúne e liga.
import { api } from '../api.js';
import * as ui from '../ui.js';

const NAV_DA_TABELA = { motoristas: 'motoristas', passageiros: 'passageiros', parceiros: 'parceiros', entregadores: 'entregadores', comercios: 'comercios' };
const ICONE = { motorista: 'steering', passageiro: 'users', entregador: 'send', parceiro_clube: 'store', comercio: 'building' };
const ROTULO_EVENTO = { criado: 'Cadastro criado', funcao_adicionada: 'Função adicionada', funcao_encerrada: 'Função encerrada', juntada: 'Recebeu cadastro duplicado', mesclada: 'Juntado a outro cadastro' };

const tomRegistro = (r) => (r.removido ? 'danger' : r.fechado ? 'fechado' : r.perdido ? 'neutral' : ui.statusTone(r.situacao));
const iniciais = (nome) => String(nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
const telefoneVisivel = (t) => {
  const d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.startsWith('55') && d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d || 'Não informado';
};

function chipsFuncoes(funcoes) {
  if (!funcoes.length) return '<span class="muted small">Sem funções ativas</span>';
  return funcoes.map((f) => `<span class="pessoa-chip ${tomRegistro(f.registro)}">${ui.icon(ICONE[f.funcao] || 'users', 13)} ${ui.esc(f.rotulo)} · ${ui.esc(f.registro.situacao || '—')}</span>`).join('');
}

export async function renderPessoas(view, state, params) {
  const admin = state.user && state.user.role === 'admin';
  if (/^\d+$/.test(params.get('id') || '')) return renderFicha(view, state, Number(params.get('id')));
  if (params.get('duplicados') === '1' && admin) return renderDuplicados(view, state);
  return renderLista(view, state, admin);
}

/* --------------------------------- lista --------------------------------- */
async function renderLista(view, state, admin) {
  let q = '';
  let page = 1;
  let seq = 0;
  view.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Ficha central</div><h2>Pessoas</h2>
        <p class="sub">Cada pessoa aparece uma vez, com todas as suas funções. Abra a pessoa para ver cada ficha funcional.</p></div>
      <div class="page-actions">${admin ? `<a class="btn btn-ghost" href="#/pessoas?duplicados=1">${ui.icon('alert', 16)} Possíveis duplicados</a>` : ''}</div>
    </div>
    <div class="toolbar"><div class="search">${ui.icon('search', 16)}<input id="p-busca" type="search" placeholder="Buscar por nome ou telefone" maxlength="80"></div></div>
    <div id="p-lista">Carregando…</div>`;
  const lista = view.querySelector('#p-lista');
  async function carregar() {
    const meu = ++seq;
    const d = await api.get(`/pessoas?q=${encodeURIComponent(q)}&page=${page}`);
    if (meu !== seq) return;
    if (!d.items.length) {
      lista.innerHTML = `<div class="card"><div class="empty"><div class="empty-icon">${ui.icon('users', 22)}</div><h4>${q ? 'Ninguém encontrado' : 'Nenhuma pessoa cadastrada'}</h4>
        <p>${q ? 'Confira o nome ou os números digitados.' : 'Ao cadastrar um motorista ou passageiro, a pessoa aparece aqui.'}</p></div></div>`;
      return;
    }
    lista.innerHTML = `<div class="pessoa-grid">${d.items.map((p) => `
      <a class="card pessoa-card" href="#/pessoas?id=${p.id}">
        <div class="pessoa-avatar">${ui.esc(iniciais(p.nome))}</div>
        <div class="pessoa-info"><b>${ui.esc(p.nome)}</b>
          <span class="muted small">${ui.esc(p.cidade || 'Cidade não informada')} · ${ui.esc(telefoneVisivel(p.telefone))}</span>
          <div class="pessoa-chips">${chipsFuncoes(p.funcoes)}</div></div>
      </a>`).join('')}</div>
      ${d.pages > 1 ? `<div class="pager"><button class="btn btn-sm btn-ghost" data-pg="-1" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
        <span class="muted small">Página ${d.page} de ${d.pages} · ${ui.fmtInt(d.total)} pessoa(s)</span>
        <button class="btn btn-sm btn-ghost" data-pg="1" ${page >= d.pages ? 'disabled' : ''}>Próxima</button></div>` : `<p class="muted small" style="margin-top:8px">${ui.fmtInt(d.total)} pessoa(s)</p>`}`;
    lista.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => { page += Number(b.dataset.pg); carregar(); }));
  }
  let timer = null;
  view.querySelector('#p-busca').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); page = 1; carregar(); }, 250); });
  await carregar();
}

/* ------------------------------ ficha central ------------------------------ */
async function renderFicha(view, state, id) {
  const admin = state.user && state.user.role === 'admin';
  const d = await api.get(`/pessoas/${id}`);
  if (d.mesclada) { location.hash = `#/pessoas?id=${d.mesclada_em_id}`; return; }
  const p = d.pessoa;
  const disponiveis = d.funcoes_disponiveis.filter((f) => f.disponivel && !f.ja_tem);

  view.innerHTML = `
    <div class="page-head">
      <div><a class="muted small" href="#/pessoas">← Todas as pessoas</a><div class="eyebrow" style="margin-top:6px">Ficha central da pessoa</div></div>
      <div class="page-actions"><button class="btn btn-primary" id="p-add" ${disponiveis.length ? '' : 'disabled'}>${ui.icon('plus', 16)} Adicionar função</button></div>
    </div>

    <div class="card pessoa-topo">
      <div class="pessoa-avatar grande">${ui.esc(iniciais(p.nome))}</div>
      <div class="pessoa-dados">
        <h2>${ui.esc(p.nome)}</h2>
        <div class="pessoa-meta">
          <span>${ui.icon('phone', 14)} ${ui.esc(telefoneVisivel(p.telefone))}</span>
          <span>${ui.icon('building', 14)} ${ui.esc(p.cidade || 'Cidade não informada')}</span>
          ${p.email ? `<span>${ui.esc(p.email)}</span>` : ''}
          <span class="muted">Cadastro desde ${ui.fmtDate(p.criado_em)}</span>
          <span class="muted" title="Identificador permanente">ID ${ui.esc(p.uid.slice(0, 8))}</span>
        </div>
      </div>
    </div>

    ${d.possiveis_duplicados.length ? `<div class="notice warn" style="margin:14px 0">${ui.icon('alert', 15)}
      <span><b>Possível cadastro repetido:</b> ${d.possiveis_duplicados.map((x) => `${ui.esc(x.nome)} (telefone terminado em ${ui.esc(x.telefone_final)})`).join(', ')}.
      ${admin ? '<a href="#/pessoas?duplicados=1">Comparar e decidir</a>' : 'Avise o administrador para conferir.'}</span></div>` : ''}

    <div class="section-title">Funções na Fortaleza Move</div>
    <div class="funcao-grid">
      ${d.funcoes.length ? d.funcoes.map((f) => cartaoFuncao(f)).join('') : '<div class="card"><div class="empty"><p>Nenhuma função ativa.</p></div></div>'}
    </div>

    ${d.funcoes_encerradas.length ? `<div class="section-title">Funções encerradas (o histórico continua guardado)</div>
      <div class="funcao-grid">${d.funcoes_encerradas.map((f) => cartaoFuncao(f, true)).join('')}</div>` : ''}

    <div class="section-title">Histórico do cadastro</div>
    <div class="card"><div class="card-body">${d.eventos.length ? `<div class="timeline">${d.eventos.map((e) => `
      <div class="tl-item"><div class="tl-dot"></div><div><p><b>${ui.esc(ROTULO_EVENTO[e.evento] || e.evento)}</b>${e.detalhe ? ` — ${ui.esc(e.detalhe)}` : ''}</p>
      <div class="tl-meta">${ui.fmtDateTime(e.criado_em)}${e.usuario ? ` · ${ui.esc(e.usuario)}` : ''}</div></div></div>`).join('')}</div>`
      : '<p class="muted small">Sem eventos registrados.</p>'}</div></div>`;

  view.querySelector('#p-add').addEventListener('click', () => adicionarFuncao(state, p, disponiveis, () => renderFicha(view, state, id)));
}

function cartaoFuncao(f, encerrada = false) {
  const r = f.registro;
  const nav = NAV_DA_TABELA[f.registro_tabela];
  return `<div class="card funcao-card ${encerrada ? 'encerrada' : ''} ${r.fechado && !encerrada ? 'fechada' : ''}">
    <div class="funcao-topo"><span class="funcao-icone">${ui.icon(ICONE[f.funcao] || 'users', 18)}</span>
      <div><b>${ui.esc(f.rotulo)}</b><div class="muted small">Ficha #${f.registro_id}${r.titulo && !r.removido ? ` · ${ui.esc(r.titulo)}` : ''}</div></div></div>
    <div class="funcao-situacao">${r.removido ? ui.badge('Registro excluído', 'danger') : ui.badge(r.situacao || '—', tomRegistro(r))}
      ${r.documentos ? ui.badge(`Documentos: ${r.documentos}`) : ''}</div>
    <div class="muted small">${encerrada ? `Encerrada em ${ui.fmtDate(f.encerrado_em)} · ${ui.esc(f.motivo_encerramento || '')}`
      : r.contratado_em ? `Contratado em ${ui.fmtDate(r.contratado_em)}` : r.confirmado_em ? `Confirmado em ${ui.fmtDate(r.confirmado_em)}` : `Função desde ${ui.fmtDate(f.criado_em)}`}</div>
    ${!r.removido && nav ? `<a class="btn btn-sm btn-ghost" href="#/${nav}?abrir=${f.registro_id}">Abrir ficha de ${ui.esc(f.rotulo.toLowerCase())}</a>` : ''}
  </div>`;
}

// "Adicionar função": escolhe a função compatível e preenche a ficha nova (nome, telefone e cidade já vêm da pessoa).
function adicionarFuncao(state, pessoa, disponiveis, depois) {
  if (!disponiveis.length) return;
  const corpo = document.createElement('div');
  corpo.innerHTML = `<div class="form-errors" id="af-erro" hidden></div>
    <div class="field"><label for="af-funcao">Função</label><select id="af-funcao">${disponiveis.map((f) => `<option value="${ui.esc(f.funcao)}">${ui.esc(f.rotulo)}</option>`).join('')}</select>
    <div class="form-hint">A nova ficha terá situação e histórico próprios: aprovar ou contratar em uma função não muda as outras.</div></div>
    <div id="af-form"></div>`;
  const m = ui.modal({ title: `Adicionar função — ${pessoa.nome}`, body: corpo,
    footer: '<button class="btn btn-ghost" data-cancel type="button">Cancelar</button><button class="btn btn-primary" data-salvar type="button">Adicionar função</button>' });
  let form = null;
  const montar = () => {
    const f = disponiveis.find((x) => x.funcao === corpo.querySelector('#af-funcao').value);
    const def = state.meta.entities[f.tabela];
    const valores = { nome: pessoa.nome, telefone: pessoa.telefone ? telefoneVisivel(pessoa.telefone) : '', cidade: pessoa.cidade || '' };
    for (const campo of def.fields) {
      if (campo.key === def.statusField) valores[campo.key] = def.statuses[0];
      if (campo.type === 'date' && campo.required && !valores[campo.key]) valores[campo.key] = state.meta.hoje;
    }
    form = ui.buildForm(def, valores);
    const alvo = corpo.querySelector('#af-form');
    alvo.replaceChildren(form.el);
  };
  corpo.querySelector('#af-funcao').addEventListener('change', montar);
  montar();
  m.dialog.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  m.dialog.querySelector('[data-salvar]').addEventListener('click', async () => {
    const erro = corpo.querySelector('#af-erro');
    erro.hidden = true;
    try {
      await api.post(`/pessoas/${pessoa.id}/funcoes`, { funcao: corpo.querySelector('#af-funcao').value, dados: form.getValues() });
      ui.toast('Função adicionada.', 'success');
      m.close();
      depois();
    } catch (err) {
      if (err.fields) form.setErrors(err.fields);
      erro.hidden = false;
      erro.textContent = err.message;
    }
  });
}

/* --------------------------- possíveis duplicados --------------------------- */
async function renderDuplicados(view, state) {
  const d = await api.get('/pessoas/duplicados');
  view.innerHTML = `
    <div class="page-head"><div><a class="muted small" href="#/pessoas">← Todas as pessoas</a>
      <div class="eyebrow" style="margin-top:6px">Somente administrador</div><h2>Possíveis cadastros duplicados</h2>
      <p class="sub">Nada é juntado sozinho. Compare os dois cadastros e só junte quando tiver certeza de que são a mesma pessoa.</p></div></div>
    ${d.grupos.length ? d.grupos.map((g, i) => `
      <div class="card" style="margin-bottom:14px"><div class="card-head"><div>
        <h3>${g.motivo === 'mesmo_telefone' ? 'Mesmo telefone' : 'Mesmo nome'}${g.mesmo_nome ? '' : ' · nomes diferentes'}</h3>
        <p class="sub">${g.pessoas.length} cadastros</p></div></div>
        <div class="card-body"><div class="dup-lista">${g.pessoas.map((p) => `
          <label class="dup-item"><input type="checkbox" data-grupo="${i}" value="${p.id}">
            <div><b>${ui.esc(p.nome)}</b> <span class="muted small">#${p.id} · ${ui.esc(p.cidade || 'sem cidade')} · tel. ${ui.esc(p.telefone_final || '—')} · desde ${ui.fmtDate(p.criado_em)}</span>
            <div class="pessoa-chips">${p.funcoes.map((f) => `<span class="pessoa-chip">${ui.esc(f.rotulo)} #${f.registro_id} · ${ui.esc(f.situacao || '—')}</span>`).join('') || '<span class="muted small">Sem funções</span>'}</div></div>
          </label>`).join('')}</div>
          <button class="btn btn-soft btn-sm" data-comparar="${i}" type="button" style="margin-top:10px">Comparar os dois marcados</button></div></div>`).join('')
      : `<div class="card"><div class="empty"><div class="empty-icon">${ui.icon('check', 22)}</div><h4>Nenhum possível duplicado</h4><p>Nenhum telefone ou nome repetido entre os cadastros ativos.</p></div></div>`}`;
  view.querySelectorAll('[data-comparar]').forEach((b) => b.addEventListener('click', async () => {
    const marcados = [...view.querySelectorAll(`input[data-grupo="${b.dataset.comparar}"]:checked`)].map((x) => Number(x.value));
    if (marcados.length !== 2) { ui.toast('Marque exatamente dois cadastros para comparar.', 'error'); return; }
    const [a, c] = await Promise.all(marcados.map((id) => api.get(`/pessoas/${id}`)));
    comparar(a, c, () => renderDuplicados(view, state));
  }));
}

function comparar(a, b, depois) {
  const linhas = [
    ['Nome', (x) => x.pessoa.nome],
    ['Telefone', (x) => telefoneVisivel(x.pessoa.telefone)],
    ['Cidade', (x) => x.pessoa.cidade || '—'],
    ['E-mail', (x) => x.pessoa.email || '—'],
    ['Cadastro desde', (x) => ui.fmtDate(x.pessoa.criado_em)],
    ['Funções ativas', (x) => x.funcoes.map((f) => `${f.rotulo} #${f.registro_id} (${f.registro.situacao || '—'})`).join('; ') || '—']
  ];
  const conflitos = a.funcoes.filter((f) => b.funcoes.some((g) => g.funcao === f.funcao)).map((f) => f.funcao);
  const corpo = document.createElement('div');
  corpo.innerHTML = `<div class="form-errors" id="j-erro" hidden></div>
    <table class="table compara"><thead><tr><th></th><th>Cadastro #${a.pessoa.id}</th><th>Cadastro #${b.pessoa.id}</th></tr></thead><tbody>
      ${linhas.map(([rot, fn]) => { const va = fn(a); const vb = fn(b); return `<tr class="${va === vb ? '' : 'diferente'}"><th>${ui.esc(rot)}</th><td>${ui.esc(va)}</td><td>${ui.esc(vb)}</td></tr>`; }).join('')}
    </tbody></table>
    <div class="field" style="margin-top:12px"><label>Qual cadastro continua?</label>
      <label class="check-line"><input type="radio" name="j-manter" value="${a.pessoa.id}" checked> #${a.pessoa.id} — ${ui.esc(a.pessoa.nome)}</label>
      <label class="check-line"><input type="radio" name="j-manter" value="${b.pessoa.id}"> #${b.pessoa.id} — ${ui.esc(b.pessoa.nome)}</label>
      <div class="form-hint">O outro fica marcado como "juntado" e aponta para este. Nada é apagado: funções, fichas e históricos passam para o cadastro que continua; campos vazios são completados.</div></div>
    ${conflitos.map((fn) => { const fa = a.funcoes.find((x) => x.funcao === fn); const fb = b.funcoes.find((x) => x.funcao === fn); return `
      <div class="field"><label>Os dois têm a função ${ui.esc(fa.rotulo)}: qual ficha continua como principal?</label>
        <label class="check-line"><input type="radio" name="j-principal-${fn}" value="${fa.registro_id}"> Ficha #${fa.registro_id} (${ui.esc(fa.registro.situacao || '—')})</label>
        <label class="check-line"><input type="radio" name="j-principal-${fn}" value="${fb.registro_id}"> Ficha #${fb.registro_id} (${ui.esc(fb.registro.situacao || '—')})</label>
        <div class="form-hint">A outra ficha é encerrada (continua existindo, com o histórico), não excluída.</div></div>`; }).join('')}
    <label class="check-line" style="margin-top:8px"><input type="checkbox" id="j-confirmo"> Conferi os dados e confirmo que os dois cadastros são da mesma pessoa.</label>`;
  const m = ui.modal({ title: 'Comparar cadastros', body: corpo, size: 'wide',
    footer: '<button class="btn btn-ghost" data-cancel type="button">Cancelar</button><button class="btn btn-danger" data-juntar type="button">Juntar cadastros</button>' });
  m.dialog.querySelector('[data-cancel]').addEventListener('click', () => m.close());
  m.dialog.querySelector('[data-juntar]').addEventListener('click', async () => {
    const erro = corpo.querySelector('#j-erro');
    erro.hidden = true;
    const manter = Number(corpo.querySelector('input[name="j-manter"]:checked').value);
    const juntar = manter === a.pessoa.id ? b.pessoa.id : a.pessoa.id;
    const principais = {};
    for (const fn of conflitos) {
      const sel = corpo.querySelector(`input[name="j-principal-${fn}"]:checked`);
      if (!sel) { erro.hidden = false; erro.textContent = 'Escolha a ficha principal de cada função repetida.'; return; }
      principais[fn] = Number(sel.value);
    }
    if (!corpo.querySelector('#j-confirmo').checked) { erro.hidden = false; erro.textContent = 'Marque a confirmação para juntar.'; return; }
    try {
      await api.post('/pessoas/juntar', { manter_id: manter, juntar_id: juntar, principais, confirmo: true });
      ui.toast('Cadastros juntados. Nada foi apagado.', 'success');
      m.close();
      location.hash = `#/pessoas?id=${manter}`;
    } catch (err) { erro.hidden = false; erro.textContent = err.message; void depois; }
  });
}
