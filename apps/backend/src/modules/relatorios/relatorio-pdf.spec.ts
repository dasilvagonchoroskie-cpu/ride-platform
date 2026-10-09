import { writeFileSync } from 'fs';
import { gerarPdf, reais } from './relatorio-pdf';
import type { DadosDoRelatorio } from './relatorio-pdf';

function exemplo(muitas = 3): DadosDoRelatorio {
  const base = new Date('2026-10-05T13:00:00Z');
  return {
    titulo: 'Relatório de faturamento do motorista',
    quem: 'Evandro da Silva Gonchoroski',
    detalheQuem: '(64) 99268-6632   |   CPF 123.456.789-00   |   Chevrolet Prisma - placa OBL3A45   |   Cidade: Goiatuba',
    de: new Date('2026-10-01T03:00:00Z'),
    ate: new Date('2026-10-31T02:59:59Z'),
    geradoEm: new Date('2026-10-09T05:00:00Z'),
    totais: { corridas: muitas, canceladas: 1, valorCents: 123456, descontoCents: 300, comissaoCents: 9876, liquidoCents: 113580, metros: 45210 },
    porForma: [
      { forma: 'Dinheiro', corridas: 2, valorCents: 100000 },
      { forma: 'Pix', corridas: 1, valorCents: 23456 },
    ],
    carteira: { recargasCents: 5000, comissoesCents: 9876, bonusCents: 300, saquesCents: 0, saldoAtualCents: -4576 },
    corridas: Array.from({ length: muitas }, (_, i) => ({
      quando: new Date(base.getTime() + i * 3_600_000),
      codigo: String(240974 + i),
      embarque: 'Praça da Matriz, Centro - Goiatuba - GO',
      destino: i % 2 ? 'Rodoviária de Goiatuba, Avenida Brasil, 500' : 'Hospital Municipal → Pronto Socorro “Ala B”',
      metros: 3200 + i * 100,
      forma: i % 2 ? 'Pix' : 'Dinheiro',
      valorCents: 1850 + i,
      descontoCents: i === 0 ? 300 : 0,
      comissaoCents: 148,
      liquidoCents: 1702 + i,
    })),
    corridasOmitidas: 0,
  };
}

describe('Relatorio de faturamento em PDF', () => {
  it('formata dinheiro em reais', () => {
    expect(reais(123456)).toBe('R$ 1.234,56');
    expect(reais(-4576)).toBe('- R$ 45,76');
    expect(reais(5)).toBe('R$ 0,05');
  });

  it('gera o PDF do motorista (com acentos e varias paginas)', async () => {
    const pdf = await gerarPdf(exemplo(60));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(3000);
    if (process.env.SALVAR_PDF) writeFileSync(process.env.SALVAR_PDF, pdf);
  });

  it('gera o PDF da frota com a tabela por motorista', async () => {
    const d = exemplo(5);
    d.titulo = 'Relatório de faturamento da frota';
    d.quem = 'Frota toda';
    d.carteira = undefined;
    d.motoristas = [
      { nome: 'Evandro', telefone: '(64) 99268-6632', cidade: 'Goiatuba', corridas: 3, valorCents: 5555, comissaoCents: 444, liquidoCents: 5111 },
      { nome: 'Maria de Teutônia', telefone: '(51) 99999-0000', cidade: 'Teutônia', corridas: 2, valorCents: 4000, comissaoCents: 320, liquidoCents: 3680 },
    ];
    d.corridas = d.corridas.map((c) => ({ ...c, motorista: 'Evandro' }));
    const pdf = await gerarPdf(d);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.SALVAR_PDF_FROTA) writeFileSync(process.env.SALVAR_PDF_FROTA, pdf);
  });
});
