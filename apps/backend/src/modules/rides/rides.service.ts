import { Injectable, Logger } from '@nestjs/common';
import { Prisma, RideStatus, OfferStatus, UserRole } from '@prisma/client';
import type { Ride, RideOffer } from '@prisma/client';
import { ERROR_CODES, generateNumericCode } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { FareService } from './fare.service';
import { tocarJornada } from '../painel-motorista/jornada';
import { regrasDaCarteira } from '../painel-motorista/regras-carteira';
import type {
  CancelRideInput,
  EstimateRideInput,
  FinishRideInput,
  ListRidesInput,
  RequestRideInput,
} from './dto';

/**
 * Para onde cada situacao pode ir. Escrito uma vez, em tabela, em vez de
 * espalhado em `if` pelos metodos: assim uma transicao invalida e
 * impossivel de passar despercebida, e da para ler o ciclo inteiro de uma
 * olhada.
 */
const TRANSICOES: Record<RideStatus, RideStatus[]> = {
  REQUESTED: ['SEARCHING', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_SYSTEM', 'EXPIRED'],
  SEARCHING: ['DRIVER_ASSIGNED', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_SYSTEM', 'EXPIRED'],
  DRIVER_ASSIGNED: ['DRIVER_ARRIVING', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_SYSTEM'],
  DRIVER_ARRIVING: ['DRIVER_WAITING', 'IN_PROGRESS', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER'],
  DRIVER_WAITING: ['IN_PROGRESS', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED_BY_SYSTEM'],
  COMPLETED: [],
  CANCELLED_BY_PASSENGER: [],
  CANCELLED_BY_DRIVER: [],
  CANCELLED_BY_SYSTEM: [],
  EXPIRED: [],
};

/** Situacoes em que a corrida ainda ocupa o motorista e o passageiro. */
const EM_ABERTO: RideStatus[] = [
  'REQUESTED', 'SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_WAITING', 'IN_PROGRESS',
];

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  // Quanto tempo o motorista tem para responder ao chamado antes de
  // passar para o proximo.
  private static readonly SEGUNDOS_PARA_RESPONDER = 30;

  // Raio de busca. Comeca perto e vai abrindo: assim o mais proximo tem
  // preferencia, em vez de sortear qualquer um da cidade.
  private static readonly RAIOS_METROS = [2000, 5000, 10000];

  constructor(
    private readonly prisma: PrismaService,
    private readonly fare: FareService,
  ) {}

  // ------------------------------------------------------------------
  // Orcamento antes de chamar
  // ------------------------------------------------------------------

  async estimar(input: EstimateRideInput) {
    const rota = this.fare.estimarRota(input.pickup, input.dropoff);
    const orcamento = await this.fare.calcular({
      distanceMeters: rota.distanceMeters,
      durationSeconds: rota.durationSeconds,
    });
    return {
      flag: orcamento.flag,
      estimatedFareCents: orcamento.totalCents,
      baseFareCents: orcamento.baseFareCents,
      distanceCents: orcamento.distanceCents,
      distanceMeters: orcamento.distanceMeters,
      durationSeconds: orcamento.durationSeconds,
      chargedDistanceMeters: orcamento.chargedDistanceMeters,
      minFareApplied: orcamento.minFareApplied,
    };
  }

  // ------------------------------------------------------------------
  // Passageiro chama
  // ------------------------------------------------------------------

  async pedir(passengerId: string, input: RequestRideInput) {
    const jaTem = await this.prisma.ride.findFirst({
      where: { passengerId, status: { in: EM_ABERTO } },
    });
    if (jaTem) {
      throw BusinessException.conflict(
        'Voce ja tem uma corrida em andamento.',
        ERROR_CODES.RIDE_INVALID_STATE,
      );
    }

    const rota = this.fare.estimarRota(input.pickup, input.dropoff);
    const pedidoEm = new Date();
    const orcamento = await this.fare.calcular({
      distanceMeters: rota.distanceMeters,
      durationSeconds: rota.durationSeconds,
      quando: pedidoEm,
    });

    const corrida = await this.prisma.withTransaction(async (tx) => {
      const criada = await tx.ride.create({
        data: {
          code: await this.codigoUnico(tx),
          // PIN de embarque: o passageiro diz ao motorista, que confere
          // antes de iniciar — garante que entrou a pessoa certa.
          pin: generateNumericCode(4),
          passengerId,
          status: RideStatus.REQUESTED,
          fareFlag: orcamento.flag,
          pickupAddress: input.pickup.address,
          pickupLat: input.pickup.latitude,
          pickupLng: input.pickup.longitude,
          pickupPlaceId: input.pickup.placeId,
          dropoffAddress: input.dropoff.address,
          dropoffLat: input.dropoff.latitude,
          dropoffLng: input.dropoff.longitude,
          dropoffPlaceId: input.dropoff.placeId,
          distanceMeters: orcamento.distanceMeters,
          durationSeconds: orcamento.durationSeconds,
          estimatedFareCents: orcamento.totalCents,
          commissionPercent: new Prisma.Decimal(orcamento.commissionPercent),
          paymentMethodType: input.paymentMethodType,
        },
      });
      await tx.rideStatusHistory.create({
        data: {
          rideId: criada.id,
          status: RideStatus.REQUESTED,
          actorId: passengerId,
          actorRole: UserRole.PASSENGER,
          latitude: input.pickup.latitude,
          longitude: input.pickup.longitude,
        },
      });
      return criada;
    });

    // A procura comeca em seguida, fora da transacao: gravar a corrida
    // nao pode depender de haver motorista livre neste instante.
    await this.procurarMotorista(corrida.id);
    return this.detalhe(corrida.id);
  }

  /**
   * Oferece a corrida aos motoristas proximos, do mais perto ao mais
   * longe, abrindo o raio ate achar alguem.
   */
  async procurarMotorista(rideId: string) {
    const corrida = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!corrida) throw BusinessException.notFound('Corrida nao encontrada.');
    if (corrida.status !== RideStatus.REQUESTED && corrida.status !== RideStatus.SEARCHING) {
      return { offered: 0 };
    }

    await this.mudarSituacao(rideId, RideStatus.SEARCHING, null, null);

    // Carteira pre-paga: com o bloqueio ligado na Central, quem esta abaixo
    // do saldo minimo nao recebe chamado (a comissao nao teria de onde sair).
    const carteira = await regrasDaCarteira(this.prisma);

    for (const raio of RidesService.RAIOS_METROS) {
      const proximos = await this.prisma.findNearbyDrivers({
        latitude: corrida.pickupLat,
        longitude: corrida.pickupLng,
        radiusMeters: raio,
        limit: 10,
      });
      if (proximos.length === 0) continue;

      const expiraEm = new Date(Date.now() + RidesService.SEGUNDOS_PARA_RESPONDER * 1000);
      let enviados = 0;
      for (const m of proximos) {
        // Quem ja recusou esta corrida nao e chamado de novo.
        const jaOfertado = await this.prisma.rideOffer.findUnique({
          where: { rideId_driverId: { rideId, driverId: m.driverId } },
        });
        if (jaOfertado) continue;
        if (carteira.bloquear) {
          const w = await this.prisma.wallet.findUnique({ where: { driverId: m.driverId } });
          if ((w?.balanceCents ?? 0) < carteira.minimoCents) continue;
        }
        await this.prisma.rideOffer.create({
          data: {
            rideId,
            driverId: m.driverId,
            distanceKm: m.distanceMeters / 1000,
            etaSeconds: Math.round((m.distanceMeters / 1000 / 25) * 3600),
            expiresAt: expiraEm,
          },
        });
        enviados += 1;
      }
      if (enviados > 0) return { offered: enviados, radiusMeters: raio };
    }

    this.logger.warn(`Corrida ${rideId}: nenhum motorista disponivel.`);
    return { offered: 0 };
  }

  // ------------------------------------------------------------------
  // Motorista responde
  // ------------------------------------------------------------------

  /** Chamados abertos para este motorista, ainda dentro do prazo. */
  async chamados(driverId: string) {
    const agora = new Date();
    // Enquanto o aparelho pergunta por chamados, ele esta online.
    await tocarJornada(this.prisma, driverId).catch(() => undefined);
    const ofertas: Array<RideOffer & { ride: Ride & { passenger: { name: string } } }> =
      await this.prisma.rideOffer.findMany({
      where: { driverId, status: OfferStatus.PENDING, expiresAt: { gt: agora } },
      include: { ride: { include: { passenger: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return ofertas
      .filter((o) => o.ride.status === RideStatus.SEARCHING)
      .map((o) => ({
        offerId: o.id,
        rideId: o.rideId,
        code: o.ride.code,
        pickupAddress: o.ride.pickupAddress,
        dropoffAddress: o.ride.dropoffAddress,
        estimatedFareCents: o.ride.estimatedFareCents,
        distanceKm: o.distanceKm,
        etaSeconds: o.etaSeconds,
        expiresAt: o.expiresAt,
        // Coordenadas: a tela de oferta desenha embarque e destino no mapa
        // ANTES do motorista aceitar. So o endereco escrito nao basta.
        pickupLat: o.ride.pickupLat,
        pickupLng: o.ride.pickupLng,
        dropoffLat: o.ride.dropoffLat,
        dropoffLng: o.ride.dropoffLng,
        tripDistanceMeters: o.ride.distanceMeters,
        tripDurationSeconds: o.ride.durationSeconds,
        commissionPercent: Number(o.ride.commissionPercent),
        passengerName: o.ride.passenger?.name ?? 'Passageiro',
        // O motorista precisa saber antes de aceitar como vai receber.
        paymentMethodType: o.ride.paymentMethodType,
      }));
  }

  /**
   * Carros disponiveis perto do passageiro, para o mapa da tela inicial.
   * Posicao arredondada (uns 50 m) e sem identificar o motorista: o
   * passageiro ve que ha carro por perto, nao onde cada um esta parado.
   */
  async carrosPerto(lat: number, lng: number) {
    const perto = await this.prisma.findNearbyDrivers({
      latitude: lat,
      longitude: lng,
      radiusMeters: 5000,
      limit: 12,
    });
    const arredondar = (n: number) => Math.round(n * 2000) / 2000;
    return perto.map((m, i) => ({
      id: `carro-${i + 1}`,
      latitude: arredondar(m.latitude),
      longitude: arredondar(m.longitude),
      distanceMeters: Math.round(m.distanceMeters),
    }));
  }

  async aceitar(driverId: string, rideId: string) {
    return this.prisma.withTransaction(async (tx) => {
      // Trava a linha da corrida: dois motoristas tocando "aceitar" no
      // mesmo segundo nao podem ambos levar a mesma corrida.
      const travadas = await tx.$queryRaw<Array<{ id: string; status: RideStatus }>>`
        SELECT id, status FROM rides WHERE id = ${rideId}::uuid FOR UPDATE
      `;
      if (travadas.length === 0) throw BusinessException.notFound('Corrida nao encontrada.');
      if (travadas[0].status !== RideStatus.SEARCHING) {
        throw new BusinessException(
          ERROR_CODES.RIDE_INVALID_STATE,
          'Esta corrida ja foi atendida por outro motorista.',
        );
      }

      const oferta = await tx.rideOffer.findUnique({
        where: { rideId_driverId: { rideId, driverId } },
      });
      if (!oferta) throw BusinessException.forbidden('Esta corrida nao foi oferecida a voce.');
      if (oferta.expiresAt < new Date()) {
        throw new BusinessException(ERROR_CODES.RIDE_INVALID_STATE, 'O tempo para aceitar terminou.');
      }

      const motorista = await tx.driver.findUnique({
        where: { id: driverId },
        include: { vehicles: { where: { isActive: true }, take: 1 } },
      });
      if (!motorista) throw BusinessException.notFound('Motorista nao encontrado.');

      await tx.ride.update({
        where: { id: rideId },
        data: {
          driverId,
          vehicleId: motorista.vehicles[0]?.id,
          status: RideStatus.DRIVER_ASSIGNED,
          acceptedAt: new Date(),
        },
      });
      await tx.rideOffer.update({
        where: { id: oferta.id },
        data: { status: OfferStatus.ACCEPTED, respondedAt: new Date() },
      });
      // As demais ofertas desta corrida perdem a validade na hora.
      await tx.rideOffer.updateMany({
        where: { rideId, status: OfferStatus.PENDING },
        data: { status: OfferStatus.EXPIRED, respondedAt: new Date() },
      });
      // O motorista sai da fila enquanto estiver nesta corrida.
      await tx.driverLocation.updateMany({
        where: { driverId },
        data: { isAvailable: false },
      });
      await tx.rideStatusHistory.create({
        data: {
          rideId,
          status: RideStatus.DRIVER_ASSIGNED,
          actorId: driverId,
          actorRole: UserRole.DRIVER,
        },
      });
      const pin = (await tx.ride.findUnique({ where: { id: rideId }, select: { pin: true } }))?.pin ?? null;
      return { ok: true, rideId, pin };
    });
  }

  async recusar(driverId: string, rideId: string) {
    const oferta = await this.prisma.rideOffer.findUnique({
      where: { rideId_driverId: { rideId, driverId } },
    });
    if (!oferta) throw BusinessException.notFound('Chamado nao encontrado.');
    await this.prisma.rideOffer.update({
      where: { id: oferta.id },
      data: { status: OfferStatus.DECLINED, respondedAt: new Date() },
    });
    // Ninguem mais pendente: abre o raio e procura de novo.
    const pendentes = await this.prisma.rideOffer.count({
      where: { rideId, status: OfferStatus.PENDING },
    });
    if (pendentes === 0) await this.procurarMotorista(rideId);
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // Andamento da corrida
  // ------------------------------------------------------------------

  async cheguei(driverId: string, rideId: string, onde?: { latitude: number; longitude: number }) {
    const corrida = await this.daCorridaDoMotorista(driverId, rideId);
    this.exigirTransicao(corrida.status, RideStatus.DRIVER_WAITING);
    await this.prisma.ride.update({
      where: { id: rideId },
      data: { status: RideStatus.DRIVER_WAITING, arrivedAt: new Date() },
    });
    await this.registrar(rideId, RideStatus.DRIVER_WAITING, driverId, UserRole.DRIVER, onde);
    return this.detalhe(rideId);
  }

  async aCaminho(driverId: string, rideId: string, onde?: { latitude: number; longitude: number }) {
    const corrida = await this.daCorridaDoMotorista(driverId, rideId);
    this.exigirTransicao(corrida.status, RideStatus.DRIVER_ARRIVING);
    await this.prisma.ride.update({
      where: { id: rideId },
      data: { status: RideStatus.DRIVER_ARRIVING },
    });
    await this.registrar(rideId, RideStatus.DRIVER_ARRIVING, driverId, UserRole.DRIVER, onde);
    return this.detalhe(rideId);
  }

  async iniciar(driverId: string, rideId: string, onde?: { latitude: number; longitude: number }) {
    const corrida = await this.daCorridaDoMotorista(driverId, rideId);
    this.exigirTransicao(corrida.status, RideStatus.IN_PROGRESS);
    await this.prisma.ride.update({
      where: { id: rideId },
      data: { status: RideStatus.IN_PROGRESS, startedAt: new Date() },
    });
    await this.registrar(rideId, RideStatus.IN_PROGRESS, driverId, UserRole.DRIVER, onde);
    return this.detalhe(rideId);
  }

  /**
   * Fim da corrida.
   *
   * O aplicativo manda o que mediu, e o servidor recalcula o preco pela
   * tabela vigente. Se o GPS falhou e nao veio medicao, usa-se o que foi
   * estimado no pedido — melhor cobrar o combinado do que cobrar zero.
   */
  async finalizar(driverId: string, rideId: string, input: FinishRideInput) {
    const corrida = await this.daCorridaDoMotorista(driverId, rideId);
    this.exigirTransicao(corrida.status, RideStatus.COMPLETED);

    const distancia = input.distanceMeters ?? corrida.distanceMeters;
    const duracao = input.durationSeconds ?? corrida.durationSeconds;

    // A bandeira e a do PEDIDO, nao a do instante em que terminou: quem
    // chamou as 21h55 nao paga noturna por ter descido as 22h05.
    const orcamento = await this.fare.calcular({
      distanceMeters: distancia,
      durationSeconds: duracao,
      waitingSeconds: input.waitingSeconds,
      flag: corrida.fareFlag,
    });

    return this.prisma.withTransaction(async (tx) => {
      await tx.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.COMPLETED,
          finishedAt: new Date(),
          distanceMeters: distancia,
          durationSeconds: duracao,
          finalFareCents: orcamento.totalCents,
          commissionCents: orcamento.commissionCents,
          driverEarningCents: orcamento.driverEarningCents,
          chargedDistanceMeters: orcamento.chargedDistanceMeters,
          chargedWaitingSeconds: orcamento.chargedWaitingSeconds,
        },
      });

      // Carteira PRE-PAGA: o passageiro paga o motorista direto (o dinheiro
      // nao passa pela plataforma). Por isso a carteira nao recebe o valor
      // da corrida — so desconta a comissao dos creditos que o motorista
      // comprou com a Central. Nada se apaga: correcao vira lancamento novo,
      // e cada linha guarda o saldo que ficou depois dela.
      const carteira = await tx.wallet.upsert({ where: { driverId }, update: {}, create: { driverId } });
      const aposComissao = carteira.balanceCents - orcamento.commissionCents;
      if (orcamento.commissionCents > 0) {
        await tx.walletTransaction.create({
          data: {
            walletId: carteira.id,
            type: 'COMMISSION',
            amountCents: -orcamento.commissionCents,
            balanceAfterCents: aposComissao,
            description: 'Corrida finalizada',
            rideId,
          },
        });
      }
      await tx.wallet.update({
        where: { id: carteira.id },
        data: {
          balanceCents: aposComissao,
          totalEarnedCents: { increment: orcamento.driverEarningCents },
        },
      });
      await tx.driver.update({ where: { id: driverId }, data: { totalRides: { increment: 1 } } });

      // O motorista volta para a fila assim que encerra.
      await tx.driverLocation.updateMany({ where: { driverId }, data: { isAvailable: true } });
      await tx.rideStatusHistory.create({
        data: { rideId, status: RideStatus.COMPLETED, actorId: driverId, actorRole: UserRole.DRIVER },
      });

      return {
        rideId,
        code: corrida.code,
        flag: orcamento.flag,
        baseFareCents: orcamento.baseFareCents,
        distanceCents: orcamento.distanceCents,
        waitingCents: orcamento.waitingCents,
        chargedDistanceMeters: orcamento.chargedDistanceMeters,
        chargedWaitingSeconds: orcamento.chargedWaitingSeconds,
        finalFareCents: orcamento.totalCents,
        commissionCents: orcamento.commissionCents,
        driverEarningCents: orcamento.driverEarningCents,
        distanceMeters: distancia,
        durationSeconds: duracao,
        minFareApplied: orcamento.minFareApplied,
      };
    });
  }

  // ------------------------------------------------------------------
  // Cancelamento
  // ------------------------------------------------------------------

  async cancelar(
    atorId: string,
    papel: UserRole,
    rideId: string,
    input: CancelRideInput,
  ) {
    const corrida = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!corrida) throw BusinessException.notFound('Corrida nao encontrada.');

    const ehPassageiro = corrida.passengerId === atorId;
    const ehMotorista = corrida.driverId === atorId;
    if (!ehPassageiro && !ehMotorista && papel !== UserRole.ADMIN) {
      throw BusinessException.forbidden('Esta corrida nao e sua.');
    }

    const destino = ehPassageiro
      ? RideStatus.CANCELLED_BY_PASSENGER
      : ehMotorista
        ? RideStatus.CANCELLED_BY_DRIVER
        : RideStatus.CANCELLED_BY_SYSTEM;
    this.exigirTransicao(corrida.status, destino);

    // Multa so depois que o motorista ja estava a caminho. Cancelar
    // enquanto ainda procura nao custa nada — seria injusto cobrar por
    // uma corrida que ninguem aceitou.
    let multaCents = 0;
    if (ehPassageiro && corrida.driverId) {
      multaCents = await this.fare.taxaDeCancelamento();
    }

    await this.prisma.withTransaction(async (tx) => {
      await tx.ride.update({
        where: { id: rideId },
        data: {
          status: destino,
          cancelledAt: new Date(),
          cancelledBy: atorId,
          cancellationReason: input.reason,
          finalFareCents: multaCents > 0 ? multaCents : null,
        },
      });
      await tx.rideOffer.updateMany({
        where: { rideId, status: OfferStatus.PENDING },
        data: { status: OfferStatus.EXPIRED, respondedAt: new Date() },
      });
      if (corrida.driverId) {
        await tx.driverLocation.updateMany({
          where: { driverId: corrida.driverId },
          data: { isAvailable: true },
        });
      }
      await tx.rideStatusHistory.create({
        data: { rideId, status: destino, actorId: atorId, actorRole: papel, note: input.reason },
      });
    });

    return { rideId, status: destino, cancellationFeeCents: multaCents };
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  /** A corrida aberta do passageiro, se houver. */
  async atualDoPassageiro(passengerId: string) {
    const corrida = await this.prisma.ride.findFirst({
      where: { passengerId, status: { in: EM_ABERTO } },
      orderBy: { requestedAt: 'desc' },
    });
    return corrida ? this.detalhe(corrida.id) : { ride: null };
  }

  /** A corrida aberta do motorista, se houver. */
  async atualDoMotorista(driverId: string) {
    const corrida = await this.prisma.ride.findFirst({
      where: { driverId, status: { in: EM_ABERTO } },
      orderBy: { acceptedAt: 'desc' },
    });
    return corrida ? this.detalhe(corrida.id) : { ride: null };
  }

  async detalhe(rideId: string) {
    const corrida = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: { select: { id: true, name: true, phone: true } },
        driver: {
          select: {
            id: true,
            ratingAvg: true,
            user: { select: { name: true, phone: true } },
          },
        },
        vehicle: { select: { plate: true, brand: true, model: true, color: true } },
      },
    });
    if (!corrida) throw BusinessException.notFound('Corrida nao encontrada.');
    return { ride: corrida };
  }

  async historico(userId: string, papel: UserRole, filtro: ListRidesInput) {
    const onde: Prisma.RideWhereInput =
      papel === UserRole.DRIVER ? { driverId: userId } : { passengerId: userId };
    if (filtro.status) onde.status = filtro.status as RideStatus;

    const [total, itens] = await Promise.all([
      this.prisma.ride.count({ where: onde }),
      this.prisma.ride.findMany({
        where: onde,
        orderBy: { requestedAt: 'desc' },
        skip: (filtro.page - 1) * filtro.pageSize,
        take: filtro.pageSize,
      }),
    ]);
    return { total, page: filtro.page, pageSize: filtro.pageSize, items: itens };
  }

  // ------------------------------------------------------------------
  // Apoio
  // ------------------------------------------------------------------

  private exigirTransicao(de: RideStatus, para: RideStatus): void {
    if (!TRANSICOES[de]?.includes(para)) {
      throw new BusinessException(
        ERROR_CODES.RIDE_INVALID_STATE,
        `Nao e possivel passar de ${de} para ${para}.`,
      );
    }
  }

  private async daCorridaDoMotorista(driverId: string, rideId: string) {
    const corrida = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!corrida) throw BusinessException.notFound('Corrida nao encontrada.');
    if (corrida.driverId !== driverId) {
      throw BusinessException.forbidden('Esta corrida nao e sua.');
    }
    return corrida;
  }

  private async mudarSituacao(
    rideId: string,
    para: RideStatus,
    atorId: string | null,
    papel: UserRole | null,
  ) {
    await this.prisma.ride.update({ where: { id: rideId }, data: { status: para } });
    await this.prisma.rideStatusHistory.create({
      data: { rideId, status: para, actorId: atorId, actorRole: papel },
    });
  }

  private async registrar(
    rideId: string,
    status: RideStatus,
    atorId: string,
    papel: UserRole,
    onde?: { latitude: number; longitude: number },
  ) {
    await this.prisma.rideStatusHistory.create({
      data: {
        rideId,
        status,
        actorId: atorId,
        actorRole: papel,
        latitude: onde?.latitude,
        longitude: onde?.longitude,
      },
    });
  }

  /** Codigo curto que o passageiro le em voz alta para conferir o carro. */
  private async codigoUnico(tx: Prisma.TransactionClient): Promise<string> {
    for (let tentativa = 0; tentativa < 10; tentativa += 1) {
      const codigo = generateNumericCode(6);
      const existe = await tx.ride.findUnique({ where: { code: codigo } });
      if (!existe) return codigo;
    }
    throw new BusinessException(ERROR_CODES.INTERNAL_ERROR, 'Nao foi possivel gerar o codigo da corrida.');
  }
}
