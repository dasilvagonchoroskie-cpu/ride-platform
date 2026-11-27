import { RideStatus } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

/** Corrida que ja acabou, de um jeito ou de outro. */
export const CORRIDA_ENCERRADA: RideStatus[] = [
  RideStatus.COMPLETED,
  RideStatus.CANCELLED_BY_PASSENGER,
  RideStatus.CANCELLED_BY_DRIVER,
  RideStatus.CANCELLED_BY_SYSTEM,
  RideStatus.EXPIRED,
];

/** Corridas desta pessoa, como passageiro, em andamento ou agendadas. */
export function corridasAbertasDoPassageiro(prisma: Pick<PrismaService, 'ride'>, userId: string): Promise<number> {
  return prisma.ride.count({ where: { passengerId: userId, status: { notIn: CORRIDA_ENCERRADA } } });
}
