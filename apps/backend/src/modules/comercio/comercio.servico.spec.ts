jest.mock('../rides/rides.service', () => ({ RidesService: class RidesService {} }));
jest.mock('../pracas/pracas.service', () => ({ PracasService: class PracasService {} }));

import { CentralService } from '../central/central.service';
import { ReportsService } from '../reports/reports.service';
import { motoristasEmSos, servicoDa, servicosDasCorridas } from './comercio.servico';

/**
 * Tipo de servico do mapa e das listas da Central (carro/moto x passageiro/entrega do
 * Comercio x SOS). Vem das tabelas (nunca do texto da descricao). Banco falso na memoria.
 */
const agora = new Date();

function bancoFalso(op: { sos?: Array<{ userId: string; rideDriverId?: string; motoristaId?: string }> } = {}) {
  const pedidos = [
    { rideId: 'rCom', origem: 'APP', comercioId: 'c1', comercio: { nomeFantasia: 'Padaria Estrela' } },
    { rideId: 'rComMot', origem: 'MOTORISTA', comercioId: 'c1', comercio: { nomeFantasia: 'Padaria Estrela' } },
  ];
  // "rEnt" e uma entrega do app do passageiro (sem pedido do Comercio); a descricao NAO decide nada.
  const entregas = [{ rideId: 'rCom' }, { rideId: 'rComMot' }, { rideId: 'rEnt' }];
  const corridas: any[] = [
    { id: 'rPass', code: 'P1', status: 'IN_PROGRESS', driverId: 'dCarroPass' },
    { id: 'rCom', code: 'C1', status: 'DRIVER_ASSIGNED', driverId: 'dMotoCom' },
    { id: 'rComMot', code: 'C2', status: 'IN_PROGRESS', driverId: 'dCarroCom' },
    { id: 'rEnt', code: 'E1', status: 'IN_PROGRESS', driverId: 'dMotoEnt' },
    { id: 'rDescricaoEngana', code: 'X1', status: 'IN_PROGRESS', driverId: 'dMotoPass' },
  ];
  const mot = (id: string, categoria: string, online = true) => ({
    id,
    userId: `u-${id}`,
    status: 'APPROVED',
    isOnline: online,
    ratingAvg: 4.9,
    user: { name: `Nome ${id}`, phone: '+5564900000000' },
    location: {},
    vehicles: [{ brand: 'Honda', model: 'X', color: 'Preta', plate: `PL${id}`.slice(0, 7), category: categoria, isActive: true }],
  });
  const motoristas = [
    mot('dCarroPass', 'CARRO'),
    mot('dMotoPass', 'MOTO'),
    mot('dMotoCom', 'MOTO'),
    mot('dCarroCom', 'CARRO'),
    mot('dMotoEnt', 'MOTO'),
    mot('dLivre', 'CARRO'),
    mot('dOffline', 'MOTO', false),
  ];
  const prisma: any = {
    comercioPedido: { findMany: async ({ where }: any) => pedidos.filter((p) => where.rideId.in.includes(p.rideId)) },
    entrega: { findMany: async ({ where }: any) => entregas.filter((e) => where.rideId.in.includes(e.rideId)) },
    safetyEvent: {
      findMany: async () =>
        (op.sos ?? []).map((e) => ({
          userId: e.userId,
          ride: e.rideDriverId ? { driverId: e.rideDriverId } : null,
          user: e.motoristaId ? { driver: { id: e.motoristaId } } : { driver: null },
        })),
    },
    driver: { findMany: async () => motoristas },
    ride: {
      findMany: async (a: any) => {
        if (a.take === 200 && a.select?.requestedAt) return [];
        return corridas.filter((c) => !a.where?.status?.in || a.where.status.in.includes(c.status));
      },
    },
    $queryRaw: async () => motoristas.map((m, i) => ({ driverId: m.id, latitude: -18 + i / 100, longitude: -49, lastSeenAt: agora })),
  };
  return { prisma, motoristas };
}

describe('servicosDasCorridas: tipo de servico vem do banco', () => {
  it('Comercio (app e motorista), entrega comum e passageiro; descricao nao influencia', async () => {
    const { prisma } = bancoFalso();
    const m = await servicosDasCorridas(prisma, ['rPass', 'rCom', 'rComMot', 'rEnt', 'rDescricaoEngana']);
    expect(servicoDa(m, 'rCom')).toMatchObject({ servico: 'COMERCIO', origem: 'APP', comercio: 'Padaria Estrela', comercioId: 'c1' });
    expect(servicoDa(m, 'rComMot')).toMatchObject({ servico: 'COMERCIO', origem: 'MOTORISTA' });
    expect(servicoDa(m, 'rEnt')).toMatchObject({ servico: 'ENTREGA', origem: null, comercio: null });
    expect(servicoDa(m, 'rPass').servico).toBe('PASSAGEIRO');
    expect(servicoDa(m, 'rDescricaoEngana').servico).toBe('PASSAGEIRO');
    expect(servicoDa(m, null).servico).toBe('PASSAGEIRO');
  });

  it('lista vazia: nenhuma consulta e mapa vazio', async () => {
    const { prisma } = bancoFalso();
    prisma.comercioPedido.findMany = jest.fn();
    expect((await servicosDasCorridas(prisma, [])).size).toBe(0);
    expect(prisma.comercioPedido.findMany).not.toHaveBeenCalled();
  });
});

describe('motoristasEmSos', () => {
  it('SOS aberto do proprio motorista, do passageiro/loja na corrida dele, e nada quando nao ha', async () => {
    expect((await motoristasEmSos(bancoFalso().prisma)).size).toBe(0);
    const { prisma } = bancoFalso({
      sos: [
        { userId: 'u-dMotoCom', motoristaId: 'dMotoCom' },
        { userId: 'uLoja', rideDriverId: 'dCarroCom' },
      ],
    });
    expect([...(await motoristasEmSos(prisma))].sort()).toEqual(['dCarroCom', 'dMotoCom']);
  });
});

describe('Mapa da Central (livresPerto): carro/moto x passageiro/Comercio/livre/offline/SOS', () => {
  function central(sos?: Parameters<typeof bancoFalso>[0]['sos']) {
    const { prisma } = bancoFalso({ sos });
    const c: any = Object.create(CentralService.prototype);
    c.prisma = prisma;
    c.pracas = { idsDeMotoristas: async () => null };
    return c as CentralService;
  }

  it('cada veiculo traz o tipo de servico, a corrida e a loja; livre e offline sem servico', async () => {
    const lista: any[] = await central().livresPerto(-18, -49, true);
    const por = (id: string) => lista.find((m) => m.driverId === id);
    expect(por('dCarroPass')).toMatchObject({ category: 'CARRO', busy: true, servico: 'PASSAGEIRO', sos: false, corrida: { code: 'P1' } });
    expect(por('dMotoPass')).toMatchObject({ category: 'MOTO', servico: 'PASSAGEIRO' });
    expect(por('dMotoCom')).toMatchObject({ category: 'MOTO', servico: 'COMERCIO', origemDoServico: 'APP', comercio: 'Padaria Estrela' });
    expect(por('dCarroCom')).toMatchObject({ category: 'CARRO', servico: 'COMERCIO', origemDoServico: 'MOTORISTA' });
    expect(por('dMotoEnt')).toMatchObject({ servico: 'ENTREGA', comercio: null });
    expect(por('dLivre')).toMatchObject({ busy: false, servico: null, corrida: null, online: true });
    expect(por('dOffline')).toMatchObject({ online: false, servico: null });
  });

  it('entrega + SOS: marca sos E mantem o contexto da entrega (a Central pinta de SOS sem perder a loja)', async () => {
    const lista: any[] = await central([{ userId: 'u-dMotoCom', motoristaId: 'dMotoCom' }]).livresPerto(-18, -49, true);
    const m = lista.find((x) => x.driverId === 'dMotoCom');
    expect(m).toMatchObject({ sos: true, servico: 'COMERCIO', comercio: 'Padaria Estrela', corrida: { code: 'C1' } });
    expect(lista.filter((x) => x.sos)).toHaveLength(1);
  });

  it('sem posicao: o motorista sai sem coordenadas (nao inventa lugar)', async () => {
    const c = central();
    (c as any).prisma.$queryRaw = async () => [];
    const lista: any[] = await c.livresPerto(-18, -49, true);
    expect(lista.every((m) => m.latitude === null && m.longitude === null)).toBe(true);
  });
});

describe('Painel ao vivo (ReportsService.aoVivo)', () => {
  it('motoristas e corridas de hoje com o tipo de servico e o SOS', async () => {
    const { prisma, motoristas } = bancoFalso({ sos: [{ userId: 'u-dCarroCom', motoristaId: 'dCarroCom' }] });
    const porId = new Map(motoristas.map((m) => [m.id, m]));
    prisma.driver.findMany = async () => motoristas.map((m) => ({ ...m, vehicles: m.vehicles }));
    prisma.ride.findMany = async (a: any) =>
      a.take !== 200
        ? [
            { id: 'rCom', code: 'C1', status: 'DRIVER_ASSIGNED', driverId: 'dMotoCom', passenger: { name: 'Loja' } },
            { id: 'rComMot', code: 'C2', status: 'IN_PROGRESS', driverId: 'dCarroCom', passenger: { name: 'Loja' } },
          ]
        : [{ id: 'rCom', code: 'C1', status: 'DRIVER_ASSIGNED', category: 'ENTREGA_MOTO', requestedAt: agora, finishedAt: null, estimatedFareCents: 700, finalFareCents: null, pickupAddress: 'a', dropoffAddress: 'b', driverId: 'dMotoCom', passenger: { name: 'Loja', phone: '+55' }, driver: { user: { name: 'Nome dMotoCom' } }, vehicle: { plate: 'PLdMoto' } }];
    prisma.$queryRaw = async () => [];
    const r: any = await new ReportsService(prisma).aoVivo();
    const d = (id: string) => r.drivers.find((x: any) => x.driverId === id);
    expect(porId.size).toBeGreaterThan(0);
    expect(d('dMotoCom')).toMatchObject({ servico: 'COMERCIO', origemDoServico: 'APP', comercio: 'Padaria Estrela', moto: true, sos: false });
    expect(d('dCarroCom')).toMatchObject({ servico: 'COMERCIO', origemDoServico: 'MOTORISTA', moto: false, sos: true });
    expect(d('dLivre')).toMatchObject({ servico: null, situacao: 'LIVRE' });
    expect(r.ridesToday[0]).toMatchObject({ servico: 'COMERCIO', comercio: 'Padaria Estrela' });
  });
});

describe('Reatribuir pela Central (atribuir) preserva a categoria de ENTREGA', () => {
  function montarAtribuir(categoria: string) {
    const atualizacoes: any[] = [];
    const tx: any = {
      ride: { update: jest.fn(async ({ data }: any) => void atualizacoes.push(data)) },
      driverLocation: { updateMany: jest.fn() },
      rideOffer: { updateMany: jest.fn(), upsert: jest.fn() },
      rideStatusHistory: { create: jest.fn() },
    };
    const prisma: any = {
      ride: {
        findUnique: async () => ({ id: 'r1', status: 'SEARCHING', driverId: null, passengerId: 'uLoja', category: categoria }),
        count: async () => 0,
      },
      driver: {
        findUnique: async () => ({
          id: 'm1',
          userId: 'uMot',
          status: 'APPROVED',
          isOnline: true,
          location: {},
          user: { name: 'Motorista' },
          vehicles: [{ category: 'MOTO' }],
        }),
      },
      contaDeTeste: async () => false,
      wallet: { findUnique: async () => null },
      setting: { findUnique: async () => null, findMany: async () => [] },
      withTransaction: async (fn: any) => fn(tx),
    };
    const c: any = Object.create(CentralService.prototype);
    c.prisma = prisma;
    c.push = { chamadoParaMotorista: async () => undefined };
    return { c: c as CentralService, atualizacoes };
  }

  it('entrega: continua com a categoria de entrega (confere codigo e coleta); passageiro: segue a do veiculo', async () => {
    const e = montarAtribuir('ENTREGA');
    await e.c.atribuir('admin', 'r1', 'm1');
    expect(e.atualizacoes[0].category).toBe('ENTREGA');
    const em = montarAtribuir('ENTREGA_MOTO');
    await em.c.atribuir('admin', 'r1', 'm1');
    expect(em.atualizacoes[0].category).toBe('ENTREGA_MOTO');
    const p = montarAtribuir('CARRO');
    await p.c.atribuir('admin', 'r1', 'm1');
    expect(p.atualizacoes[0].category).toBe('MOTO');
  });
});
