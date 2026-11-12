'use strict';
// Layout padrão dos relatórios em PDF do CRM (identidade visual da Fortaleza Move).
// Recebe uma descrição pura do relatório (sem banco, sem HTTP) e devolve o Buffer do PDF:
//
// gerarRelatorio({
//   titulo, subtitulo, paisagem, org: { nome, slogan }, logo (Buffer PNG, opcional),
//   filtros: [[rótulo, valor], ...],
//   blocos: [
//     { tipo: 'indicadores', itens: [{ rotulo, valor, tom: 'verde'|'vermelho'|'dourado'|null }] },
//     { tipo: 'tabela', titulo, colunas: [{ titulo, peso, alinhar }], linhas: [{ celulas: [...], tom }],
//       totais: [...] | null, vazio: 'texto quando não há linhas' },
//     { tipo: 'distribuicoes', itens: [{ titulo, itens: [{ chave, total }] }], colunas: 3 },
//     { tipo: 'pares', titulo, itens: [[rótulo, valor]] },
//     { tipo: 'nota', texto }
//   ],
//   rodape: { gerado_por, gerado_em: Date }, aviso
// })
//
// Sem registro: a tabela mostra a caixa "Nenhum registro encontrado..." (o relatório sai assim mesmo, com os filtros).
const { DocumentoPdf, quebrarLinhas, cortar, larguraTexto } = require('./documento');

const CORES = {
  marinho: '#0b2545', marinhoEscuro: '#061a33', azul: '#1d4ed8', azulClaro: '#e5edff', dourado: '#f2b705',
  douradoClaro: '#fff5d6', texto: '#101c2e', suave: '#5b6b82', linha: '#e1e8f3', linhaForte: '#ccd7e8', zebra: '#f6f8fc',
  verde: '#15803d', verdeClaro: '#e8f6ec', vermelho: '#b91c1c', vermelhoClaro: '#fdecec', branco: '#ffffff'
};
const TOM = {
  verde: { fundo: CORES.verdeClaro, texto: CORES.verde },
  vermelho: { fundo: CORES.vermelhoClaro, texto: CORES.vermelho },
  dourado: { fundo: CORES.douradoClaro, texto: '#8a6100' }
};

const MARGEM = 36;
const RODAPE = 30;
const MAX_LINHAS_CELULA = 6;

function dataHora(d) {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

function gerarRelatorio(r) {
  const doc = new DocumentoPdf({ paisagem: !!r.paisagem });
  const W = doc.largura; const H = doc.altura;
  const util = W - 2 * MARGEM;
  const limite = H - MARGEM - RODAPE;
  let logo = null;
  if (r.logo) { try { logo = doc.registrarImagem(r.logo); } catch (err) { logo = null; } }
  const org = r.org || {};
  let y = 0;

  function cabecalhoCompleto() {
    doc.novaPagina();
    const topo = MARGEM - 8;
    const tamLogo = 44;
    let x = MARGEM;
    if (logo !== null) { doc.imagem(logo, x, topo, tamLogo, tamLogo); x += tamLogo + 10; }
    doc.texto(org.nome || 'Fortaleza Move', x, topo + 6, { tamanho: 17, negrito: true, cor: CORES.marinho });
    if (org.slogan) doc.texto(cortar(org.slogan, util * 0.55, 9, false), x, topo + 27, { tamanho: 9, cor: CORES.suave });
    doc.texto('CRM · uso interno', MARGEM, topo + 6, { tamanho: 8, negrito: true, cor: CORES.azul, alinhar: 'direita', largura: util });
    doc.texto(`Emitido em ${dataHora(r.rodape && r.rodape.gerado_em ? r.rodape.gerado_em : new Date())}`, MARGEM, topo + 19, { tamanho: 8, cor: CORES.suave, alinhar: 'direita', largura: util });
    y = topo + tamLogo + 8;
    doc.retangulo(MARGEM, y, util, 2.2, { preencher: CORES.dourado });
    y += 12;
    for (const l of quebrarLinhas(r.titulo || 'Relatório', util, 18, true).slice(0, 2)) { doc.texto(l, MARGEM, y, { tamanho: 18, negrito: true, cor: CORES.marinho }); y += 22; }
    if (r.subtitulo) { for (const l of quebrarLinhas(r.subtitulo, util, 9.5, false).slice(0, 3)) { doc.texto(l, MARGEM, y, { tamanho: 9.5, cor: CORES.suave }); y += 13; } }
    y += 4;
    const filtros = (r.filtros || []).filter((f) => f && f[1] !== undefined && f[1] !== null && f[1] !== '');
    if (filtros.length) {
      const texto = filtros.map(([k, v]) => `${k}: ${v}`).join('   ·   ');
      const linhas = quebrarLinhas(texto, util - 20, 8.5, false);
      const h = 18 + linhas.length * 11 + 6;
      doc.retangulo(MARGEM, y, util, h, { preencher: CORES.azulClaro });
      doc.retangulo(MARGEM, y, 3, h, { preencher: CORES.azul });
      doc.texto('FILTROS APLICADOS', MARGEM + 10, y + 6, { tamanho: 7.5, negrito: true, cor: CORES.azul });
      linhas.forEach((l, i) => doc.texto(l, MARGEM + 10, y + 18 + i * 11, { tamanho: 8.5, cor: CORES.texto }));
      y += h + 12;
    }
  }

  function cabecalhoContinuacao() {
    doc.novaPagina();
    const topo = MARGEM - 10;
    let x = MARGEM;
    if (logo !== null) { doc.imagem(logo, x, topo, 22, 22); x += 30; }
    doc.texto(cortar(`${org.nome || 'Fortaleza Move'} · ${r.titulo || 'Relatório'}`, util - 40, 10, true), x, topo + 6, { tamanho: 10, negrito: true, cor: CORES.marinho });
    y = topo + 28;
    doc.retangulo(MARGEM, y, util, 1.2, { preencher: CORES.dourado });
    y += 12;
  }

  const cabe = (h) => y + h <= limite;
  function garantir(h) { if (!cabe(h)) { cabecalhoContinuacao(); return true; } return false; }

  function tituloSecao(t) {
    if (!t) return;
    garantir(40);
    doc.texto(t, MARGEM, y, { tamanho: 11.5, negrito: true, cor: CORES.marinho });
    y += 17;
  }

  /* ------------------------------ indicadores ------------------------------ */
  function indicadores(b) {
    const itens = b.itens || [];
    if (!itens.length) return;
    tituloSecao(b.titulo);
    const porLinha = Math.min(itens.length, r.paisagem ? 6 : 4);
    const gap = 8;
    const w = (util - gap * (porLinha - 1)) / porLinha;
    const h = 46;
    for (let i = 0; i < itens.length; i += porLinha) {
      garantir(h + 8);
      itens.slice(i, i + porLinha).forEach((it, j) => {
        const x = MARGEM + j * (w + gap);
        const tom = TOM[it.tom] || null;
        doc.retangulo(x, y, w, h, { preencher: tom ? tom.fundo : CORES.zebra, contorno: CORES.linha });
        doc.retangulo(x, y, 3, h, { preencher: tom ? tom.texto : CORES.azul });
        doc.texto(cortar(String(it.rotulo || '').toUpperCase(), w - 16, 7, true), x + 10, y + 8, { tamanho: 7, negrito: true, cor: CORES.suave });
        doc.texto(cortar(String(it.valor === undefined || it.valor === null ? '—' : it.valor), w - 16, 16, true), x + 10, y + 21, { tamanho: 16, negrito: true, cor: tom ? tom.texto : CORES.marinho });
      });
      y += h + 8;
    }
    y += 6;
  }

  /* --------------------------------- tabela -------------------------------- */
  function tabela(b) {
    const cols = b.colunas || [];
    const pesoTotal = cols.reduce((s, c) => s + (c.peso || 1), 0) || 1;
    const larg = cols.map((c) => (util * (c.peso || 1)) / pesoTotal);
    const fs = b.tamanho || 8.2;
    const lh = fs * 1.28;
    const pad = 4.5;
    const linhas = b.linhas || [];

    garantir(70);
    tituloSecao(b.titulo);

    const desenharCabecalho = () => {
      const textos = cols.map((c, i) => quebrarLinhas(c.titulo, larg[i] - 2 * pad, fs, true).slice(0, 3));
      const h = Math.max(...textos.map((t) => t.length)) * lh + 2 * pad;
      doc.retangulo(MARGEM, y, util, h, { preencher: CORES.marinho });
      let x = MARGEM;
      textos.forEach((t, i) => {
        t.forEach((l, k) => doc.texto(l, x + pad, y + pad + k * lh, { tamanho: fs, negrito: true, cor: CORES.branco, alinhar: cols[i].alinhar || 'esquerda', largura: larg[i] - 2 * pad }));
        x += larg[i];
      });
      y += h;
    };

    if (!linhas.length) {
      desenharCabecalho();
      const msg = b.vazio || 'Nenhum registro encontrado para os filtros aplicados.';
      const h = 40;
      doc.retangulo(MARGEM, y, util, h, { preencher: CORES.douradoClaro, contorno: CORES.linhaForte });
      doc.texto(msg, MARGEM, y + 14, { tamanho: 10, negrito: true, cor: '#8a6100', alinhar: 'centro', largura: util });
      y += h + 14;
      return;
    }

    desenharCabecalho();
    const linhaTabela = (celulas, { negrito = false, fundo = null, corTexto = CORES.texto, total = false } = {}, zebra) => {
      const textos = celulas.map((v, i) => {
        const t = quebrarLinhas(v === null || v === undefined || v === '' ? (total ? '' : '—') : String(v), larg[i] - 2 * pad, fs, negrito);
        if (t.length > MAX_LINHAS_CELULA) { const c = t.slice(0, MAX_LINHAS_CELULA); c[MAX_LINHAS_CELULA - 1] = cortar(`${c[MAX_LINHAS_CELULA - 1]} …`, larg[i] - 2 * pad, fs, negrito); return c; }
        return t;
      });
      const h = Math.max(1, ...textos.map((t) => t.length)) * lh + 2 * pad;
      if (!cabe(h)) { cabecalhoContinuacao(); doc.texto(`${b.titulo || 'Tabela'} (continuação)`, MARGEM, y, { tamanho: 9, negrito: true, cor: CORES.suave }); y += 14; desenharCabecalho(); }
      const bg = fundo || (zebra ? CORES.zebra : null);
      if (bg) doc.retangulo(MARGEM, y, util, h, { preencher: bg });
      doc.linha(MARGEM, y + h, MARGEM + util, y + h, { cor: CORES.linha, espessura: 0.5 });
      let x = MARGEM;
      textos.forEach((t, i) => {
        t.forEach((l, k) => doc.texto(l, x + pad, y + pad + k * lh, { tamanho: fs, negrito, cor: corTexto, alinhar: cols[i].alinhar || 'esquerda', largura: larg[i] - 2 * pad }));
        x += larg[i];
      });
      y += h;
    };

    linhas.forEach((l, i) => {
      const tom = TOM[l.tom] || null;
      linhaTabela(l.celulas, { fundo: tom ? tom.fundo : null, corTexto: tom ? tom.texto : CORES.texto }, i % 2 === 1);
    });
    if (b.totais) linhaTabela(b.totais, { negrito: true, fundo: CORES.douradoClaro, corTexto: CORES.marinho, total: true }, false);
    if (b.observacao) {
      y += 4;
      for (const l of quebrarLinhas(b.observacao, util, 7.5, false)) { garantir(10); doc.texto(l, MARGEM, y, { tamanho: 7.5, cor: CORES.suave }); y += 10; }
    }
    y += 14;
  }

  /* ----------------------------- distribuições ----------------------------- */
  function distribuicoes(b) {
    const grupos = b.itens || [];
    if (!grupos.length) return;
    tituloSecao(b.titulo);
    const n = Math.max(1, Math.min(b.colunas || (r.paisagem ? 3 : 2), grupos.length));
    const gap = 14;
    const w = (util - gap * (n - 1)) / n;
    const lh = 13;
    for (let i = 0; i < grupos.length; i += n) {
      const linha = grupos.slice(i, i + n);
      const altura = Math.max(...linha.map((g) => 18 + Math.max(1, (g.itens || []).length) * lh)) + 6;
      garantir(Math.min(altura, limite - MARGEM - 60));
      const y0 = y;
      let maxY = y;
      linha.forEach((g, j) => {
        const x = MARGEM + j * (w + gap);
        let yy = y0;
        doc.texto(cortar(g.titulo, w, 9, true), x, yy, { tamanho: 9, negrito: true, cor: CORES.azul });
        yy += 13;
        doc.linha(x, yy, x + w, yy, { cor: CORES.linhaForte, espessura: 0.6 });
        yy += 3;
        const itens = g.itens || [];
        const max = Math.max(1, ...itens.map((it) => Number(it.total) || 0));
        if (!itens.length) { doc.texto('Sem registros.', x, yy + 1, { tamanho: 8, cor: CORES.suave }); yy += lh; }
        itens.forEach((it) => {
          if (yy + lh > limite) return; // grupos enormes são raros; o resto aparece nas tabelas
          const barra = (w * 0.3 * (Number(it.total) || 0)) / max;
          doc.retangulo(x + w - w * 0.3 - 32, yy + 2.5, Math.max(1, barra), 6.5, { preencher: '#c7d6ff' });
          doc.texto(cortar(it.chave || 'Não informado', w * 0.7 - 40, 8, false), x, yy + 1, { tamanho: 8, cor: CORES.texto });
          doc.texto(String(it.total_fmt || it.total), x, yy + 1, { tamanho: 8, negrito: true, cor: CORES.marinho, alinhar: 'direita', largura: w });
          yy += lh;
        });
        maxY = Math.max(maxY, yy);
      });
      y = maxY + 12;
    }
  }

  /* -------------------------------- pares --------------------------------- */
  function pares(b) {
    const itens = b.itens || [];
    tituloSecao(b.titulo);
    const wr = util * 0.42;
    for (const [k, v] of itens) {
      const linhas = quebrarLinhas(v === null || v === undefined || v === '' ? '—' : String(v), util - wr - 12, 9, false).slice(0, 8);
      const h = Math.max(1, linhas.length) * 12 + 6;
      garantir(h);
      doc.texto(cortar(k, wr - 6, 9, false), MARGEM, y + 3, { tamanho: 9, cor: CORES.suave });
      linhas.forEach((l, i) => doc.texto(l, MARGEM + wr, y + 3 + i * 12, { tamanho: 9, negrito: true, cor: CORES.texto }));
      y += h;
      doc.linha(MARGEM, y, MARGEM + util, y, { cor: CORES.linha, espessura: 0.4 });
    }
    y += 14;
  }

  function nota(b) {
    const linhas = quebrarLinhas(b.texto || '', util - 20, 8.5, false);
    const h = linhas.length * 11 + 14;
    garantir(h);
    doc.retangulo(MARGEM, y, util, h, { preencher: CORES.douradoClaro });
    doc.retangulo(MARGEM, y, 3, h, { preencher: CORES.dourado });
    linhas.forEach((l, i) => doc.texto(l, MARGEM + 10, y + 7 + i * 11, { tamanho: 8.5, cor: CORES.texto }));
    y += h + 12;
  }

  cabecalhoCompleto();
  for (const b of r.blocos || []) {
    if (b.tipo === 'indicadores') indicadores(b);
    else if (b.tipo === 'tabela') tabela(b);
    else if (b.tipo === 'distribuicoes') distribuicoes(b);
    else if (b.tipo === 'pares') pares(b);
    else if (b.tipo === 'nota') nota(b);
  }

  // Rodapé em todas as páginas (agora que se sabe o total).
  const total = doc.paginas.length;
  const quando = r.rodape && r.rodape.gerado_em ? r.rodape.gerado_em : new Date();
  const quem = r.rodape && r.rodape.gerado_por ? ` por ${r.rodape.gerado_por}` : '';
  const aviso = r.aviso || 'Documento interno da Fortaleza Move. Contém dados pessoais protegidos pela LGPD: não compartilhe fora da empresa.';
  for (let i = 0; i < total; i++) {
    doc.irPara(i);
    const yr = H - MARGEM - 14;
    doc.linha(MARGEM, yr - 6, W - MARGEM, yr - 6, { cor: CORES.linhaForte, espessura: 0.5 });
    const pag = `Página ${i + 1} de ${total}`;
    const wPag = larguraTexto(pag, 8, true) + 8;
    doc.texto(cortar(`Gerado em ${dataHora(quando)}${quem}. ${aviso}`, util - wPag - 10, 7, false), MARGEM, yr, { tamanho: 7, cor: CORES.suave });
    doc.texto(pag, MARGEM, yr - 0.5, { tamanho: 8, negrito: true, cor: CORES.marinho, alinhar: 'direita', largura: util });
  }

  return doc.gerar({ titulo: r.titulo || 'Relatório', autor: org.nome || 'Fortaleza Move', assunto: r.subtitulo || '', data: quando });
}

module.exports = { gerarRelatorio, dataHora };
