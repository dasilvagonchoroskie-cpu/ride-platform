'use strict';
// Ponto de entrada para hospedagem com disco temporário (Render). Restaura data/ do cofre ANTES de abrir o banco,
// sobe o CRM e liga os retratos automáticos. Sem as variáveis SNAPSHOT_*, é igual a "node server.js".
const persist = require('./src/persist');

(async () => {
  try {
    await persist.restaurar();
  } catch (err) {
    console.error(`[cofre] ${err.message}`);
    process.exit(1); // o Render tenta de novo; nunca sobe vazio por cima dos dados guardados
  }
  const { db } = require('./src/db');
  const { aoEncerrar } = require('./server');
  const cofre = persist.iniciar({ db });
  aoEncerrar(() => cofre.parar());

  // Trocar o e-mail de acesso sem entrar no CRM: FM_TROCAR_EMAIL="antigo@x.com>novo@y.com" (apagar a variável depois).
  if (process.env.FM_TROCAR_EMAIL) {
    const [antigo, novo] = String(process.env.FM_TROCAR_EMAIL).split('>').map((x) => String(x || '').trim().toLowerCase());
    const valido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
    if (!valido(antigo) || !valido(novo)) console.error('[e-mail de acesso] FM_TROCAR_EMAIL inválida (use antigo>novo).');
    else if (db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(novo)) console.log(`[e-mail de acesso] ${novo} já é o e-mail de acesso. Apague a variável FM_TROCAR_EMAIL.`);
    else {
      const u = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(antigo);
      if (!u) console.error(`[e-mail de acesso] nenhum usuário com ${antigo}.`);
      else {
        db.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?').run(novo, new Date().toISOString(), u.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
        db.prepare("INSERT INTO audit_log (user_id, user_nome, action, entity, entity_id, detail, ip, created_at) VALUES (NULL, 'Sistema', 'editar', 'users', ?, 'E-mail de acesso alterado pela variável FM_TROCAR_EMAIL', '', ?)").run(u.id, new Date().toISOString());
        console.log(`[e-mail de acesso] trocado para ${novo}. Entre com o e-mail novo e apague a variável FM_TROCAR_EMAIL.`);
      }
    }
  }

  // Recuperação de senha sem terminal: defina FM_RESET_EMAIL, reinicie, pegue o código no log e APAGUE a variável.
  if (process.env.FM_RESET_EMAIL) {
    const r = require('./src/reset').gerarCodigoRecuperacao(db, process.env.FM_RESET_EMAIL);
    if (r.erro) console.error(`[recuperação] ${r.erro}`);
    else {
      // Emergência (sem acesso ao e-mail nem ao autenticador): desliga também a verificação em duas etapas da conta.
      db.prepare('UPDATE users SET totp_ativo = 0, totp_segredo = NULL, totp_pendente = NULL, email_2fa = 0 WHERE lower(email) = ?').run(String(process.env.FM_RESET_EMAIL).trim().toLowerCase());
      console.log('[recuperação] verificação em duas etapas desligada para essa conta (ligue de novo em Configurações).');
    }
    if (!r.erro) console.log(`[recuperação] código de uso único (30 min) para ${process.env.FM_RESET_EMAIL}: ${r.token}\n[recuperação] link: ${r.link}\n[recuperação] apague a variável FM_RESET_EMAIL depois de usar.`);
  }
})();
