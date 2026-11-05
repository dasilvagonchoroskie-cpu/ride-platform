'use strict';
const { db } = require('../src/db');
const auth = require('../src/auth');

try {
  if (auth.countUsers() > 0) {
    console.error('A configuração inicial já foi concluída. Não existe chave de instalação ativa.');
    process.exitCode = 1;
  } else {
    console.log(`Chave de instalação: ${auth.installationKey()}`);
    console.log(`Arquivo: ${auth.KEY_PATH}`);
    console.log('Guarde essa chave fora do repositório e não a compartilhe publicamente.');
  }
} finally {
  db.close();
}
