import { RequestMethod } from '@nestjs/common';
import { UserRole } from '@ride/shared';

// Motor de corridas, cidades e Central sao simulados (nao carregam o banco).
jest.mock('../rides/rides.service', () => ({ RidesService: class RidesService {} }));
jest.mock('../pracas/pracas.service', () => ({ PracasService: class PracasService {} }));
jest.mock('./central.service', () => ({ CentralService: class CentralService {} }));

import { ROLES_KEY } from '../../common/constants/metadata.constants';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ComercioAvisosService } from '../comercio/comercio.avisos';
import { ComercioService } from '../comercio/comercio.service';
import { EntregaManualController } from './entrega-manual.controller';
import { EntregaManualCentralController } from './entrega-manual-central.controller';
import { entregaAvulsaSchema } from '../comercio/comercio.regras';
import { EntregaManualService } from './entrega-manual.service';

/**
 * Lancamento manual de entrega pelo motorista: servicos de verdade (Comercio e
 * EntregaManual), banco falso na memoria, motor de corridas e despacho simulados.
 * Nenhuma entrega real, motorista real ou loja real.
 */
const PRACAS = [
  { id: 'goiatuba', nome: 'Goiatuba', latitude: -18.01, longitude: -49.36, raioKm: 20 },
  { id: 'itumbiara', nome: 'Itumbiara', latitude: -18.41, longitude: -49.21, raioKm: 20 },
];

const destino = { logradouro: 'Rua Verde', numero: '55', bairro: 'Jardim', cidade: 'Goiatuba', uf: 'GO', cep: '75600111', latitude: -18.02, longitude: -49.35 };
const pedidoManual = (comercioId: string, chave = 'chave-manual-00000001', extra: Record<string, unknown> = {}) => ({
  comercioId,
  chave,
  encomenda: { descricao: '2 caixas de bolo' },
  destinatario: { nome: 'Ana Lima', telefone: '(64) 98888-7777' },
  destino,
  ...extra,
});

function loja(id: string, userId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    userId,
    nomeFantasia: 'Padaria Estrela',
    razaoSocial: null,
    cnpj: '11222333000181',
    telefone: '+5564999991234',
    email: `${userId}@loja.com`,
    logradouro: 'Rua das Flores',
    numero: '120',
    bairro: 'Centro',
    cidade: 'Goiatuba',
    uf: 'GO',
    cep: '75600000',
    complemento: null,
    latitude: -18.01,
    longitude: -49.36,
    status: 'APROVADO',
    createdAt: new Date(),
    ...extra,
  };
}

/** Confere um `where` simples do Prisma (so o que a busca do motorista usa). */
function combina(c: any, where: any, users: Record<string, any>): boolean {
  if (!where) return true;
  if (where.OR) return where.OR.some((w: any) => combina(c, w, users));
  if (where.email !== undefined) return c.email === where.email;
  if (where.user?.email !== undefined) return users[c.userId]?.email === where.user.email;
  if (where.telefone?.endsWith) return c.telefone.endsWith(where.telefone.endsWith);
  if (where.user?.phone?.endsWith) return (users[c.userId]?.phone ?? '').endsWith(where.user.phone.endsWith);
  if (where.nomeFantasia?.contains) return c.nomeFantasia.toLowerCase().includes(where.nomeFantasia.contains.toLowerCase());
  return true;
}

const entregasFalsas = { criarParadas: jest.fn(async () => undefined), paradasDaCorrida: jest.fn(async () => [] as unknown[]) };

function montar(op: { chaveLigada?: boolean; online?: boolean; categoria?: string; semVeiculo?: boolean; pracaDoMotorista?: string | null; operadorDaCidade?: string | null } = {}) {
  const users: Record<string, any> = {
    uLoja1: { id: 'uLoja1', role: 'PASSENGER', email: 'padaria@loja.com', phone: '+5564999991234', emailVerifiedAt: new Date() },
    uLoja2: { id: 'uLoja2', role: 'PASSENGER', email: 'mercado@loja.com', phone: '+5564988887777', emailVerifiedAt: new Date() },
    uSemEmail: { id: 'uSemEmail', role: 'PASSENGER', email: 'novo@loja.com', phone: '+5564977776666', emailVerifiedAt: null },
    uItu: { id: 'uItu', role: 'PASSENGER', email: 'itu@loja.com', phone: '+5564955554444', emailVerifiedAt: new Date() },
    uMot: { id: 'uMot', role: 'DRIVER', email: 'mot@x.com', phone: '+5564911112222', emailVerifiedAt: new Date() },
  };
  const comercios: any[] = [
    loja('c1', 'uLoja1'),
    loja('c2', 'uLoja2', { nomeFantasia: 'Mercado Bom Preço', telefone: '+5564988887777', email: 'mercado@loja.com', bairro: 'Sul' }),
    loja('c3', 'uSemEmail', { nomeFantasia: 'Padaria Nova', telefone: '+5564977776666', email: 'novo@loja.com' }),
    loja('cItu', 'uItu', { nomeFantasia: 'Padaria Itumbiara', telefone: '+5564955554444', email: 'itu@loja.com', cidade: 'Itumbiara', latitude: -18.41, longitude: -49.21 }),
    loja('cAguardando', 'uAg', { nomeFantasia: 'Padaria Aguardando', telefone: '+5564966665555', email: 'ag@loja.com', status: 'AGUARDANDO' }),
    loja('cSuspensa', 'uSus', { nomeFantasia: 'Padaria Suspensa', telefone: '+5564944443333', email: 'sus@loja.com', status: 'SUSPENSO' }),
  ];
  users.uAg = { id: 'uAg', role: 'PASSENGER', email: 'ag@loja.com', phone: '+5564966665555', emailVerifiedAt: new Date() };
  users.uSus = { id: 'uSus', role: 'PASSENGER', email: 'sus@loja.com', phone: '+5564944443333', emailVerifiedAt: new Date() };
  const pedidos: any[] = [];
  const corridas: Record<string, any> = {};
  const historico: any[] = [];
  const auditoria: any[] = [];
  const config: Record<string, unknown> = op.chaveLigada === false ? {} : { 'comercio.config': { ativo: true } };
  let n = 0;
  const motorista = { id: 'mot1', userId: 'uMot', status: 'APPROVED', isOnline: op.online ?? true };

  const comJoin = (p: any) => (p ? { ...p, ride: corridas[p.rideId] } : null);
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => users[where.id] ?? null,
      findFirst: async ({ where }: any) => Object.values(users).find((u: any) => u.phone === where.phone) ?? null,
      create: jest.fn(async ({ data }: any) => {
        const novo = { id: `uNovo${++n}`, ...data };
        users[novo.id] = novo;
        return novo;
      }),
    },
    driver: { findFirst: async ({ where }: any) => (where.userId === 'uMot' ? { ...motorista } : null) },
    vehicle: {
      findFirst: async () => (op.semVeiculo ? null : { category: op.categoria ?? 'MOTO' }),
    },
    comercio: {
      findUnique: async ({ where }: any) => {
        const c = comercios.find((x) => x.id === where.id);
        return c ? { ...c } : null;
      },
      findMany: async ({ where, take }: any = {}) => comercios.filter((c) => combina(c, where, users)).slice(0, take ?? Infinity),
    },
    comercioPedido: {
      findUnique: async ({ where }: any) => {
        if (where.rideId) return comJoin(pedidos.find((p) => p.rideId === where.rideId));
        const k = where.comercioId_chave;
        return pedidos.find((p) => p.comercioId === k.comercioId && p.chave === k.chave) ?? null;
      },
      findFirst: async ({ where }: any) => comJoin(pedidos.find((p) => p.rideId === where.rideId && p.comercioId === where.comercioId)),
      findMany: async ({ where, take }: any = {}) =>
        pedidos
          .filter((p) => !where?.comercioId || p.comercioId === where.comercioId)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(comJoin)
          .slice(0, take ?? Infinity),
      count: async ({ where }: any) =>
        pedidos.filter((p) => {
          if (p.comercioId !== where.comercioId) return false;
          const st = corridas[p.rideId]?.status;
          if (where.ride?.status?.in) return where.ride.status.in.includes(st);
          if (typeof where.ride?.status === 'string') return st === where.ride.status;
          return true;
        }).length,
      create: async ({ data }: any) => {
        if (pedidos.some((p) => p.comercioId === data.comercioId && p.chave === data.chave)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        pedidos.push({ createdAt: new Date(++n), ...data });
      },
    },
    ride: {
      update: jest.fn(async ({ where, data }: any) => Object.assign(corridas[where.id], data)),
      findUnique: async ({ where }: any) => corridas[where.id] ?? null,
      count: async ({ where }: any) => Object.values(corridas).filter((c: any) => c.passengerId === where.passengerId && where.status.in.includes(c.status)).length,
    },
    rideStatusHistory: { create: jest.fn(async ({ data }: any) => void historico.push(data)) },
    setting: { findUnique: async ({ where }: any) => (config[where.key] === undefined ? null : { key: where.key, value: config[where.key] }) },
    auditLog: {
      create: jest.fn(async ({ data }: any) => void auditoria.push(data)),
      findFirst: async ({ where }: any) =>
        auditoria.find((a) => a.actorId === where.actorId && a.action === where.action && a.entity === where.entity && a.after?.chave === where.after.equals) ?? null,
    },
    notification: { findFirst: async () => null },
    $executeRawUnsafe: jest.fn(),
    withTransaction: async (fn: any) => fn(prisma),
  };

  const rides: any = {
    estimar: jest.fn(async () => ({
      distanceMeters: 3200,
      durationSeconds: 600,
      cotacao: 'cotacao-assinada',
      opcoesEntrega: [
        { veiculo: 'MOTO', nome: 'Moto', estimatedFareCents: 700 },
        { veiculo: 'CARRO', nome: 'Carro', estimatedFareCents: 1200 },
      ],
    })),
    pedir: jest.fn(async (_uid: string, input: any, o: any) => {
      const id = `r${++n}`;
      await o.aoCriar(prisma, id);
      corridas[id] = {
        id,
        passengerId: _uid,
        code: `FM${n}`,
        status: 'SEARCHING',
        category: 'ENTREGA_MOTO',
        requestedAt: new Date(),
        estimatedFareCents: 700,
        finalFareCents: null,
        pickupAddress: input.pickup.address,
        dropoffAddress: input.dropoff.address,
        driverId: null,
        entrega: { destinatarioNome: 'Ana Lima', destinatarioTelefone: '64988887777', codigo: '4821', coletadaEm: null, entregueEm: null },
        driver: null,
        vehicle: null,
      };
      return { ride: { id } };
    }),
    aceitar: jest.fn(async (_m: string, id: string) => {
      corridas[id].status = 'DRIVER_ASSIGNED';
    }),
  };
  const central: any = {
    atribuir: jest.fn(async (_admin: string, id: string, driverId: string) => {
      corridas[id].driverId = driverId;
    }),
  };
  const pracas: any = {
    listar: jest.fn(async () => PRACAS),
    pracaDoMotorista: jest.fn(async () => (op.pracaDoMotorista === undefined ? 'goiatuba' : op.pracaDoMotorista)),
    // Operador da Central: sem cidade = dono (ve tudo); com cidade so mexe nela.
    escopoDe: jest.fn(async () => (op.operadorDaCidade ?? null)),
    exigirAcesso: jest.fn(async (_u: unknown, praca: string | null) => {
      if (op.operadorDaCidade && op.operadorDaCidade !== praca) throw new Error('Isto e de outra cidade.');
    }),
  };
  const avisos = new ComercioAvisosService(prisma, { avisar: jest.fn() } as never);
  const comercio = new ComercioService(prisma, rides as never, pracas as never, avisos, entregasFalsas as never);
  const manual = new EntregaManualService(prisma, comercio, central as never, rides as never, pracas as never);
  return { prisma, rides, central, comercio, manual, comercios, pedidos, corridas, historico, auditoria, motorista, config, users };
}

describe('Lancamento manual: busca do estabelecimento pelo motorista', () => {
  it('acha por NOME (mais de um resultado vem com o que distingue) e por TELEFONE e por E-MAIL', async () => {
    const { comercio } = montar();
    const porNome = await comercio.buscarParaMotorista('uMot', 'padaria');
    // Padaria Estrela e Padaria Nova (da cidade do motorista); as de outras cidades nao aparecem.
    expect(porNome.itens.map((i) => i.nomeFantasia).sort()).toEqual(['Padaria Aguardando', 'Padaria Estrela', 'Padaria Nova', 'Padaria Suspensa']);
    const estrela = porNome.itens.find((i) => i.nomeFantasia === 'Padaria Estrela')!;
    expect(estrela).toMatchObject({ endereco: 'Rua das Flores, 120, Centro', cidade: 'Goiatuba', telefoneFinal: '…1234', podeLancar: true, motivo: null });

    const porTel = await comercio.buscarParaMotorista('uMot', '(64) 99999-1234');
    expect(porTel.itens.map((i) => i.id)).toEqual(['c1']);
    const porTelComPais = await comercio.buscarParaMotorista('uMot', '+55 64 99999 1234');
    expect(porTelComPais.itens.map((i) => i.id)).toEqual(['c1']);

    const porEmail = await comercio.buscarParaMotorista('uMot', 'Padaria@Loja.com');
    expect(porEmail.itens.map((i) => i.id)).toEqual(['c1']);
  });

  it('nao devolve CNPJ nem e-mail e telefone inteiros, e nao cria nada', async () => {
    const { comercio, comercios } = montar();
    const r = await comercio.buscarParaMotorista('uMot', 'padaria estrela');
    const texto = JSON.stringify(r);
    expect(texto).not.toContain('11222333000181');
    expect(texto).not.toContain('padaria@loja.com');
    expect(texto).not.toContain('99999');
    expect(comercios).toHaveLength(6);
  });

  it('nome inexistente: lista vazia (o app mostra "nao encontrado"), sem criar cadastro', async () => {
    const { comercio, comercios } = montar();
    expect((await comercio.buscarParaMotorista('uMot', 'Loja Fantasma')).itens).toEqual([]);
    expect(comercios).toHaveLength(6);
  });

  it('loja de OUTRA cidade nunca aparece (isolamento por praca)', async () => {
    const { comercio } = montar();
    expect((await comercio.buscarParaMotorista('uMot', 'Itumbiara')).itens).toEqual([]);
    expect((await comercio.buscarParaMotorista('uMot', 'itu@loja.com')).itens).toEqual([]);
    expect((await comercio.buscarParaMotorista('uMot', '64955554444')).itens).toEqual([]);
  });

  it('nao aprovada ou suspensa: aparece com o MOTIVO e sem permissao de lancar', async () => {
    const { comercio } = montar();
    const r = await comercio.buscarParaMotorista('uMot', 'padaria');
    const ag = r.itens.find((i) => i.id === 'cAguardando')!;
    const sus = r.itens.find((i) => i.id === 'cSuspensa')!;
    expect(ag).toMatchObject({ podeLancar: false, motivo: expect.stringContaining('aguardando aprovação') });
    expect(sus).toMatchObject({ podeLancar: false, motivo: expect.stringContaining('suspenso') });
  });

  it('informa se a chave geral esta desligada (o app avisa antes de tentar)', async () => {
    expect((await montar({ chaveLigada: false }).comercio.buscarParaMotorista('uMot', 'padaria')).liberado).toBe(false);
    expect((await montar().comercio.buscarParaMotorista('uMot', 'padaria')).liberado).toBe(true);
  });

  it('so motorista APROVADO busca; quem nao e motorista e recusado', async () => {
    const ctx = montar();
    ctx.motorista.status = 'PENDING';
    await expect(ctx.comercio.buscarParaMotorista('uMot', 'padaria')).rejects.toThrow('ainda não foi aprovado');
    await expect(ctx.comercio.buscarParaMotorista('uLoja1', 'padaria')).rejects.toThrow('não tem cadastro de motorista');
  });
});

describe('Lancamento manual: perfil para confirmar', () => {
  it('mostra nome, CNPJ mascarado, endereco de retirada, situacao e conta so entregas CONCLUIDAS', async () => {
    const ctx = montar();
    ctx.pedidos.push(
      { comercioId: 'c1', rideId: 'a', chave: 'k1', origem: 'APP', createdAt: new Date(1), destBairro: 'Centro', encomenda: 'x', observacoes: null, coletaAlternativa: false },
      { comercioId: 'c1', rideId: 'b', chave: 'k2', origem: 'MOTORISTA', createdAt: new Date(2), destBairro: 'Sul', encomenda: 'x', observacoes: null, coletaAlternativa: false },
      { comercioId: 'c1', rideId: 'c', chave: 'k3', origem: 'APP', createdAt: new Date(3), destBairro: 'Norte', encomenda: 'x', observacoes: null, coletaAlternativa: false },
      { comercioId: 'c1', rideId: 'd', chave: 'k4', origem: 'APP', createdAt: new Date(4), destBairro: 'Leste', encomenda: 'x', observacoes: null, coletaAlternativa: false },
    );
    const base = { requestedAt: new Date(), estimatedFareCents: 700, finalFareCents: null, pickupAddress: 'a', dropoffAddress: 'b', entrega: null, driver: null, vehicle: null, category: 'ENTREGA_MOTO', code: 'X' };
    ctx.corridas.a = { ...base, id: 'a', status: 'COMPLETED' };
    ctx.corridas.b = { ...base, id: 'b', status: 'COMPLETED' };
    ctx.corridas.c = { ...base, id: 'c', status: 'CANCELLED_BY_PASSENGER' };
    ctx.corridas.d = { ...base, id: 'd', status: 'SEARCHING' };

    const p = await ctx.comercio.perfilParaMotorista('uMot', 'c1');
    expect(p).toMatchObject({
      nomeFantasia: 'Padaria Estrela',
      cnpj: '**.***.***/****-81',
      enderecoDeRetirada: expect.stringContaining('Rua das Flores, 120'),
      situacaoRotulo: expect.any(String),
      podeLancar: true,
      entregasConcluidas: 2, // cancelada e em busca NAO contam
    });
    expect(p.historico).toHaveLength(4);
    expect(p.historico.map((h) => h.origem)).toContain('MOTORISTA');
    const texto = JSON.stringify(p);
    expect(texto).not.toContain('11222333000181');
    expect(texto).not.toContain('88887777'); // telefone de quem recebe nunca aparece
  });

  it('loja de outra cidade ou inexistente: 404, sem revelar que existe', async () => {
    const { comercio } = montar();
    await expect(comercio.perfilParaMotorista('uMot', 'cItu')).rejects.toThrow('Estabelecimento não encontrado');
    await expect(comercio.perfilParaMotorista('uMot', 'nao-existe')).rejects.toThrow('Estabelecimento não encontrado');
  });
});

describe('Lancamento manual: preco oficial', () => {
  it('cota pelo motor oficial e mostra so a opcao do veiculo em uso do motorista (moto)', async () => {
    const ctx = montar({ categoria: 'MOTO' });
    const r = await ctx.comercio.cotarParaMotorista('uMot', { comercioId: 'c1', destino } as never);
    expect(r.veiculo).toBe('MOTO');
    expect(r.opcoes).toEqual([{ veiculo: 'MOTO', nome: 'Moto', valorCents: 700 }]);
    // o "passageiro" da cotacao e a conta da loja, nunca a do motorista
    expect((ctx.rides.estimar.mock.calls[0] as unknown[])[1]).toBe('uLoja1');
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
  });

  it('motorista de carro recebe a opcao de carro', async () => {
    const r = await montar({ categoria: 'CARRO' }).comercio.cotarParaMotorista('uMot', { comercioId: 'c1', destino } as never);
    expect(r.opcoes).toEqual([{ veiculo: 'CARRO', nome: 'Carro', valorCents: 1200 }]);
  });

  it.each([
    ['loja aguardando', 'cAguardando', {}, 'aguardando'],
    ['loja suspensa', 'cSuspensa', {}, 'suspens'],
    ['e-mail nao confirmado', 'c3', {}, 'e-mail'],
    ['chave geral desligada', 'c1', { chaveLigada: false }, ''],
  ])('%s: nao cota', async (_nome, id, opcoes, trecho) => {
    const ctx = montar(opcoes);
    await expect(ctx.comercio.cotarParaMotorista('uMot', { comercioId: id, destino } as never)).rejects.toThrow(trecho ? new RegExp(trecho, 'i') : undefined);
    expect(ctx.rides.estimar).not.toHaveBeenCalled();
  });

  it('motorista sem veiculo em uso: recusado com explicacao', async () => {
    await expect(montar({ semVeiculo: true }).comercio.cotarParaMotorista('uMot', { comercioId: 'c1', destino } as never)).rejects.toThrow('veículo em uso');
  });
});

describe('Lancamento manual: criar e atribuir a entrega', () => {
  it('lanca: pedido do Comercio com origem MOTORISTA, quem lancou e quando; entrega ja atribuida a ele', async () => {
    const ctx = montar();
    const r = await ctx.manual.lancar('uMot', pedidoManual('c1') as never);
    expect(r).toMatchObject({ repetido: false, codigo: expect.stringMatching(/^FM/) });
    // o pedido sai pelo motor oficial, em nome da LOJA, como entrega em dinheiro (sem pagamento novo)
    const [passageiro, entrada, opcoes] = ctx.rides.pedir.mock.calls[0] as unknown as [string, any, any];
    expect(passageiro).toBe('uLoja1');
    expect(entrada.paymentMethodType).toBe('CASH');
    expect(entrada.entrega.veiculo).toBe('MOTO');
    expect(opcoes.varias).toBe(true);
    // registro da origem
    expect(ctx.pedidos).toHaveLength(1);
    expect(ctx.pedidos[0]).toMatchObject({ comercioId: 'c1', origem: 'MOTORISTA', lancadoPor: 'mot1', lancadoEm: expect.any(Date) });
    // despacho: atribuida e aceita por ele; sem "cheguei" (ele ainda vai ate a loja)
    expect(ctx.central.atribuir).toHaveBeenCalledWith('uMot', r.rideId, 'mot1');
    expect(ctx.rides.aceitar).toHaveBeenCalledWith('mot1', r.rideId);
    // historico e auditoria com autor, operacao e loja
    expect(ctx.historico[0]).toMatchObject({ rideId: r.rideId, actorId: 'uMot', note: expect.stringContaining('Padaria Estrela') });
    expect(ctx.auditoria[0]).toMatchObject({ actorId: 'uMot', actorRole: UserRole.DRIVER, action: 'COMERCIO_ENTREGA_LANCADA_PELO_MOTORISTA' });
    expect(ctx.auditoria[0].after).toMatchObject({ comercioId: 'c1', origem: 'MOTORISTA' });
  });

  it('o veiculo vem do motorista, nunca do que o app mandar', async () => {
    const ctx = montar({ categoria: 'CARRO' });
    await ctx.manual.lancar('uMot', pedidoManual('c1', 'chave-manual-00000002', { veiculo: 'MOTO' }) as never);
    expect((ctx.rides.pedir.mock.calls[0] as unknown as [string, any])[1].entrega.veiculo).toBe('CARRO');
  });

  it.each([
    ['loja aguardando', 'cAguardando', {}, /aguardando/i],
    ['loja suspensa', 'cSuspensa', {}, /suspens/i],
    ['e-mail nao confirmado', 'c3', {}, /e-mail/i],
    ['chave geral desligada', 'c1', { chaveLigada: false }, /./],
  ])('porta fechada (%s): nada e criado nem atribuido', async (_n, id, opcoes, erro) => {
    const ctx = montar(opcoes);
    await expect(ctx.manual.lancar('uMot', pedidoManual(id) as never)).rejects.toThrow(erro);
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
    expect(ctx.pedidos).toHaveLength(0);
    expect(ctx.central.atribuir).not.toHaveBeenCalled();
  });

  it('cidade sem Entrega / veiculo nao aceito (portas do pedido oficial): o erro chega e nada fica pela metade', async () => {
    const ctx = montar();
    ctx.rides.pedir.mockRejectedValueOnce(new Error('Entrega de moto não está disponível nesta cidade.'));
    await expect(ctx.manual.lancar('uMot', pedidoManual('c1') as never)).rejects.toThrow('Entrega de moto não está disponível nesta cidade.');
    expect(ctx.pedidos).toHaveLength(0);
    expect(ctx.central.atribuir).not.toHaveBeenCalled();
  });

  it('loja de outra cidade: 404, mesmo sabendo o id', async () => {
    const ctx = montar();
    await expect(ctx.manual.lancar('uMot', pedidoManual('cItu') as never)).rejects.toThrow('Estabelecimento não encontrado');
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
  });

  it('motorista offline ou nao aprovado nao lanca', async () => {
    const off = montar({ online: false });
    await expect(off.manual.lancar('uMot', pedidoManual('c1') as never)).rejects.toThrow('online');
    const pend = montar();
    pend.motorista.status = 'PENDING';
    await expect(pend.manual.lancar('uMot', pedidoManual('c1') as never)).rejects.toThrow('ainda não foi aprovado');
  });

  it('conta de loja (nao motorista) nao entra por aqui', async () => {
    await expect(montar().manual.lancar('uLoja1', pedidoManual('c1') as never)).rejects.toThrow('não tem cadastro de motorista');
  });

  it('o preco confirmado precisa ser o oficial: se mudou, 409 e nada e criado', async () => {
    const ctx = montar();
    await expect(ctx.manual.lancar('uMot', pedidoManual('c1', 'chave-manual-00000003', { valorEsperadoCents: 650 }) as never)).rejects.toThrow('O preço mudou');
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
    // com o preco certo (700 da moto) passa
    const ok = await ctx.manual.lancar('uMot', pedidoManual('c1', 'chave-manual-00000004', { valorEsperadoCents: 700 }) as never);
    expect(ok.repetido).toBe(false);
  });

  it('repetir a mesma chave (queda de rede) nao duplica a entrega', async () => {
    const ctx = montar();
    const a = await ctx.manual.lancar('uMot', pedidoManual('c1') as never);
    const b = await ctx.manual.lancar('uMot', pedidoManual('c1') as never);
    expect(b).toMatchObject({ rideId: a.rideId, repetido: true });
    expect(ctx.pedidos).toHaveLength(1);
    expect(ctx.rides.pedir).toHaveBeenCalledTimes(1);
    expect(ctx.central.atribuir).toHaveBeenCalledTimes(1);
  });

  it('duas chamadas ao mesmo tempo com a mesma chave criam uma entrega so', async () => {
    const ctx = montar();
    const [a, b] = await Promise.allSettled([
      ctx.manual.lancar('uMot', pedidoManual('c1') as never),
      ctx.manual.lancar('uMot', pedidoManual('c1') as never),
    ]);
    expect(ctx.pedidos).toHaveLength(1);
    expect([a.status, b.status]).toContain('fulfilled');
  });

  it('chave que ja e de uma entrega pedida pelo APP da loja nao pode ser reaproveitada pelo motorista', async () => {
    const ctx = montar();
    ctx.pedidos.push({ comercioId: 'c1', rideId: 'rApp', chave: 'chave-manual-00000001', origem: 'APP', lancadoPor: null, createdAt: new Date(1) });
    ctx.corridas.rApp = { id: 'rApp', code: 'APP1', status: 'SEARCHING', driverId: null };
    await expect(ctx.manual.lancar('uMot', pedidoManual('c1') as never)).rejects.toThrow('já foi usada');
    expect(ctx.central.atribuir).not.toHaveBeenCalled();
  });

  it('falha ao atribuir: a entrega e cancelada pelo sistema e nao fica solta', async () => {
    const ctx = montar();
    ctx.central.atribuir.mockRejectedValueOnce(new Error('Motorista ocupado.'));
    await expect(ctx.manual.lancar('uMot', pedidoManual('c1') as never)).rejects.toThrow('Motorista ocupado.');
    const rideId = ctx.pedidos[0].rideId;
    expect(ctx.corridas[rideId].status).toBe('CANCELLED_BY_SYSTEM');
    expect(ctx.corridas[rideId].driverId).toBeNull();
  });

  it('teto de entregas abertas da loja vale tambem para o motorista', async () => {
    const ctx = montar();
    for (let i = 0; i < 20; i++) {
      ctx.pedidos.push({ comercioId: 'c1', rideId: `ab${i}`, chave: `kk-${i}`.padEnd(20, 'x'), origem: 'APP', createdAt: new Date(i) });
      ctx.corridas[`ab${i}`] = { id: `ab${i}`, status: 'SEARCHING' };
    }
    await expect(ctx.manual.lancar('uMot', pedidoManual('c1', 'chave-manual-00000009') as never)).rejects.toThrow('entregas em andamento');
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
  });

  it('a entrega lancada e igual a do app: mesmo "item" na loja, com a origem preservada', async () => {
    const ctx = montar();
    await ctx.manual.lancar('uMot', pedidoManual('c1') as never);
    expect(ctx.pedidos[0].origem).toBe('MOTORISTA');
    const p = await ctx.comercio.perfilParaMotorista('uMot', 'c1');
    expect(p.historico[0]).toMatchObject({ origem: 'MOTORISTA' });
    expect(p.entregasConcluidas).toBe(0); // ainda nao terminou: nao conta
  });
});

describe('Lancamento manual: rotas e papeis', () => {
  it('so o papel DRIVER usa as rotas, e a corrida manual de passageiro continua separada', () => {
    expect(Reflect.getMetadata(ROLES_KEY, EntregaManualController)).toEqual([UserRole.DRIVER]);
    const guard = new RolesGuard(new Reflector());
    const ctx = (role: UserRole) =>
      ({
        getHandler: () => EntregaManualController.prototype.lancar,
        getClass: () => EntregaManualController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      }) as never;
    expect(guard.canActivate(ctx(UserRole.DRIVER))).toBe(true);
    expect(() => guard.canActivate(ctx(UserRole.PASSENGER))).toThrow();
    expect(() => guard.canActivate(ctx(UserRole.ADMIN))).toThrow();
    expect(Reflect.getMetadata('path', EntregaManualController)).toBe('driver/manual-deliveries');
    expect(Reflect.getMetadata('method', EntregaManualController.prototype.lancar)).toBe(RequestMethod.POST);
  });
});

describe('Lancamento manual pela Central', () => {
  const admin = { id: 'uAdmin', role: UserRole.ADMIN } as never;
  const pedidoCentral = (comercioId: string, extra: Record<string, unknown> = {}) => ({
    ...pedidoManual(comercioId, 'chave-central-0000001'),
    veiculo: 'MOTO',
    ...extra,
  });

  it('lanca: pedido do Comercio com origem CENTRAL, veiculo escolhido e despacho automatico (ninguem atribuido)', async () => {
    const ctx = montar();
    const r = await ctx.manual.lancarPelaCentral(admin, pedidoCentral('c1') as never);
    expect(r).toMatchObject({ repetido: false, codigo: expect.stringMatching(/^FM/) });
    const [passageiro, entrada] = ctx.rides.pedir.mock.calls[0] as unknown as [string, any];
    expect(passageiro).toBe('uLoja1');
    expect(entrada.paymentMethodType).toBe('CASH');
    expect(entrada.entrega.veiculo).toBe('MOTO');
    expect(ctx.pedidos[0]).toMatchObject({ comercioId: 'c1', origem: 'CENTRAL' });
    expect(ctx.pedidos[0].lancadoPor ?? null).toBeNull();
    expect(ctx.central.atribuir).not.toHaveBeenCalled();
    expect(ctx.rides.aceitar).not.toHaveBeenCalled();
    expect(ctx.auditoria[0]).toMatchObject({ actorId: 'uAdmin', actorRole: UserRole.ADMIN, action: 'COMERCIO_ENTREGA_LANCADA_PELA_CENTRAL' });
  });

  it('o veiculo e o que a Central escolheu (carro)', async () => {
    const ctx = montar();
    await ctx.manual.lancarPelaCentral(admin, pedidoCentral('c1', { veiculo: 'CARRO' }) as never);
    expect((ctx.rides.pedir.mock.calls[0] as unknown as [string, any])[1].entrega.veiculo).toBe('CARRO');
  });

  it('com motorista escolhido: so envia a ele (ele aceita no aplicativo)', async () => {
    const ctx = montar();
    const r = await ctx.manual.lancarPelaCentral(admin, pedidoCentral('c1', { motoristaId: '11111111-1111-4111-8111-111111111111' }) as never);
    expect(ctx.central.atribuir).toHaveBeenCalledWith('uAdmin', r.rideId, '11111111-1111-4111-8111-111111111111');
    expect(ctx.rides.aceitar).not.toHaveBeenCalled();
  });

  it('falha ao enviar ao motorista escolhido: a entrega e cancelada e nao fica solta', async () => {
    const ctx = montar();
    ctx.central.atribuir.mockRejectedValueOnce(new Error('Motorista desconectado'));
    await expect(
      ctx.manual.lancarPelaCentral(admin, pedidoCentral('c1', { motoristaId: '11111111-1111-4111-8111-111111111111' }) as never),
    ).rejects.toThrow('Motorista desconectado');
    const ids = Object.keys(ctx.corridas);
    expect(ctx.corridas[ids[0]].status).toBe('CANCELLED_BY_SYSTEM');
  });

  it.each([
    ['loja aguardando', 'cAguardando', {}, /aguardando/i],
    ['loja suspensa', 'cSuspensa', {}, /suspens/i],
    ['e-mail nao confirmado', 'c3', {}, /e-mail/i],
    ['chave geral desligada', 'c1', { chaveLigada: false }, /./],
  ])('porta fechada (%s): nada e criado', async (_n, id, opcoes, erro) => {
    const ctx = montar(opcoes);
    await expect(ctx.manual.lancarPelaCentral(admin, pedidoCentral(id) as never)).rejects.toThrow(erro);
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
    expect(ctx.pedidos).toHaveLength(0);
  });

  it('operador de OUTRA cidade nao lanca nem enxerga a loja', async () => {
    const ctx = montar({ operadorDaCidade: 'itumbiara' });
    await expect(ctx.manual.lancarPelaCentral(admin, pedidoCentral('c1') as never)).rejects.toThrow('outra cidade');
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
    const achadas = await ctx.comercio.buscarParaCentral('itumbiara', async (praca) => praca === 'goiatuba');
    expect(achadas.itens).toHaveLength(0);
  });

  it('repetir a mesma chave nao duplica; chave de entrega do app nao e reaproveitada', async () => {
    const ctx = montar();
    const a = await ctx.manual.lancarPelaCentral(admin, pedidoCentral('c1') as never);
    const b = await ctx.manual.lancarPelaCentral(admin, pedidoCentral('c1') as never);
    expect(b).toMatchObject({ repetido: true, rideId: a.rideId });
    expect(ctx.pedidos).toHaveLength(1);
  });

  it('a Central cota o preco oficial dos dois veiculos, sem criar nada', async () => {
    const ctx = montar();
    const c = await ctx.comercio.lojaParaCentral('c1');
    const { comercioId: _x, chave: _y, ...cotar } = pedidoCentral('c1') as any;
    const r = await ctx.comercio.cotarParaCentral(c, cotar);
    expect(r.opcoes.length).toBeGreaterThan(0);
    expect(ctx.pedidos).toHaveLength(0);
  });

  it('rotas: so ADMIN, em admin/manual-deliveries (a rota do motorista continua so do motorista)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, EntregaManualCentralController)).toEqual([UserRole.ADMIN]);
    expect(Reflect.getMetadata('path', EntregaManualCentralController)).toBe('admin/manual-deliveries');
    expect(Reflect.getMetadata(ROLES_KEY, EntregaManualController)).toEqual([UserRole.DRIVER]);
  });
});

describe('Lancamento manual pela Central: estabelecimento NAO cadastrado (avulso)', () => {
  const admin = { id: 'uAdmin', role: UserRole.ADMIN } as never;
  const estabelecimento = (extra: Record<string, unknown> = {}) => ({
    nome: 'Lanchonete do Zé',
    telefone: '(64) 99111-2233',
    coleta: { address: 'Av. Brasil, 300, Centro, Goiatuba/GO', latitude: -18.01, longitude: -49.36 },
    ...extra,
  });
  const pedidoAvulso = (extra: Record<string, unknown> = {}) => ({
    chave: 'chave-avulsa-000000001',
    estabelecimento: estabelecimento(),
    encomenda: { descricao: '3 marmitas' },
    destinatario: { nome: 'Ana Lima', telefone: '(64) 98888-7777' },
    destino,
    veiculo: 'MOTO',
    ...extra,
  });

  it('lanca sem cadastro: cria a conta de contato, coleta no endereco digitado e NAO cria pedido do Comercio', async () => {
    const ctx = montar();
    const r = await ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never);
    expect(r).toMatchObject({ repetido: false, codigo: expect.stringMatching(/^FM/) });
    expect(ctx.pedidos).toHaveLength(0);
    expect(ctx.comercios).toHaveLength(6);
    const [passageiro, entrada] = ctx.rides.pedir.mock.calls[0] as unknown as [string, any];
    expect(ctx.users[passageiro]).toMatchObject({ phone: '+5564991112233', role: 'PASSENGER', name: 'Lanchonete do Zé', metadata: { criadoPelaCentral: true } });
    expect(entrada.pickup.address).toBe('Av. Brasil, 300, Centro, Goiatuba/GO');
    expect(entrada.paymentMethodType).toBe('CASH');
    expect(entrada.entrega).toMatchObject({ veiculo: 'MOTO', destinatarioNome: 'Ana Lima' });
    expect(entrada.entrega.descricao).toBe('AVULSO Lanchonete do Zé (64991112233): 3 marmitas');
    expect(ctx.central.atribuir).not.toHaveBeenCalled();
    expect(ctx.historico[0]).toMatchObject({ actorId: 'uAdmin', note: expect.stringContaining('sem cadastro') });
    expect(ctx.auditoria[0]).toMatchObject({
      actorId: 'uAdmin',
      actorRole: UserRole.ADMIN,
      action: 'ENTREGA_AVULSA_LANCADA_PELA_CENTRAL',
      entity: 'ride',
      after: { chave: 'chave-avulsa-000000001', estabelecimento: { nome: 'Lanchonete do Zé', telefone: '64991112233' } },
    });
  });

  it('o mesmo telefone reaproveita a conta (nao cria outra) e o veiculo e o que a Central escolheu', async () => {
    const ctx = montar();
    await ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never);
    await ctx.manual.lancarAvulsa(admin, pedidoAvulso({ chave: 'chave-avulsa-000000002', veiculo: 'CARRO' }) as never);
    expect(ctx.prisma.user.create).toHaveBeenCalledTimes(1);
    const [p1] = ctx.rides.pedir.mock.calls[0] as unknown as [string];
    const [p2, e2] = ctx.rides.pedir.mock.calls[1] as unknown as [string, any];
    expect(p2).toBe(p1);
    expect(e2.entrega.veiculo).toBe('CARRO');
  });

  it('com motorista escolhido: so envia a ele; se falhar, a entrega e cancelada e nao fica solta', async () => {
    const ctx = montar();
    const motoristaId = '11111111-1111-4111-8111-111111111111';
    const r = await ctx.manual.lancarAvulsa(admin, pedidoAvulso({ motoristaId }) as never);
    expect(ctx.central.atribuir).toHaveBeenCalledWith('uAdmin', r.rideId, motoristaId);
    ctx.central.atribuir.mockRejectedValueOnce(new Error('Motorista desconectado'));
    await expect(ctx.manual.lancarAvulsa(admin, pedidoAvulso({ chave: 'chave-avulsa-000000003', motoristaId }) as never)).rejects.toThrow('Motorista desconectado');
    const ultima = Object.values(ctx.corridas).pop() as any;
    expect(ultima.status).toBe('CANCELLED_BY_SYSTEM');
  });

  it('repetir a mesma chave (queda de rede) devolve a mesma entrega, sem duplicar', async () => {
    const ctx = montar();
    const a = await ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never);
    const b = await ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never);
    expect(b).toMatchObject({ repetido: true, rideId: a.rideId, codigo: a.codigo });
    expect(ctx.rides.pedir).toHaveBeenCalledTimes(1);
  });

  it('duas chamadas ao mesmo tempo com a mesma chave criam uma entrega so', async () => {
    const ctx = montar();
    const r = await Promise.allSettled([ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never), ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never)]);
    expect(ctx.rides.pedir).toHaveBeenCalledTimes(1);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });

  it('chave geral do Comercio desligada: nada e criado (nem a conta de contato)', async () => {
    const ctx = montar({ chaveLigada: false });
    await expect(ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never)).rejects.toThrow();
    await expect(ctx.manual.cotarAvulsa(admin, { estabelecimento: estabelecimento(), destino } as never)).rejects.toThrow();
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
    expect(ctx.prisma.user.create).not.toHaveBeenCalled();
  });

  it('cidade sem Entrega / veiculo nao aceito: o erro do pedido oficial chega e nada fica pela metade', async () => {
    const ctx = montar();
    ctx.rides.pedir.mockRejectedValueOnce(new Error('Entrega de moto não está disponível nesta cidade.'));
    await expect(ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never)).rejects.toThrow('não está disponível');
    expect(ctx.historico).toHaveLength(0);
    expect(ctx.auditoria).toHaveLength(0);
  });

  it('operador de OUTRA cidade nao cota nem lanca coleta fora da cidade dele', async () => {
    const ctx = montar({ operadorDaCidade: 'itumbiara' });
    await expect(ctx.manual.cotarAvulsa(admin, { estabelecimento: estabelecimento(), destino } as never)).rejects.toThrow('outra cidade');
    await expect(ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never)).rejects.toThrow('outra cidade');
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
    // ...mas na cidade dele funciona.
    const coletaItu = estabelecimento({ coleta: { address: 'Rua Central, 10, Itumbiara/GO', latitude: -18.41, longitude: -49.21 } });
    await expect(ctx.manual.lancarAvulsa(admin, pedidoAvulso({ estabelecimento: coletaItu }) as never)).resolves.toMatchObject({ repetido: false });
  });

  it('o preco confirmado precisa ser o oficial: se mudou, 409 e nada e criado', async () => {
    const ctx = montar();
    await expect(ctx.manual.lancarAvulsa(admin, pedidoAvulso({ valorEsperadoCents: 500 }) as never)).rejects.toThrow('preço mudou');
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
    await expect(ctx.manual.lancarAvulsa(admin, pedidoAvulso({ valorEsperadoCents: 700 }) as never)).resolves.toMatchObject({ repetido: false });
  });

  it('telefone bloqueado nao lanca', async () => {
    const ctx = montar();
    ctx.users.uBloq = { id: 'uBloq', role: 'PASSENGER', phone: '+5564991112233', status: 'BLOCKED' };
    await expect(ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never)).rejects.toThrow('bloqueado');
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
  });

  it('teto de entregas abertas por contato', async () => {
    const ctx = montar();
    await ctx.manual.lancarAvulsa(admin, pedidoAvulso() as never);
    const [passageiro] = ctx.rides.pedir.mock.calls[0] as unknown as [string];
    for (let i = 0; i < 19; i++) ctx.corridas[`x${i}`] = { id: `x${i}`, passengerId: passageiro, status: 'SEARCHING' };
    await expect(ctx.manual.lancarAvulsa(admin, pedidoAvulso({ chave: 'chave-avulsa-000000009' }) as never)).rejects.toThrow('em andamento');
  });

  it('cota o preco oficial (moto e carro) com a coleta digitada, sem criar nada', async () => {
    const ctx = montar();
    const r = await ctx.manual.cotarAvulsa(admin, { estabelecimento: estabelecimento(), destino } as never);
    expect(r.opcoes).toEqual([
      { veiculo: 'MOTO', nome: 'Moto', valorCents: 700 },
      { veiculo: 'CARRO', nome: 'Carro', valorCents: 1200 },
    ]);
    expect(r).toMatchObject({ coleta: { endereco: 'Av. Brasil, 300, Centro, Goiatuba/GO', alternativa: false }, cotacao: 'cotacao-assinada', totalDeEntregas: 1 });
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
    expect(ctx.prisma.user.create).not.toHaveBeenCalled();
    expect(ctx.pedidos).toHaveLength(0);
  });

  it('dados do estabelecimento: telefone com DDD e endereco de coleta obrigatorios', () => {
    expect(entregaAvulsaSchema.safeParse(pedidoAvulso()).success).toBe(true);
    expect(entregaAvulsaSchema.safeParse(pedidoAvulso({ estabelecimento: estabelecimento({ telefone: '9111' }) })).success).toBe(false);
    expect(entregaAvulsaSchema.safeParse(pedidoAvulso({ estabelecimento: estabelecimento({ nome: ' ' }) })).success).toBe(false);
    expect(entregaAvulsaSchema.safeParse(pedidoAvulso({ estabelecimento: { nome: 'X Y', telefone: '64991112233' } })).success).toBe(false);
  });

  it('rotas: so ADMIN, em admin/manual-deliveries/avulsa (e a entrega de loja cadastrada continua como estava)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, EntregaManualCentralController)).toEqual([UserRole.ADMIN]);
    const proto = EntregaManualCentralController.prototype as any;
    expect(Reflect.getMetadata('path', proto.lancarAvulsa)).toBe('avulsa');
    expect(Reflect.getMetadata('method', proto.lancarAvulsa)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata('path', proto.cotarAvulsa)).toBe('avulsa/cotar');
    expect(Reflect.getMetadata('path', proto.lancar)).toBe('/');
  });
});
