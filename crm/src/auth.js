'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');
const { COOKIE_NAME, parseCookies, setCookie, clearCookie, isSecure, clientIp } = require('./http');
const { createLimiter } = require('./limiter');

const SESSION_HOURS = 12;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password).normalize('NFKC'), salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, N, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(String(password).normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (err) {
    return false;
  }
}

// Hash descartável: usado para gastar o mesmo tempo de CPU quando o e-mail não existe,
// evitando que o tempo de resposta revele quais e-mails têm conta.
const DUMMY_HASH = hashPassword('senha-descartavel-0000');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const nowISO = () => new Date().toISOString();

function countUsers() {
  return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
}

function createSession(userId, req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_HOURS * 3600 * 1000);
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, ip, user_agent, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(sha256(token), userId, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 250), now.toISOString(), now.toISOString(), exp.toISOString());
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());
  setCookie(res, COOKIE_NAME, token, { maxAge: SESSION_HOURS * 3600, secure: isSecure(req) });
  return token;
}

function destroySession(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  clearCookie(res, COOKIE_NAME, req);
}

function currentSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const row = db.prepare(
    `SELECT s.id AS sid, s.expires_at, u.id, u.nome, u.email, u.role, u.ativo
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`
  ).get(sha256(token));
  if (!row) return null;
  if (new Date(row.expires_at) < new Date() || !row.ativo) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.sid);
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowISO(), row.sid);
  return { sid: row.sid, id: row.id, nome: row.nome, email: row.email, role: row.role };
}

function requireAuth(req, res, next) {
  const session = currentSession(req);
  if (!session) {
    return res.status(401).json({ error: { code: 'unauthenticated', message: 'Sessão expirada ou inexistente. Entre novamente.' } });
  }
  req.user = session;
  next();
}

/* --------------------------- chave de instalação --------------------------- */
const KEY_PATH = path.join(DATA_DIR, 'installation-key.txt');

function installationKey() {
  // FM_INSTALL_KEY: chave definida pelo dono na hospedagem (útil sem acesso ao terminal/log). Só serve antes do
  // primeiro administrador: depois disso a rota de configuração inicial fica fechada para sempre.
  const doAmbiente = String(process.env.FM_INSTALL_KEY || '').trim().toUpperCase();
  if (/^[A-Z0-9-]{12,64}$/.test(doAmbiente)) return doAmbiente;
  try {
    const existing = fs.readFileSync(KEY_PATH, 'utf8').trim();
    if (existing) return existing;
  } catch (err) { /* gera nova */ }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  const key = `FM-${block()}-${block()}`;
  fs.writeFileSync(KEY_PATH, `${key}\n`, { mode: 0o600 });
  return key;
}

/* ------------------------- limites de tentativas --------------------------- */
// Não há bloqueio permanente/temporário da CONTA (isso permitiria a qualquer pessoa trancar o administrador
// só conhecendo o e-mail). Os limites abaixo são por origem e respondem igual para e-mails existentes ou não.
const limiters = {
  loginIp: createLimiter({ max: 12, windowMs: 10 * 60 * 1000 }),      // falhas por IP
  loginPair: createLimiter({ max: 6, windowMs: 15 * 60 * 1000 }),     // falhas por IP + e-mail
  loginEmail: createLimiter({ max: 40, windowMs: 15 * 60 * 1000 }),   // retaguarda contra ataque distribuído
  sensitiveIp: createLimiter({ max: 10, windowMs: 15 * 60 * 1000 }),  // chave de instalação / código de recuperação
  passwordUser: createLimiter({ max: 8, windowMs: 15 * 60 * 1000 })   // senha atual errada ao trocar a senha (por usuário)
};

const emailKey = (email) => String(email || '').trim().toLowerCase().slice(0, 254);

function loginBlocked(ip, email) {
  const e = emailKey(email);
  return limiters.loginIp.isBlocked(ip) || limiters.loginPair.isBlocked(`${ip}|${e}`) || limiters.loginEmail.isBlocked(e);
}

function loginFailed(ip, email) {
  const e = emailKey(email);
  limiters.loginIp.fail(ip);
  limiters.loginPair.fail(`${ip}|${e}`);
  limiters.loginEmail.fail(e);
}

function loginSucceeded(ip, email) {
  limiters.loginPair.clear(`${ip}|${emailKey(email)}`);
}

const passwordBlocked = (userId) => limiters.passwordUser.isBlocked(String(userId));
const passwordFailed = (userId) => limiters.passwordUser.fail(String(userId));
const passwordOk = (userId) => limiters.passwordUser.clear(String(userId));

const sensitiveBlocked = (ip) => limiters.sensitiveIp.isBlocked(ip);
const sensitiveFailed = (ip) => limiters.sensitiveIp.fail(ip);

function checkInstallationKey(provided) {
  const a = Buffer.from(String(provided || '').trim().toUpperCase());
  const b = Buffer.from(installationKey());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordProblem(password) {
  const value = String(password || '');
  if (value.length < 10) return 'A senha deve ter no mínimo 10 caracteres.';
  if (value.length > 128) return 'A senha deve ter no máximo 128 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(value) || !/\d/.test(value)) return 'A senha deve combinar letras e números.';
  if (/^(.)\1+$/.test(value)) return 'Escolha uma senha menos previsível.';
  return null;
}

module.exports = {
  SESSION_HOURS,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  currentSession,
  requireAuth,
  countUsers,
  installationKey,
  KEY_PATH,
  DUMMY_HASH,
  loginBlocked,
  loginFailed,
  loginSucceeded,
  sensitiveBlocked,
  passwordBlocked,
  passwordFailed,
  passwordOk,
  sensitiveFailed,
  checkInstallationKey,
  passwordProblem,
  sha256,
  nowISO
};
