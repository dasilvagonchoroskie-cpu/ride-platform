import { api } from '../api.js';
import * as ui from '../ui.js';

function compute(p, custos) {
  const motoristas = Number(p.motoristas_ativos) || 0;
  const corridasDia = Number(p.corridas_motorista_dia) || 0;
  const dias = Number(p.dias_operacao) || 0;
  const valor = Number(p.valor_medio_corrida) || 0;
  const pct = Number(p.comissao_pct) || 0;
  const custosTotal = custos.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const corridasMes = Math.round(motoristas * corridasDia * dias);
  const faturamento = corridasMes * valor;
  const receita = faturamento * (pct / 100);
  const repasse = faturamento - receita;
  const resultado = receita - custosTotal;
  const comissaoCorrida = valor * (pct / 100);
  return {
    corridas_mes: corridasMes,
    corridas_dia: Math.round(motoristas * corridasDia),
    faturamento_bruto: faturamento,
    receita_plataforma: receita,
    repasse_motoristas: repasse,
    custos_total: custosTotal,
    resultado_operacional: resultado,
    margem_pct: receita > 0 ? (resultado / receita) * 100 : 0,
    custo_por_corrida: corridasMes > 0 ? custosTotal / corridasMes : 0,
    ponto_equilibrio_corridas: comissaoCorrida > 0 ? Math.ceil(custosTotal / comissaoCorrida) : null,
    resultado_por_motorista: motoristas > 0 ? resultado / motoristas : 0
  };
}

export async function renderFinance(view, state) {
  const data = await api.get('/finance/cenarios');
  if (!data.items.length) {
    view.innerHTML = '<div class="card"><div class="empty"><p>Nenhum cenário configurado.</p></div></div>';
    return;
  }
  let ativo = data.items.find((c) => c.nome === 'Intermediário') || data.items[0];

  function paint() {
    const r = ativo.resultado;
    const premissas = [
      { key: 'motoristas_ativos', label: 'Motoristas ativos', step: 1, min: 0, hint: 'motoristas' },
      { key: 'corridas_motorista_dia', label: 'Corridas por motorista / dia', step: 0.5, min: 0, hint: 'corridas' },
      { key: 'dias_operacao', label: 'Dias de operação por mês', step: 1, min: 0, hint: 'dias' },
      { key: 'valor_medio_corrida', label: 'Valor médio por corrida (R$)', step: 0.01, min: 0, hint: 'R$' },
      { key: 'comissao_pct', label: 'Comissão da plataforma (%)', step: 0.5, min: 0, hint: '%' }
    ];

    view.innerHTML = `
      <div class="page-head">
        <div>
          <div class="eyebrow">Planejamento financeiro</div>
          <h2>Projeções e simulações</h2>
          <p class="sub">Comissão padrão da plataforma: ${data.comissao_padrao}% por corrida concluída · premissas editáveis</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-ghost" id="fin-new-scenario">${ui.icon('plus', 16)} Novo cenário</button>
          <button class="btn btn-gold" id="fin-save-sim">${ui.icon('save', 16)} Salvar simulação</button>
        </div>
      </div>

      <div class="estimate-note" style="margin-bottom:14px">${ui.icon('alert', 16)}
        <span><b>Valores estimados.</b> Todos os números desta tela são simulações calculadas a partir das premissas que você informar — não representam receita realizada nem previsão garantida. Os valores reais devem ser lançados conforme a operação.</span>
      </div>

      <div class="scenario-tabs">
        ${data.items.map((c) => `<button class="scenario-tab ${c.id === ativo.id ? 'active' : ''}" data-cenario="${c.id}">
          <strong>${ui.esc(c.nome)}</strong>
          <span>${ui.fmtInt(c.motoristas_ativos)} motoristas · receita projetada ${ui.fmtMoney(c.resultado.receita_plataforma)}/mês</span>
        </button>`).join('')}
      </div>

      <div class="grid-2" style="align-items:start">
        <div class="stack">
          <div class="card">
            <div class="card-head">
              <div><h3>Premissas do cenário ${ui.esc(ativo.nome)}</h3><p class="sub">Altere os valores e veja o resultado recalculado imediatamente</p></div>
            </div>
            <div class="card-body">
              <div class="premise-list">
                ${premissas.map((p) => `<div class="premise">
                  <label for="p-${p.key}">${ui.esc(p.label)}</label>
                  <input id="p-${p.key}" data-premissa="${p.key}" type="number" min="${p.min}" step="${p.step}" value="${ativo[p.key]}">
                </div>`).join('')}
              </div>
              <div class="formula">Corridas/mês = motoristas × corridas por dia × dias de operação. Receita da plataforma = faturamento bruto × comissão.</div>
              <div class="row" style="margin-top:14px;justify-content:flex-end">
                <button class="btn btn-primary" id="fin-save-premises">${ui.icon('save', 15)} Salvar premissas</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div><h3>Custos mensais da plataforma</h3><p class="sub">Some apenas custos reais; linhas sem valor podem ficar em zero</p></div>
            </div>
            <div class="card-body">
              <div id="fin-costs">
                ${ativo.custos.map((c) => `<div class="cost-row" data-custo="${c.id}">
                  <input type="text" class="desc" value="${ui.esc(c.descricao)}" maxlength="80" aria-label="Descrição do custo">
                  <input type="number" class="valor" min="0" step="0.01" value="${c.valor}" aria-label="Valor do custo">
                  <button class="icon-btn" data-remove-custo="${c.id}" title="Remover custo">${ui.icon('trash', 15)}</button>
                </div>`).join('')}
              </div>
              <div class="inline-form" style="margin-top:10px">
                <div class="field"><label for="novo-custo">Novo custo</label><input id="novo-custo" type="text" placeholder="Ex.: hospedagem, suporte" maxlength="80"></div>
                <div class="field" style="max-width:130px"><label for="novo-custo-valor">Valor (R$)</label><input id="novo-custo-valor" type="number" min="0" step="0.01" value="0"></div>
                <button class="btn btn-soft" id="fin-add-custo">${ui.icon('plus', 15)} Adicionar</button>
              </div>
              <div class="spread" style="margin-top:12px;padding-top:10px;border-top:1px solid #eef2f9">
                <span class="muted small">Total de custos mensais</span>
                <b id="fin-custos-total">${ui.fmtMoney(r.custos_total)}</b>
              </div>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-head">
              <div><h3>Projeção mensal</h3><p class="sub">Cenário ${ui.esc(ativo.nome)} · calculada pelas premissas, não é resultado realizado</p></div>
              <span class="badge gold">Projeção</span>
            </div>
            <div class="card-body">
              <div class="estimate-note warn hidden" id="r-incompleta" style="margin-bottom:12px">${ui.icon('alert', 15)}
                <span><b>Simulação incompleta:</b> nenhum custo mensal foi informado. Sem custos, o resultado abaixo é só a receita projetada — não é lucro. Cadastre os custos (hospedagem, marketing, equipe, impostos…) para ver o resultado operacional.</span></div>

              <div class="section-title">1. Receita (projeção)</div>
              <div class="fin-linhas">
                <div class="spread"><span class="muted">Corridas por mês</span><b id="r-corridas"></b></div>
                <div class="spread"><span class="muted">Corridas por dia</span><b id="r-corridas-dia"></b></div>
                <div class="spread"><span class="muted">Valor movimentado nas corridas</span><b id="r-faturamento"></b></div>
                <div class="spread"><span class="muted">Repasse aos motoristas</span><b id="r-repasse"></b></div>
                <div class="spread destaque"><span>Receita bruta da plataforma <small class="muted" id="r-receita-hint"></small></span><b id="r-receita"></b></div>
              </div>

              <div class="section-title">2. Custos mensais (informados por você)</div>
              <div class="fin-linhas">
                <div class="spread destaque"><span>Total de custos</span><b id="r-custos"></b></div>
                <div class="spread"><span class="muted">Custo por corrida</span><b id="r-custo-corrida"></b></div>
              </div>

              <div class="section-title">3. Resultado operacional (projeção)</div>
              <div class="result-box" id="r-resultado-box">
                <div class="lbl">Receita bruta − custos</div>
                <div class="val" id="r-resultado"></div>
                <div class="hint" id="r-resultado-hint"></div>
              </div>

              <div class="formula" id="r-equilibrio">${r.ponto_equilibrio_corridas !== null ? `Ponto de equilíbrio: ${ui.fmtInt(r.ponto_equilibrio_corridas)} corridas/mês para cobrir os custos cadastrados.` : 'Informe o valor médio e a comissão para calcular o ponto de equilíbrio.'}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head"><div><h3>Histórico de simulações salvas</h3><p class="sub">Registros datados das projeções avaliadas pela equipe</p></div></div>
        <div class="card-body" id="fin-history" style="padding-top:8px">Carregando…</div>
      </div>`;

    bind();
    recalc();
    loadHistory();
  }

  function readPremissas() {
    const out = {};
    view.querySelectorAll('[data-premissa]').forEach((input) => { out[input.dataset.premissa] = Number(input.value) || 0; });
    return out;
  }

  function readCustos() {
    return ativo.custos.map((c) => {
      const row = view.querySelector(`.cost-row[data-custo="${c.id}"]`);
      return { ...c, valor: row ? Number(row.querySelector('.valor').value) || 0 : c.valor };
    });
  }

  function recalc() {
    const r = compute(readPremissas(), readCustos());
    ativo.resultado = r;
    // Sem nenhum custo informado, não existe resultado de verdade: mostra a simulação como incompleta (sem "margem de 100%").
    const semCustos = !readCustos().some((c) => (Number(c.valor) || 0) > 0);
    view.querySelector('#r-incompleta').classList.toggle('hidden', !semCustos);
    view.querySelector('#r-receita').textContent = ui.fmtMoney(r.receita_plataforma);
    view.querySelector('#r-receita-hint').textContent = `(${ui.fmtPct(Number(view.querySelector('#p-comissao_pct').value) || 0)} de comissão)`;
    const box = view.querySelector('#r-resultado-box');
    if (semCustos) {
      view.querySelector('#r-resultado').textContent = 'Incompleto';
      view.querySelector('#r-resultado-hint').textContent = 'Informe os custos mensais para calcular o resultado e a margem.';
      box.classList.remove('negative', 'positive');
    } else {
      view.querySelector('#r-resultado').textContent = ui.fmtMoney(r.resultado_operacional);
      view.querySelector('#r-resultado-hint').textContent = `Margem projetada de ${ui.fmtPct(r.margem_pct)} sobre a receita bruta`;
      box.classList.toggle('negative', r.resultado_operacional < 0);
      box.classList.toggle('positive', r.resultado_operacional >= 0);
    }
    view.querySelector('#r-corridas').textContent = ui.fmtInt(r.corridas_mes);
    view.querySelector('#r-corridas-dia').textContent = ui.fmtInt(r.corridas_dia);
    view.querySelector('#r-faturamento').textContent = ui.fmtMoney(r.faturamento_bruto);
    view.querySelector('#r-repasse').textContent = ui.fmtMoney(r.repasse_motoristas);
    view.querySelector('#r-custos').textContent = semCustos ? 'Não informados' : ui.fmtMoney(r.custos_total);
    view.querySelector('#fin-custos-total').textContent = semCustos ? 'Não informados' : ui.fmtMoney(r.custos_total);
    view.querySelector('#r-custo-corrida').textContent = semCustos ? '—' : ui.fmtMoney(r.custo_por_corrida);
    view.querySelector('#r-equilibrio').textContent = semCustos ? 'Ponto de equilíbrio: informe os custos mensais para calcular.' : r.ponto_equilibrio_corridas !== null
      ? `Ponto de equilíbrio: ${ui.fmtInt(r.ponto_equilibrio_corridas)} corridas/mês para cobrir os custos cadastrados.`
      : 'Informe o valor médio e a comissão para calcular o ponto de equilíbrio.';
  }

  async function loadHistory() {
    const el = view.querySelector('#fin-history');
    try {
      const hist = await api.get('/finance/simulacoes');
      if (!hist.items.length) {
        el.innerHTML = '<div class="notice">Nenhuma simulação salva. Use “Salvar simulação” para registrar a projeção atual no histórico.</div>';
        return;
      }
      el.innerHTML = ui.tableHtml({
        columns: [
          { label: 'Data', render: (r) => `${ui.fmtDate(r.created_at)}<span class="sub">${ui.esc(r.autor || '')}</span>` },
          { label: 'Cenário', render: (r) => `<b>${ui.esc(r.cenario)}</b>` },
          { label: 'Corridas/mês', render: (r) => ui.fmtInt(r.resultados.corridas_mes) },
          { label: 'Receita projetada', render: (r) => ui.fmtMoney(r.resultados.receita_plataforma) },
          { label: 'Resultado projetado', render: (r) => !(Number(r.resultados.custos_total) > 0) ? '<span class="muted">Incompleto (sem custos)</span>' : `<b style="color:${r.resultados.resultado_operacional < 0 ? '#cf3d2b' : '#0b8a5f'}">${ui.fmtMoney(r.resultados.resultado_operacional)}</b>` },
          { label: 'Observação', render: (r) => r.observacao ? ui.esc(r.observacao) : '<span class="muted">—</span>' },
          { label: 'Ações', cls: 'right row-actions-cell', render: (r) => (state.meta.can && state.meta.can.excluir_financeiro) ? `<button class="btn btn-sm btn-ghost" data-del-sim="${r.id}">${ui.icon('trash', 15)}</button>` : '' }
        ],
        rows: hist.items
      });
      el.querySelectorAll('[data-del-sim]').forEach((b) => b.addEventListener('click', async () => {
        const ok = await ui.confirmDialog({ title: 'Excluir simulação', message: 'Remover esta simulação do histórico?', confirmLabel: 'Excluir', danger: true });
        if (!ok) return;
        try {
          await api.del(`/finance/simulacoes/${b.dataset.delSim}`);
          ui.toast('Simulação removida.', 'success');
          loadHistory();
        } catch (err) { ui.toast(err.message, 'error'); }
      }));
    } catch (err) {
      el.innerHTML = `<div class="notice warn">${ui.esc(err.message)}</div>`;
    }
  }

  function bind() {
    view.querySelectorAll('[data-cenario]').forEach((btn) => btn.addEventListener('click', () => {
      ativo = data.items.find((c) => c.id === Number(btn.dataset.cenario));
      paint();
    }));

    view.querySelectorAll('[data-premissa], .cost-row .valor').forEach((input) => {
      input.addEventListener('input', recalc);
    });

    view.querySelector('#fin-save-premises').addEventListener('click', async () => {
      try {
        const res = await api.patch(`/finance/cenarios/${ativo.id}`, readPremissas());
        ativo = res.item;
        ui.toast('Premissas salvas.', 'success');
        const idx = data.items.findIndex((c) => c.id === ativo.id);
        data.items[idx] = ativo;
        paint();
      } catch (err) { ui.toast(err.message, 'error'); }
    });

    view.querySelectorAll('.cost-row').forEach((row) => {
      const id = Number(row.dataset.custo);
      const desc = row.querySelector('.desc');
      const valor = row.querySelector('.valor');
      const save = async () => {
        try {
          const res = await api.patch(`/finance/custos/${id}`, { descricao: desc.value, valor: Number(valor.value) || 0 });
          ativo = res.item;
          const idx = data.items.findIndex((c) => c.id === ativo.id);
          data.items[idx] = ativo;
          recalc();
        } catch (err) { ui.toast(err.message, 'error'); }
      };
      desc.addEventListener('change', save);
      valor.addEventListener('change', save);
    });

    view.querySelectorAll('[data-remove-custo]').forEach((btn) => btn.addEventListener('click', async () => {
      const ok = await ui.confirmDialog({ title: 'Remover custo', message: 'Remover esta linha de custo do cenário?', confirmLabel: 'Remover', danger: true });
      if (!ok) return;
      try {
        const res = await api.del(`/finance/custos/${btn.dataset.removeCusto}`);
        ativo = res.item;
        const idx = data.items.findIndex((c) => c.id === ativo.id);
        data.items[idx] = ativo;
        paint();
        ui.toast('Custo removido.', 'success');
      } catch (err) { ui.toast(err.message, 'error'); }
    }));

    view.querySelector('#fin-add-custo').addEventListener('click', async () => {
      const desc = view.querySelector('#novo-custo');
      const valor = view.querySelector('#novo-custo-valor');
      if (!desc.value.trim()) { ui.toast('Informe a descrição do custo.', 'error'); return; }
      try {
        const res = await api.post(`/finance/cenarios/${ativo.id}/custos`, { descricao: desc.value.trim(), valor: Number(valor.value) || 0 });
        ativo = res.item;
        const idx = data.items.findIndex((c) => c.id === ativo.id);
        data.items[idx] = ativo;
        paint();
        ui.toast('Custo adicionado.', 'success');
      } catch (err) { ui.toast(err.message, 'error'); }
    });

    view.querySelector('#fin-save-sim').addEventListener('click', () => {
      const body = document.createElement('div');
      body.innerHTML = `<p class="muted small" style="margin-bottom:12px">A simulação será registrada com as premissas que estão na tela para o cenário <b>${ui.esc(ativo.nome)}</b>; se houver alterações ainda não salvas, elas serão salvas no cenário junto com a simulação. Valores são estimativas.</p>
        <div class="field"><label for="sim-obs">Observação (opcional)</label><input id="sim-obs" type="text" maxlength="200" placeholder="Ex.: avaliado em reunião de planejamento"></div>`;
      const m = ui.modal({
        title: 'Salvar simulação',
        body,
        size: 'small',
        footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-gold" data-save>Salvar no histórico</button>'
      });
      m.dialog.querySelector('[data-cancel]').addEventListener('click', () => m.close());
      m.dialog.querySelector('[data-save]').addEventListener('click', async () => {
        try {
          // O servidor calcula a simulação a partir do cenário salvo. Sem este passo, premissas alteradas na tela
          // e ainda não salvas eram ignoradas, e o histórico registrava números diferentes dos que o usuário via.
          const naTela = readPremissas();
          const mudou = Object.keys(naTela).some((k) => Number(ativo[k]) !== Number(naTela[k]));
          if (mudou) {
            const res = await api.patch(`/finance/cenarios/${ativo.id}`, naTela);
            ativo = res.item;
            const idx = data.items.findIndex((c) => c.id === ativo.id);
            if (idx >= 0) data.items[idx] = ativo;
          }
          await api.post('/finance/simulacoes', { cenario_id: ativo.id, observacao: m.body.querySelector('#sim-obs').value });
          ui.toast('Simulação salva no histórico.', 'success');
          m.close();
          loadHistory();
        } catch (err) { ui.toast(err.message, 'error'); }
      });
    });

    view.querySelector('#fin-new-scenario').addEventListener('click', () => {
      const body = document.createElement('div');
      body.innerHTML = `<div class="field"><label for="novo-cenario">Nome do cenário</label><input id="novo-cenario" type="text" maxlength="40" placeholder="Ex.: Piloto 2027"></div>`;
      const m = ui.modal({
        title: 'Novo cenário',
        body,
        size: 'small',
        footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Criar cenário</button>'
      });
      m.dialog.querySelector('[data-cancel]').addEventListener('click', () => m.close());
      m.dialog.querySelector('[data-save]').addEventListener('click', async () => {
        try {
          const res = await api.post('/finance/cenarios', { nome: m.body.querySelector('#novo-cenario').value });
          ativo = res.item;
          const fresh = await api.get('/finance/cenarios');
          data.items = fresh.items;
          ui.toast('Cenário criado. Informe as premissas.', 'success');
          paint();
        } catch (err) { ui.toast(err.message, 'error'); }
      });
    });
  }

  paint();
}
