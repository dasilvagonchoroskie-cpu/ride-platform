'use strict';
// Utilitários de teste: lê o PDF gerado pelo CRM e devolve o texto de cada página (sem depender de programas externos).
const zlib = require('zlib');

const CP1252 = { 128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 136: 'ˆ', 137: '‰', 138: 'Š', 139: '‹', 140: 'Œ', 142: 'Ž', 145: '‘', 146: '’', 147: '“', 148: '”', 149: '•', 150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›', 156: 'œ', 158: 'ž', 159: 'Ÿ' };
const decodeByte = (b) => CP1252[b] || String.fromCharCode(b);

function objetos(buf) {
  const txt = buf.toString('latin1');
  const out = new Map();
  const re = /(\d+) 0 obj\n/g;
  let m;
  while ((m = re.exec(txt))) {
    const ini = m.index + m[0].length;
    const fim = txt.indexOf('\nendobj', ini);
    out.set(Number(m[1]), { dic: txt.slice(ini, fim), ini, fim, offset: m.index });
  }
  return out;
}

/** Texto de cada página (strings do operador Tj, decodificadas de WinAnsi). */
function textoPorPagina(buf) {
  const obj = objetos(buf);
  const paginas = [];
  for (const [, o] of obj) {
    if (!/\/Type \/Page /.test(o.dic)) continue;
    const c = /\/Contents (\d+) 0 R/.exec(o.dic);
    const co = obj.get(Number(c[1]));
    const ini = buf.indexOf('stream\n', co.ini) + 7;
    const fim = buf.indexOf('\nendstream', ini);
    const ops = zlib.inflateSync(buf.subarray(ini, fim)).toString('latin1');
    const partes = [];
    for (const t of ops.matchAll(/<([0-9a-f]*)> Tj/g)) partes.push([...Buffer.from(t[1], 'hex')].map(decodeByte).join(''));
    paginas.push(partes.join('\n'));
  }
  return paginas;
}

/** Confere a estrutura: cabeçalho, %%EOF, tabela xref apontando para os objetos certos, contagem de páginas. */
function validar(buf) {
  const erros = [];
  const txt = buf.toString('latin1');
  if (!txt.startsWith('%PDF-1.')) erros.push('sem cabeçalho %PDF');
  if (!txt.trimEnd().endsWith('%%EOF')) erros.push('sem %%EOF');
  const sx = /startxref\n(\d+)\n/.exec(txt);
  if (!sx) return ['sem startxref'];
  const xr = txt.slice(Number(sx[1]));
  if (!xr.startsWith('xref')) erros.push('startxref não aponta para xref');
  const linhas = [...xr.matchAll(/(\d{10}) (\d{5}) ([nf]) /g)];
  linhas.forEach((l, i) => {
    if (l[3] !== 'n') return;
    if (!txt.slice(Number(l[1])).startsWith(`${i} 0 obj`)) erros.push(`xref do objeto ${i} errado`);
  });
  const paginas = (txt.match(/\/Type \/Page /g) || []).length;
  const n = /\/Count (\d+)/.exec(txt);
  if (!n || Number(n[1]) !== paginas) erros.push('contagem de páginas inconsistente');
  return { erros, paginas };
}

module.exports = { textoPorPagina, validar };
