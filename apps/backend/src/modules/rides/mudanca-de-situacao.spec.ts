import { RidesService } from './rides.service';

/** Situacao diferente da que foi lida: nada mais e gravado. */
function montar(status: string) {
  const prisma = {
    ride: {
      findUnique: jest.fn(async () => ({ id: 'r1', status, driverId: 'm1', passengerId: 'u1', category: 'CARRO' })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    rideOffer: { updateMany: jest.fn() },
    driverLocation: { updateMany: jest.fn() },
    rideStatusHistory: { create: jest.fn() },
    withTransaction: jest.fn(),
  };
  prisma.withTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const s = Object.create(RidesService.prototype) as RidesService & Record<string, unknown>;
  Object.assign(s, { prisma, fare: { taxaDeCancelamento: jest.fn(async () => 0) } });
  return { s: s as RidesService, prisma };
}

describe('Mudanca de situacao da corrida', () => {
  it.each([
    ['cheguei', 'DRIVER_ASSIGNED'],
    ['aCaminho', 'DRIVER_ASSIGNED'],
    ['iniciar', 'DRIVER_WAITING'],
  ] as const)('%s: recusa e nao grava historico', async (acao, status) => {
    const { s, prisma } = montar(status);
    await expect(s[acao]('m1', 'r1')).rejects.toThrow('acabou de mudar');
    expect(prisma.rideStatusHistory.create).not.toHaveBeenCalled();
    expect(prisma.ride.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1', status: { in: [status] }, driverId: 'm1' } }),
    );
  });

  it('cancelar: recusa sem soltar o motorista nem mexer nas ofertas', async () => {
    const { s, prisma } = montar('DRIVER_WAITING');
    await expect(s.cancelar('u1', 'PASSENGER' as never, 'r1', { reason: 'teste' } as never)).rejects.toThrow('acabou de mudar');
    expect(prisma.rideOffer.updateMany).not.toHaveBeenCalled();
    expect(prisma.driverLocation.updateMany).not.toHaveBeenCalled();
    expect(prisma.rideStatusHistory.create).not.toHaveBeenCalled();
  });
});
