'use strict';
// Código de recuperação de senha (uso único, 30 minutos). Usado pelo "npm run reset" e, em hospedagem sem terminal
// (Render grátis), pela variável FM_RESET_EMAIL ao ligar: o código sai só no log do servidor, visível ao dono da conta.
const crypto = require('crypto');
const { sha256 } = require('./auth');

function gerarCodigoRecuperacao(db, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { erro: 'E-mail inválido.' };
  const user = db.prepare('SELECT id, email FROM users WHERE lower(email) = ? AND ativo = 1').get(e);
  if (!user) return { erro: 'Usuário ativo não encontrado.' };
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(now.toISOString(), user.id);
  db.prepare('INSERT INTO password_resets (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(user.id, sha256(token), now.toISOString(), expires);
  const base = String(process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
  return { token, link: `${base}/reset?token=${token}` };
}

module.exports = { gerarCodigoRecuperacao };
