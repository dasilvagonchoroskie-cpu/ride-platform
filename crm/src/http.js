'use strict';

const COOKIE_NAME = 'fm_sid';

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { /* ignora cookie malformado sem derrubar a requisição */ }
  }
  return out;
}

// req.secure respeita a configuração "trust proxy" do Express (X-Forwarded-Proto só é aceito de proxy confiável).
// COOKIE_SECURE=true força o atributo Secure (útil quando o TLS termina fora e o proxy não é "confiável").
function isSecure(req) {
  return process.env.COOKIE_SECURE === 'true' || !!req.secure;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearCookie(res, name, req) {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (req && isSecure(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

// Usa req.ip: o Express só lê X-Forwarded-For de proxies confiáveis (TRUST_PROXY). Ler o cabeçalho
// diretamente permitiria a qualquer cliente forjar o IP registrado na auditoria e nas sessões.
function clientIp(req) {
  if (req.ip) return req.ip;
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
}

// Converte um timestamp ISO (UTC) para a data civil em America/Sao_Paulo (YYYY-MM-DD).
// Evita o erro de "dia seguinte" para registros feitos depois das 21h em Fortaleza.
function localDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function addDaysISO(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isDateISO(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// Texto que parece telefone/número assinado (ex.: +55 (85) 99999-9999) não executa fórmula e não precisa de apóstrofo.
const SIGNED_NUMERIC_TEXT = /^[+-]\d[\d\s().,-]*$/;

function csvValue(v) {
  if (v === null || v === undefined) return '';
  let s;
  if (typeof v === 'number') {
    // Números reais (inclusive negativos) saem como número, com vírgula decimal. Nunca recebem apóstrofo.
    s = Number.isFinite(v) ? String(v).replace('.', ',') : '';
  } else {
    s = String(v);
    // Evita que Excel/LibreOffice interpretem dados importados como fórmulas (=, +, -, @, TAB, CR).
    const risky = /^[\s\u0000-\u001f]*[=+@-]/.test(s) || /^[\t\r]/.test(s);
    if (risky && !SIGNED_NUMERIC_TEXT.test(s)) s = `'${s}`;
  }
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function sendCsv(res, filename, header, rows) {
  const safeFilename = String(filename || 'exportacao.csv').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const lines = [header.map(csvValue).join(';')];
  for (const row of rows) lines.push(row.map(csvValue).join(';'));
  const body = '\uFEFF' + lines.join('\r\n') + '\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.send(body);
}

function audit(req, action, entity, entityId, detail) {
  try {
    const db = req.app.locals.db;
    const user = req.user || {};
    db.prepare(
      `INSERT INTO audit_log (user_id, user_nome, action, entity, entity_id, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user.id || null,
      user.nome || null,
      action,
      entity || null,
      entityId === undefined ? null : entityId,
      detail || null,
      clientIp(req),
      new Date().toISOString()
    );
  } catch (err) {
    console.error('audit error', err.message);
  }
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  isSecure,
  setCookie,
  clearCookie,
  clientIp,
  todayISO,
  localDate,
  addDaysISO,
  isDateISO,
  fail,
  sendCsv,
  audit
};
