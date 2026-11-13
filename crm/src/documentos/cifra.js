'use strict';
// Cifra dos documentos (M4): criptografia em ENVELOPE.
//  - Cada arquivo recebe uma chave própria aleatória (32 bytes) e é cifrado com AES-256-GCM (integridade embutida: qualquer
//    byte alterado no armazenamento faz a abertura falhar).
//  - A chave do arquivo é "embrulhada" (cifrada) com a chave mestra FM_DOCS_KEY (64 hex, fora do banco e do repositório) e só
//    o resultado embrulhado vai para o banco. Quem tiver só o banco, ou só o armazenamento, não lê nada.
//  - O contexto (AAD) amarra o conteúdo ao documento/versão: um arquivo copiado para outra versão não abre.
//  - Troca de chave mestra: FM_DOCS_KEY_ANTERIOR ainda abre o que foi embrulhado com a antiga.
// Sem FM_DOCS_KEY o módulo falha fechado (não grava nem lê).
const crypto = require('crypto');

const MAGIA = Buffer.from('FMD1');

function chaveMestra(nome = 'FM_DOCS_KEY') {
  const k = Buffer.from(String(process.env[nome] || ''), 'hex');
  return k.length === 32 ? k : null;
}
function derivar(mestra, rotulo) { return Buffer.from(crypto.hkdfSync('sha256', mestra, Buffer.alloc(0), Buffer.from(rotulo), 32)); }

function configurada() { return !!chaveMestra(); }
function exigir() {
  const k = chaveMestra();
  if (!k) throw Object.assign(new Error('Armazenamento de documentos indisponível: FM_DOCS_KEY não configurada.'), { code: 'sem_chave' });
  return k;
}

const contexto = (uid, numero) => Buffer.from(`fm-doc-v1|${uid}|${numero}`);

/** Cifra o conteúdo. Retorna { blob, chaveEmbrulhada } (blob = o que vai para o armazenamento). */
function cifrar(conteudo, uid, numero) {
  const mestra = exigir();
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', dek, iv);
  c.setAAD(contexto(uid, numero));
  const corpo = Buffer.concat([c.update(conteudo), c.final()]);
  const blob = Buffer.concat([MAGIA, iv, c.getAuthTag(), corpo]);
  const wiv = crypto.randomBytes(12);
  const w = crypto.createCipheriv('aes-256-gcm', derivar(mestra, 'fm-docs-embrulho-v1'), wiv);
  w.setAAD(contexto(uid, numero));
  const emb = Buffer.concat([w.update(dek), w.final()]);
  return { blob, chaveEmbrulhada: `K1.${Buffer.concat([wiv, w.getAuthTag(), emb]).toString('base64')}` };
}

function desembrulhar(chaveEmbrulhada, uid, numero) {
  const s = String(chaveEmbrulhada || '');
  if (!s.startsWith('K1.')) throw new Error('Chave de documento em formato desconhecido.');
  const buf = Buffer.from(s.slice(3), 'base64');
  const candidatas = [chaveMestra(), chaveMestra('FM_DOCS_KEY_ANTERIOR')].filter(Boolean);
  if (!candidatas.length) throw Object.assign(new Error('FM_DOCS_KEY não configurada.'), { code: 'sem_chave' });
  let erro = null;
  for (const mestra of candidatas) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', derivar(mestra, 'fm-docs-embrulho-v1'), buf.subarray(0, 12));
      d.setAAD(contexto(uid, numero));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
    } catch (e) { erro = e; }
  }
  throw Object.assign(new Error('Não foi possível abrir a chave do documento (chave mestra errada ou dado adulterado).'), { code: 'chave_invalida', causa: erro });
}

/** Abre o arquivo. Lança erro se a chave estiver errada ou se qualquer byte tiver sido alterado. */
function decifrar(blob, chaveEmbrulhada, uid, numero) {
  if (!Buffer.isBuffer(blob) || blob.length < 32 || !blob.subarray(0, 4).equals(MAGIA)) throw Object.assign(new Error('Arquivo de documento em formato desconhecido.'), { code: 'formato' });
  const dek = desembrulhar(chaveEmbrulhada, uid, numero);
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', dek, blob.subarray(4, 16));
    d.setAAD(contexto(uid, numero));
    d.setAuthTag(blob.subarray(16, 32));
    return Buffer.concat([d.update(blob.subarray(32)), d.final()]);
  } catch (e) { throw Object.assign(new Error('O arquivo não passou na verificação de integridade (alterado ou corrompido).'), { code: 'adulterado' }); }
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Cifra um texto qualquer com a chave mestra (manifesto de backup). */
function cifrarTexto(buf, rotulo) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', derivar(exigir(), 'fm-docs-manifesto-v1'), iv);
  c.setAAD(Buffer.from(rotulo));
  const corpo = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('FMM1'), iv, c.getAuthTag(), corpo]);
}
function decifrarTexto(buf, rotulo) {
  if (!buf.subarray(0, 4).equals(Buffer.from('FMM1'))) throw new Error('Manifesto em formato desconhecido.');
  const chaves = [chaveMestra(), chaveMestra('FM_DOCS_KEY_ANTERIOR')].filter(Boolean);
  for (const m of chaves) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', derivar(m, 'fm-docs-manifesto-v1'), buf.subarray(4, 16));
      d.setAAD(Buffer.from(rotulo)); d.setAuthTag(buf.subarray(16, 32));
      return Buffer.concat([d.update(buf.subarray(32)), d.final()]);
    } catch (e) { /* tenta a próxima */ }
  }
  throw new Error('Não consegui abrir o manifesto do backup (chave errada ou arquivo alterado).');
}

/** Impressão digital da chave mestra (não revela a chave): detecta troca por engano antes que os arquivos fiquem ilegíveis. */
function impressao(nome = 'FM_DOCS_KEY') {
  const k = chaveMestra(nome);
  return k ? crypto.createHmac('sha256', derivar(k, 'fm-docs-impressao')).update('fm-docs').digest('hex').slice(0, 24) : null;
}

module.exports = { cifrar, decifrar, sha256, configurada, cifrarTexto, decifrarTexto, impressao };
