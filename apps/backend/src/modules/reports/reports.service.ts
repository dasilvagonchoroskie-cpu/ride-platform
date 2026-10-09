import { Injectable } from '@nestjs/common';
import { DriverStatus, Prisma, RideStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const ATIVAS: RideStatus[] = [
  RideStatus.SCHEDULED,
  RideStatus.REQUESTED,
  RideStatus.SEARCHING,
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_WAITING,
  RideStatus.IN_PROGRESS,
];

type Concluida = {
  finalFareCents: number | null;
  estimatedFareCents: number;
  commissionCents: number;
  driverEarningCents: number;
  finishedAt: Date | null;
};

const HORA = 3600_000;
const DIA = 24 * HORA;

/**
 * Numeros do painel da Central. Tudo calculado no horario de Brasilia
 * (UTC-3): "hoje" comeca a meia-noite daqui, nao a de Londres.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async corridasAtivas(daPraca: Prisma.RideWhereInput = {}) {
    const corridas = await this.prisma.ride.findMany({
      where: { status: { in: ATIVAS }, ...daPraca },
      orderBy: { requestedAt: 'desc' },
      take: 100,
      include: {
        passenger: { select: { name: true, phone: true } },
        driver: { select: { id: true, user: { select: { name: true, phone: true } } } },
        vehicle: { select: { plate: true } },
      },
    });
    // Posicao real de cada carro (antes a Central desenhava o motorista no
    // ponto de embarque).
    const ids = corridas.map((c) => c.driverId).filter((x): x is string => !!x);
    const posicoes = ids.length
      ? await this.prisma.$queryRaw<Array<{ driverId: string; latitude: number; longitude: number }>>`
          SELECT driver_id::text AS "driverId", ST_Y(location::geometry) AS "latitude", ST_X(location::geometry) AS "longitude"
          FROM driver_locations WHERE driver_id::text = ANY(${ids})`
      : [];
    const ondeEsta = new Map(posicoes.map((p) => [p.driverId, { latitude: Number(p.latitude), longitude: Number(p.longitude) }]));
    return {
      items: corridas.map((c) => ({
        id: c.id,
        code: c.code,
        status: c.status,
        passengerName: c.passenger.name,
        passengerPhone: c.passenger.phone,
        driverId: c.driverId,
        driverPhone: c.driver?.user.phone ?? null,
        category: c.category,
        paymentMethodType: c.paymentMethodType,
        multiplier: Number(c.multiplier),
        driverName: c.driver?.user.name ?? 'Procurando motorista',
        driverPlate: c.vehicle?.plate ?? '',
        pickup: { latitude: c.pickupLat, longitude: c.pickupLng, address: c.pickupAddress },
        dropoff: { latitude: c.dropoffLat, longitude: c.dropoffLng, address: c.dropoffAddress },
        estimatedFareCents: c.estimatedFareCents,
        requestedAt: c.requestedAt.toISOString(),
        scheduledFor: c.scheduledFor ? c.scheduledFor.toISOString() : null,
        discountCents: c.discountCents,
        driverPosition: c.driverId ? (ondeEsta.get(c.driverId) ?? null) : null,
      })),
    };
  }

  async resumo(daPraca: Prisma.RideWhereInput = {}, ids: string[] | null = null) {
    const dosMotoristas = ids ? { id: { in: ids } } : {};
    const brasilia = new Date(Date.now() - 3 * HORA);
    const inicioHoje = new Date(
      Date.UTC(brasilia.getUTCFullYear(), brasilia.getUTCMonth(), brasilia.getUTCDate(), 3),
    );
    const inicioSemana = new Date(inicioHoje.getTime() - 6 * DIA);
    const inicioMes = new Date(Date.UTC(brasilia.getUTCFullYear(), brasilia.getUTCMonth(), 1, 3));

    const [semana, mes, canceladas, aprovados, online, pendentes] = await Promise.all([
      this.prisma.ride.findMany({
        where: { status: RideStatus.COMPLETED, finishedAt: { gte: inicioSemana }, ...daPraca },
        select: {
          finalFareCents: true,
          estimatedFareCents: true,
          commissionCents: true,
          driverEarningCents: true,
          finishedAt: true,
        },
      }),
      this.prisma.ride.aggregate({
        where: { status: RideStatus.COMPLETED, finishedAt: { gte: inicioMes }, ...daPraca },
        _sum: { finalFareCents: true },
      }),
      this.prisma.ride.count({ where: { cancelledAt: { gte: inicioSemana }, ...daPraca } }),
      this.prisma.driver.count({ where: { status: DriverStatus.APPROVED, ...dosMotoristas } }),
      this.prisma.driver.count({ where: { isOnline: true, ...dosMotoristas } }),
      this.prisma.driver.count({ where: { status: DriverStatus.PENDING, ...dosMotoristas } }),
    ]);

    const valor = (r: Concluida) => r.finalFareCents ?? r.estimatedFareCents;
    const soma = (lista: Concluida[], f: (r: Concluida) => number) =>
      lista.reduce((total, r) => total + f(r), 0);
    const hoje = semana.filter((r) => r.finishedAt !== null && r.finishedAt.getTime() >= inicioHoje.getTime());

    const porHora = new Array<number>(24).fill(0);
    for (const r of hoje) {
      if (!r.finishedAt) continue;
      porHora[new Date(r.finishedAt.getTime() - 3 * HORA).getUTCHours()] += valor(r);
    }
    const tentativas = semana.length + canceladas;

    return {
      todayCents: soma(hoje, valor),
      weekCents: soma(semana, valor),
      monthCents: mes._sum.finalFareCents ?? 0,
      ridesToday: hoje.length,
      ridesWeek: semana.length,
      commissionTodayCents: soma(hoje, (r) => r.commissionCents),
      driverPayoutsTodayCents: soma(hoje, (r) => r.driverEarningCents),
      activeDrivers: aprovados,
      onlineDrivers: online,
      pendingApprovals: pendentes,
      averageTicketCents: hoje.length ? Math.round(soma(hoje, valor) / hoje.length) : 0,
      cancellationRate: tentativas ? canceladas / tentativas : 0,
      hourlyRevenue: porHora,
    };
  }
}
