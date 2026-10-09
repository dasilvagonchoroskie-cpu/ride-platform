import PDFDocument from 'pdfkit';

/**
 * Relatorio de faturamento em PDF (Evandro, 08/10/2026: "gerar o relatorio
 * em PDF, tanto no aplicativo do motorista, para ele contabilizar, como pela
 * Central, por motorista e da frota toda").
 *
 * Fontes padrao do PDF (Helvetica): servem para portugues com acento, sem
 * baixar nada. Caracteres fora do Latin-1 viram "-".
 */
export interface LinhaCorrida {
  quando: Date;
  codigo: string;
  embarque: string;
  destino: string;
  metros: number;
  forma: string;
  valorCents: number;
  descontoCents: number;
  comissaoCents: number;
  liquidoCents: number;
  motorista?: string;
}

export interface LinhaMotorista {
  nome: string;
  telefone: string;
  cidade: string | null;
  corridas: number;
  valorCents: number;
  comissaoCents: number;
  liquidoCents: number;
}

export interface DadosDoRelatorio {
  titulo: string;
  /** Motorista, cidade ou "Frota toda". */
  quem: string;
  detalheQuem?: string;
  de: Date;
  ate: Date;
  geradoEm: Date;
  totais: {
    corridas: number;
    canceladas: number;
    valorCents: number;
    descontoCents: number;
    comissaoCents: number;
    liquidoCents: number;
    metros: number;
  };
  porForma: Array<{ forma: string; corridas: number; valorCents: number }>;
  carteira?: {
    recargasCents: number;
    comissoesCents: number;
    bonusCents: number;
    saquesCents: number;
    saldoAtualCents: number;
  };
  motoristas?: LinhaMotorista[];
  corridas: LinhaCorrida[];
  /** Corridas a mais que nao couberam (o PDF lista no maximo 1.000). */
  corridasOmitidas: number;
}

const FUSO_MS = 3 * 3_600_000;

export function reais(cents: number): string {
  const neg = cents < 0;
  const v = Math.abs(Math.round(cents));
  const inteiro = Math.floor(v / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '- ' : ''}R$ ${inteiro},${String(v % 100).padStart(2, '0')}`;
}

export function dataBr(d: Date, comHora = false): string {
  const b = new Date(d.getTime() - FUSO_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  const dia = `${p(b.getUTCDate())}/${p(b.getUTCMonth() + 1)}/${b.getUTCFullYear()}`;
  return comHora ? `${dia} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}` : dia;
}

function km(metros: number): string {
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

/** So o que a fonte padrao do PDF desenha (Latin-1). */
function limpo(t: string | null | undefined): string {
  return (t ?? '')
    .replace(/[–—→]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '-');
}

const COR_TITULO = '#0F172A';
const COR_TEXTO = '#1F2937';
const COR_FRACA = '#6B7280';
const COR_LINHA = '#E5E7EB';
const COR_FAIXA = '#F3F4F6';
const COR_DESTAQUE = '#15803D';

export function gerarPdf(d: DadosDoRelatorio): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: limpo(d.titulo), Author: 'Fortaleza Mov' } });
    const partes: Buffer[] = [];
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const esq = doc.page.margins.left;
    const largura = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // ---------- Cabecalho ----------
    doc.rect(0, 0, doc.page.width, 92).fill(COR_TITULO);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text('Fortaleza Mov', esq, 24);
    doc.font('Helvetica').fontSize(11).text(limpo(d.titulo), esq, 48);
    doc.fontSize(9).fillColor('#CBD5E1').text(`Período: ${dataBr(d.de)} a ${dataBr(d.ate)}   -   Gerado em ${dataBr(d.geradoEm, true)}`, esq, 66);
    doc.y = 110;

    doc.fillColor(COR_TEXTO).font('Helvetica-Bold').fontSize(13).text(limpo(d.quem), esq, doc.y);
    if (d.detalheQuem) doc.font('Helvetica').fontSize(9).fillColor(COR_FRACA).text(limpo(d.detalheQuem));
    doc.moveDown(0.8);

    // ---------- Quadro de totais ----------
    const caixas: Array<[string, string, boolean]> = [
      ['Corridas concluídas', String(d.totais.corridas), false],
      ['Total das corridas', reais(d.totais.valorCents), true],
      ['Comissão da Central', reais(d.totais.comissaoCents), false],
      [d.motoristas ? 'Líquido dos motoristas' : 'Líquido do motorista', reais(d.totais.liquidoCents), true],
      ['Descontos de cupom (pagos pela Central)', reais(d.totais.descontoCents), false],
      ['Distância percorrida', km(d.totais.metros), false],
      ['Corridas canceladas', String(d.totais.canceladas), false],
    ];
    const col = 3;
    const w = (largura - (col - 1) * 8) / col;
    const h = 46;
    let y0 = doc.y;
    caixas.forEach(([rot, val, forte], i) => {
      const cx = esq + (i % col) * (w + 8);
      const cy = y0 + Math.floor(i / col) * (h + 8);
      doc.roundedRect(cx, cy, w, h, 6).fill(COR_FAIXA);
      doc.fillColor(COR_FRACA).font('Helvetica').fontSize(8).text(limpo(rot), cx + 8, cy + 7, { width: w - 16 });
      doc.fillColor(forte ? COR_DESTAQUE : COR_TEXTO).font('Helvetica-Bold').fontSize(13).text(val, cx + 8, cy + 22, { width: w - 16 });
    });
    doc.y = y0 + Math.ceil(caixas.length / col) * (h + 8) + 6;
    doc.x = esq;

    // ---------- Por forma de pagamento ----------
    if (d.porForma.length > 0) {
      secao(doc, 'Por forma de pagamento', esq);
      tabela(
        doc,
        esq,
        largura,
        [
          { titulo: 'Forma', peso: 3 },
          { titulo: 'Corridas', peso: 1, direita: true },
          { titulo: 'Valor', peso: 1.5, direita: true },
        ],
        d.porForma.map((f) => [f.forma, String(f.corridas), reais(f.valorCents)]),
      );
    }

    // ---------- Carteira (relatorio do motorista) ----------
    if (d.carteira) {
      secao(doc, 'Carteira pré-paga no período', esq);
      tabela(
        doc,
        esq,
        largura,
        [
          { titulo: 'Movimento', peso: 3 },
          { titulo: 'Valor', peso: 1.5, direita: true },
        ],
        [
          ['Recargas (créditos comprados da Central)', reais(d.carteira.recargasCents)],
          ['Comissões descontadas', reais(-d.carteira.comissoesCents)],
          ['Bônus e cupons pagos pela Central', reais(d.carteira.bonusCents)],
          ['Saques PIX', reais(-d.carteira.saquesCents)],
          ['Saldo da carteira hoje', reais(d.carteira.saldoAtualCents)],
        ],
      );
    }

    // ---------- Por motorista (frota ou cidade) ----------
    if (d.motoristas && d.motoristas.length > 0) {
      secao(doc, 'Por motorista', esq);
      tabela(
        doc,
        esq,
        largura,
        [
          { titulo: 'Motorista', peso: 3 },
          { titulo: 'Cidade', peso: 1.6 },
          { titulo: 'Corridas', peso: 1, direita: true },
          { titulo: 'Total', peso: 1.4, direita: true },
          { titulo: 'Comissão', peso: 1.3, direita: true },
          { titulo: 'Líquido', peso: 1.4, direita: true },
        ],
        d.motoristas.map((m) => [
          `${m.nome}${m.telefone ? `\n${m.telefone}` : ''}`,
          m.cidade ?? '-',
          String(m.corridas),
          reais(m.valorCents),
          reais(m.comissaoCents),
          reais(m.liquidoCents),
        ]),
      );
    }

    // ---------- Corridas ----------
    secao(doc, d.corridas.length > 0 ? 'Corridas concluídas' : 'Nenhuma corrida concluída no período', esq);
    if (d.corridas.length > 0) {
      const comMotorista = d.corridas.some((c) => c.motorista);
      tabela(
        doc,
        esq,
        largura,
        [
          { titulo: 'Data', peso: 1.25 },
          { titulo: 'Trajeto', peso: 3.6 },
          ...(comMotorista ? [{ titulo: 'Motorista', peso: 1.6 }] : []),
          { titulo: 'Km', peso: 0.8, direita: true },
          { titulo: 'Pagamento', peso: 1.1 },
          { titulo: 'Valor', peso: 1.2, direita: true },
          { titulo: 'Comissão', peso: 1.1, direita: true },
          { titulo: 'Líquido', peso: 1.2, direita: true },
        ],
        d.corridas.map((c) => [
          `${dataBr(c.quando, true)}\nNº ${c.codigo}`,
          `${c.embarque}\npara ${c.destino}`,
          ...(comMotorista ? [c.motorista ?? '-'] : []),
          km(c.metros),
          c.forma,
          reais(c.valorCents) + (c.descontoCents > 0 ? `\ncupom ${reais(c.descontoCents)}` : ''),
          reais(c.comissaoCents),
          reais(c.liquidoCents),
        ]),
        7,
      );
      if (d.corridasOmitidas > 0) {
        doc.moveDown(0.4).font('Helvetica').fontSize(8).fillColor(COR_FRACA)
          .text(`+ ${d.corridasOmitidas} corrida(s) a mais no período (estão nos totais acima).`, esq);
      }
    }

    // ---------- Rodape em todas as paginas ----------
    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(paginas.start + i);
      // Sem isto o PDFKit abre pagina nova ao escrever abaixo da margem.
      doc.page.margins.bottom = 0;
      const yRod = doc.page.height - 30;
      doc.font('Helvetica').fontSize(7.5).fillColor(COR_FRACA);
      doc.text(
        'Fortaleza Mov - relatório gerado pelo sistema. Valores conforme as corridas registradas no servidor.',
        esq,
        yRod,
        { width: largura - 60, lineBreak: false },
      );
      doc.text(`Página ${i + 1} de ${paginas.count}`, esq + largura - 60, yRod, { width: 60, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

function secao(doc: PDFKit.PDFDocument, titulo: string, esq: number) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(0.6);
  doc.fillColor(COR_TITULO).font('Helvetica-Bold').fontSize(11).text(limpo(titulo), esq, doc.y);
  doc.moveDown(0.3);
}

interface Coluna {
  titulo: string;
  peso: number;
  direita?: boolean;
}

/** Tabela simples com cabecalho repetido a cada pagina e faixas alternadas. */
function tabela(doc: PDFKit.PDFDocument, esq: number, largura: number, colunas: Coluna[], linhas: string[][], tamanho = 8) {
  const total = colunas.reduce((s, c) => s + c.peso, 0);
  const larguras = colunas.map((c) => (c.peso / total) * largura);
  const pad = 4;
  const fim = () => doc.page.height - doc.page.margins.bottom - 24;

  const cabecalho = () => {
    const y = doc.y;
    doc.rect(esq, y, largura, 16).fill(COR_TITULO);
    let x = esq;
    doc.font('Helvetica-Bold').fontSize(tamanho).fillColor('#FFFFFF');
    colunas.forEach((c, i) => {
      doc.text(limpo(c.titulo), x + pad, y + 4, { width: larguras[i] - 2 * pad, align: c.direita ? 'right' : 'left', lineBreak: false });
      x += larguras[i];
    });
    doc.y = y + 16;
  };

  cabecalho();
  linhas.forEach((linha, n) => {
    doc.font('Helvetica').fontSize(tamanho);
    const alturas = linha.map((t, i) => doc.heightOfString(limpo(t), { width: larguras[i] - 2 * pad }));
    const h = Math.max(...alturas) + 2 * pad;
    if (doc.y + h > fim()) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      cabecalho();
    }
    const y = doc.y;
    if (n % 2 === 1) doc.rect(esq, y, largura, h).fill(COR_FAIXA);
    let x = esq;
    doc.fillColor(COR_TEXTO).font('Helvetica').fontSize(tamanho);
    linha.forEach((t, i) => {
      doc.text(limpo(t), x + pad, y + pad, { width: larguras[i] - 2 * pad, align: colunas[i].direita ? 'right' : 'left' });
      x += larguras[i];
    });
    doc.moveTo(esq, y + h).lineTo(esq + largura, y + h).lineWidth(0.5).strokeColor(COR_LINHA).stroke();
    doc.y = y + h;
  });
  doc.x = esq;
}
