import { api } from '../api.js';
import * as ui from '../ui.js';
import { abrirExportacao, botaoExportar, podeExportar } from '../exportar.js';

export async function renderEntity(view, state, key, params) {
  // O servidor valida de novo: esconder o botão é só conveniência.
  const podeExcluir = ((state.meta.can && state.meta.can.excluir) || []).includes(key);
  const def = state.meta.entities[key];
  // Motorista e entregador/motociclista têm a mesma ficha: documentos (CNH, CRLV, endereço) e "contratado".
  const ehCondutor = key === 'motoristas' || key === 'entregadores';
  const hasCategoria = def.fields.some((f) => f.key === 'categoria');
  let vista = params.get('vista') || 'lista';
  if (!def.views.includes(vista)) vista = 'lista';
  // Separação do que está em andamento e do que já está 100% fechado (verde).
  const fechados = def.fechados || [];
  const filtros = { q: '', situacao: '', categoria: '', page: 1, etapa: fechados.length ? 'andamento' : '' };
  const ehFechado = (row) => fechados.includes(row[def.statusField]);
  const ROTULO_FECHADO = { motoristas: 'Contratados', entregadores: 'Contratados', parceiros: 'Parcerias fechadas', comercios: 'Ativos', passageiros: 'Cadastrados' }[key] || 'Fechados';
  let listSeq = 0; // descarta respostas antigas (a busca dispara várias requisições; a mais lenta não pode vencer a mais nova)
  let calRef = null;
  let calMes = ui.todayISO().slice(0, 7);

  view.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${ui.esc(def.label)}</div>
        <h2>${ui.esc(key === 'entregadores' ? 'Entregadores' : `${def.singular}s`)}</h2>
        <p class="sub" id="ent-count">Carregando registros…</p>
      </div>
      <div class="page-actions">
        ${def.views.length > 1 ? `<div class="segmented" style="display:flex;gap:4px;background:#e9eefa;padding:4px;border-radius:10px">
          <button class="btn btn-sm ${vista === 'lista' ? 'btn-primary' : ''}" data-vista="lista" style="${vista === 'lista' ? '' : 'background:transparent;color:#5b6b82'}">${ui.icon('list', 15)} Lista</button>
          <button class="btn btn-sm ${vista === 'kanban' ? 'btn-primary' : ''}" data-vista="kanban" style="${vista === 'kanban' ? '' : 'background:transparent;color:#5b6b82'}">${ui.icon('board', 15)} Kanban</button>
          <button class="btn btn-sm ${vista === 'calendario' ? 'btn-primary' : ''}" data-vista="calendario" style="${vista === 'calendario' ? '' : 'background:transparent;color:#5b6b82'}">${ui.icon('calendar', 15)} Calendário</button>
        </div>` : ''}
        ${podeExportar(state, key) ? botaoExportar() : ''}
        <button class="btn btn-primary" id="btn-new">${ui.icon('plus', 16)} Novo ${def.singular.toLowerCase()}</button>
      </div>
    </div>

    ${fechados.length ? `<div class="etapas ${vista !== 'lista' ? 'hidden' : ''}" id="etapas">
      <button class="btn btn-sm btn-ghost ativo" data-etapa="andamento" type="button">Em andamento</button>
      <button class="btn btn-sm btn-ghost verde" data-etapa="fechados" type="button">✅ ${ui.esc(ROTULO_FECHADO)}</button>
      <button class="btn btn-sm btn-ghost" data-etapa="" type="button">Todos</button>
    </div>` : ''}
    <div class="toolbar ${vista !== 'lista' ? 'hidden' : ''}" id="toolbar">
      <div class="search">
        ${ui.icon('search', 16)}
        <input type="search" id="f-q" placeholder="Pesquisar ${ui.esc(def.label.toLowerCase())}…" autocomplete="off">
      </div>
      <select id="f-situacao"><option value="">Todas as situações</option>
        ${def.statuses.map((s) => `<option value="${ui.esc(s)}">${ui.esc(s)}</option>`).join('')}
      </select>
      ${hasCategoria ? `<select id="f-categoria"><option value="">Todas as categorias</option>
        ${(def.fields.find((f) => f.key === 'categoria').options || []).map((s) => `<option value="${ui.esc(s)}">${ui.esc(s)}</option>`).join('')}
      </select>` : ''}
      <button class="btn btn-ghost btn-sm" id="f-limpar">Limpar</button>
    </div>

    <div id="content"></div>`;

  const content = view.querySelector('#content');
  const countEl = view.querySelector('#ent-count');

  const queryString = () => {
    const p = new URLSearchParams();
    if (filtros.q) p.set('q', filtros.q);
    if (filtros.situacao) p.set('f_situacao', filtros.situacao);
    if (filtros.categoria) p.set('f_categoria', filtros.categoria);
    if (filtros.etapa && vista === 'lista') p.set('etapa', filtros.etapa);
    p.set('page', String(filtros.page));
    p.set('size', vista === 'lista' ? '20' : '200');
    if (key === 'tarefas') { p.set('sort', 'data_vencimento'); p.set('dir', 'asc'); }
    return p.toString();
  };

  const cell = (field, row) => {
    const value = row[field.key];
    if (!field) return ui.esc(value || '—');
    if (field.key === def.statusField) return ui.badge(value);
    if (field.key === 'documentos') return value ? ui.badge(value) : '—';
    if (field.key === 'prioridade') return ui.badge(value, ui.priorityTone(value));
    if (field.type === 'date') return ui.fmtDate(value);
    if (field.type === 'number') return /invest|custo|valor/.test(field.key) ? ui.fmtMoney(value) : ui.fmtInt(value);
    if (['tipo', 'canal', 'categoria', 'origem'].includes(field.key)) return value ? `<span class="tag">${ui.esc(value)}</span>` : '—';
    return value === null || value === undefined || value === '' ? '—' : ui.esc(value);
  };

  async function loadList() {
    const seq = ++listSeq;
    const data = await api.get(`/${key}?${queryString()}`);
    if (seq !== listSeq) return;
    filtros.page = data.page; // o servidor devolve a página real (ex.: após excluir o último item da última página)
    countEl.textContent = `${ui.fmtInt(data.total)} ${data.total === 1 ? 'registro' : 'registros'}${filtros.q || filtros.situacao ? ' com os filtros aplicados' : ' na base'}`;
    if (!data.items.length) {
      content.innerHTML = `<div class="card">${ui.emptyState(
        filtros.q || filtros.situacao || filtros.categoria ? 'Nenhum resultado' : `Nenhum ${def.singular.toLowerCase()} cadastrado`,
        filtros.q || filtros.situacao || filtros.categoria
          ? 'Ajuste a pesquisa ou remova os filtros para ver outros registros.'
          : `Comece cadastrando o primeiro ${def.singular.toLowerCase()}. Os indicadores do dashboard passam a refletir esses dados.`,
        `<button class="btn btn-primary" id="empty-new">${ui.icon('plus', 16)} Cadastrar ${def.singular.toLowerCase()}</button>`
      )}</div>`;
      const b = content.querySelector('#empty-new');
      if (b) b.addEventListener('click', () => openForm(null));
      return;
    }

    const columns = def.columns.map((colKey) => {
      const field = def.fields.find((f) => f.key === colKey);
      const first = colKey === def.columns[0];
      return {
        label: field ? field.label : colKey,
        render: (row) => first
          ? `<b>${ui.esc(row[colKey] || '—')}</b>${(key === 'parceiros' || key === 'comercios') && row.responsavel ? `<span class="sub">${ui.esc(row.responsavel)}</span>` : ''}`
          : cell(field, row)
      };
    });
    columns.push({
      label: 'Ações',
      cls: 'right row-actions-cell',
      render: (row) => `<div class="row-actions">
        <button class="btn btn-sm btn-ghost" data-edit="${row.id}" title="Editar">${ui.icon('edit', 15)}</button>
        ${podeExcluir ? `<button class="btn btn-sm btn-ghost" data-del="${row.id}" title="Excluir">${ui.icon('trash', 15)}</button>` : ''}
      </div>`
    });

    content.innerHTML = `<div class="card">
      ${ui.tableHtml({ columns, rows: data.items, rowClick: true, rowClass: (r) => (ehFechado(r) ? 'linha-fechada' : '') })}
      <div class="pager">
        <span>Página ${data.page} de ${data.pages} · ${ui.fmtInt(data.total)} registros</span>
        <span class="row">
          <button class="btn btn-sm btn-ghost" id="prev" ${data.page <= 1 ? 'disabled' : ''}>${ui.icon('arrowLeft', 14)} Anterior</button>
          <button class="btn btn-sm btn-ghost" id="next" ${data.page >= data.pages ? 'disabled' : ''}>Próxima ${ui.icon('arrowRight', 14)}</button>
        </span>
      </div>
    </div>`;

    content.querySelectorAll('tbody tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openDetail(Number(tr.dataset.id));
      });
    });
    content.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = data.items.find((i) => i.id === Number(b.dataset.edit));
      openForm(item);
    }));
    content.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = data.items.find((i) => i.id === Number(b.dataset.del));
      await removeItem(item);
    }));
    const prev = content.querySelector('#prev');
    const next = content.querySelector('#next');
    if (prev) prev.addEventListener('click', () => { filtros.page -= 1; loadList(); });
    if (next) next.addEventListener('click', () => { filtros.page += 1; loadList(); });
  }

  function detailValue(field, row) {
    const value = row[field.key];
    if (field.key === def.statusField) return ui.badge(value);
    if (field.key === 'prioridade') return ui.badge(value, ui.priorityTone(value));
    if (field.type === 'date') return ui.fmtDate(value);
    if (field.type === 'number') return /invest|custo|valor/.test(field.key) ? ui.fmtMoney(value) : ui.fmtInt(value);
    if (field.type === 'relation' && value) return `#${value}`;
    return value === null || value === undefined || value === '' ? '<span class="muted">—</span>' : ui.esc(value);
  }

  const DOCS = [['cnh', 'doc_cnh', 'CNH'], ['crlv', 'doc_crlv', 'Documento do veículo (CRLV)'], ['endereco', 'doc_endereco', 'Comprovante de endereço']];

  // Ficha: tudo do cadastro num lugar só. Motorista: documentos (CNH, CRLV, comprovante), etapa e contratação.
  function fichaHtml(item, ficha) {
    if (!ficha) return '';
    const status = item[def.statusField];
    let banner = '';
    if (fechados.includes(status)) {
      const quando = item.contratado_em || item.confirmado_em || item.ativado_em;
      banner = `<div class="ficha-banner fechado">✅ ${ui.esc(status)}${quando ? ` em ${ui.fmtDate(quando)}` : ''}${key === 'motoristas' ? ' — motorista trabalhando' : key === 'entregadores' ? ' — entregador trabalhando' : key === 'parceiros' ? ' — parceria fechada' : key === 'comercios' ? ' — comércio pedindo entregas' : ''}</div>`;
    } else if (ehCondutor && status === 'Aprovado') {
      banner = '<div class="ficha-banner quase">Cadastro aprovado. Falta marcar como contratado quando ele começar a trabalhar.</div>';
    } else if (!(def.perdidos || []).includes(status)) {
      banner = `<div class="ficha-banner andamento">Em andamento: ${ui.esc(status || '—')}</div>`;
    }
    let docs = '';
    if (ehCondutor && ficha.documentos) {
      docs = `<div class="section-title">Documentos</div><div class="ficha-docs">${DOCS.map(([tipo, campo, nome]) => {
        const rec = ficha.documentos[tipo];
        const st = item[campo] || (rec ? 'Recebido — conferir' : 'Não enviado');
        return `<div class="ficha-doc"><span class="nome">${ui.esc(nome)}</span>${ui.badge(st)}
          ${rec && rec.recebido_em ? `<span class="quando">recebido em ${ui.fmtDateTime(rec.recebido_em)}</span>` : ''}
          ${rec && ficha.conversa ? `<a class="btn btn-sm btn-ghost" href="#/conversas?c=${ficha.conversa.id}">Ver na conversa</a>` : ''}
          ${st === 'Recebido — conferir' ? `<button class="btn btn-sm btn-soft" data-conferir="${campo}" type="button">Marcar conferido</button>` : ''}</div>`;
      }).join('')}</div>`;
    }
    const resumo = ficha.resumo_ia && ficha.resumo_ia.texto
      ? `<div class="section-title">Resumo da conversa (IA)</div><div class="ficha-resumo">${ui.esc(ficha.resumo_ia.texto)}<div class="muted small" style="margin-top:4px">${ui.fmtDateTime(ficha.resumo_ia.em)}</div></div>` : '';
    const conversa = ficha.conversa
      ? `<div class="ficha-acoes"><a class="btn btn-sm btn-primary" href="#/conversas?c=${ficha.conversa.id}">${ui.icon('chat', 15)} Abrir conversa no WhatsApp</a></div>`
      : '<div class="notice" style="margin-bottom:14px">Sem conversa de WhatsApp vinculada a este cadastro.</div>';
    return banner + docs + conversa + resumo + '<div class="section-title">Dados</div>';
  }

  async function openDetail(id) {
    let data;
    try {
      data = await api.get(`/${key}/${id}`);
    } catch (err) { ui.toast(err.message, 'error'); return; }
    const item = data.item;
    const ocultos = ehCondutor ? DOCS.map((d) => d[1]) : [];
    const fields = def.fields
      .filter((f) => !(f.type === 'relation' && !item[f.key]) && !ocultos.includes(f.key))
      .map((f) => `<div class="detail-item ${f.full ? 'full' : ''}"><dt>${ui.esc(f.label)}</dt><dd>${detailValue(f, item)}</dd></div>`)
      .join('');

    const historico = (data.interacoes || []).length
      ? `<div class="section-title">Histórico de acompanhamento</div><div class="timeline">${data.interacoes.map((i) => `
          <div class="tl-item"><div class="tl-dot"></div><div>
            <p>${ui.esc(i.resumo)}</p>
            <div class="tl-meta">${ui.fmtDateTime(i.data)} · ${ui.esc(i.canal || 'Interno')}${i.created_by_nome ? ` · ${ui.esc(i.created_by_nome)}` : ''}${i.situacao_nova && i.situacao_anterior !== i.situacao_nova ? ` · ${ui.esc(i.situacao_anterior || '—')} → ${ui.esc(i.situacao_nova)}` : ''}</div>
          </div></div>`).join('')}</div>`
      : '';

    const podeConfirmar = def.confirmStatus && item[def.statusField] !== def.confirmStatus;
    const podeContratar = ehCondutor && item.situacao !== 'Contratado' && item.situacao !== 'Não prosseguiu';
    const podeAtivar = key === 'comercios' && item.situacao !== 'Ativo na plataforma' && item.situacao !== 'Não concretizado';
    const ficha = (data.titular
      ? (data.titular.tipo === 'pessoa'
        ? `<div class="ficha-acoes"><a class="btn btn-sm btn-soft" href="#/pessoas?id=${Number(data.titular.id)}">${ui.icon('users', 15)} Ficha central da pessoa (todas as funções)</a></div>`
        : `<div class="ficha-acoes"><a class="btn btn-sm btn-soft" href="#/empresas?id=${Number(data.titular.id)}">${ui.icon('building', 15)} Ficha central da empresa (todas as funções)</a></div>`) : '')
      + fichaHtml(item, data.ficha);

    const m = ui.modal({
      title: `${key === 'motoristas' ? 'Ficha do motorista' : key === 'entregadores' ? 'Ficha do entregador' : def.singular} · ${item[def.columns[0]] || `#${item.id}`}`,
      subtitle: `Registro #${item.id}${item.created_at ? ` · criado em ${ui.fmtDate(item.created_at)}` : ''}`,
      size: 'wide',
      body: `${ficha}<dl class="detail-list">${fields}</dl>
             ${historico}
             ${data.interacoes.length === 0 && def.interactions ? '<div class="notice" style="margin-top:14px">Nenhum acompanhamento registrado ainda. Use “Registrar acompanhamento” para manter o histórico.</div>' : ''}`,
      footer: `
        ${podeExcluir ? `<button class="btn btn-danger btn-sm" data-detail-del>${ui.icon('trash', 15)} Excluir</button>` : ''}
        ${def.interactions ? `<button class="btn btn-ghost btn-sm" data-detail-hist>${ui.icon('headset', 15)} Registrar acompanhamento</button>` : ''}
        ${podeConfirmar ? `<button class="btn btn-gold btn-sm" data-detail-confirm>${ui.icon('check', 15)} Confirmar parceria</button>` : ''}
        ${podeContratar ? `<button class="btn btn-gold btn-sm" data-detail-contratar>${ui.icon('check', 15)} Marcar como contratado</button>` : ''}
        ${podeAtivar ? `<button class="btn btn-gold btn-sm" data-detail-ativar>${ui.icon('check', 15)} Marcar como ativo na plataforma</button>` : ''}
        <button class="btn btn-primary btn-sm" data-detail-edit>${ui.icon('edit', 15)} Editar</button>`
    });

    // Links para a conversa fecham a ficha antes de navegar.
    m.dialog.querySelectorAll('a[href^="#/conversas"], a[href^="#/pessoas"], a[href^="#/empresas"]').forEach((a) => a.addEventListener('click', () => m.close()));
    m.dialog.querySelectorAll('[data-conferir]').forEach((b) => b.addEventListener('click', async () => {
      const campo = b.dataset.conferir;
      const estado = { ...item, [campo]: 'Conferido' };
      const vals = DOCS.map((d) => estado[d[1]] || (data.ficha && data.ficha.documentos && data.ficha.documentos[d[0]] ? 'Recebido — conferir' : 'Não enviado'));
      const geral = vals.every((v) => v === 'Conferido') ? 'Conferidos' : vals.every((v) => v !== 'Não enviado') ? 'Recebidos — conferir' : vals.some((v) => v !== 'Não enviado') ? 'Incompletos' : 'Não enviados';
      try {
        await api.patch(`/${key}/${item.id}`, { [campo]: 'Conferido', documentos: geral });
        ui.toast('Documento marcado como conferido.', 'success');
        m.close();
        openDetail(item.id);
        loadList();
      } catch (err) { ui.toast(err.message, 'error'); }
    }));
    const contratarBtn = m.dialog.querySelector('[data-detail-contratar]');
    if (contratarBtn) contratarBtn.addEventListener('click', async () => {
      const ok = await ui.confirmDialog({
        title: 'Marcar como contratado',
        message: `“${item.nome}” passa para “Contratado” (já trabalhando) e fica em verde, separado dos cadastros em andamento. A data fica registrada.`,
        confirmLabel: 'Marcar como contratado',
        requireCheck: key === 'entregadores' ? 'Confirmo que este entregador foi contratado.' : 'Confirmo que este motorista foi contratado.'
      });
      if (!ok) return;
      try {
        await api.post(`/${key}/${item.id}/contratar`, { confirmo: true });
        ui.toast(key === 'entregadores' ? 'Entregador marcado como contratado.' : 'Motorista marcado como contratado.', 'success');
        m.close();
        loadList();
      } catch (err) { ui.toast(err.message, 'error'); }
    });

    const ativarBtn = m.dialog.querySelector('[data-detail-ativar]');
    if (ativarBtn) ativarBtn.addEventListener('click', async () => {
      const ok = await ui.confirmDialog({
        title: 'Marcar como ativo na plataforma',
        message: `“${item.nome_estabelecimento}” passa para “Ativo na plataforma” (já pedindo entregas) e fica em verde. A data fica registrada. Isso não altera a situação da mesma empresa no Clube de Vantagens.`,
        confirmLabel: 'Marcar como ativo',
        requireCheck: 'Confirmo que este comércio já está ativo na plataforma.'
      });
      if (!ok) return;
      try {
        await api.post(`/comercios/${item.id}/ativar`, { confirmo: true });
        ui.toast('Comércio marcado como ativo na plataforma.', 'success');
        m.close();
        loadList();
      } catch (err) { ui.toast(err.message, 'error'); }
    });

    m.dialog.querySelector('[data-detail-edit]').addEventListener('click', () => { m.close(); openForm(item); });
    const detailDel = m.dialog.querySelector('[data-detail-del]');
    if (detailDel) detailDel.addEventListener('click', async () => { m.close(); await removeItem(item); });
    const histBtn = m.dialog.querySelector('[data-detail-hist]');
    if (histBtn) histBtn.addEventListener('click', () => openInteraction(item, m));
    const confBtn = m.dialog.querySelector('[data-detail-confirm]');
    if (confBtn) confBtn.addEventListener('click', async () => {
      const ok = await ui.confirmDialog({
        title: 'Confirmar parceria',
        message: `Confirme que as condições com “${item.nome_estabelecimento}” foram acordadas. A situação passará a “Parceria confirmada” e o registro ficará datado.`,
        confirmLabel: 'Confirmar parceria',
        requireCheck: 'Confirmo que a parceria foi acordada e que esta marcação é manual.'
      });
      if (!ok) return;
      try {
        await api.post(`/parceiros/${item.id}/confirmar`, { confirmo: true });
        ui.toast('Parceria confirmada.', 'success');
        m.close();
        loadList();
      } catch (err) { ui.toast(err.message, 'error'); }
    });
  }

  function openForm(item) {
    const isNew = !item;
    const values = {};
    if (isNew) {
      for (const f of def.fields) {
        if (f.type === 'date' && f.key === def.dateField) values[f.key] = ui.todayISO();
        if (f.key === def.statusField) values[f.key] = def.statuses[0];
        if (f.key === 'prioridade') values[f.key] = 'Média';
        if (f.key === 'tipo' && def.statuses.includes('Pendente')) values[f.key] = 'Campanha';
      }
      const pNovo = params.get('novo') === '1';
      if (key === 'tarefas' && params.get('data')) values.data_vencimento = params.get('data');
      if (pNovo) history.replaceState(null, '', `#/${location.hash.split('/')[1] || key}`);
    } else {
      for (const f of def.fields) values[f.key] = item[f.key];
    }

    const form = ui.buildForm(def, values);
    const m = ui.modal({
      title: isNew ? `Novo ${def.singular.toLowerCase()}` : `Editar ${def.singular.toLowerCase()}`,
      subtitle: isNew ? 'Preencha os campos obrigatórios. Os dados ficam salvos no banco do sistema.' : `Registro #${item.id}`,
      body: '<div class="form-errors" id="form-error" hidden></div>',
      footer: `<button class="btn btn-ghost" data-cancel>Cancelar</button>
               <button class="btn btn-primary" data-save>${ui.icon('save', 16)} ${isNew ? 'Cadastrar' : 'Salvar alterações'}</button>`
    });
    m.body.appendChild(form.el);
    form.focus();

    m.dialog.querySelector('[data-cancel]').addEventListener('click', () => m.close());
    m.dialog.querySelector('[data-save]').addEventListener('click', async () => {
      const errorBox = m.body.querySelector('#form-error');
      errorBox.hidden = true;
      const payload = form.getValues();
      try {
        if (isNew) {
          // Etapa 2: antes de criar, avisa se o telefone já pertence a alguém. Nunca associa sozinho: o usuário escolhe.
          const titular = { motoristas: 'pessoa', entregadores: 'pessoa', passageiros: 'pessoa', parceiros: 'empresa', comercios: 'empresa' }[key];
          if (state.meta.etapa2 && titular && payload.telefone) {
            const v = await api.post(titular === 'pessoa' ? '/pessoas/verificar-telefone' : '/empresas/verificar-telefone', { telefone: payload.telefone });
            if (v.possiveis.length) {
              const escolha = await escolherPessoa(v.possiveis, def, titular);
              if (escolha === null) return;
              if (escolha) payload[titular === 'pessoa' ? 'pessoa_id' : 'empresa_id'] = escolha;
            }
          }
          await api.post(`/${key}`, payload);
        } else {
          // Envia só o que mudou: salvar o formulário inteiro sobrescrevia alterações feitas por outra pessoa no mesmo registro.
          const changed = {};
          for (const k of Object.keys(payload)) {
            if (String(payload[k] ?? '') !== String(item[k] ?? '')) changed[k] = payload[k];
          }
          if (!Object.keys(changed).length) {
            ui.toast('Nenhuma alteração para salvar.', 'info');
            m.close();
            return;
          }
          await api.patch(`/${key}/${item.id}`, changed);
        }
        ui.toast(isNew ? `${def.singular} cadastrado.` : `${def.singular} atualizado.`, 'success');
        m.close();
        await loadList();
        state.refreshMeta();
      } catch (err) {
        if (err.fields) form.setErrors(err.fields);
        errorBox.hidden = false;
        errorBox.textContent = err.message;
      }
    });
  }

  async function removeItem(item) {
    const label = item[def.columns[0]] || `#${item.id}`;
    const ok = await ui.confirmDialog({
      title: 'Excluir registro',
      message: `Excluir “${label}” definitivamente? O histórico de acompanhamento também será removido. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      danger: true
    });
    if (!ok) return;
    try {
      await api.del(`/${key}/${item.id}`);
      ui.toast('Registro excluído.', 'success');
      await loadList();
      state.refreshMeta();
    } catch (err) { ui.toast(err.message, 'error'); }
  }

  function openInteraction(item, parentModal) {
    if (parentModal) parentModal.close();
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-errors" id="hist-error" hidden></div>
      <div class="form-grid">
        <div class="field full">
          <label for="hist-resumo">Acompanhamento realizado<span class="req">*</span></label>
          <textarea id="hist-resumo" placeholder="Ex.: Ligação de retorno; solicitou envio da documentação."></textarea>
        </div>
        <div class="field">
          <label for="hist-canal">Canal</label>
          <select id="hist-canal">
            ${['WhatsApp', 'Telefone', 'Presencial', 'Instagram', 'Facebook', 'TikTok', 'Interno'].map((c) => `<option>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="hist-situacao">Nova situação (opcional)</label>
          <select id="hist-situacao"><option value="">Manter “${ui.esc(item[def.statusField])}”</option>
            ${def.statuses.filter((s) => !(def.confirmStatus && s === def.confirmStatus && item[def.statusField] !== def.confirmStatus)).map((s) => `<option value="${ui.esc(s)}">${ui.esc(s)}</option>`).join('')}
          </select>
        </div>
      </div>`;
    const m = ui.modal({
      title: 'Registrar acompanhamento',
      subtitle: `${def.singular} · ${item[def.columns[0]] || `#${item.id}`}`,
      body,
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Registrar</button>'
    });
    m.dialog.querySelector('[data-cancel]').addEventListener('click', () => m.close());
    m.dialog.querySelector('[data-save]').addEventListener('click', async () => {
      const errorBox = m.body.querySelector('#hist-error');
      errorBox.hidden = true;
      try {
        await api.post(`/${key}/${item.id}/interacoes`, {
          resumo: m.body.querySelector('#hist-resumo').value,
          canal: m.body.querySelector('#hist-canal').value,
          situacao_nova: m.body.querySelector('#hist-situacao').value || undefined
        });
        ui.toast('Acompanhamento registrado.', 'success');
        m.close();
        await loadList();
        state.refreshMeta();
      } catch (err) {
        errorBox.hidden = false;
        errorBox.textContent = err.message;
      }
    });
  }

  /* ------------------------------ kanban ------------------------------ */
  async function loadKanban() {
    // Uma consulta por coluna. Antes vinham as 200 tarefas de vencimento mais antigo de todas as situações:
    // com o tempo as concluídas ocupavam tudo e as tarefas novas deixavam de aparecer.
    const finalizadas = new Set(['Concluída', 'Cancelada']);
    const results = await Promise.all(def.statuses.map((status) => {
      const dir = finalizadas.has(status) ? 'desc' : 'asc';
      return api.get(`/${key}?size=100&sort=data_vencimento&dir=${dir}&f_${def.statusField}=${encodeURIComponent(status)}`);
    }));
    const total = results.reduce((sum, r) => sum + r.total, 0);
    countEl.textContent = `${ui.fmtInt(total)} tarefas · arraste os cartões para mudar a situação`;
    const cols = def.statuses.map((status, idx) => {
      const data = results[idx];
      const items = data.items;
      return `<div class="kanban-col" data-status="${ui.esc(status)}">
        <h4><span>${ui.esc(status)}</span><span class="badge neutral">${data.total > items.length ? `${items.length} de ${data.total}` : data.total}</span></h4>
        ${items.map((t) => `<div class="kanban-card" draggable="true" data-id="${t.id}">
          <div class="t">${ui.esc(t.titulo)}</div>
          <div class="m"><span>${ui.fmtDate(t.data_vencimento)}</span>${ui.badge(t.prioridade, ui.priorityTone(t.prioridade))}</div>
          ${t.responsavel ? `<div class="m"><span class="muted">${ui.esc(t.responsavel)}</span></div>` : ''}
        </div>`).join('')}
      </div>`;
    }).join('');
    content.innerHTML = `<div class="kanban">${cols}</div>`;

    content.querySelectorAll('.kanban-card').forEach((card) => {
      card.addEventListener('click', () => openDetail(Number(card.dataset.id)));
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
      });
    });
    content.querySelectorAll('.kanban-col').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const id = Number(e.dataTransfer.getData('text/plain'));
        if (!id) return;
        try {
          await api.patch(`/tarefas/${id}`, { situacao: col.dataset.status });
          ui.toast(`Tarefa movida para “${col.dataset.status}”.`, 'success');
          loadKanban();
          state.refreshMeta();
        } catch (err) { ui.toast(err.message, 'error'); }
      });
    });
  }

  /* ---------------------------- calendário ---------------------------- */
  async function loadCalendar() {
    const [ano, mes] = calMes.split('-').map(Number);
    const first = new Date(ano, mes - 1, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const last = new Date(ano, mes, 0);
    const end = new Date(last);
    end.setDate(last.getDate() + (6 - last.getDay()));

    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const de = iso(start);
    const ate = iso(end);
    const data = await api.get(`/${key}?size=200&de=${de}&ate=${ate}&sort=data_vencimento&dir=asc`);
    const porDia = {};
    for (const t of data.items) {
      const dia = String(t[def.dateField]).slice(0, 10);
      (porDia[dia] = porDia[dia] || []).push(t);
    }
    countEl.textContent = `${ui.fmtInt(data.total)} tarefas entre ${ui.fmtDate(de)} e ${ui.fmtDate(ate)}`;

    const hoje = ui.todayISO();
    const cells = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key2 = iso(new Date(d));
      const out = d.getMonth() !== mes - 1;
      const items = porDia[key2] || [];
      cells.push(`<div class="cal-cell ${out ? 'out' : ''} ${key2 === hoje ? 'today' : ''}">
        <span class="cal-day">${d.getDate()}</span>
        <button class="cal-add" data-add="${key2}" title="Nova tarefa neste dia">+</button>
        ${items.slice(0, 3).map((t) => `<span class="cal-item ${t.situacao === 'Concluída' ? 'done' : ''} ${t.situacao !== 'Concluída' && t.situacao !== 'Cancelada' && t.data_vencimento < hoje ? 'late' : ''}" data-task="${t.id}">${ui.esc(t.titulo)}</span>`).join('')}
        ${items.length > 3 ? `<span class="small muted" style="display:block;margin-top:3px">+${items.length - 3} outras</span>` : ''}
      </div>`);
    }

    const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    content.innerHTML = `<div class="card">
      <div class="card-head">
        <div><h3 style="text-transform:capitalize">${ui.esc(label)}</h3><p class="sub">Calendário de vencimentos das tarefas</p></div>
        <div class="row">
          <button class="btn btn-sm btn-ghost" id="cal-prev">${ui.icon('arrowLeft', 14)}</button>
          <button class="btn btn-sm btn-ghost" id="cal-hoje">Hoje</button>
          <button class="btn btn-sm btn-ghost" id="cal-next">${ui.icon('arrowRight', 14)}</button>
        </div>
      </div>
      <div class="card-body" style="padding-top:10px">
        <div class="calendar">
          <div class="cal-head">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => `<div>${d}</div>`).join('')}</div>
          <div class="cal-grid">${cells.join('')}</div>
        </div>
      </div>
    </div>`;

    content.querySelectorAll('[data-task]').forEach((el) => el.addEventListener('click', () => openDetail(Number(el.dataset.task))));
    content.querySelectorAll('[data-add]').forEach((el) => el.addEventListener('click', () => {
      const form = { data_vencimento: el.dataset.add };
      params.set('data', el.dataset.add);
      openForm(null);
      params.delete('data');
    }));
    content.querySelector('#cal-prev').addEventListener('click', () => {
      const d = new Date(ano, mes - 2, 1);
      calMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      loadCalendar();
    });
    content.querySelector('#cal-next').addEventListener('click', () => {
      const d = new Date(ano, mes, 1);
      calMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      loadCalendar();
    });
    content.querySelector('#cal-hoje').addEventListener('click', () => {
      calMes = ui.todayISO().slice(0, 7);
      loadCalendar();
    });
  }

  async function load() {
    if (vista === 'kanban') return loadKanban();
    if (vista === 'calendario') return loadCalendar();
    return loadList();
  }

  /* ------------------------------ eventos ----------------------------- */
  // Exportar: PDF (principal) e CSV (complementar) com os MESMOS filtros da lista que está na tela.
  const btnExp = view.querySelector('[data-exportar]');
  if (btnExp) btnExp.addEventListener('click', () => {
    const p = new URLSearchParams();
    if (filtros.q) p.set('q', filtros.q);
    if (filtros.situacao) p.set('f_situacao', filtros.situacao);
    if (filtros.categoria) p.set('f_categoria', filtros.categoria);
    if (filtros.etapa) p.set('etapa', filtros.etapa);
    const f = p.toString();
    abrirExportacao(state, {
      titulo: `Exportar ${def.label.toLowerCase()}`, tipo: key,
      pdf: `type=${key}${f ? `&${f}` : ''}`,
      csv: `type=${key}&modo=lista${f ? `&${f}` : ''}`, csvNome: `${key}.csv`
    });
  });

  view.querySelector('#btn-new').addEventListener('click', () => {
    if (vista === 'calendario') params.set('data', ui.todayISO());
    openForm(null);
    params.delete('data');
  });
  view.querySelectorAll('[data-vista]').forEach((btn) => btn.addEventListener('click', () => {
    vista = btn.dataset.vista;
    const url = new URL(location.href);
    view.querySelectorAll('[data-vista]').forEach((b) => {
      b.classList.toggle('btn-primary', b.dataset.vista === vista);
      if (b.dataset.vista !== vista) b.style.background = 'transparent';
      else b.style.background = '';
    });
    view.querySelector('#toolbar').classList.toggle('hidden', vista !== 'lista');
    const et = view.querySelector('#etapas');
    if (et) et.classList.toggle('hidden', vista !== 'lista');
    load();
  }));
  view.querySelectorAll('[data-etapa]').forEach((btn) => btn.addEventListener('click', () => {
    filtros.etapa = btn.dataset.etapa;
    filtros.page = 1;
    view.querySelectorAll('[data-etapa]').forEach((b) => b.classList.toggle('ativo', b === btn));
    loadList();
  }));

  const q = view.querySelector('#f-q');
  q.addEventListener('input', ui.debounce(() => { filtros.q = q.value.trim(); filtros.page = 1; loadList(); }, 320));
  view.querySelector('#f-situacao').addEventListener('change', (e) => { filtros.situacao = e.target.value; filtros.page = 1; loadList(); });
  const cat = view.querySelector('#f-categoria');
  if (cat) cat.addEventListener('change', (e) => { filtros.categoria = e.target.value; filtros.page = 1; loadList(); });
  view.querySelector('#f-limpar').addEventListener('click', () => {
    q.value = '';
    view.querySelector('#f-situacao').value = '';
    if (cat) cat.value = '';
    Object.assign(filtros, { q: '', situacao: '', categoria: '', page: 1 });
    loadList();
  });

  await load();

  // Abrir direto uma ficha (ex.: vindo da ficha central da pessoa): #/motoristas?abrir=ID
  if (/^\d+$/.test(params.get('abrir') || '')) {
    const alvo = Number(params.get('abrir'));
    history.replaceState(null, '', `#/${location.hash.split('/')[1].split('?')[0]}`);
    openDetail(alvo);
  }

  if (params.get('novo') === '1') {
    openForm(null);
    history.replaceState(null, '', `#/${key}`);
  }
}

// Telefone já cadastrado (Etapa 2): mostra quem é e deixa o usuário decidir.
// Devolve o id da pessoa escolhida, 0 para "pessoa nova" ou null para cancelar.
function escolherPessoa(possiveis, def, titular = 'pessoa') {
  const quem = titular === 'pessoa' ? 'pessoa' : 'empresa';
  return new Promise((resolve) => {
    const body = document.createElement('div');
    body.innerHTML = `<div class="notice" style="margin-bottom:12px">Este telefone já aparece no cadastro abaixo. Se for a mesma ${quem}, use o cadastro existente: a ficha de ${ui.esc(def.singular.toLowerCase())} fica ligada a ela, com situação e histórico próprios.</div>
      <div class="stack">${possiveis.map((p) => `<div class="card" style="padding:12px">
        <div class="spread" style="gap:10px;flex-wrap:wrap"><div><b>${ui.esc(p.nome)}</b><div class="muted small">${ui.esc(p.cidade || 'Cidade não informada')} · telefone terminado em ${ui.esc(p.telefone_final)}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${p.funcoes.map((f) => `<span class="badge">${ui.esc(f.rotulo)}: ${ui.esc(f.situacao || '—')}</span>`).join('') || '<span class="muted small">Sem funções</span>'}</div></div>
        <button class="btn btn-sm btn-primary" data-usar="${p.id}" type="button">Usar este cadastro</button></div></div>`).join('')}</div>`;
    let resolvido = false;
    const fim = (v) => { if (!resolvido) { resolvido = true; resolve(v); } };
    const m = ui.modal({ title: 'Possível cadastro existente', body, size: 'small',
      footer: `<button class="btn btn-ghost" data-cancel type="button">Cancelar</button><button class="btn btn-soft" data-novo type="button">É outra ${quem}: criar cadastro novo</button>`,
      onClose: () => fim(null) });
    body.querySelectorAll('[data-usar]').forEach((b) => b.addEventListener('click', () => { fim(Number(b.dataset.usar)); m.close(); }));
    m.dialog.querySelector('[data-novo]').addEventListener('click', () => { fim(0); m.close(); });
    m.dialog.querySelector('[data-cancel]').addEventListener('click', () => { fim(null); m.close(); });
  });
}
