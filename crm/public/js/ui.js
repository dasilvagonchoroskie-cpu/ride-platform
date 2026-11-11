/* Componentes de interface reutilizáveis */
import { api } from './api.js';

export const esc = (value) => String(value === null || value === undefined ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtMoney = (v) => moneyFmt.format(Number(v) || 0);
export const fmtInt = (v) => intFmt.format(Number(v) || 0);
export const fmtDec = (v) => decFmt.format(Number(v) || 0);
export const fmtPct = (v) => `${decFmt.format(Number(v) || 0)}%`;

const TZ = 'America/Sao_Paulo';

export function fmtDate(iso) {
  if (!iso) return '—';
  let s = String(iso);
  if (s.includes('T')) {
    // Timestamp (ex.: created_at em UTC): converte para o dia de Fortaleza. Registros feitos após 21h não pulam para o dia seguinte.
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    }
  }
  s = s.slice(0, 10);
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fmtDate(iso);
  return `${d.toLocaleDateString('pt-BR', { timeZone: TZ })} ${d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function fmtMonth(key) {
  if (!key) return '';
  const [y, m] = String(key).split('-');
  return `${MESES[Number(m) - 1] || m}/${String(y).slice(2)}`;
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* -------------------------------- ícones -------------------------------- */
const ICONS = {
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  dashboard: '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  steering: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 9.5V3.2M14.2 13.2l5.5 3.2M9.8 13.2l-5.5 3.2"/>',
  users: '<path d="M16 20v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7" r="3.2"/><path d="M17 4.4a3.2 3.2 0 0 1 0 5.2M22 20v-1.6a4 4 0 0 0-3-3.8"/>',
  store: '<path d="M3 9.5 4.6 4h14.8L21 9.5"/><path d="M4 9.5V20h16V9.5"/><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M9.5 20v-5.5h5V20"/>',
  headset: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M4 13h2.5v5H5a1 1 0 0 1-1-1zM20 13h-2.5v5H19a1 1 0 0 0 1-1z"/><path d="M20 18v.5A3.5 3.5 0 0 1 16.5 22H13"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14 8.5a5 5 0 0 1 0 7M17 5.5a9 9 0 0 1 0 13"/>',
  check: '<path d="M9 11.5 12 14.5 20 6"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 11a2 2 0 1 1 0 4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/><path d="M10 11v5M14 11v5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 17h12v4H6z"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 9v5M12 17h.01"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M7 3v6h8V3M7 21v-7h10v7"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  phone: '<path d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  install: '<path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'
};

export function icon(name, size = 18) {
  const body = ICONS[name] || ICONS.dashboard;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* -------------------------------- toast --------------------------------- */
export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; }, 3200);
  setTimeout(() => el.remove(), 3700);
}

/* -------------------------------- modal --------------------------------- */
export function modal({ title, subtitle = '', body, footer = '', size = '' }) {
  const dialog = document.createElement('dialog');
  dialog.className = `modal ${size}`.trim();
  dialog.innerHTML = `
    <div class="modal-shell">
      <div class="modal-head">
        <div>
          <h3>${esc(title)}</h3>
          ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
        </div>
        <button class="icon-btn" data-modal-close aria-label="Fechar">${icon('x')}</button>
      </div>
      <div class="modal-body"></div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  const bodyEl = dialog.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  document.getElementById('modal-root').appendChild(dialog);
  const close = () => { try { dialog.close(); } catch (err) { /* ignore */ } dialog.remove(); };
  dialog.querySelector('[data-modal-close]').addEventListener('click', close);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');

  return { dialog, body: bodyEl, close, footerEl: dialog.querySelector('.modal-foot') };
}

export function confirmDialog({ title = 'Confirmar ação', message, confirmLabel = 'Confirmar', danger = false, requireCheck = null }) {
  return new Promise((resolve) => {
    const check = requireCheck
      ? `<label class="check" style="margin-top:14px"><input type="checkbox" id="cf-check"><span>${esc(requireCheck)}</span></label>`
      : '';
    const m = modal({
      title,
      body: `<p style="font-size:14px;color:#33455e">${esc(message)}</p>${check}`,
      footer: `<button class="btn btn-ghost" data-cancel>Cancelar</button>
               <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok ${requireCheck ? 'disabled' : ''}>${esc(confirmLabel)}</button>`,
      size: 'small'
    });
    const ok = m.dialog.querySelector('[data-ok]');
    if (requireCheck) {
      m.dialog.querySelector('#cf-check').addEventListener('change', (e) => { ok.disabled = !e.target.checked; });
    }
    ok.addEventListener('click', () => { m.close(); resolve(true); });
    m.dialog.querySelector('[data-cancel]').addEventListener('click', () => { m.close(); resolve(false); });
    m.dialog.addEventListener('close', () => resolve(false), { once: true });
  });
}

/* -------------------------------- charts -------------------------------- */
function chartFrame(inner, height) {
  return `<div class="chart"><svg viewBox="0 0 720 ${height}" role="img" preserveAspectRatio="none">${inner}</svg></div>`;
}

export function lineChart(labels, series, height = 240) {
  if (!labels.length || series.every((s) => s.data.every((v) => !v))) {
    return '<div class="chart-empty">Sem dados no período para exibir o gráfico.</div>';
  }
  const W = 720, H = height, P = { t: 16, r: 18, b: 30, l: 38 };
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const x = (i) => P.l + (i * (W - P.l - P.r)) / Math.max(1, labels.length - 1);
  const y = (v) => H - P.b - (v / top) * (H - P.t - P.b);

  let grid = '';
  for (let i = 0; i <= 4; i += 1) {
    const val = step * i;
    const yy = y(val);
    grid += `<line x1="${P.l}" y1="${yy}" x2="${W - P.r}" y2="${yy}" stroke="#e8eef7" stroke-width="1"/>`;
    grid += `<text x="${P.l - 8}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#8494ab">${val}</text>`;
  }

  let paths = '';
  for (const s of series) {
    const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const area = `M${x(0)},${y(0)} L${pts.split(' ').join(' L')} L${x(labels.length - 1)},${y(0)} Z`;
    paths += `<path d="${area}" fill="${s.color}" opacity="0.08"/>`;
    paths += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    paths += s.data.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.2" fill="#fff" stroke="${s.color}" stroke-width="2"><title>${esc(s.name)} — ${esc(fmtMonth(labels[i]))}: ${v}</title></circle>`).join('');
  }

  const xlabels = labels.map((l, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#8494ab">${esc(fmtMonth(l))}</text>`).join('');
  const legend = `<div class="chart-legend">${series.map((s) => `<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}</div>`;
  return chartFrame(grid + paths + xlabels, height) + legend;
}

export function barChart(labels, series, height = 240) {
  if (!labels.length || series.every((s) => s.data.every((v) => !v))) {
    return '<div class="chart-empty">Sem dados no período para exibir o gráfico.</div>';
  }
  const W = 720, H = height, P = { t: 16, r: 18, b: 30, l: 38 };
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const groupW = (W - P.l - P.r) / labels.length;
  const barW = Math.min(22, (groupW * 0.62) / series.length);
  const y = (v) => H - P.b - (v / top) * (H - P.t - P.b);

  let grid = '';
  for (let i = 0; i <= 4; i += 1) {
    const yy = y(step * i);
    grid += `<line x1="${P.l}" y1="${yy}" x2="${W - P.r}" y2="${yy}" stroke="#e8eef7"/>`;
    grid += `<text x="${P.l - 8}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#8494ab">${step * i}</text>`;
  }

  let bars = '';
  labels.forEach((label, i) => {
    const cx = P.l + groupW * i + groupW / 2;
    series.forEach((s, si) => {
      const v = s.data[i];
      const bx = cx - (barW * series.length) / 2 + si * barW;
      const by = y(v);
      bars += `<rect x="${bx + 1}" y="${by}" width="${Math.max(2, barW - 2)}" height="${Math.max(0, H - P.b - by)}" rx="3" fill="${s.color}"><title>${esc(s.name)} — ${esc(fmtMonth(label))}: ${v}</title></rect>`;
    });
    bars += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#8494ab">${esc(fmtMonth(label))}</text>`;
  });

  const legend = `<div class="chart-legend">${series.map((s) => `<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}</div>`;
  return chartFrame(grid + bars, height) + legend;
}

export function donut(items) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return '<div class="chart-empty">Sem dados para exibir.</div>';
  const R = 48, C = 2 * Math.PI * R;
  let offset = 0;
  const circles = items.map((item) => {
    const len = (item.value / total) * C;
    const el = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${item.color}" stroke-width="16"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"><title>${esc(item.label)}: ${item.value}</title></circle>`;
    offset += len;
    return el;
  }).join('');
  return `<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    <div class="chart" style="width:132px;flex:none"><svg viewBox="0 0 120 120">${circles}
      <text x="60" y="58" text-anchor="middle" font-size="20" font-weight="700" fill="#101c2e">${total}</text>
      <text x="60" y="72" text-anchor="middle" font-size="9" fill="#8494ab">TOTAL</text></svg></div>
    <div class="breakdown" style="flex:1;min-width:150px">${items.map((i) => `<div class="bd-row"><span><span class="legend-dot" style="display:inline-block;background:${i.color};margin-right:6px"></span>${esc(i.label)}</span><b>${i.value}</b></div>`).join('')}</div>
  </div>`;
}

export function bars(items, color = '#1d4ed8') {
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<div class="bars">${items.map((i) => `
    <div class="bar-row"><span>${esc(i.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(i.value / max) * 100}%;background:${color}"></span></span>
      <span class="val">${i.value}</span></div>`).join('')}</div>`;
}

/* -------------------------------- table --------------------------------- */
export function tableHtml({ columns, rows, emptyHtml = '', responsive = true, rowClick = false, rowClass = null }) {
  if (!rows.length) return emptyHtml || '<div class="empty"><p>Nenhum registro encontrado.</p></div>';
  const head = columns.map((c) => `<th${c.cls ? ` class="${c.cls}"` : ''}>${esc(c.label)}</th>`).join('');
  const body = rows.map((row) => {
    const cells = columns.map((c) => `<td data-label="${esc(c.label)}"${c.cls ? ` class="${c.cls}"` : ''}>${c.render ? c.render(row) : esc(row[c.key])}</td>`).join('');
    const classes = [rowClick ? 'clickable' : '', rowClass ? rowClass(row) || '' : ''].filter(Boolean).join(' ');
    return `<tr${classes ? ` class="${classes}"` : ''} data-id="${row.id}">${cells}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="data${responsive ? ' responsive' : ''}">
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function statusTone(status) {
  const s = String(status || '');
  if (/^(Contratado|Parceria confirmada|Usuário cadastrado)$/.test(s)) return 'fechado';
  if (/^(Aprovado|Concluída|Resolvido|Publicada|Conferido|Conferidos)$/.test(s)) return 'success';
  if (/^(Recebido — conferir|Recebidos — conferir|Incompletos)$/.test(s)) return 'warn';
  if (/^(Não prosseguiu|Não concretizada|Cancelada|Cancelado)$/.test(s)) return 'danger';
  if (/Aguardando|Pendente/.test(s)) return 'warn';
  if (/^Em |Em negociação|Cadastro em|Primeiro contato|Contato realizado|Interessado|Proposta apresentada|Identificado/.test(s)) return 'info';
  return 'neutral';
}

export function priorityTone(p) {
  return { Urgente: 'danger', Alta: 'warn', Média: 'info', Baixa: 'neutral' }[p] || 'neutral';
}

export const badge = (text, tone) => `<span class="badge ${tone || statusTone(text)}">${esc(text || '—')}</span>`;

export function emptyState(title, text, actionHtml = '') {
  return `<div class="empty"><div class="empty-icon">${icon('database', 22)}</div><h4>${esc(title)}</h4><p>${esc(text)}</p>${actionHtml}</div>`;
}

/* -------------------------------- formulário ---------------------------- */
export async function relationOptions(type, selected) {
  try {
    // "include" garante que o registro já vinculado venha na lista, mesmo fora dos 50 mais recentes.
    const include = selected ? `&include=${encodeURIComponent(selected)}` : '';
    const data = await api.get(`/relations?type=${encodeURIComponent(type)}${include}`);
    return data.items.map((i) => ({
      value: String(i.id),
      label: `#${i.id} — ${i.label}`,
      selected: String(i.id) === String(selected)
    }));
  } catch (err) {
    return [];
  }
}

export function buildForm(def, values = {}, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  const refs = {};

  const optionsHtml = (field, current) => {
    let options = (field.options || []).slice();
    if (def.confirmStatus && field.key === def.statusField && current !== def.confirmStatus) {
      options = options.filter((o) => o !== def.confirmStatus);
    }
    const blank = field.required ? '<option value="">Selecione…</option>' : '<option value="">—</option>';
    return blank + options.map((o) => `<option value="${esc(o)}" ${String(current) === String(o) ? 'selected' : ''}>${esc(o)}</option>`).join('');
  };

  for (const field of def.fields) {
    const wrapper = document.createElement('div');
    wrapper.className = `field${field.full || field.type === 'textarea' ? ' full' : ''}`;
    wrapper.dataset.key = field.key;
    const current = values[field.key] === null || values[field.key] === undefined ? '' : values[field.key];
    const label = `<label for="f-${field.key}">${esc(field.label)}${field.required ? '<span class="req">*</span>' : ''}</label>`;
    let control;

    if (field.type === 'textarea') {
      control = `<textarea id="f-${field.key}" maxlength="${field.max || 4000}" placeholder="${esc(field.placeholder || '')}">${esc(current)}</textarea>`;
    } else if (field.type === 'select') {
      control = `<select id="f-${field.key}">${optionsHtml(field, current)}</select>`;
    } else if (field.type === 'relation') {
      control = `<select id="f-${field.key}"><option value="">Selecione…</option></select>`;
    } else {
      const type = field.type === 'number' ? 'number' : field.type;
      const step = field.step !== undefined ? `step="${field.step}"` : (field.type === 'number' ? 'step="0.01"' : '');
      const min = field.min !== undefined ? `min="${field.min}"` : '';
      control = `<input id="f-${field.key}" type="${type}" value="${esc(current)}" ${step} ${min} maxlength="${field.max || 255}" placeholder="${esc(field.placeholder || '')}" ${field.type === 'tel' ? 'inputmode="tel"' : ''} ${field.type === 'number' ? 'inputmode="decimal"' : ''}>`;
    }

    wrapper.innerHTML = `${label}${control}<div class="field-error"></div>`;
    wrap.appendChild(wrapper);
    refs[field.key] = wrapper.querySelector('input, select, textarea');
  }

  // O vínculo salvo só vale enquanto o módulo escolhido for o mesmo de quando o formulário abriu.
  // Antes, o valor salvo era ignorado: editar uma tarefa vinculada e salvar apagava o vínculo sem avisar.
  const initialType = {};
  for (const field of def.fields) {
    if (field.type === 'relation') initialType[field.key] = opts.relationType || values[field.dependsOn] || '';
  }
  const loadRelations = async () => {
    for (const field of def.fields) {
      if (field.type !== 'relation') continue;
      const type = opts.relationType || (refs[field.dependsOn] ? refs[field.dependsOn].value : '');
      if (!type) {
        refs[field.key].innerHTML = '<option value="">Nenhum / não vinculado</option>';
        continue;
      }
      const wanted = type === initialType[field.key] ? (values[field.key] ?? '') : '';
      const items = await relationOptions(type, wanted);
      refs[field.key].innerHTML = '<option value="">Nenhum / não vinculado</option>' +
        items.map((i) => `<option value="${i.value}" ${i.selected ? 'selected' : ''}>${esc(i.label)}</option>`).join('');
    }
  };

  for (const field of def.fields) {
    if (field.type === 'relation' && field.dependsOn && refs[field.dependsOn]) {
      refs[field.dependsOn].addEventListener('change', async () => {
        refs[field.key].innerHTML = '<option value="">Carregando…</option>';
        await loadRelations();
      });
    }
  }
  loadRelations();

  const api2 = {
    el: wrap,
    refs,
    getValues() {
      const out = {};
      for (const field of def.fields) {
        const node = refs[field.key];
        let v = node.value;
        if (field.type === 'relation') v = v ? Number(v) : null;
        if (field.type === 'number') v = v === '' ? '' : Number(v);
        out[field.key] = v;
      }
      return out;
    },
    setErrors(errors) {
      wrap.querySelectorAll('.field').forEach((f) => {
        f.classList.remove('invalid');
        const err = f.querySelector('.field-error');
        if (err) err.textContent = '';
      });
      if (!errors) return;
      for (const [key, message] of Object.entries(errors)) {
        const field = wrap.querySelector(`.field[data-key="${key}"]`);
        if (!field) continue;
        field.classList.add('invalid');
        const err = field.querySelector('.field-error');
        if (err) err.textContent = message;
      }
      const first = wrap.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea');
      if (first) first.focus();
    },
    focus() {
      const first = wrap.querySelector('input, select, textarea');
      if (first) first.focus();
    }
  };
  return api2;
}
