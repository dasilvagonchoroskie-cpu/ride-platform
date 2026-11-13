'use strict';
// Armazenamento PRIVADO dos arquivos de documento (M4), já cifrados por cifra.js. Interface única; o resto do CRM não sabe onde
// os bytes ficam. Nunca há URL pública: o arquivo só sai por uma rota autenticada do CRM, que confere permissão e registra o acesso.
//
//   local     pasta no servidor (DOCS_DIR, padrão data/documentos; fora do retrato do cofre). Só vale como armazenamento
//             DEFINITIVO se o disco for persistente (VPS/volume). Em hospedagem de disco temporário (Render grátis), o CRM
//             RECUSA gravar documentos a menos que o dono declare FM_DOCS_LOCAL_PERSISTENTE=1.
//   supabase  Supabase Storage, bucket PRIVADO, pela API HTTPS com a chave de serviço (DOCS_SUPABASE_URL, DOCS_SUPABASE_KEY,
//             DOCS_SUPABASE_BUCKET). O provedor só recebe texto cifrado.
// A escolha do armazenamento definitivo é decisão pendente do dono (ver PENDENCIAS.md).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHAVE_OK = /^\d{4}\/\d{2}\/[a-f0-9]{32}\.bin$/;
/** Nome interno: ano/mês/aleatório. Nunca usa nome enviado pelo usuário. */
function novaChave(agora = new Date()) {
  return `${agora.toISOString().slice(0, 4)}/${agora.toISOString().slice(5, 7)}/${crypto.randomBytes(16).toString('hex')}.bin`;
}
const exigirChave = (c) => { if (!CHAVE_OK.test(String(c))) throw new Error('Nome interno de arquivo inválido.'); return c; };

function efemero(env = process.env) {
  const emHospedagem = !!env.RENDER || env.NODE_ENV === 'production';
  return emHospedagem && env.FM_DOCS_LOCAL_PERSISTENTE !== '1';
}

function criarLocal({ dir, env = process.env }) {
  const raiz = path.resolve(dir);
  const caminho = (chave) => path.join(raiz, ...exigirChave(chave).split('/'));
  return {
    nome: 'local',
    pronto() {
      if (efemero(env)) return { ok: false, motivo: 'Armazenamento em disco local não é definitivo nesta hospedagem (disco temporário). Configure o armazenamento definitivo ou declare FM_DOCS_LOCAL_PERSISTENTE=1 se o disco for persistente.' };
      return { ok: true };
    },
    async gravar(chave, buf) {
      const destino = caminho(chave);
      fs.mkdirSync(path.dirname(destino), { recursive: true, mode: 0o700 });
      const tmp = `${destino}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, buf, { mode: 0o600, flag: 'wx' });
      // link falha se o destino já existe: um arquivo guardado nunca é sobrescrito (versões são imutáveis).
      try { fs.linkSync(tmp, destino); } finally { fs.rmSync(tmp, { force: true }); }
    },
    async ler(chave) {
      try { return fs.readFileSync(caminho(chave)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async remover(chave) { fs.rmSync(caminho(chave), { force: true }); },
    async existe(chave) { return fs.existsSync(caminho(chave)); },
    /** Chaves presentes (para procurar arquivos órfãos). */
    async listar() {
      const out = [];
      const visita = (rel) => {
        let itens = [];
        try { itens = fs.readdirSync(path.join(raiz, rel), { withFileTypes: true }); } catch (e) { return; }
        for (const it of itens) {
          const r = rel ? `${rel}/${it.name}` : it.name;
          if (it.isDirectory()) visita(r); else if (CHAVE_OK.test(r)) out.push(r);
        }
      };
      visita('');
      return out;
    }
  };
}

function criarSupabase({ url, chave, bucket, fetchImpl = globalThis.fetch }) {
  const base = String(url || '').replace(/\/+$/, '');
  const cab = () => ({ apikey: chave, authorization: `Bearer ${chave}` });
  const rota = (c) => `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${exigirChave(c).split('/').map(encodeURIComponent).join('/')}`;
  async function chamar(u, opcoes) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 60000);
    try { return await fetchImpl(u, { ...opcoes, signal: ctl.signal }); } finally { clearTimeout(t); }
  }
  return {
    nome: 'supabase',
    pronto() {
      return base && chave && bucket ? { ok: true } : { ok: false, motivo: 'Supabase Storage não configurado (DOCS_SUPABASE_URL, DOCS_SUPABASE_KEY, DOCS_SUPABASE_BUCKET).' };
    },
    async gravar(c, buf) {
      const r = await chamar(rota(c), { method: 'POST', headers: { ...cab(), 'content-type': 'application/octet-stream', 'x-upsert': 'false' }, body: buf });
      if (!r.ok) throw new Error(`armazenamento respondeu ${r.status} ao gravar`);
    },
    async ler(c) {
      const r = await chamar(rota(c), { method: 'GET', headers: cab() });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error(`armazenamento respondeu ${r.status} ao ler`);
      return Buffer.from(await r.arrayBuffer());
    },
    async remover(c) {
      const r = await chamar(rota(c), { method: 'DELETE', headers: cab() });
      if (!r.ok && r.status !== 404) throw new Error(`armazenamento respondeu ${r.status} ao remover`);
    },
    async existe(c) { return (await this.ler(c)) !== null; },
    async listar() { return null; } // não listamos o bucket: o backup e a verificação partem do banco
  };
}

/** Escolhe o armazenamento pelas variáveis de ambiente (DOCS_STORAGE=local|supabase; padrão local). */
function criarDoAmbiente({ dataDir, env = process.env, fetchImpl } = {}) {
  const tipo = String(env.DOCS_STORAGE || 'local').toLowerCase();
  if (tipo === 'supabase') return criarSupabase({ url: env.DOCS_SUPABASE_URL, chave: env.DOCS_SUPABASE_KEY, bucket: env.DOCS_SUPABASE_BUCKET, fetchImpl });
  return criarLocal({ dir: env.DOCS_DIR ? env.DOCS_DIR : path.join(dataDir, 'documentos'), env });
}

module.exports = { criarLocal, criarSupabase, criarDoAmbiente, novaChave, CHAVE_OK, efemero };
