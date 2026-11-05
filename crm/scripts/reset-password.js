'use strict';
const { db } = require('../src/db');
const { gerarCodigoRecuperacao } = require('../src/reset');

try {
  const r = gerarCodigoRecuperacao(db, process.argv[2]);
  if (r.erro) {
    console.error(r.erro === 'E-mail inválido.' ? 'Uso: npm run reset -- usuario@exemplo.com' : r.erro);
    process.exitCode = 1;
  } else {
    console.log('Recuperação de senha (uso único, válida por 30 minutos).\n');
    console.log(`Link:\n${r.link}\n`);
    console.log(`Ou, na tela de login, "Esqueci minha senha" > "Já tenho o código", e cole:\n${r.token}\n`);
    console.log('Não envie por canais públicos.');
  }
} catch (err) {
  console.error('Não foi possível gerar o código:', err.message);
  process.exitCode = 1;
} finally {
  db.close();
}
