'use strict';
// Backup dos documentos: node scripts/docs-backup.js <pasta-de-destino>
// Copia os arquivos já cifrados + manifesto cifrado. Exige FM_DOCS_KEY (a mesma do servidor). Guarde a pasta FORA do servidor.
const { db, DATA_DIR } = require('../src/db');
const { criarDoAmbiente } = require('../src/documentos/armazenamento');
const m = require('../src/documentos/manutencao');
const destino = process.argv[2];
if (!destino) { console.error('Uso: node scripts/docs-backup.js <pasta-de-destino>'); process.exit(2); }
m.backup(db, criarDoAmbiente({ dataDir: DATA_DIR }), destino).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ausentes.length ? 1 : 0); }).catch((e) => { console.error(e.message); process.exit(1); });
