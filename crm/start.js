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
