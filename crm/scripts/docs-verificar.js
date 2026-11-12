'use strict';
// Verificação de integridade dos documentos: node scripts/docs-verificar.js
// Abre cada arquivo, confere tamanho e hash e lista arquivos órfãos (quando o armazenamento permite listar).
const { db, DATA_DIR } = require('../src/db');
const { criarDoAmbiente } = require('../src/documentos/armazenamento');
const m = require('../src/documentos/manutencao');
m.verificar(db, criarDoAmbiente({ dataDir: DATA_DIR })).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.integro ? 0 : 1); }).catch((e) => { console.error(e.message); process.exit(1); });
