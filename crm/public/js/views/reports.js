import { api } from '../api.js';
import * as ui from '../ui.js';
import { abrirExportacao, podeExportar, podePdf } from '../exportar.js';

const MODULOS = [
  { key: 'motoristas', label: 'Motoristas', icon: 'steering' },
  { key: 'passageiros', label: 'Passageiros', icon: 'users' },
  { key: 'parceiros', label: 'Parceiros comerciais', icon: 'store' },
  { key: 'campanhas', label: 'Campanhas e publicações', icon: 'megaphone' },
  { key: 'atendimentos', label: 'Atendimentos', icon: 'headset' },
  { key: 'tarefas', label: 'Tarefas', icon: 'check' }
];

function breakdown(items) {
  if (!items || !items.length) return '<p class="small muted">Sem registros no período.</p>';
  return `<div class="breakdown">${items.map((i) => `<div class="bd-row"><span>${ui.esc(i.chave || 'Não informado')}</span><b>${ui.fmtInt(i.total)}</b></div>`).join('')}</div>`;
}

function mini(label, value) {
  return `<div class="mini-stat"><span>${ui.esc(label)}</span><strong>${value}</strong></div>`;
}

export async function renderReports(view, state) {
  // PDF é o formato principal e o CSV é complementar; as permissões são validadas também no servidor.
  // `tipo` = módulo do CSV; `pdfTipo` = modelo do PDF (as simulações saem no modelo "financeiro").
  const exportBtn = (tipo, pdfTipo = tipo) => podeExportar(state, pdfTipo) || podeExportar(state, tipo)
    ? `<button class="btn btn-sm btn-ghost no-print" data-export="${tipo}" data-pdf="${pdfTipo}">${ui.icon('download', 14)} Exportar</button>`
    : '';
  const hoje = ui.todayISO();
  let de = `${hoje.slice(0, 7)}-01`;
  let ate = hoje;

  view.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">Relatórios</div>
        <h2>Histórico e resultados</h2>
        <p class="sub">Filtre por período, consulte os totais e exporte em PDF (ou CSV)</p>
      </div>
      <div class="page-actions no-print">
        ${podePdf(state, 'resumo') ? `<button class="btn btn-primary" id="rep-pdf">${ui.icon('download', 16)} Relatório geral (PDF)</button>` : ''}
        <button class="btn btn-ghost" id="rep-print">${ui.icon('print', 16)} Imprimir tela</button>
      </div>
    </div>

    <div class="toolbar no-print">
      <div class="field" style="min-width:150px"><label for="rep-de">De</label><input type="date" id="rep-de" value="${de}"></div>
      <div class="field" style="min-width:150px"><label for="rep-ate">Até</label><input type="date" id="rep-ate" value="${ate}"></div>
      <div class="row" style="gap:6px">
        <button class="btn btn-sm btn-ghost" data-preset="mes">Mês atual</button>
        <button class="btn btn-sm btn-ghost" data-preset="30">Últimos 30 dias</button>
        <button class="btn btn-sm btn-ghost" data-preset="ano">Ano atual</button>
      </div>
      <button class="btn btn-primary btn-sm" id="rep-apply" style="margin-left:auto">Aplicar filtro</button>
    </div>

    <div id="rep-body"></div>`;

  const body = view.querySelector('#rep-body');

  async function load() {
    body.innerHTML = '<div class="card" style="padding:30px;text-align:center;color:#8494ab">Gerando relatório…</div>';
    let s;
    try {
      s = await api.get(`/reports/summary?de=${de}&ate=${ate}`);
    } catch (err) {
      body.innerHTML = `<div class="card"><div class="empty"><p>${ui.esc(err.message)}</p></div></div>`;
      return;
    }

    body.innerHTML = `
      <div class="print-head">
        <h2 style="font-size:20px">CRM Fortaleza Move — Relatório</h2>
        <p class="small muted">Período de ${ui.fmtDate(de)} a ${ui.fmtDate(ate)} · emitido em ${ui.fmtDate(ui.todayISO())} · valores estimados identificados como simulação</p>
      </div>

      <div class="report-section">
        <div class="card">
          <div class="card-head"><div><h3>Resumo do período</h3><p class="sub">Totais por módulo, considerando a data de cada registro</p></div></div>
          <div class="card-body">
            <div class="report-grid">
              ${mini('Motoristas', ui.fmtInt(s.motoristas.total))}
              ${mini('Passageiros', ui.fmtInt(s.passageiros.total))}
              ${mini('Parceiros', ui.fmtInt(s.parceiros.total))}
              ${mini('Campanhas', ui.fmtInt(s.campanhas.total))}
              ${mini('Atendimentos', ui.fmtInt(s.atendimentos.total))}
              ${mini('Tarefas', ui.fmtInt(s.tarefas.total))}
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2 report-section">
        <div class="card">
          <div class="card-head">
            <div><h3>Motoristas por situação</h3><p class="sub">${ui.fmtInt(s.motoristas.total)} motoristas no período</p></div>
            ${exportBtn('motoristas')}
          </div>
          <div class="card-body">${breakdown(s.motoristas.por_situacao)}</div>
        </div>

        <div class="card">
          <div class="card-head">
            <div><h3>Passageiros por situação</h3><p class="sub">${ui.fmtInt(s.passageiros.total)} passageiros no período</p></div>
            ${exportBtn('passageiros')}
          </div>
          <div class="card-body">${breakdown(s.passageiros.por_situacao)}</div>
        </div>
      </div>

      ${s.documentos ? `<div class="report-section">
        <div class="card">
          <div class="card-head">
            <div><h3>Documentos (arquivo digital)</h3><p class="sub">${ui.fmtInt(s.documentos.total)} documento(s) guardado(s) · ${ui.fmtInt(s.documentos.enviados_no_periodo)} enviado(s) no período</p></div>
            ${exportBtn('documentos')}
          </div>
          <div class="card-body">${breakdown([['Pendente de conferência', 'pendente'], ['Conferido', 'conferido'], ['Rejeitado', 'rejeitado'], ['Necessita atualização', 'necessita_atualizacao']].map(([chave, k]) => ({ chave, total: s.documentos.por_situacao[k] || 0 })))}</div>
        </div>
      </div>` : ''}

      ${s.comercios ? `<div class="report-section">
        <div class="card">
          <div class="card-head">
            <div><h3>Comércios parceiros (entregas) por situação</h3><p class="sub">${ui.fmtInt(s.comercios.total)} cadastros no período · ${ui.fmtInt(s.comercios.ativos)} ativo(s) na plataforma</p></div>
            ${exportBtn('comercios')}
          </div>
          <div class="card-body">${breakdown(s.comercios.por_situacao)}</div>
        </div>
      </div>` : ''}

      ${s.entregadores ? `<div class="report-section">
        <div class="card">
          <div class="card-head">
            <div><h3>Entregadores e motociclistas por situação</h3><p class="sub">${ui.fmtInt(s.entregadores.total)} cadastros no período</p></div>
            ${exportBtn('entregadores')}
          </div>
          <div class="card-body">${breakdown(s.entregadores.por_situacao)}</div>
        </div>
      </div>` : ''}

      <div class="grid-2 report-section">
        <div class="card">
          <div class="card-head">
            <div><h3>Parceiros por categoria</h3><p class="sub">${ui.fmtInt(s.parceiros.confirmados)} parcerias confirmadas no período</p></div>
            ${exportBtn('parceiros')}
          </div>
          <div class="card-body">${breakdown(s.parceiros.por_categoria)}</div>
        </div>

        <div class="card">
          <div class="card-head">
            <div><h3>Atendimentos por tipo</h3><p class="sub">${ui.fmtInt(s.atendimentos.pendentes)} pendentes no período</p></div>
            ${exportBtn('atendimentos')}
          </div>
          <div class="card-body">${breakdown(s.atendimentos.por_tipo)}</div>
        </div>
      </div>

      <div class="grid-2 report-section">
        <div class="card">
          <div class="card-head">
            <div><h3>Campanhas e divulgação</h3><p class="sub">Resultados declarados no período</p></div>
            ${exportBtn('campanhas')}
          </div>
          <div class="card-body">
            <div class="report-grid" style="margin-bottom:12px">
              ${mini('Investimento', ui.fmtMoney(s.campanhas.investimento))}
              ${mini('Alcance somado', ui.fmtInt(s.campanhas.alcance))}
              ${mini('Engajamento somado', ui.fmtInt(s.campanhas.engajamento))}
            </div>
            ${breakdown(s.campanhas.por_canal)}
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div><h3>Tarefas</h3><p class="sub">${ui.fmtInt(s.tarefas.concluidas)} concluídas · ${ui.fmtInt(s.tarefas.atrasadas)} atrasadas</p></div>
            ${exportBtn('tarefas')}
          </div>
          <div class="card-body">${breakdown(s.tarefas.por_situacao)}</div>
        </div>
      </div>

      <div class="report-section">
        <div class="card">
          <div class="card-head">
            <div><h3>Simulações financeiras registradas</h3><p class="sub">${ui.fmtInt(s.simulacoes.total)} simulações · receita estimada somada ${ui.fmtMoney(s.simulacoes.receita_total)}</p></div>
            ${exportBtn('simulacoes', 'financeiro')}
          </div>
          <div class="card-body" style="padding-top:8px">
            ${s.simulacoes.items.length ? ui.tableHtml({
              columns: [
                { label: 'Data', render: (r) => ui.fmtDate(r.created_at) },
                { label: 'Cenário', render: (r) => `<b>${ui.esc(r.cenario)}</b>` },
                { label: 'Corridas/mês', render: (r) => ui.fmtInt(r.corridas) },
                { label: 'Receita estimada', render: (r) => ui.fmtMoney(r.receita) },
                { label: 'Resultado estimado', render: (r) => ui.fmtMoney(r.resultado) },
                { label: 'Responsável', render: (r) => ui.esc(r.autor || '—') }
              ],
              rows: s.simulacoes.items
            }) : '<p class="small muted">Nenhuma simulação salva no período.</p>'}
            <p class="small muted" style="margin-top:10px">Valores de simulação são estimativas baseadas em premissas configuráveis; não representam receita realizada.</p>
          </div>
        </div>
      </div>

      <p class="small muted no-print">Os relatórios consideram a data de cadastro/contato de cada módulo dentro do período selecionado. Registros fora do período não entram nos totais.</p>`;

    body.querySelectorAll('[data-export]').forEach((btn) => btn.addEventListener('click', () => {
      const tipo = btn.dataset.export;
      const pdfTipo = btn.dataset.pdf;
      abrirExportacao(state, {
        titulo: `Exportar — ${btn.closest('.card').querySelector('h3').textContent}`, tipo: pdfTipo,
        pdf: `type=${pdfTipo}&de=${de}&ate=${ate}`,
        csv: `type=${tipo}&de=${de}&ate=${ate}`, csvNome: `${tipo}_${de}_${ate}.csv`
      });
    }));
  }

  view.querySelector('#rep-apply').addEventListener('click', () => {
    de = view.querySelector('#rep-de').value || de;
    ate = view.querySelector('#rep-ate').value || ate;
    load();
  });
  view.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const tipo = b.dataset.preset;
    const d = new Date();
    if (tipo === 'mes') { de = `${hoje.slice(0, 7)}-01`; ate = hoje; }
    if (tipo === '30') { de = ui.addDays(hoje, -30); ate = hoje; }
    if (tipo === 'ano') { de = `${d.getFullYear()}-01-01`; ate = hoje; }
    view.querySelector('#rep-de').value = de;
    view.querySelector('#rep-ate').value = ate;
    load();
  }));
  view.querySelector('#rep-print').addEventListener('click', () => window.print());
  const repPdf = view.querySelector('#rep-pdf');
  if (repPdf) repPdf.addEventListener('click', () => abrirExportacao(state, { titulo: 'Relatório geral do período', tipo: 'resumo', pdf: `type=resumo&de=${de}&ate=${ate}` }));

  await load();
}
