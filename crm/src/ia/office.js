'use strict';
// Extrai o texto de documentos do Office (Word .docx, Excel .xlsx, PowerPoint .pptx) sem dependências:
// esses arquivos são ZIPs com XML dentro. Proteções: limites de tamanho (contra "zip bomb") e nada é executado.
const zlib = require('zlib');

const MAX_DESCOMPACTADO = 25 * 1024 * 1024;

function lerZip(buf, filtro) {
  const arquivos = new Map();
  // Fim do diretório central (EOCD): procura de trás para frente.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo não é um documento do Office válido.');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let usado = 0;
  for (let n = 0; n < total && p + 46 <= buf.length; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const tamReal = buf.readUInt32LE(p + 24);
    const lenNome = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30);
    const lenComent = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.slice(p + 46, p + 46 + lenNome).toString('utf8');
    p += 46 + lenNome + lenExtra + lenComent;
    if (!filtro(nome)) continue;
    if (usado + tamReal > MAX_DESCOMPACTADO) throw new Error('Documento grande demais.');
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.slice(ini, ini + tamComp);
    let conteudo;
    if (metodo === 0) conteudo = dados;
    else if (metodo === 8) conteudo = zlib.inflateRawSync(dados, { maxOutputLength: MAX_DESCOMPACTADO - usado });
    else continue;
    usado += conteudo.length;
    arquivos.set(nome, conteudo.toString('utf8'));
  }
  return arquivos;
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENTIDADES[e.toLowerCase()] || m;
});
const textosDe = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))].map((m) => decodificar(m[1]));
const ordemNumerica = (a, b) => a.localeCompare(b, 'en', { numeric: true });

function extrairTextoOffice(buf, nomeArquivo = '') {
  const ext = (String(nomeArquivo).toLowerCase().match(/\.(docx|xlsx|pptx)$/) || [])[1];
  if (ext === 'docx' || (!ext && buf.includes('word/document.xml'))) {
    const a = lerZip(buf, (n) => n === 'word/document.xml');
    const xml = a.get('word/document.xml') || '';
    return xml.split(/<\/w:p>/).map((par) => textosDe(par, 'w:t').join('')).filter((l) => l.trim()).join('\n');
  }
  if (ext === 'xlsx' || (!ext && buf.includes('xl/workbook.xml'))) {
    const a = lerZip(buf, (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    const compartilhados = a.has('xl/sharedStrings.xml') ? a.get('xl/sharedStrings.xml').split(/<\/si>/).map((si) => textosDe(si, 't').join('')) : [];
    const linhas = [];
    for (const nome of [...a.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort(ordemNumerica)) {
      linhas.push(`# ${nome.replace(/^.*\/(sheet\d+)\.xml$/, '$1')}`);
      for (const row of a.get(nome).split(/<\/row>/)) {
        const celulas = [...row.matchAll(/<c\b([^>]*)>(.*?)<\/c>/g)].map(([, attrs, corpo]) => {
          const v = (corpo.match(/<v>([^<]*)<\/v>/) || [])[1];
          if (/t="s"/.test(attrs) && v !== undefined) return compartilhados[Number(v)] || '';
          if (/t="inlineStr"/.test(attrs)) return textosDe(corpo, 't').join('');
          return v !== undefined ? decodificar(v) : '';
        }).filter((x) => x !== '');
        if (celulas.length) linhas.push(celulas.join(' | '));
      }
    }
    return linhas.join('\n');
  }
  if (ext === 'pptx' || (!ext && buf.includes('ppt/presentation.xml'))) {
    const a = lerZip(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    return [...a.keys()].sort(ordemNumerica).map((n, i) => `# Slide ${i + 1}\n${textosDe(a.get(n), 'a:t').join(' ')}`).join('\n');
  }
  throw new Error('Formato do Office não reconhecido.');
}

module.exports = { extrairTextoOffice, lerZip };
