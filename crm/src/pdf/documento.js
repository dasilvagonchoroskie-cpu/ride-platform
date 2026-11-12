'use strict';
// Escritor de PDF mínimo, sem dependências (só zlib do Node). Gera PDF 1.4 com:
// - fontes padrão Helvetica e Helvetica-Bold (não precisam ser embutidas) em WinAnsi, que cobre o português;
// - texto, retângulos, linhas e imagens PNG (RGB/RGBA 8 bits, com transparência via SMask);
// - várias páginas; coordenadas a partir do canto SUPERIOR esquerdo, em pontos (1 pt = 1/72 pol).
// Caracteres fora do WinAnsi (emoji etc.) são removidos ou trocados pela letra sem acento.
const zlib = require('zlib');
const { HELVETICA, HELVETICA_NEGRITO, WIN_ANSI } = require('./metricas');

const TAMANHOS = { A4: [595.28, 841.89] };

/** Texto → bytes WinAnsi (cp1252). */
function paraWinAnsi(texto) {
  const s = String(texto === null || texto === undefined ? '' : texto);
  const bytes = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp === 9 || cp === 10 || cp === 13) { bytes.push(32); continue; }
    if (cp < 32 || cp === 127) continue;
    if (cp < 127 || (cp >= 160 && cp <= 255)) { bytes.push(cp); continue; }
    if (Object.prototype.hasOwnProperty.call(WIN_ANSI, cp)) { bytes.push(WIN_ANSI[cp]); continue; }
    if (cp === 0x2010 || cp === 0x2011 || cp === 0x2012) { bytes.push(45); continue; }
    if (cp === 0x2022 || cp === 0x25cf) { bytes.push(149); continue; }
    // Letra acentuada fora do WinAnsi: tenta a forma sem acento; emoji e símbolos somem.
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (base && base !== ch && [...base].every((c) => c.codePointAt(0) < 256)) { for (const c of base) bytes.push(c.codePointAt(0)); }
  }
  return Buffer.from(bytes);
}

function larguraBytes(bytes, tamanho, negrito) {
  const tabela = negrito ? HELVETICA_NEGRITO : HELVETICA;
  let soma = 0;
  for (const b of bytes) soma += tabela[b] || 0;
  return (soma * tamanho) / 1000;
}

const larguraTexto = (texto, tamanho, negrito) => larguraBytes(paraWinAnsi(texto), tamanho, negrito);

/** Quebra o texto em linhas que cabem na largura (por palavras; palavra longa demais é cortada). */
function quebrarLinhas(texto, largura, tamanho, negrito) {
  const linhas = [];
  const paragrafos = String(texto === null || texto === undefined ? '' : texto).split(/\r?\n/);
  for (const par of paragrafos) {
    const palavras = par.split(/\s+/).filter(Boolean);
    if (!palavras.length) { linhas.push(''); continue; }
    let atual = '';
    for (let p of palavras) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (larguraTexto(tentativa, tamanho, negrito) <= largura) { atual = tentativa; continue; }
      if (atual) { linhas.push(atual); atual = ''; }
      // Palavra maior que a linha: corta em pedaços.
      while (larguraTexto(p, tamanho, negrito) > largura && p.length > 1) {
        let n = p.length - 1;
        while (n > 1 && larguraTexto(p.slice(0, n), tamanho, negrito) > largura) n--;
        linhas.push(p.slice(0, n));
        p = p.slice(n);
      }
      atual = p;
    }
    linhas.push(atual);
  }
  return linhas;
}

/** Corta o texto para caber na largura, terminando com reticências. */
function cortar(texto, largura, tamanho, negrito) {
  const s = String(texto || '');
  if (larguraTexto(s, tamanho, negrito) <= largura) return s;
  let n = s.length;
  while (n > 0 && larguraTexto(`${s.slice(0, n).trimEnd()}…`, tamanho, negrito) > largura) n--;
  return n > 0 ? `${s.slice(0, n).trimEnd()}…` : '';
}

/* ---------------------------------- PNG ---------------------------------- */
function paeth(a, b, c) {
  const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Lê um PNG 8 bits (cinza, cinza+alfa, RGB ou RGBA, sem entrelaçamento). Devolve { largura, altura, rgb, alfa }. */
function lerPng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG inválido');
  let pos = 8; let largura = 0; let altura = 0; let profundidade = 0; let tipo = 0; let entrelacado = 0;
  const dados = [];
  while (pos + 8 <= buf.length) {
    const tam = buf.readUInt32BE(pos); const nome = buf.toString('ascii', pos + 4, pos + 8);
    const corpo = buf.subarray(pos + 8, pos + 8 + tam);
    if (nome === 'IHDR') {
      largura = corpo.readUInt32BE(0); altura = corpo.readUInt32BE(4); profundidade = corpo[8]; tipo = corpo[9]; entrelacado = corpo[12];
    } else if (nome === 'IDAT') dados.push(corpo);
    else if (nome === 'IEND') break;
    pos += 12 + tam;
  }
  const canais = { 0: 1, 2: 3, 4: 2, 6: 4 }[tipo];
  if (profundidade !== 8 || !canais || entrelacado || !largura || !altura || largura > 4096 || altura > 4096) throw new Error('Formato de PNG não suportado');
  const bruto = zlib.inflateSync(Buffer.concat(dados));
  const linha = largura * canais;
  const px = Buffer.alloc(linha * altura);
  for (let y = 0; y < altura; y++) {
    const filtro = bruto[y * (linha + 1)];
    const ini = y * (linha + 1) + 1;
    for (let x = 0; x < linha; x++) {
      const raw = bruto[ini + x];
      const a = x >= canais ? px[y * linha + x - canais] : 0;
      const b = y > 0 ? px[(y - 1) * linha + x] : 0;
      const c = x >= canais && y > 0 ? px[(y - 1) * linha + x - canais] : 0;
      let v;
      if (filtro === 0) v = raw; else if (filtro === 1) v = raw + a; else if (filtro === 2) v = raw + b;
      else if (filtro === 3) v = raw + ((a + b) >> 1); else if (filtro === 4) v = raw + paeth(a, b, c);
      else throw new Error('Filtro de PNG inválido');
      px[y * linha + x] = v & 255;
    }
  }
  const total = largura * altura;
  const rgb = Buffer.alloc(total * 3);
  const temAlfa = canais === 2 || canais === 4;
  const alfa = temAlfa ? Buffer.alloc(total) : null;
  for (let i = 0; i < total; i++) {
    const o = i * canais;
    if (canais >= 3) { rgb[i * 3] = px[o]; rgb[i * 3 + 1] = px[o + 1]; rgb[i * 3 + 2] = px[o + 2]; } else { rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = px[o]; }
    if (temAlfa) alfa[i] = px[o + canais - 1];
  }
  return { largura, altura, rgb, alfa };
}

/* -------------------------------- documento ------------------------------- */
const num = (n) => {
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isFinite(v) ? String(v) : '0';
};
function cor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')) || [null, '000000'];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => num(c / 255)).join(' ');
}
const hexStr = (bytes) => `<${bytes.toString('hex')}>`;
function textoInfo(s) { // texto do dicionário Info em UTF-16BE (aceita qualquer caractere)
  const b = Buffer.from(String(s || ''), 'utf16le');
  for (let i = 0; i < b.length; i += 2) { const t = b[i]; b[i] = b[i + 1]; b[i + 1] = t; }
  return `<feff${b.toString('hex')}>`;
}
function dataPdf(d) {
  // Horário de Fortaleza (UTC-3, sem horário de verão).
  const l = new Date(d.getTime() - 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `D:${l.getUTCFullYear()}${p(l.getUTCMonth() + 1)}${p(l.getUTCDate())}${p(l.getUTCHours())}${p(l.getUTCMinutes())}${p(l.getUTCSeconds())}-03'00'`;
}

class DocumentoPdf {
  constructor({ paisagem = false } = {}) {
    const [w, h] = TAMANHOS.A4;
    this.largura = paisagem ? h : w;
    this.altura = paisagem ? w : h;
    this.paginas = [];
    this.imagens = [];
    this.atual = null;
  }

  novaPagina() { this.atual = { ops: [] }; this.paginas.push(this.atual); return this.paginas.length - 1; }
  irPara(i) { this.atual = this.paginas[i]; }
  op(s) { if (!this.atual) this.novaPagina(); this.atual.ops.push(s); }

  retangulo(x, y, w, h, { preencher, contorno, espessura = 0.6 } = {}) {
    if (!preencher && !contorno) return;
    const partes = ['q'];
    if (preencher) partes.push(`${cor(preencher)} rg`);
    if (contorno) partes.push(`${cor(contorno)} RG ${num(espessura)} w`);
    partes.push(`${num(x)} ${num(this.altura - y - h)} ${num(w)} ${num(h)} re ${preencher && contorno ? 'B' : preencher ? 'f' : 'S'} Q`);
    this.op(partes.join(' '));
  }

  linha(x1, y1, x2, y2, { cor: c = '#000000', espessura = 0.6 } = {}) {
    this.op(`q ${cor(c)} RG ${num(espessura)} w ${num(x1)} ${num(this.altura - y1)} m ${num(x2)} ${num(this.altura - y2)} l S Q`);
  }

  /** Texto numa linha. y = topo da linha. alinhar: esquerda | direita | centro (relativo a x e largura). */
  texto(s, x, y, { tamanho = 10, negrito = false, cor: c = '#101c2e', alinhar = 'esquerda', largura = 0 } = {}) {
    const bytes = paraWinAnsi(s);
    if (!bytes.length) return;
    let px = x;
    if (alinhar !== 'esquerda' && largura) {
      const w = larguraBytes(bytes, tamanho, negrito);
      px = alinhar === 'direita' ? x + largura - w : x + (largura - w) / 2;
    }
    const base = this.altura - y - tamanho * 0.8;
    this.op(`BT /${negrito ? 'F2' : 'F1'} ${num(tamanho)} Tf ${cor(c)} rg ${num(px)} ${num(base)} Td ${hexStr(bytes)} Tj ET`);
  }

  /** Registra uma imagem PNG (Buffer) e devolve o identificador para desenhar. */
  registrarImagem(png) {
    const img = lerPng(png);
    this.imagens.push(img);
    return this.imagens.length - 1;
  }

  imagem(id, x, y, w, h) {
    this.op(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.altura - y - h)} cm /Im${id + 1} Do Q`);
  }

  /** Monta o arquivo. */
  gerar({ titulo = '', autor = '', assunto = '', data = new Date() } = {}) {
    if (!this.paginas.length) this.novaPagina();
    const objetos = []; // cada item: Buffer com o conteúdo do objeto (sem "n 0 obj")
    const reservar = () => { objetos.push(null); return objetos.length; };
    const definir = (n, conteudo) => { objetos[n - 1] = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'latin1'); };
    const fluxo = (dic, dados) => Buffer.concat([Buffer.from(`<< ${dic} /Length ${dados.length} >>\nstream\n`, 'latin1'), dados, Buffer.from('\nendstream', 'latin1')]);

    const catalogo = reservar();
    const paginasN = reservar();
    const f1 = reservar(); definir(f1, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = reservar(); definir(f2, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const imgs = this.imagens.map((img) => {
      let smask = '';
      if (img.alfa) {
        const s = reservar();
        definir(s, fluxo(`/Type /XObject /Subtype /Image /Width ${img.largura} /Height ${img.altura} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, zlib.deflateSync(img.alfa)));
        smask = ` /SMask ${s} 0 R`;
      }
      const n = reservar();
      definir(n, fluxo(`/Type /XObject /Subtype /Image /Width ${img.largura} /Height ${img.altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smask}`, zlib.deflateSync(img.rgb)));
      return n;
    });
    const xobj = imgs.length ? ` /XObject << ${imgs.map((n, i) => `/Im${i + 1} ${n} 0 R`).join(' ')} >>` : '';
    const recursos = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj} /ProcSet [/PDF /Text /ImageB /ImageC] >>`;
    const kids = this.paginas.map((p) => {
      const c = reservar();
      definir(c, fluxo('/Filter /FlateDecode', zlib.deflateSync(Buffer.from(p.ops.join('\n'), 'latin1'))));
      const n = reservar();
      definir(n, `<< /Type /Page /Parent ${paginasN} 0 R /MediaBox [0 0 ${num(this.largura)} ${num(this.altura)}] /Resources ${recursos} /Contents ${c} 0 R >>`);
      return n;
    });
    definir(paginasN, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`);
    definir(catalogo, `<< /Type /Catalog /Pages ${paginasN} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`);
    const info = reservar();
    definir(info, `<< /Title ${textoInfo(titulo)} /Author ${textoInfo(autor)} /Subject ${textoInfo(assunto)} /Producer ${textoInfo('CRM Fortaleza Move')} /Creator ${textoInfo('CRM Fortaleza Move')} /CreationDate (${dataPdf(data)}) >>`);

    const partes = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    let pos = partes[0].length;
    const offsets = [];
    objetos.forEach((conteudo, i) => {
      offsets.push(pos);
      const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), conteudo, Buffer.from('\nendobj\n', 'latin1')]);
      partes.push(b); pos += b.length;
    });
    const xref = [`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
    partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(partes);
  }
}

module.exports = { DocumentoPdf, paraWinAnsi, larguraTexto, quebrarLinhas, cortar, lerPng };
