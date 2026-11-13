'use strict';
// Cópia de segurança contínua e criptografada da pasta data/ num cofre externo (banco Supabase), para hospedagem com
// disco temporário (Render grátis apaga o disco a cada reinício, deploy ou hibernação).
//
// Como funciona:
//  1. Ao ligar (antes de abrir o banco), baixa o último retrato, decifra e restaura data/ (banco, sessão do WhatsApp,
//     chaves da IA). Se o cofre estiver configurado e NÃO responder, o CRM não sobe (fail-closed): subir vazio e
//     depois gravar por cima apagaria os dados de verdade.
//  2. Enquanto roda, a cada INTERVALO confere se algo mudou e, se mudou, envia um retrato novo.
//  3. Ao desligar (SIGTERM do Render), envia o último retrato antes de sair.
//
// Segurança: o retrato é compactado e cifrado aqui (AES-256-GCM, chave SNAPSHOT_KEY que só existe no servidor do CRM).
// O cofre só guarda texto cifrado. O acesso ao cofre exige SNAPSHOT_TOKEN (conferido por hash dentro do banco).
// "Dono": cada processo que liga assume o cofre; um processo antigo (ex.: durante um deploy) não grava por cima do novo.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const INTERVALO_MS = Number(process.env.SNAPSHOT_INTERVALO_MS) || 30000;
// Nunca vão para o retrato: biblioteca do WhatsApp (instalada no build), backups locais, os arquivos dos documentos (M4: têm
// armazenamento próprio, cifrado) e o banco em si (vai serializado).
const IGNORAR = /^(wa-lib|backups|documentos)(\/|$)|^crm\.db(-wal|-shm|-journal)?$|\.tmp$/;

function dirs() {
  const dataDir = process.env.FM_DATA_DIR ? path.resolve(process.env.FM_DATA_DIR) : path.join(ROOT, 'data');
  const dbPath = process.env.FM_DB_PATH ? path.resolve(process.env.FM_DB_PATH) : path.join(dataDir, 'crm.db');
  return { dataDir, dbPath };
}

function configurado() {
  return !!(process.env.SNAPSHOT_URL && process.env.SNAPSHOT_TOKEN && process.env.SNAPSHOT_KEY);
}

function chaveCifra() {
  const k = Buffer.from(String(process.env.SNAPSHOT_KEY || ''), 'hex');
  if (k.length !== 32) throw new Error('SNAPSHOT_KEY deve ter 64 caracteres hexadecimais (32 bytes).');
  return k;
}

function cifrar(buf, chave) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
  c.setAAD(Buffer.from('fm-crm-snapshot-v1'));
  const corpo = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('FMS1'), iv, c.getAuthTag(), corpo]).toString('base64');
}

function decifrar(b64, chave) {
  const buf = Buffer.from(String(b64), 'base64');
  if (buf.slice(0, 4).toString() !== 'FMS1') throw new Error('Retrato em formato desconhecido.');
  const iv = buf.slice(4, 16); const tag = buf.slice(16, 32); const corpo = buf.slice(32);
  const d = crypto.createDecipheriv('aes-256-gcm', chave, iv);
  d.setAAD(Buffer.from('fm-crm-snapshot-v1'));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(corpo), d.final()]);
}

function listarArquivos(base, rel = '') {
  const out = [];
  let itens = [];
  try { itens = fs.readdirSync(path.join(base, rel), { withFileTypes: true }); } catch (err) { return out; }
  for (const it of itens) {
    const r = rel ? `${rel}/${it.name}` : it.name;
    if (IGNORAR.test(r)) continue;
    if (it.isDirectory()) out.push(...listarArquivos(base, r));
    else if (it.isFile()) out.push(r);
  }
  return out;
}

// Caminho relativo seguro (sem "..", sem absoluto): o retrato vem de fora e nunca pode escrever fora de data/.
function relSeguro(r) {
  return typeof r === 'string' && r.length < 300 && !r.startsWith('/') && !r.includes('\\')
    && r.split('/').every((p) => p && p !== '.' && p !== '..') && !IGNORAR.test(r);
}

function criarCliente({ fetchImpl = globalThis.fetch } = {}) {
  const base = String(process.env.SNAPSHOT_URL || '').replace(/\/+$/, '');
  const anon = String(process.env.SNAPSHOT_ANON || '');
  const token = String(process.env.SNAPSHOT_TOKEN || '');
  async function rpc(fn, corpo) {
    const headers = { 'content-type': 'application/json', apikey: anon };
    if (/^eyJ/.test(anon)) headers.authorization = `Bearer ${anon}`;
    const controle = new AbortController();
    const t = setTimeout(() => controle.abort(), 30000);
    let r;
    try {
      r = await fetchImpl(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify({ p_token: token, ...corpo }), signal: controle.signal });
    } finally { clearTimeout(t); }
    const texto = await r.text();
    if (!r.ok) {
      const e = new Error(`cofre respondeu ${r.status}${/outro_dono/.test(texto) ? ' (outro_dono)' : ''}`);
      e.status = r.status; e.outroDono = /outro_dono/.test(texto);
      throw e;
    }
    return texto ? JSON.parse(texto) : null;
  }
  return {
    assumir: (dono) => rpc('crm_snapshot_assumir', { p_dono: dono }),
    gravar: (dono, dados) => rpc('crm_snapshot_gravar', { p_dono: dono, p_dados: dados })
  };
}

const DONO = `${process.env.RENDER_INSTANCE_ID || 'local'}-${crypto.randomBytes(6).toString('hex')}`;
const modoCopia = () => String(process.env.SNAPSHOT_MODO || '').trim().toLowerCase() === 'copia';
let cliente = null;
let ativo = false;
let perdeuDono = false;

// Passo 1: antes de abrir o banco.
async function restaurar({ log = console, fetchImpl } = {}) {
  if (!configurado()) return { usado: false };
  const chave = chaveCifra();
  cliente = criarCliente({ fetchImpl });
  const { dataDir, dbPath } = dirs();
  let r;
  try {
    r = await cliente.assumir(DONO);
  } catch (err) {
    throw new Error(`Não consegui falar com o cofre de dados (${err.message}). O CRM não vai subir vazio para não apagar os dados.`);
  }
  ativo = true;
  // Modo cópia (servidor com disco PERSISTENTE, ex.: VPS da Hostinger): se já existe banco local, ele é a fonte da verdade e o
  // cofre só recebe cópias cifradas (fora do servidor). Sem banco local (dia da migração), restaura do cofre uma vez.
  // Assumir o cofre faz o processo antigo (Render) parar de gravar; religar o Render traz de volta a última cópia (rollback).
  if (modoCopia() && fs.existsSync(dbPath)) {
    log.log('[cofre] modo cópia: usando os dados do disco local; o cofre recebe cópias cifradas.');
    return { usado: true, novo: false, local: true };
  }
  if (!r || !r.dados) { log.log('[cofre] nenhum retrato salvo ainda: instalação nova.'); return { usado: true, novo: true }; }
  // Troca de chave: se o retrato ainda estiver cifrado com a chave antiga (SNAPSHOT_KEY_ANTERIOR), abre com ela;
  // o próximo retrato já sai com a chave nova. Depois da troca, a variável antiga deve ser apagada.
  let bruto;
  try {
    bruto = decifrar(r.dados, chave);
  } catch (err) {
    const anterior = Buffer.from(String(process.env.SNAPSHOT_KEY_ANTERIOR || ''), 'hex');
    if (anterior.length !== 32) throw new Error('Não consegui decifrar o retrato do cofre com a chave atual.');
    bruto = decifrar(r.dados, anterior);
    log.log('[cofre] retrato aberto com a chave anterior; o próximo será gravado com a chave nova.');
  }
  const pacote = JSON.parse(zlib.gunzipSync(bruto).toString('utf8'));
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  for (const ext of ['', '-wal', '-shm', '-journal']) fs.rmSync(dbPath + ext, { force: true });
  if (pacote.db) fs.writeFileSync(dbPath, Buffer.from(pacote.db, 'base64'), { mode: 0o600 });
  let n = 0;
  for (const [rel, b64] of Object.entries(pacote.arquivos || {})) {
    if (!relSeguro(rel)) continue;
    const destino = path.join(dataDir, rel);
    fs.mkdirSync(path.dirname(destino), { recursive: true, mode: 0o700 });
    fs.writeFileSync(destino, Buffer.from(b64, 'base64'), { mode: 0o600 });
    n++;
  }
  log.log(`[cofre] dados restaurados (retrato v${r.versao}, ${n} arquivo(s), ${new Date(pacote.criado_em).toISOString()}).`);
  return { usado: true, novo: false, versao: r.versao };
}

// Passo 2: retratos periódicos. db = conexão better-sqlite3 já aberta.
function iniciar({ db, log = console }) {
  if (!ativo) return { parar: async () => {} };
  const chave = chaveCifra();
  const { dataDir } = dirs();
  let ultimaAssinatura = '';
  let ultimoHash = '';
  let enviando = null;

  const assinatura = () => {
    const changes = db.prepare('SELECT total_changes() AS n').get().n;
    const arqs = listarArquivos(dataDir).map((r) => { try { const s = fs.statSync(path.join(dataDir, r)); return `${r}:${s.size}:${s.mtimeMs}`; } catch (e) { return r; } });
    return `${changes}|${arqs.join(',')}`;
  };

  async function enviar(motivo) {
    if (perdeuDono) return;
    if (enviando) { await enviando.catch(() => {}); }
    const assin = assinatura();
    if (assin === ultimaAssinatura && motivo !== 'forcar') return;
    enviando = (async () => {
      const arquivos = {};
      for (const r of listarArquivos(dataDir)) { try { arquivos[r] = fs.readFileSync(path.join(dataDir, r)).toString('base64'); } catch (e) { /* sumiu no meio */ } }
      const dbBuf = db.serialize();
      const hash = crypto.createHash('sha256').update(dbBuf).update(JSON.stringify(arquivos)).digest('hex');
      if (hash === ultimoHash) { ultimaAssinatura = assin; return; }
      const pacote = Buffer.from(JSON.stringify({ v: 1, criado_em: Date.now(), db: dbBuf.toString('base64'), arquivos }));
      const dados = cifrar(zlib.gzipSync(pacote, { level: 6 }), chave);
      try {
        const r = await cliente.gravar(DONO, dados);
        ultimoHash = hash; ultimaAssinatura = assin;
        if (motivo !== 'periodico') log.log(`[cofre] retrato enviado (${motivo}, v${r && r.versao}, ${Math.round(dados.length / 1024)} KB).`);
      } catch (err) {
        if (err.outroDono) { perdeuDono = true; log.error('[cofre] outro processo assumiu o cofre (deploy novo?). Este processo para de gravar.'); return; }
        log.error(`[cofre] falha ao enviar retrato: ${err.message} (tento de novo em ${INTERVALO_MS / 1000}s)`);
      }
    })();
    return enviando;
  }

  const timer = setInterval(() => { enviar('periodico').catch(() => {}); }, INTERVALO_MS);
  if (timer.unref) timer.unref();
  log.log(`[cofre] retratos automáticos a cada ${INTERVALO_MS / 1000}s quando houver mudança.`);
  return {
    enviar,
    async parar() { clearInterval(timer); await enviar('desligando'); }
  };
}

module.exports = { restaurar, iniciar, configurado, cifrar, decifrar, relSeguro, criarCliente, _dirs: dirs };
