'use strict';
// Manutenção dos documentos (M4): verificar integridade, fazer backup e restaurar. Funciona com qualquer armazenamento.
//
// BACKUP  = pasta com os arquivos JÁ CIFRADOS (cópia exata do que está no armazenamento) + manifesto cifrado com a chave mestra
//           (tabelas documentos, documento_versoes e documento_eventos). Sem a chave FM_DOCS_KEY o backup não abre: guarde a
//           chave FORA do servidor e FORA do backup.
// RESTAURAR = devolve ao armazenamento os arquivos que faltam e, se o banco perdeu os registros (tabela vazia), recria os registros
//           a partir do manifesto. Nunca sobrescreve arquivo nem registro que já existe. Termina verificando a integridade.
const fs = require('fs');
const path = require('path');
const cifra = require('./cifra');
const { CHAVE_OK } = require('./armazenamento');

/** Confere TODAS as versões com arquivo: existe, abre e tem o mesmo tamanho e hash. */
async function verificar(db, armazenamento) {
  const versoes = db.prepare(`SELECT v.*, d.uid FROM documento_versoes v JOIN documentos d ON d.id = v.documento_id WHERE v.arquivo_removido_em IS NULL ORDER BY v.id`).all();
  const problemas = [];
  let ok = 0;
  for (const v of versoes) {
    try {
      const bruto = await armazenamento.ler(v.chave_armazenamento);
      if (!bruto) { problemas.push({ documento_id: v.documento_id, versao: v.numero, problema: 'arquivo ausente' }); continue; }
      const c = cifra.decifrar(bruto, v.chave_embrulhada, v.uid, v.numero);
      if (c.length !== v.tamanho || cifra.sha256(c) !== v.sha256) problemas.push({ documento_id: v.documento_id, versao: v.numero, problema: 'hash ou tamanho diferente' });
      else ok++;
    } catch (e) { problemas.push({ documento_id: v.documento_id, versao: v.numero, problema: e.code || e.message }); }
  }
  let orfaos = null;
  const lista = await armazenamento.listar();
  if (Array.isArray(lista)) {
    const conhecidas = new Set(db.prepare('SELECT chave_armazenamento FROM documento_versoes').all().map((r) => r.chave_armazenamento));
    orfaos = lista.filter((k) => !conhecidas.has(k));
  }
  return { total: versoes.length, ok, problemas, orfaos, integro: problemas.length === 0 };
}

async function backup(db, armazenamento, destino) {
  const raiz = path.resolve(destino);
  fs.mkdirSync(path.join(raiz, 'blobs'), { recursive: true, mode: 0o700 });
  const versoes = db.prepare('SELECT * FROM documento_versoes ORDER BY id').all();
  const copiados = []; const ausentes = []; let jaExistiam = 0;
  const blobs = {};
  for (const v of versoes) {
    if (v.arquivo_removido_em) continue;
    const alvo = path.join(raiz, 'blobs', ...v.chave_armazenamento.split('/'));
    const bruto = await armazenamento.ler(v.chave_armazenamento);
    if (!bruto) { ausentes.push(v.chave_armazenamento); continue; }
    blobs[v.chave_armazenamento] = cifra.sha256(bruto);
    if (fs.existsSync(alvo) && cifra.sha256(fs.readFileSync(alvo)) === blobs[v.chave_armazenamento]) { jaExistiam++; continue; }
    fs.mkdirSync(path.dirname(alvo), { recursive: true, mode: 0o700 });
    fs.writeFileSync(alvo, bruto, { mode: 0o600 });
    copiados.push(v.chave_armazenamento);
  }
  const manifesto = {
    formato: 1, criado_em: new Date().toISOString(), blobs,
    documentos: db.prepare('SELECT * FROM documentos ORDER BY id').all(),
    versoes, eventos: db.prepare('SELECT * FROM documento_eventos ORDER BY id').all()
  };
  fs.writeFileSync(path.join(raiz, 'manifesto.enc'), cifra.cifrarTexto(Buffer.from(JSON.stringify(manifesto)), 'fm-docs-backup-v1'), { mode: 0o600 });
  return { destino: raiz, documentos: manifesto.documentos.length, versoes: versoes.length, copiados: copiados.length, ja_existiam: jaExistiam, ausentes };
}

async function restaurar(db, armazenamento, origem) {
  const raiz = path.resolve(origem);
  const arq = path.join(raiz, 'manifesto.enc');
  if (!fs.existsSync(arq)) throw new Error('manifesto.enc não encontrado na pasta de backup.');
  const m = JSON.parse(cifra.decifrarTexto(fs.readFileSync(arq), 'fm-docs-backup-v1').toString('utf8'));
  const resumo = { arquivos_restaurados: 0, arquivos_ja_existiam: 0, arquivos_corrompidos_no_backup: [], registros_recriados: false, documentos_faltando_no_banco: 0 };
  for (const [chave, hash] of Object.entries(m.blobs || {})) {
    if (!CHAVE_OK.test(chave)) continue;
    if (await armazenamento.existe(chave)) { resumo.arquivos_ja_existiam++; continue; }
    const origemBlob = path.join(raiz, 'blobs', ...chave.split('/'));
    if (!fs.existsSync(origemBlob)) { resumo.arquivos_corrompidos_no_backup.push(chave); continue; }
    const bruto = fs.readFileSync(origemBlob);
    if (cifra.sha256(bruto) !== hash) { resumo.arquivos_corrompidos_no_backup.push(chave); continue; }
    await armazenamento.gravar(chave, bruto);
    resumo.arquivos_restaurados++;
  }
  const vazio = db.prepare('SELECT COUNT(*) n FROM documentos').get().n === 0;
  if (vazio && m.documentos.length) {
    db.transaction(() => {
      const ins = (tabela, linhas) => {
        for (const l of linhas) {
          const cols = Object.keys(l);
          db.prepare(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => l[c]));
        }
      };
      ins('documentos', m.documentos); ins('documento_versoes', m.versoes); ins('documento_eventos', m.eventos);
    })();
    resumo.registros_recriados = true;
  } else {
    const uids = new Set(db.prepare('SELECT uid FROM documentos').all().map((r) => r.uid));
    resumo.documentos_faltando_no_banco = m.documentos.filter((d) => !uids.has(d.uid)).length;
  }
  resumo.verificacao = await verificar(db, armazenamento);
  return resumo;
}

module.exports = { verificar, backup, restaurar };
