'use strict';
// Validação dos arquivos de documento (M4). Nunca confia no nome, na extensão nem no tipo declarado pelo navegador:
// o tipo vem do CONTEÚDO (assinatura dos primeiros bytes) e a extensão enviada tem que combinar com ele.
const TIPOS = {
  pdf: { mime: 'application/pdf', exts: ['pdf'] },
  jpg: { mime: 'image/jpeg', exts: ['jpg', 'jpeg'] },
  png: { mime: 'image/png', exts: ['png'] },
  webp: { mime: 'image/webp', exts: ['webp'] }
};

function detectarTipo(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

const maxBytes = () => Math.min(25, Math.max(1, Number(process.env.DOCS_MAX_MB) || 10)) * 1024 * 1024;

// PDF com ação automática, JavaScript, programa para abrir ou arquivo embutido não é aceito (defesa em profundidade; não
// substitui antivírus). Procura nas partes não compactadas do arquivo.
const PDF_ATIVO = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction|AA)\b/;

/** Nome só para exibir (nunca vira caminho nem cabeçalho): sem pastas, sem controle, até 80 caracteres. */
function nomeSeguro(nome) {
  let n = String(nome || '').normalize('NFC').split(/[\\/]/).pop();
  n = n.replace(/[\u0000-\u001f\u007f<>"|?*:]/g, '').replace(/\s+/g, ' ').trim();
  if (n.length > 80) { const m = /\.[A-Za-z0-9]{1,5}$/.exec(n); n = n.slice(0, 80 - (m ? m[0].length : 0)) + (m ? m[0] : ''); }
  return n || 'documento';
}

/** { ok, tipo, mime, ext } ou { ok:false, erro }. */
function validarArquivo(buf, nomeEnviado) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return { ok: false, erro: 'Nenhum arquivo foi enviado.' };
  if (buf.length > maxBytes()) return { ok: false, erro: `Arquivo maior que o limite de ${Math.round(maxBytes() / 1048576)} MB.` };
  const tipo = detectarTipo(buf);
  if (!tipo) return { ok: false, erro: 'Formato não aceito. Envie PDF, JPG, PNG ou WEBP.' };
  const ext = (/\.([A-Za-z0-9]{1,6})$/.exec(String(nomeEnviado || '')) || [])[1];
  if (!ext || !TIPOS[tipo].exts.includes(ext.toLowerCase())) return { ok: false, erro: `A extensão do arquivo não combina com o conteúdo (conteúdo: ${tipo.toUpperCase()}).` };
  if (tipo === 'pdf' && PDF_ATIVO.test(buf.toString('latin1'))) return { ok: false, erro: 'PDF com conteúdo ativo (JavaScript, ação automática ou anexo embutido) não é aceito.' };
  return { ok: true, tipo, mime: TIPOS[tipo].mime, ext: TIPOS[tipo].exts[0] };
}

module.exports = { validarArquivo, detectarTipo, nomeSeguro, maxBytes, TIPOS };
