'use strict';
// Restauração dos documentos: node scripts/docs-restaurar.js <pasta-do-backup>
// Devolve ao armazenamento os arquivos que faltam; recria os registros só se a tabela de documentos estiver vazia.
const { db, DATA_DIR } = require('../src/db');
const { criarDoAmbiente } = require('../src/documentos/armazenamento');
const m = require('../src/documentos/manutencao');
const origem = process.argv[2];
if (!origem) { console.error('Uso: node scripts/docs-restaurar.js <pasta-do-backup>'); process.exit(2); }
m.restaurar(db, criarDoAmbiente({ dataDir: DATA_DIR }), origem).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.verificacao.integro && !r.arquivos_corrompidos_no_backup.length ? 0 : 1); }).catch((e) => { console.error(e.message); process.exit(1); });
