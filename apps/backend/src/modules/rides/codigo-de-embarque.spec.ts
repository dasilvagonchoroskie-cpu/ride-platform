import { RideStatus } from '@prisma/client';
import { PRACA_PADRAO } from '../pracas/pracas.store';
import {
  ERROS_ANTES_DA_ESPERA,
  ERROS_NO_MAXIMO,
  MINUTOS_DE_ESPERA,
  conferirCodigoDeEmbarque,
  exigeCodigoDeEmbarque,
} from './codigo-de-embarque';
import type { CorridaComCodigo } from './codigo-de-embarque';

const corrida: CorridaComCodigo = {
  id: '11111111-1111-1111-1111-111111111111',
  pin: '4821',
  status: RideStatus.DRIVER_WAITING,
  category: 'CARRO',
  pickupLat: PRACA_PADRAO.latitude,
  pickupLng: PRACA_PADRAO.longitude,
};

/** Banco de mentira: guarda os erros como a auditoria guardaria. */
function montar(pracas?: unknown) {
  const erros: Array<{ createdAt: Date }> = [];
  const prisma = {
    setting: { findUnique: jest.fn(async () => (pracas ? { value: pracas } : null)) },
    auditLog: {
      findMany: jest.fn(async () => [...erros].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
      create: jest.fn(async () => erros.push({ createdAt: new Date() })),
    },
    $queryRaw: jest.fn(async () => []),
    withTransaction: jest.fn(),
  };
  prisma.withTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const conferir = (codigo?: string, c: CorridaComCodigo = corrida) => conferirCodigoDeEmbarque(prisma as never, c, 'm1', codigo);
  const passarTempo = (min: number) => erros.forEach((e) => (e.createdAt = new Date(e.createdAt.getTime() - min * 60_000)));
  return { prisma, erros, conferir, passarTempo };
}

const codigoDoErro = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'PASSOU';
  } catch (e) {
    return ((e as { getResponse: () => { code: string } }).getResponse()).code;
  }
};

describe('Codigo de embarque: quando a corrida pede', () => {
  it('pede por padrao, inclusive em cidade cadastrada antes da chave existir', async () => {
    const antiga = { ...PRACA_PADRAO, exigirCodigoEmbarque: undefined };
    expect(await exigeCodigoDeEmbarque(montar().prisma as never, corrida)).toBe(true);
    expect(await exigeCodigoDeEmbarque(montar([antiga]).prisma as never, corrida)).toBe(true);
  });

  it('nao pede na cidade desligada; fora de todas as cidades, pede', async () => {
    const { prisma } = montar([{ ...PRACA_PADRAO, exigirCodigoEmbarque: false }]);
    expect(await exigeCodigoDeEmbarque(prisma as never, corrida)).toBe(false);
    expect(await exigeCodigoDeEmbarque(prisma as never, { ...corrida, pickupLat: -29.4, pickupLng: -51.8 })).toBe(true);
  });

  it.each([
    ['sem codigo (motorista ou Central lancaram)', { pin: null }],
    ['entrega de carro', { category: 'ENTREGA' }],
    ['entrega de moto', { category: 'ENTREGA_MOTO' }],
    ['viagem ja comecada', { status: RideStatus.IN_PROGRESS }],
    ['corrida terminada', { status: RideStatus.COMPLETED }],
    ['corrida cancelada', { status: RideStatus.CANCELLED_BY_PASSENGER }],
  ])('nao pede: %s', async (_nome, mudanca) => {
    expect(await exigeCodigoDeEmbarque(montar().prisma as never, { ...corrida, ...mudanca })).toBe(false);
  });
});

describe('Codigo de embarque: conferencia', () => {
  it('certo passa; sem codigo e formato errado recusam sem gastar tentativa', async () => {
    const { conferir, erros } = montar();
    expect(await codigoDoErro(conferir(undefined))).toBe('BOARDING_CODE_REQUIRED');
    expect(await codigoDoErro(conferir('   '))).toBe('BOARDING_CODE_REQUIRED');
    for (const ruim of ['1', '12345', 'abcd', '48 1']) expect(await codigoDoErro(conferir(ruim))).toBe('BOARDING_CODE_INVALID');
    expect(erros).toHaveLength(0);
    await expect(conferir(' 4821 ')).resolves.toBeUndefined();
  });

  it('na cidade desligada nada e conferido', async () => {
    const { conferir } = montar([{ ...PRACA_PADRAO, exigirCodigoEmbarque: false }]);
    await expect(conferir(undefined)).resolves.toBeUndefined();
  });

  it('trava a corrida no banco antes de contar os erros', async () => {
    const { conferir, prisma } = montar();
    await codigoDoErro(conferir('0000'));
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.auditLog.findMany.mock.invocationCallOrder[0]);
  });

  it('a cada 5 erros para por 10 minutos; nem o certo passa na pausa', async () => {
    const { conferir, erros, passarTempo } = montar();
    for (let i = 1; i < ERROS_ANTES_DA_ESPERA; i += 1) expect(await codigoDoErro(conferir('0000'))).toBe('BOARDING_CODE_INVALID');
    expect(await codigoDoErro(conferir('0000'))).toBe('BOARDING_CODE_LOCKED');
    expect(await codigoDoErro(conferir('4821'))).toBe('BOARDING_CODE_LOCKED');
    expect(erros).toHaveLength(ERROS_ANTES_DA_ESPERA);
    passarTempo(MINUTOS_DE_ESPERA + 1);
    await expect(conferir('4821')).resolves.toBeUndefined();
  });

  it('com 20 erros o codigo da corrida fica bloqueado de vez', async () => {
    const { conferir, erros, passarTempo } = montar();
    while (erros.length < ERROS_NO_MAXIMO) {
      await codigoDoErro(conferir('0000'));
      passarTempo(MINUTOS_DE_ESPERA + 1);
    }
    expect(await codigoDoErro(conferir('4821'))).toBe('BOARDING_CODE_LOCKED');
    expect(erros).toHaveLength(ERROS_NO_MAXIMO);
  });
});
