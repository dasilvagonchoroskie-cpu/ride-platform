#!/usr/bin/env node
'use strict';
// Uso: node scripts/simular-migracao.js [caminho/do/crm.db]
// Lê o banco SÓ PARA LEITURA, faz uma cópia em memória e aplica as migrações da Etapa 2 nela. O original não muda.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { simular } = require('../src/migracoes/simular');

const arq = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'crm.db'));
if (!fs.existsSync(arq)) { console.error(`Banco não encontrado: ${arq}`); process.exit(1); }
const origem = new Database(arq, { readonly: true, fileMustExist: true });
const buf = origem.serialize();
origem.close();
const r = simular(buf, { log: { log: (...a) => console.error(...a) } }); // registros no stderr; o relatório (JSON) no stdout
console.log(JSON.stringify({
  arquivo: arq, erro: r.erro, registros_antigos_inalterados: r.inalteradas,
  contagens_antes: r.antes.contagens, contagens_depois: r.depois.contagens, novas_tabelas: r.novas,
  migracoes: r.depois.estado, integridade: r.depois.integridade,
  duplicados: { total_grupos: r.duplicados.total_grupos, grupos: r.duplicados.grupos }
}, null, 2));
process.exit(r.erro || !r.inalteradas ? 2 : 0);
