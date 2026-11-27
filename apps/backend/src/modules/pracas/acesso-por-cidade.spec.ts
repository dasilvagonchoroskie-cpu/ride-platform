import { PracasService } from './pracas.service';
import { RidesController } from '../rides/rides.controller';
import { AdminCentralController } from '../central/central.controller';
import { AdminDriversController } from '../drivers/admin-drivers.controller';
import { DriversService } from '../drivers/drivers.service';

/**
 * Regras da Central por cidade.
 */
const DONO = { id: 'dono', role: 'ADMIN' } as never;
const DA_CIDADE_A = { id: 'op-a', role: 'ADMIN' } as never;

function cidades() {
  const pracas = new PracasService({} as never);
  jest.spyOn(pracas, 'escopoDe').mockImplementation(async (id: string) => (id === 'op-a' ? 'a' : null));
  jest.spyOn(pracas, 'pracaDaCorrida').mockImplementation(async (id: string) => (id.startsWith('corrida-a') ? 'a' : 'b'));
  jest.spyOn(pracas, 'doPonto').mockImplementation(async (p) => ({ id: p.latitude === 1 ? 'a' : 'b' }) as never);
  return pracas;
}

describe('Detalhe da corrida pela rota comum', () => {
  async function papelUsado(usuario: unknown, corrida: string) {
    const rides = { acompanharDoPassageiro: jest.fn(async () => ({})) };
    const c = new RidesController(rides as never, cidades());
    await c.detail(usuario as never, corrida);
    return (rides.acompanharDoPassageiro.mock.calls[0] as unknown[])[1];
  }

  it('dono ve como Central qualquer cidade', async () => {
    expect(await papelUsado(DONO, 'corrida-b')).toBe('ADMIN');
  });

  it('conta de cidade ve como Central so a propria cidade', async () => {
    expect(await papelUsado(DA_CIDADE_A, 'corrida-a')).toBe('ADMIN');
    expect(await papelUsado(DA_CIDADE_A, 'corrida-b')).toBe('PASSENGER');
  });

  it('passageiro e motorista continuam com o proprio papel', async () => {
    expect(await papelUsado({ id: 'p', role: 'PASSENGER' }, 'corrida-b')).toBe('PASSENGER');
    expect(await papelUsado({ id: 'm', role: 'DRIVER' }, 'corrida-b')).toBe('DRIVER');
  });
});

describe('Encerrar alerta de SOS', () => {
  function montar(alerta: { latitude: number | null; longitude: number | null }) {
    const central = { resolverSos: jest.fn(async () => ({ ok: true })) };
    const prisma = { safetyEvent: { findUnique: jest.fn(async () => alerta) } };
    const c = new AdminCentralController(central as never, cidades(), prisma as never, {} as never);
    return { c, central };
  }

  it('conta de cidade encerra o da propria cidade', async () => {
    const { c, central } = montar({ latitude: 1, longitude: 1 });
    await c.resolver(DA_CIDADE_A, 'x', { note: '' });
    expect(central.resolverSos).toHaveBeenCalled();
  });

  it.each([
    ['de outra cidade', { latitude: 2, longitude: 2 }],
    ['sem localizacao (nao aparece na lista dela)', { latitude: null, longitude: null }],
  ])('conta de cidade nao encerra alerta %s', async (_nome, alerta) => {
    const { c, central } = montar(alerta);
    await expect(c.resolver(DA_CIDADE_A, 'x', { note: '' })).rejects.toThrow(/outra cidade/i);
    expect(central.resolverSos).not.toHaveBeenCalled();
  });

  it('dono encerra alerta sem localizacao', async () => {
    const { c, central } = montar({ latitude: null, longitude: null });
    await c.resolver(DONO, 'x', { note: '' });
    expect(central.resolverSos).toHaveBeenCalled();
  });
});

describe('Cadastro pela Central: conta que ja existe', () => {
  const entrada = (extra: Record<string, unknown> = {}) =>
    ({
      name: 'Maria da Silva',
      phone: '+5564999990000',
      cpf: '52998224725',
      birthDate: new Date('1990-01-01'),
      cnhNumber: '12345678900',
      cnhCategory: 'B',
      cnhExpiresAt: new Date('2030-01-01'),
      vehicle: { plate: 'ABC1D23', brand: 'VW', model: 'Gol', year: 2020, color: 'Azul' },
      aprovar: true,
      ...extra,
    }) as never;

  function montar(existente: Record<string, unknown> | null) {
    const tx = {
      user: { update: jest.fn(async () => ({ id: 'u1' })), create: jest.fn(async () => ({ id: 'u2' })) },
      driver: { create: jest.fn(async () => ({ id: 'd1' })) },
      wallet: { create: jest.fn() },
      vehicle: { create: jest.fn() },
    };
    const prisma = {
      user: { findUnique: jest.fn(async () => existente), findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
      driver: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
      vehicle: { findUnique: jest.fn(async () => null) },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (f: (t: unknown) => unknown) => f(tx)),
    };
    const servico = new DriversService({} as never, prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    jest.spyOn(servico as never, 'withProgress' as never).mockResolvedValue({} as never);
    const dados = () => (tx.user.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    return { servico, prisma, tx, dados };
  }
  const conta = (extra: Record<string, unknown> = {}) => ({ id: 'u1', role: 'PASSENGER', status: 'ACTIVE', driver: null, cpf: null, email: null, ...extra });

  it.each(['BLOCKED', 'DELETED'])('conta %s nao e cadastrada, nem pelo dono', async (status) => {
    const { servico, prisma } = montar(conta({ status }));
    await expect(servico.adminCreate('dono', entrada(), { donoDaCentral: true })).rejects.toThrow(/bloqueada|excluida/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('nao regrava a situacao de uma conta ativa', async () => {
    const { servico, dados } = montar(conta());
    await servico.adminCreate('op-a', entrada(), { donoDaCentral: false });
    expect(dados()).not.toHaveProperty('status');
  });

  it('conta ainda pendente passa a ativa', async () => {
    const { servico, dados } = montar(conta({ status: 'PENDING' }));
    await servico.adminCreate('op-a', entrada(), { donoDaCentral: false });
    expect(dados().status).toBe('ACTIVE');
  });

  it('conta de cidade nao poe e-mail em conta que ja existe', async () => {
    const { servico, prisma } = montar(conta());
    await expect(servico.adminCreate('op-a', entrada({ email: 'novo@exemplo.test' }), { donoDaCentral: false })).rejects.toThrow(/dono/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sem dizer quem pede, vale a regra mais fechada', async () => {
    const { servico } = montar(conta());
    await expect(servico.adminCreate('x', entrada({ email: 'novo@exemplo.test' }))).rejects.toThrow(/dono/i);
  });

  it('dono pode por o e-mail', async () => {
    const { servico, dados } = montar(conta());
    await servico.adminCreate('dono', entrada({ email: 'novo@exemplo.test' }), { donoDaCentral: true });
    expect(dados().email).toBe('novo@exemplo.test');
  });

  it('conta de cidade cadastra conta que ja tem e-mail, sem trocar o e-mail', async () => {
    const { servico, dados } = montar(conta({ email: 'dela@exemplo.test' }));
    await servico.adminCreate('op-a', entrada({ email: 'outro@exemplo.test' }), { donoDaCentral: false });
    expect(dados()).not.toHaveProperty('email');
  });

  it('conta de cidade cadastra pessoa nova com e-mail', async () => {
    const { servico, tx } = montar(null);
    await servico.adminCreate('op-a', entrada({ email: 'novo@exemplo.test' }), { donoDaCentral: false });
    expect(tx.user.create).toHaveBeenCalled();
  });

  it.each([
    [DA_CIDADE_A, false],
    [DONO, true],
  ])('a rota da Central informa ao cadastro se quem pede e o dono', async (usuario, dono) => {
    const drivers = { adminCreate: jest.fn(async () => ({})) };
    const pracas = cidades();
    jest.spyOn(pracas, 'definirPracaDoMotorista').mockResolvedValue();
    const c = new AdminDriversController(drivers as never, pracas, { user: { findUnique: async () => null } } as never);
    await c.criar(usuario, entrada());
    expect((drivers.adminCreate.mock.calls[0] as unknown[])[2]).toEqual({ donoDaCentral: dono });
  });
});
