import { api } from '../api.js';
import * as ui from '../ui.js';
import * as notif from '../notificacoes.js';

function kpiCard({ icon, label, value, foot, tone = '' }) {
  return `<div class="kpi ${tone}">
    <div class="kpi-icon">${ui.icon(icon, 17)}</div>
    <div class="kpi-value">${ui.fmtInt(value)}</div>
    <div class="kpi-label">${ui.esc(label)}</div>
    ${foot ? `<div class="kpi-foot">${ui.esc(foot)}</div>` : ''}
  </div>`;
}

export async function renderDashboard(view, state) {
  const d = await api.get('/dashboard');
  const k = d.kpis;
  const nome = state.user.nome.split(' ')[0];
  const semDados = !k.motoristas_total && !k.passageiros_interessados && !k.parceiros_negociacao && !k.atendimentos_pendentes && !k.campanhas_andamento;

  const acoes = d.proximas_acoes.length
    ? d.proximas_acoes.map((a) => `
      <div class="spread" style="padding:9px 0;border-bottom:1px dashed #eef2f9">
        <div style="min-width:0">
          <div style="font-size:13.5px;font-weight:600">${ui.esc(a.titulo)}</div>
          <div class="small muted">${ui.esc(a.modulo)} · ${ui.esc(a.acao || a.situacao || '')}</div>
        </div>
        <div style="text-align:right;flex:none">
          <div class="small ${a.atrasado ? '' : 'muted'}" style="${a.atrasado ? 'color:#cf3d2b;font-weight:700' : ''}">${ui.fmtDate(a.data)}</div>
          ${a.atrasado ? '<span class="badge danger">Atrasado</span>' : ui.badge(a.situacao)}
        </div>
      </div>`).join('')
    : '<div class="empty" style="padding:26px 12px"><p>Nenhuma ação com data próxima. Cadastre acompanhamentos com data para aparecerem aqui.</p></div>';

  const atendimentos = d.ultimos_atendimentos.length
    ? ui.tableHtml({
      columns: [
        { label: 'Assunto', render: (r) => `<b>${ui.esc(r.assunto)}</b><span class="sub">${ui.esc(r.tipo)} · ${ui.fmtDate(r.data)}</span>` },
        { label: 'Prioridade', render: (r) => ui.badge(r.prioridade, ui.priorityTone(r.prioridade)) },
        { label: 'Situação', render: (r) => ui.badge(r.situacao) }
      ],
      rows: d.ultimos_atendimentos,
      responsive: false
    })
    : '<div class="empty" style="padding:26px 12px"><p>Nenhum atendimento registrado.</p></div>';

  const atividade = d.atividade.length
    ? d.atividade.map((a) => `<div class="tl-item"><div class="tl-dot"></div><div>
        <p>${ui.esc(a.detail || a.action)}</p>
        <div class="tl-meta">${ui.esc(a.user_nome || 'Sistema')} · ${ui.fmtDateTime(a.created_at)}</div>
      </div></div>`).join('')
    : '<p class="small muted">Sem movimentações registradas.</p>';

  view.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">Painel principal</div>
        <h2>Olá, ${ui.esc(nome)}</h2>
        <p class="sub">Dados reais cadastrados no CRM · atualizado em ${ui.fmtDate(d.hoje)}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" id="dash-refresh">${ui.icon('file', 16)} Atualizar</button>
        <button class="btn btn-primary" id="dash-new-driver">${ui.icon('plus', 16)} Novo motorista</button>
      </div>
    </div>

    <div id="dash-push" class="hidden"></div>

    ${semDados ? `<div class="card" style="margin-bottom:16px;border-left:4px solid #f2b705">
      <div class="card-body">
        <div class="spread">
          <div style="max-width:62ch">
            <h3 style="font-size:16px;margin-bottom:5px">Comece pelos primeiros cadastros</h3>
            <p class="muted small">O painel é alimentado exclusivamente pelos registros do CRM — não há números de exemplo. Cadastre um motorista, um passageiro ou um parceiro para ver os indicadores e gráficos ganharem vida.</p>
          </div>
          <div class="row">
            <button class="btn btn-soft" data-go="motoristas">Motoristas</button>
            <button class="btn btn-soft" data-go="passageiros">Passageiros</button>
            <button class="btn btn-soft" data-go="parceiros">Parceiros</button>
          </div>
        </div>
      </div>
    </div>` : ''}

    <div class="kpi-grid">
      ${kpiCard({ icon: 'steering', label: 'Motoristas interessados', value: k.motoristas_interessados, foot: `Novos, ainda sem contato · ${ui.fmtInt(k.motoristas_total)} no total` })}
      ${kpiCard({ icon: 'list', label: 'Motoristas em processo de cadastro', value: k.motoristas_em_processo, foot: 'Contato até análise', tone: 'gold' })}
      ${kpiCard({ icon: 'check', label: 'Motoristas aprovados', value: k.motoristas_aprovados + k.motoristas_contratados, foot: `${ui.fmtInt(k.motoristas_contratados)} contratado(s) · ${ui.fmtInt(k.motoristas_aprovados)} aguardando contratação`, tone: 'green' })}
      ${kpiCard({ icon: 'users', label: 'Motoristas contratados', value: k.motoristas_contratados, foot: k.motoristas_docs_a_conferir ? `Trabalhando · ${ui.fmtInt(k.motoristas_docs_a_conferir)} aprovado(s)/contratado(s) com documentos a conferir` : 'Trabalhando · documentos em dia', tone: 'green' })}
      ${k.entregadores_total !== undefined ? kpiCard({ icon: 'send', label: 'Entregadores e motociclistas', value: k.entregadores_total, foot: `${ui.fmtInt(k.entregadores_interessados)} novo(s) · ${ui.fmtInt(k.entregadores_em_processo)} em processo` }) : ''}
      ${k.entregadores_total !== undefined ? kpiCard({ icon: 'check', label: 'Entregadores contratados', value: k.entregadores_contratados, foot: `${ui.fmtInt(k.entregadores_aprovados)} aprovado(s) aguardando contratação${k.entregadores_docs_a_conferir ? ` · ${ui.fmtInt(k.entregadores_docs_a_conferir)} com documentos a conferir` : ''}`, tone: 'green' }) : ''}
      ${k.comercios_total !== undefined ? kpiCard({ icon: 'building', label: 'Comércios parceiros (entregas)', value: k.comercios_total, foot: `${ui.fmtInt(k.comercios_novos)} novo(s) · ${ui.fmtInt(k.comercios_negociacao)} em negociação` }) : ''}
      ${k.comercios_total !== undefined ? kpiCard({ icon: 'check', label: 'Comércios ativos na plataforma', value: k.comercios_ativos, foot: 'Já pedindo entregas · separado do Clube de Vantagens', tone: 'green' }) : ''}
      ${k.documentos_pendentes !== undefined ? kpiCard({ icon: 'file', label: 'Documentos a conferir', value: k.documentos_pendentes, foot: 'Enviados e ainda sem conferência · arquivo digital', tone: k.documentos_pendentes ? 'gold' : '' }) : ''}
      ${k.documentos_atencao ? kpiCard({ icon: 'alert', label: 'Documentos com pendência', value: k.documentos_atencao, foot: 'Rejeitados ou precisando de atualização', tone: 'gold' }) : ''}
      ${kpiCard({ icon: 'users', label: 'Passageiros interessados', value: k.passageiros_interessados, foot: `${ui.fmtInt(k.passageiros_cadastrados)} já cadastrados` })}
      ${kpiCard({ icon: 'store', label: 'Parceiros em negociação', value: k.parceiros_negociacao, foot: 'Clube de Vantagens' })}
      ${kpiCard({ icon: 'building', label: 'Parcerias confirmadas', value: k.parcerias_confirmadas, foot: 'Confirmação manual', tone: 'green' })}
      ${kpiCard({ icon: 'headset', label: 'Atendimentos pendentes', value: k.atendimentos_pendentes, foot: 'Abertos e em andamento', tone: k.atendimentos_pendentes ? 'gold' : '' })}
      ${kpiCard({ icon: 'megaphone', label: 'Campanhas em andamento', value: k.campanhas_andamento, foot: 'Produção, andamento e publicadas' })}
      ${kpiCard({ icon: 'calendar', label: 'Tarefas próximas do vencimento', value: k.tarefas_proximas, foot: `Próximos ${d.alerta_dias} dias`, tone: 'gold' })}
      ${kpiCard({ icon: 'alert', label: 'Tarefas atrasadas', value: k.tarefas_atrasadas, foot: 'Vencidas e em aberto', tone: k.tarefas_atrasadas ? 'red' : '' })}
    </div>

    <div style="margin-top:16px">
      <div class="card">
        <div class="card-head">
          <div><h3>Evolução dos últimos 6 meses</h3><p class="sub">Novos motoristas e passageiros por mês</p></div>
        </div>
        <div class="card-body">
          ${ui.lineChart(d.serie.meses, [
            { name: 'Motoristas', color: '#1d4ed8', data: d.serie.motoristas },
            { name: 'Passageiros', color: '#f2b705', data: d.serie.passageiros }
          ])}
        </div>
      </div>

    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><div><h3>Próximas ações</h3><p class="sub">Acompanhamentos e tarefas com data até ${ui.fmtDate(d.hoje)} + ${d.alerta_dias} dias</p></div></div>
        <div class="card-body">${acoes}</div>
      </div>

      <div class="card">
        <div class="card-head"><div><h3>Funil de motoristas</h3><p class="sub">Distribuição por etapa do cadastro</p></div></div>
        <div class="card-body">
          ${ui.bars(d.funil_motoristas.map((f) => ({ label: f.status, value: f.total })))}
        </div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><div><h3>Últimos atendimentos</h3><p class="sub">Registros mais recentes</p></div>
          <button class="btn btn-sm btn-ghost" data-go="atendimento">Ver todos</button></div>
        <div class="card-body" style="padding-top:8px">${atendimentos}</div>
      </div>

      ${state.meta.can && state.meta.can.ver_atividade ? `<div class="card">
        <div class="card-head"><div><h3>Atividade recente</h3><p class="sub">Últimas operações registradas no sistema</p></div></div>
        <div class="card-body"><div class="timeline">${atividade}</div></div>
      </div>` : ''}
    </div>

    <p class="small muted" style="margin-top:18px">Os indicadores refletem apenas registros cadastrados. Indicadores zerados significam ausência de dados, não ausência de operação.</p>`;

  view.querySelector('#dash-refresh').addEventListener('click', () => renderDashboard(view, state));
  view.querySelector('#dash-new-driver').addEventListener('click', () => { location.hash = '#/motoristas?novo=1'; });
  view.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/${b.dataset.go}`; }));
  avisoPush(view);
}

// Aviso para ligar as notificações com o CRM fechado (sem inscrição, o servidor não tem para quem mandar o aviso).
async function avisoPush(view) {
  const box = view.querySelector('#dash-push');
  if (!box || !notif.suportaPush() || Notification.permission === 'denied') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (await reg.pushManager.getSubscription()) return;
  } catch (e) { return; }
  box.className = 'card';
  box.style.cssText = 'margin-bottom:16px;border-left:4px solid #1d4ed8';
  box.innerHTML = `<div class="card-body"><div class="spread" style="gap:12px;flex-wrap:wrap">
      <div style="max-width:62ch"><h3 style="font-size:16px;margin-bottom:5px">🔔 Avisos com o CRM fechado</h3>
        <p class="muted small">Este aparelho ainda não recebe notificações de mensagem nova, da IA e de transferência quando o CRM está fechado ou com a tela bloqueada.</p></div>
      <button class="btn btn-primary" id="dash-push-ativar" type="button">Ativar agora</button></div></div>`;
  box.querySelector('#dash-push-ativar').addEventListener('click', async () => {
    try {
      await notif.ativarPush({ mensagem: true, ia: true, transferencia: true });
      ui.toast('Notificações ativadas neste aparelho. Para escolher os tipos, veja Configurações → Notificações.', 'success');
      box.className = 'hidden';
    } catch (e) { ui.toast(e.message, 'error'); }
  });
}
