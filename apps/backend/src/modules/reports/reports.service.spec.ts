import { ReportsService } from './reports.service';

jest.mock('../comercio/comercio.servico', () => ({
  motoristasEmSos: jest.fn(async () => new Set<string>(['d-sos'])),
  servicosDasCorridas: jest.fn(async () => new Map()),
  servicoDa: jest.fn(() => ({ servico: 'PASSAGEIRO', origem: null, comercio: null })),
}));

/**
 * Numeros do painel da Central: o "hoje" e o de Brasilia (UTC-3), valores em centavos,
 * taxa de cancelamento e situacao dos motoristas. Banco de mentira, relogio fixo.
 */
const AGORA = new Date('2026-11-13T02:30:00Z'); // 12/11 23:30 em Brasilia
const INICIO_HOJE = new Date('2026-11-12T03:00:00Z');

function corrida(finishedAt: string, finalFareCents: number | null, extra: Record<string, unknown> = {}) {
  return {
    finalFareCents,
    estimatedFareCents: 1000,
    commissionCents: 100,
    driverEarningCents: 900,
    finishedAt: new Date(finishedAt),
    ...extra,
  };
}

function montarResumo(semana: unknown[], canceladas = 0, mesSoma: number | null = 50000) {
  const prisma = {
    ride: {
      findMany: jest.fn(async () => semana),
      aggregate: jest.fn(async () => ({ _sum: { finalFareCents: mesSoma } })),
      count: jest.fn(async () => canceladas),
    },
    driver: { count: jest.fn(async (a: { where: { status?: string; isOnline?: boolean } }) => (a.where.isOnline ? 4 : a.where.status === 'PENDING' ? 2 : 10)) },
  };
  return { servico: new ReportsService(prisma as never), prisma };
}

describe('Resumo do painel', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(AGORA);
  });
  afterEach(() => jest.useRealTimers());

  it('"hoje" comeca a meia-noite de Brasilia, nao a de Londres', async () => {
    const { servico } = montarResumo([
      corrida('2026-11-12T02:59:00Z', 2000), // 11/11 23:59 em Brasilia: ontem
      corrida('2026-11-12T03:00:00Z', 3000), // 12/11 00:00 em Brasilia: hoje
      corrida('2026-11-13T02:00:00Z', 4000), // 12/11 23:00 em Brasilia: hoje
    ]);
    const r = await servico.resumo();
    expect(r.ridesToday).toBe(2);
    expect(r.todayCents).toBe(7000);
    expect(r.ridesWeek).toBe(3);
    expect(r.weekCents).toBe(9000);
  });

  it('valor da corrida: o final; sem ele, o estimado', async () => {
    const { servico } = montarResumo([corrida('2026-11-12T12:00:00Z', null), corrida('2026-11-12T13:00:00Z', 2500)]);
    const r = await servico.resumo();
    expect(r.todayCents).toBe(3500);
    expect(r.averageTicketCents).toBe(1750);
  });

  it('comissao e repasse do dia somam so as corridas de hoje', async () => {
    const { servico } = montarResumo([
      corrida('2026-11-10T12:00:00Z', 1000),
      corrida('2026-11-12T12:00:00Z', 1000, { commissionCents: 150, driverEarningCents: 850 }),
    ]);
    const r = await servico.resumo();
    expect(r.commissionTodayCents).toBe(150);
    expect(r.driverPayoutsTodayCents).toBe(850);
  });

  it('receita por hora usa a hora de Brasilia', async () => {
    const { servico } = montarResumo([corrida('2026-11-12T15:10:00Z', 1200), corrida('2026-11-12T15:50:00Z', 800)]); // 12h em Brasilia
    const r = await servico.resumo();
    expect(r.hourlyRevenue).toHaveLength(24);
    expect(r.hourlyRevenue[12]).toBe(2000);
    expect(r.hourlyRevenue.reduce((a, b) => a + b, 0)).toBe(2000);
  });

  it('taxa de cancelamento = canceladas / (concluidas + canceladas); sem corrida = 0', async () => {
    expect((await montarResumo([corrida('2026-11-12T12:00:00Z', 1000), corrida('2026-11-12T13:00:00Z', 1000), corrida('2026-11-12T14:00:00Z', 1000)], 1).servico.resumo()).cancellationRate).toBeCloseTo(0.25);
    const vazio = await montarResumo([], 0).servico.resumo();
    expect(vazio.cancellationRate).toBe(0);
    expect(vazio.averageTicketCents).toBe(0);
    expect(vazio.todayCents).toBe(0);
  });

  it('mes sem corrida volta 0 e os motoristas vem da contagem', async () => {
    const r = await montarResumo([], 0, null).servico.resumo();
    expect(r.monthCents).toBe(0);
    expect(r.activeDrivers).toBe(10);
    expect(r.onlineDrivers).toBe(4);
    expect(r.pendingApprovals).toBe(2);
  });

  it('operador de cidade: o filtro da cidade e os motoristas dela entram em todas as consultas', async () => {
    const { servico, prisma } = montarResumo([]);
    const daCidade = { pickupLat: { gte: 1, lte: 2 } };
    await servico.resumo(daCidade as never, ['d1']);
    expect((prisma.ride.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where).toMatchObject(daCidade);
    expect((prisma.ride.aggregate.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where).toMatchObject(daCidade);
    expect((prisma.ride.count.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where).toMatchObject(daCidade);
    for (const c of prisma.driver.count.mock.calls as unknown as Array<[{ where: Record<string, unknown> }]>) {
      expect(c[0].where).toMatchObject({ id: { in: ['d1'] } });
    }
  });
});

describe('Painel ao vivo', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(AGORA);
  });
  afterEach(() => jest.useRealTimers());

  const motorista = (id: string, online: boolean, categoria = 'POPULAR') => ({
    id,
    isOnline: online,
    ratingAvg: 4.8,
    user: { name: `Motorista ${id}`, phone: '+5564999990000' },
    vehicles: [{ brand: 'Fiat', model: 'Argo', color: 'Prata', plate: 'ABC1D23', category: categoria }],
  });

  function montarAoVivo(motoristas: unknown[], emAndamento: unknown[]) {
    const prisma = {
      driver: { findMany: jest.fn(async () => motoristas) },
      ride: {
        findMany: jest.fn(async (a: { where: { status?: unknown } }) => (a.where.status ? emAndamento : [])),
      },
      $queryRaw: jest.fn(async () => [{ driverId: 'd1', latitude: -18.01, longitude: -49.35, lastSeenAt: null }]),
    };
    return { servico: new ReportsService(prisma as never), prisma };
  }

  const emCurso = (driverId: string, status: string) => ({ id: `r-${driverId}`, code: 'C1', status, driverId, passenger: { name: 'Ana' } });

  it('situacao: em viagem, no embarque, a caminho, livre, offline; contagens e ordem', async () => {
    const { servico } = montarAoVivo(
      [motorista('d1', true), motorista('d2', true), motorista('d3', true), motorista('d4', true), motorista('d5', false)],
      [emCurso('d1', 'IN_PROGRESS'), emCurso('d2', 'DRIVER_WAITING'), emCurso('d3', 'DRIVER_ARRIVING')],
    );
    const r = await servico.aoVivo();
    expect(r.counts).toEqual({ livres: 1, aCaminho: 1, noEmbarque: 1, emViagem: 1, offline: 1 });
    expect(r.drivers.map((d) => d.situacao)).toEqual(['EM_VIAGEM', 'NO_EMBARQUE', 'A_CAMINHO', 'LIVRE', 'OFFLINE']);
  });

  it('moto aparece como moto; posicao vem da tabela de localizacao; SOS marcado', async () => {
    const { servico } = montarAoVivo([motorista('d1', true, 'MOTO'), motorista('d-sos', true)], []);
    const r = await servico.aoVivo();
    const d1 = r.drivers.find((d) => d.driverId === 'd1')!;
    expect(d1.moto).toBe(true);
    expect(d1.latitude).toBeCloseTo(-18.01);
    expect(r.drivers.find((d) => d.driverId === 'd-sos')!.sos).toBe(true);
    expect(r.drivers.find((d) => d.driverId === 'd-sos')!.latitude).toBeNull();
  });

  it('operador de cidade: so os motoristas dela e as corridas de hoje (desde a meia-noite de Brasilia)', async () => {
    const { servico, prisma } = montarAoVivo([], []);
    await servico.aoVivo({ pickupLat: { gte: 1 } } as never, ['d9']);
    expect((prisma.driver.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where).toMatchObject({ id: { in: ['d9'] } });
    const hoje = (prisma.ride.findMany.mock.calls as unknown as Array<[{ where: { requestedAt?: { gte: Date } } }]>).find((c) => c[0].where.requestedAt)![0].where;
    expect(hoje.requestedAt!.gte.getTime()).toBe(INICIO_HOJE.getTime());
    expect(hoje).toMatchObject({ pickupLat: { gte: 1 } });
  });
});
