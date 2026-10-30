import { CHAVE_AVISO_SALDO, lerAvisoDeSaldo, limiteDoAviso, situacaoDoSaldo } from './regras-carteira';

const banco = (valor: unknown) =>
  ({ setting: { findUnique: async ({ where }: { where: { key: string } }) => (where.key === CHAVE_AVISO_SALDO && valor !== undefined ? { value: valor } : null) } }) as never;

describe('Aviso "Saldo se esgotando" por cidade (30/10/2026)', () => {
  it('sem nada configurado: automatico, 3x o minimo (como antes)', async () => {
    const aviso = await lerAvisoDeSaldo(banco(undefined));
    expect(limiteDoAviso(aviso, 'goiatuba', 1000)).toEqual({ cents: 3000, origem: 'automatico' });
  });

  it('a cidade tem valor proprio; as outras usam o padrao', async () => {
    const aviso = await lerAvisoDeSaldo(banco({ padraoCents: 2500, porCidade: { goiatuba: 4000, ruim: -5 } }));
    expect(limiteDoAviso(aviso, 'goiatuba', 1000)).toEqual({ cents: 4000, origem: 'cidade' });
    expect(limiteDoAviso(aviso, 'itumbiara', 1000)).toEqual({ cents: 2500, origem: 'padrao' });
    expect(limiteDoAviso(aviso, null, 1000)).toEqual({ cents: 2500, origem: 'padrao' });
    expect(aviso.porCidade).toEqual({ goiatuba: 4000 });
  });

  it('situacao: sem saldo (ate o minimo), se esgotando (abaixo do aviso) ou ok', () => {
    expect(situacaoDoSaldo(1000, 1000, 4000)).toBe('insufficient');
    expect(situacaoDoSaldo(3999, 1000, 4000)).toBe('low');
    expect(situacaoDoSaldo(4000, 1000, 4000)).toBe('ok');
    // Aviso zerado pela Central: so o "sem saldo" aparece.
    expect(situacaoDoSaldo(500, 0, 0)).toBe('ok');
    expect(situacaoDoSaldo(0, 0, 0)).toBe('insufficient');
  });
});
