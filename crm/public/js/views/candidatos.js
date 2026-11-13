// Avaliação de candidatos (Etapa 2): lista, detalhe, documentos liberados, pareceres e decisão final.
// O servidor decide tudo (perfil, escopo, campos visíveis); aqui só mostramos o que ele mandou e os botões que ele liberou.
import { api } from '../api.js';
import * as ui from '../ui.js';
import { listaSomenteLeitura } from '../documentos.js';

const TOM_ETAPA = {
  cadastro_recebido: 'info', documentacao_pendente: 'warn', documentacao_recebida: 'info', documentacao_em_analise: 'info',
  complementacao_necessaria: 'warn', avaliacao_presencial_pendente: 'warn', avaliacao_presencial_realizada: 'info', aprovado: 'fechado', recusado: 'danger'
};
const TOM_PARECER = { favoravel: 'success', favoravel_com_ressalvas: 'warn', desfavoravel: 'danger', pendente_informacao: 'neutral' };
const ROTULOS = { nome: 'Nome', cidade: 'Cidade', veiculo: 'Veículo', placa: 'Placa', cnh_categoria: 'Categoria da CNH', modalidade: 'Modalidade', origem: 'Origem',
  data_primeiro_contato: 'Cadastro / primeiro contato', situacao: 'Situação na ficha', documentos: 'Documentos (resumo)', telefone: 'Telefone', contratado_em: 'Contratado em' };

export async function renderCandidatos(view, state, params) {
  const id = Number(params.get('id'));
  if (Number.isInteger(id) && id > 0) return detalhe(view, state, id);
  return lista(view, state, params);
}

async function lista(view, state, params) {
  const filtro = { etapa: params.get('etapa') || '', q: params.get('q') || '', pendentes: params.get('todas') === '1' ? '' : '1' };
  const qs = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v)).toString();
  const d = await api.get(`/candidaturas?${qs}`);
  const ehAvaliador = state.user.role === 'avaliador';
  view.innerHTML = `
    ${ehAvaliador ? `<div class="notice" style="margin-bottom:12px">${ui.icon('lock', 15)} <span>Acesso de avaliador: você vê só os candidatos liberados e os documentos autorizados. Cada consulta fica registrada. A decisão final é do proprietário.</span></div>` : ''}
    <div class="card"><div class="card-head"><h3>Candidatos em avaliação</h3><span class="muted small">${ui.fmtInt(d.total)} ${d.total === 1 ? 'candidato' : 'candidatos'}</span></div>
      <div class="toolbar" style="flex-wrap:wrap;gap:8px">
        <div class="search" style="flex:1;min-width:200px">${ui.icon('search', 16)}<input type="search" id="cd-q" placeholder="Buscar pelo nome" value="${ui.esc(filtro.q)}" aria-label="Buscar candidato pelo nome"></div>
        <select id="cd-etapa" aria-label="Filtrar por etapa"><option value="">Todas as etapas</option>${Object.entries(d.etapas).map(([k, v]) => `<option value="${k}" ${filtro.etapa === k ? 'selected' : ''}>${ui.esc(v)}${d.contagem && d.contagem[k] ? ` (${d.contagem[k]})` : ''}</option>`).join('')}</select>
        <label class="check" style="margin:0"><input type="checkbox" id="cd-todas" ${filtro.pendentes ? '' : 'checked'}> Mostrar decididos</label>
      </div>
      ${d.items.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Candidato</th><th>Função</th><th>Etapa</th><th>Último parecer</th><th>Atualizado</th></tr></thead><tbody>
        ${d.items.map((c) => `<tr class="row-click ${c.decisao === 'aprovado' ? 'linha-fechada' : ''}" data-id="${Number(c.id)}" tabindex="0">
          <td><b>${ui.esc(c.nome)}</b><div class="small muted">${ui.esc(c.cidade || '')}${c.origem === 'aplicativo' ? ' · pelo aplicativo' : ''}</div></td>
          <td>${ui.esc(c.funcao_rotulo)}</td>
          <td>${ui.badge(c.etapa_rotulo, TOM_ETAPA[c.etapa])}</td>
          <td>${c.ultimo_parecer ? `${ui.badge(c.ultimo_parecer.situacao_rotulo, TOM_PARECER[c.ultimo_parecer.situacao])}<div class="small muted">${ui.esc(c.ultimo_parecer.autor_nome)}</div>` : '<span class="muted small">Sem parecer</span>'}</td>
          <td class="small">${ui.fmtDateTime(c.atualizado_em)}</td></tr>`).join('')}
      </tbody></table></div>` : ui.emptyState('Nenhum candidato aqui', ehAvaliador ? 'Quando um cadastro entrar em avaliação, ele aparece nesta lista.' : 'Abra a avaliação pela ficha do motorista (botão "Abrir avaliação do candidato") ou aguarde os cadastros do aplicativo.')}
    </div>`;
  const ir = (mud) => {
    const p = new URLSearchParams({ ...(filtro.etapa ? { etapa: filtro.etapa } : {}), ...(filtro.q ? { q: filtro.q } : {}), ...(filtro.pendentes ? {} : { todas: '1' }), ...mud });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    location.hash = `#/candidatos${p.toString() ? `?${p}` : ''}`;
  };
  view.querySelector('#cd-etapa').addEventListener('change', (e) => ir({ etapa: e.target.value }));
  view.querySelector('#cd-todas').addEventListener('change', (e) => ir({ todas: e.target.checked ? '1' : '' }));
  let t = null;
  view.querySelector('#cd-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => ir({ q: e.target.value.trim() }), 500); });
  view.querySelectorAll('tr[data-id]').forEach((tr) => {
    const abrir = () => { location.hash = `#/candidatos?id=${tr.dataset.id}`; };
    tr.addEventListener('click', abrir);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
  });
}

async function detalhe(view, state, id) {
  const d = await api.get(`/candidaturas/${id}`);
  const c = d.candidatura;
  const recarregar = () => detalhe(view, state, id).catch((e) => ui.toast(e.message, 'error'));
  const dados = Object.entries(d.candidato || {}).filter(([k, v]) => k !== 'id' && v !== null && v !== '' && ROTULOS[k])
    .map(([k, v]) => `<div class="detail-item"><dt>${ui.esc(ROTULOS[k])}</dt><dd>${k.startsWith('data_') || k.endsWith('_em') ? ui.fmtDate(v) : ui.esc(v)}</dd></div>`).join('');
  const decisao = c.decisao
    ? `<div class="ficha-banner ${c.decisao === 'aprovado' ? 'fechado' : 'andamento'}">${c.decisao === 'aprovado' ? '✅ Aprovado' : '⛔ Recusado'} pelo proprietário (${ui.esc(c.decidido_por_nome || '')}) em ${ui.fmtDateTime(c.decidido_em)}${c.decisao_motivo ? ` — ${ui.esc(c.decisao_motivo)}` : ''}</div>
       ${c.decisao === 'aprovado' && d.pode.abrir_ficha ? '<p class="small muted" style="margin:6px 0 0">Aprovar aqui não contrata nem libera no aplicativo: marque "contratado" na ficha e libere o motorista na Central da plataforma.</p>' : ''}`
    : '';
  const pareceres = d.pareceres.length
    ? `<div class="timeline">${d.pareceres.map((p) => `<div class="tl-item"><div class="tl-dot"></div><div>
        <div>${ui.badge(p.situacao_rotulo, TOM_PARECER[p.situacao])} <span class="small muted">#${Number(p.id)}${p.substitui_id ? ` · corrige o #${Number(p.substitui_id)}` : ''}</span></div>
        ${p.parecer !== undefined ? `<p style="white-space:pre-wrap;margin:6px 0">${ui.esc(p.parecer)}</p>
          ${p.pendencias ? `<p class="small" style="margin:4px 0"><b>Pendências:</b> ${ui.esc(p.pendencias)}</p>` : ''}
          ${p.verificacao && p.verificacao !== 'nao_realizada' ? `<p class="small" style="margin:4px 0"><b>Verificação:</b> ${ui.esc(p.verificacao_rotulo)}${p.verificacao_fonte ? ` — fonte: ${ui.esc(p.verificacao_fonte)}` : ''}</p>` : ''}
          ${p.observacoes ? `<p class="small muted" style="margin:4px 0">${ui.esc(p.observacoes)}</p>` : ''}` : '<p class="small muted" style="margin:6px 0">Conteúdo visível só para o proprietário e o avaliador.</p>'}
        <div class="tl-meta">${ui.esc(p.autor_nome)} · ${ui.fmtDateTime(p.criado_em)}</div></div></div>`).join('')}</div>`
    : '<p class="small muted">Nenhum parecer registrado ainda.</p>';
  const eventos = d.eventos.length
    ? `<div class="timeline">${d.eventos.map((e) => `<div class="tl-item"><div class="tl-dot"></div><div>
        <p>${ui.esc(rotuloEvento(e, d.etapas))}</p>${e.detalhe ? `<p class="small muted" style="margin:2px 0">${ui.esc(e.detalhe)}</p>` : ''}
        <div class="tl-meta">${ui.fmtDateTime(e.criado_em)} · ${ui.esc(e.usuario_nome || 'Sistema')}</div></div></div>`).join('')}</div>` : '';

  view.innerHTML = `
    <div style="margin-bottom:10px"><a class="btn btn-sm btn-ghost" href="#/candidatos">← Voltar para a lista</a></div>
    <div class="card"><div class="card-head" style="flex-wrap:wrap;gap:8px"><h3>${ui.esc(c.nome)}</h3>${ui.badge(c.etapa_rotulo, TOM_ETAPA[c.etapa])}<span class="small muted">${ui.esc(c.funcao_rotulo)}${c.origem === 'aplicativo' ? ' · cadastro pelo aplicativo' : ''}</span></div>
      ${decisao}
      <div class="section-title">Dados para a avaliação</div><dl class="detail-list">${dados || '<p class="small muted">Sem dados.</p>'}</dl>
      ${d.pode.abrir_ficha ? `<div class="ficha-acoes"><a class="btn btn-sm btn-ghost" href="#/${c.funcao === 'motorista' ? 'motoristas' : 'entregadores'}?abrir=${Number(c.registro_id)}">Abrir a ficha completa</a></div>` : ''}
      ${d.pode.mudar_etapa ? `<div class="section-title">Etapa da avaliação</div>
        <div class="toolbar" style="flex-wrap:wrap;gap:8px"><select id="cd-nova-etapa" aria-label="Nova etapa">${Object.entries(d.etapas).filter(([k]) => !['aprovado', 'recusado'].includes(k)).map(([k, v]) => `<option value="${k}" ${k === c.etapa ? 'selected' : ''}>${ui.esc(v)}</option>`).join('')}</select>
        <input id="cd-obs-etapa" maxlength="500" placeholder="Observação (opcional)" style="flex:1;min-width:180px" aria-label="Observação da etapa"><button class="btn btn-sm btn-primary" id="cd-salvar-etapa" type="button">Atualizar etapa</button></div>` : ''}
      ${d.pode.decidir || d.pode.reabrir ? `<div class="section-title">Decisão final (proprietário)</div><div class="ficha-acoes" style="flex-wrap:wrap;gap:8px">
        ${d.pode.decidir ? `<button class="btn btn-sm btn-gold" id="cd-aprovar" type="button">${ui.icon('check', 15)} Aprovar candidato</button><button class="btn btn-sm btn-danger" id="cd-recusar" type="button">Recusar candidato</button>` : ''}
        ${d.pode.reabrir ? '<button class="btn btn-sm btn-ghost" id="cd-reabrir" type="button">Reabrir avaliação</button>' : ''}</div>` : ''}
    </div>
    <div class="card"><div class="card-head"><h3>Documentos</h3></div><div id="cd-docs"></div>
      <p class="small muted" style="margin:8px 0 0">Enviar documento não aprova ninguém. ${state.user.role === 'avaliador' ? 'Você só abre os documentos liberados pelo proprietário; cada abertura fica registrada.' : ''}</p></div>
    <div class="card"><div class="card-head" style="flex-wrap:wrap;gap:8px"><h3>Pareceres</h3>${d.pode.parecer && !c.decisao ? `<button class="btn btn-sm btn-primary" id="cd-parecer" type="button">${ui.icon('plus', 14)} Registrar parecer</button>` : ''}</div>
      <p class="small muted" style="margin:0 0 8px">O parecer do avaliador orienta, mas não decide: a aprovação ou recusa é do proprietário. Pareceres não se apagam; para corrigir, registre um novo.</p>
      ${pareceres}</div>
    ${eventos ? `<div class="card"><div class="card-head"><h3>Histórico</h3></div>${eventos}</div>` : ''}`;

  listaSomenteLeitura(view.querySelector('#cd-docs'), d.documentos);
  const on = (sel, fn) => { const b = view.querySelector(sel); if (b) b.addEventListener('click', fn); };
  on('#cd-salvar-etapa', async () => {
    try { await api.post(`/candidaturas/${id}/etapa`, { etapa: view.querySelector('#cd-nova-etapa').value, observacao: view.querySelector('#cd-obs-etapa').value.trim() }); ui.toast('Etapa atualizada.', 'success'); recarregar(); } catch (err) { ui.toast(err.message, 'error'); }
  });
  on('#cd-parecer', () => janelaParecer(id, d, recarregar));
  on('#cd-aprovar', () => janelaDecisao(id, 'aprovado', c.nome, recarregar));
  on('#cd-recusar', () => janelaDecisao(id, 'recusado', c.nome, recarregar));
  on('#cd-reabrir', () => janelaReabrir(id, recarregar));
}

function rotuloEvento(e, etapas) {
  if (e.tipo === 'etapa' || e.tipo === 'aberta') return `${e.tipo === 'aberta' ? 'Avaliação aberta' : 'Etapa alterada'}${e.para ? `: ${etapas[e.para] || e.para}` : ''}`;
  if (e.tipo === 'decisao') return `Decisão final: ${e.para === 'aprovado' ? 'aprovado' : 'recusado'}`;
  if (e.tipo === 'reaberta') return 'Decisão desfeita; avaliação reaberta';
  if (e.tipo === 'parecer') return 'Parecer registrado';
  return e.tipo;
}

function janelaParecer(id, d, depois) {
  const m = ui.modal({
    title: 'Registrar parecer', subtitle: 'Registre só o necessário para a avaliação. Não copie o conteúdo de certidões nem dados de terceiros.',
    body: `<form id="pf" class="form-grid">
      <div class="field full"><label for="pf-sit">Conclusão</label><select id="pf-sit" required><option value="">Escolha…</option>${Object.entries(d.situacoes_parecer).map(([k, v]) => `<option value="${k}">${ui.esc(v)}</option>`).join('')}</select></div>
      <div class="field full"><label for="pf-txt">Parecer</label><textarea id="pf-txt" rows="5" maxlength="4000" required placeholder="O que foi analisado e a conclusão."></textarea></div>
      <div class="field full"><label for="pf-pend">Pendências identificadas</label><textarea id="pf-pend" rows="2" maxlength="2000" placeholder="Ex.: comprovante de endereço com mais de 90 dias."></textarea></div>
      <div class="field"><label for="pf-ver">Verificação de antecedentes</label><select id="pf-ver">${Object.entries(d.verificacoes).map(([k, v]) => `<option value="${k}">${ui.esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-fonte">Fonte consultada</label><input id="pf-fonte" maxlength="200" placeholder="Ex.: certidão do tribunal estadual"></div>
      <div class="field full"><label for="pf-obs">Observações</label><textarea id="pf-obs" rows="2" maxlength="2000"></textarea></div>
      ${d.pareceres.length ? `<div class="field full"><label for="pf-subs">Corrige um parecer anterior?</label><select id="pf-subs"><option value="">Não</option>${d.pareceres.map((p) => `<option value="${Number(p.id)}">#${Number(p.id)} · ${ui.esc(p.situacao_rotulo)} · ${ui.fmtDateTime(p.criado_em)}</option>`).join('')}</select></div>` : ''}
      <div id="pf-erro" class="full" role="alert"></div></form>`,
    footer: '<button class="btn btn-ghost" data-modal-close type="button">Cancelar</button><button class="btn btn-primary" id="pf-salvar" type="button">Salvar parecer</button>'
  });
  m.dialog.querySelector('#pf-salvar').addEventListener('click', async () => {
    const v = (s) => m.dialog.querySelector(s) ? m.dialog.querySelector(s).value.trim() : '';
    try {
      await api.post(`/candidaturas/${id}/pareceres`, { situacao: v('#pf-sit'), parecer: v('#pf-txt'), pendencias: v('#pf-pend'), verificacao: v('#pf-ver'), verificacao_fonte: v('#pf-fonte'), observacoes: v('#pf-obs'), substitui_id: v('#pf-subs') || null });
      m.close(); ui.toast('Parecer registrado.', 'success'); depois();
    } catch (err) { { const e = m.dialog.querySelector('#pf-erro'); e.className = 'full form-errors'; e.textContent = err.message; } }
  });
}

function janelaDecisao(id, decisao, nome, depois) {
  const aprova = decisao === 'aprovado';
  const m = ui.modal({
    title: aprova ? 'Aprovar candidato' : 'Recusar candidato',
    subtitle: `${nome} — decisão final do proprietário. Fica registrada com o seu nome e a data.`,
    body: `<div class="field"><label for="dc-motivo">${aprova ? 'Observação (opcional)' : 'Motivo da recusa (obrigatório)'}</label><textarea id="dc-motivo" rows="3" maxlength="1000"></textarea></div>
      <label class="check"><input type="checkbox" id="dc-conf"> Confirmo a decisão final de ${aprova ? 'APROVAR' : 'RECUSAR'} este candidato.</label>
      ${aprova ? '<p class="small muted">Aprovar aqui não contrata a ficha nem libera o motorista no aplicativo.</p>' : ''}<div id="dc-erro" role="alert"></div>`,
    footer: `<button class="btn btn-ghost" data-modal-close type="button">Cancelar</button><button class="btn ${aprova ? 'btn-gold' : 'btn-danger'}" id="dc-ok" type="button">${aprova ? 'Aprovar' : 'Recusar'}</button>`
  });
  m.dialog.querySelector('#dc-ok').addEventListener('click', async () => {
    try {
      await api.post(`/candidaturas/${id}/decisao`, { decisao, motivo: m.dialog.querySelector('#dc-motivo').value.trim(), confirmo: m.dialog.querySelector('#dc-conf').checked });
      m.close(); ui.toast(aprova ? 'Candidato aprovado.' : 'Candidato recusado.', 'success'); depois();
    } catch (err) { { const e = m.dialog.querySelector('#dc-erro'); e.className = 'form-errors'; e.textContent = err.message; } }
  });
}

function janelaReabrir(id, depois) {
  const m = ui.modal({
    title: 'Reabrir avaliação', subtitle: 'Desfaz a decisão final (fica registrado no histórico).',
    body: `<div class="field"><label for="ra-motivo">Motivo</label><textarea id="ra-motivo" rows="3" maxlength="1000"></textarea></div>
      <label class="check"><input type="checkbox" id="ra-conf"> Confirmo que quero desfazer a decisão final.</label><div id="ra-erro" role="alert"></div>`,
    footer: '<button class="btn btn-ghost" data-modal-close type="button">Cancelar</button><button class="btn btn-primary" id="ra-ok" type="button">Reabrir</button>'
  });
  m.dialog.querySelector('#ra-ok').addEventListener('click', async () => {
    try { await api.post(`/candidaturas/${id}/reabrir`, { motivo: m.dialog.querySelector('#ra-motivo').value.trim(), confirmo: m.dialog.querySelector('#ra-conf').checked }); m.close(); ui.toast('Avaliação reaberta.', 'success'); depois(); } catch (err) { { const e = m.dialog.querySelector('#ra-erro'); e.className = 'form-errors'; e.textContent = err.message; } }
  });
}
