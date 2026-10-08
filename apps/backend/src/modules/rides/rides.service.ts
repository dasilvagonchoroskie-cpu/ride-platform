import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma, RideStatus, OfferStatus, UserRole } from '@prisma/client';
import type { Ride, RideOffer } from '@prisma/client';
import { ERROR_CODES, generateNumericCode } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { FareService } from './fare.service';
import { tocarJornada } from '../painel-motorista/jornada';
import { regrasDaCarteira, semSaldo } from '../painel-motorista/regras-carteira';
import { cuponsDisponiveis, descontoDoCupom, validarCupom } from './cupons';
import { lerCategorias } from './categorias';
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
  SCHEDULED: ['REQUESTED', 'SEARCHING', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_SYSTEM', 'EXPIRED'],
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
  /** Tempo do motorista responder ao chamado (especificacao: 15 a 20 s). */
  private static readonly SEGUNDOS_PARA_RESPONDER = 20;

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

  // Sem limite de distancia (decisao do Evandro em 05/10/2026): o passageiro
  // pode ver quanto da uma corrida para qualquer lugar, mesmo fora da regiao.

  async estimar(input: EstimateRideInput, passengerId?: string) {
    const rota = this.fare.estimarRota(input.pickup, input.dropoff);
    const orcamento = await this.fare.calcular({
      distanceMeters: rota.distanceMeters,
      durationSeconds: rota.durationSeconds,
      ...(input.scheduledFor ? { quando: input.scheduledFor } : {}),
      category: input.category ?? 'CARRO',
      pickup: input.pickup,
    });
    let descontoCents = 0;
    let cupom: string | null = null;
    if (input.couponCode && passengerId) {
      const v = await validarCupom(this.prisma, passengerId, input.couponCode, orcamento.totalCents);
      descontoCents = v.descontoCents;
      cupom = v.cupom.code;
    }
    return {
      flag: orcamento.flag,
      estimatedFareCents: orcamento.totalCents,
      discountCents: descontoCents,
      couponCode: cupom,
      totalToPayCents: orcamento.totalCents - descontoCents,
      category: orcamento.category,
      multiplier: orcamento.multiplier,
      timeCents: orcamento.timeCents,
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

    if (input.category) {
      const categorias = await lerCategorias(this.prisma);
      if (!categorias.some((c) => c.codigo === input.category && c.ativa)) {
        throw BusinessException.validation('Esta categoria não está disponível agora.');
      }
    }

    // Agendada: de 30 minutos a 7 dias a frente, ate 3 por passageiro.
    const agendadaPara = input.scheduledFor ? new Date(input.scheduledFor) : null;
    if (agendadaPara) {
      const minutos = (agendadaPara.getTime() - Date.now()) / 60_000;
      if (minutos < 30) throw BusinessException.validation('Agende com pelo menos 30 minutos de antecedência.');
      if (minutos > 7 * 24 * 60) throw BusinessException.validation('Dá para agendar até 7 dias à frente.');
      const agendadas = await this.prisma.ride.count({ where: { passengerId, status: RideStatus.SCHEDULED } });
      if (agendadas >= 3) throw BusinessException.validation('Você já tem 3 corridas agendadas.');
    }

    const rota = this.fare.estimarRota(input.pickup, input.dropoff);
    const pedidoEm = new Date();
    // A bandeira e a do horario da viagem: agendada para as 23h paga noturna.
    const orcamento = await this.fare.calcular({
      distanceMeters: rota.distanceMeters,
      durationSeconds: rota.durationSeconds,
      quando: agendadaPara ?? pedidoEm,
      category: input.category ?? 'CARRO',
      pickup: input.pickup,
    });
    const cupom = input.couponCode
      ? await validarCupom(this.prisma, passengerId, input.couponCode, orcamento.totalCents)
      : null;

    const corrida = await this.prisma.withTransaction(async (tx) => {
      const criada = await tx.ride.create({
        data: {
          code: await this.codigoUnico(tx),
          // PIN de embarque: o passageiro diz ao motorista, que confere
          // antes de iniciar — garante que entrou a pessoa certa.
          pin: generateNumericCode(4),
          passengerId,
          status: agendadaPara ? RideStatus.SCHEDULED : RideStatus.REQUESTED,
          scheduledFor: agendadaPara,
          category: orcamento.category,
          multiplier: orcamento.multiplier,
          couponId: cupom?.cupom.id ?? null,
          discountCents: cupom?.descontoCents ?? 0,
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
          status: agendadaPara ? RideStatus.SCHEDULED : RideStatus.REQUESTED,
          actorId: passengerId,
          actorRole: UserRole.PASSENGER,
          latitude: input.pickup.latitude,
          longitude: input.pickup.longitude,
        },
      });
      return criada;
    });

    // A procura comeca em seguida, fora da transacao: gravar a corrida
    // nao pode depender de haver motorista livre neste instante. A
    // agendada espera a rotina de minuto (10 min antes do horario).
    if (!agendadaPara) await this.procurarMotorista(corrida.id);
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

    // Motorista que pediu corrida como passageiro nao recebe o proprio chamado.
    const proprio = await this.prisma.driver.findUnique({ where: { userId: corrida.passengerId }, select: { id: true } });

    // Motoristas favoritos do passageiro recebem primeiro: na primeira
    // rodada, se algum favorito estiver livre por perto, so ele e chamado.
    // Se nao aceitar no prazo, a procura abre para todos.
    const favoritos = await this.favoritosDe(corrida.passengerId);
    // Motorista bloqueado pelo passageiro nunca recebe as corridas dele.
    const bloqueados = await this.bloqueadosDe(corrida.passengerId);
    const primeiraRodada = (await this.prisma.rideOffer.count({ where: { rideId } })) === 0;
    const teste = await this.prisma.contaDeTeste(corrida.passengerId);

    for (const raio of RidesService.RAIOS_METROS) {
      const achados = await this.prisma.findNearbyDrivers({
        latitude: corrida.pickupLat,
        longitude: corrida.pickupLng,
        radiusMeters: raio,
        limit: 10,
        category: corrida.category,
        teste,
      });
      const proximos = achados.filter((m) => !bloqueados.includes(m.driverId));
      if (proximos.length === 0) continue;
      const favoritosPerto = primeiraRodada ? proximos.filter((m) => favoritos.includes(m.driverId)) : [];
      const chamar = favoritosPerto.length > 0 ? favoritosPerto : proximos;

      const expiraEm = new Date(Date.now() + RidesService.SEGUNDOS_PARA_RESPONDER * 1000);
      let enviados = 0;
      for (const m of chamar) {
        // Quem ja recusou esta corrida nao e chamado de novo.
        const jaOfertado = await this.prisma.rideOffer.findUnique({
          where: { rideId_driverId: { rideId, driverId: m.driverId } },
        });
        if (jaOfertado) continue;
        if (proprio && m.driverId === proprio.id) continue;
        if (carteira.bloquear) {
          const w = await this.prisma.wallet.findUnique({ where: { driverId: m.driverId } });
          if (semSaldo(w?.balanceCents ?? 0, carteira.minimoCents)) continue;
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
    const abertas = ofertas.filter((o) => o.ride.status === RideStatus.SEARCHING);
    if (abertas.length === 0) return [];
    // Valor liquido do motorista: depende do modelo financeiro dele.
    const motorista = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { financeModel: true, customCommissionPercent: true, fixedFeeCents: true },
    });
    const liquido = (valor: number, percentual: number) => {
      if (motorista?.financeModel === 'PERCENTUAL' && motorista.customCommissionPercent != null) {
        return Math.round(valor * (1 - Number(motorista.customCommissionPercent) / 100));
      }
      if (motorista?.financeModel === 'TAXA_FIXA') return Math.max(valor - (motorista.fixedFeeCents ?? 0), 0);
      if (motorista?.financeModel === 'MENSALIDADE') return valor;
      return Math.round(valor * (1 - percentual / 100));
    };
    // Nota do passageiro: media das avaliacoes que os motoristas deram a ele.
    const notas = await this.prisma.rating.groupBy({
      by: ['targetId'],
      where: { targetId: { in: abertas.map((o) => o.ride.passengerId) }, targetDriverId: null },
      _avg: { score: true },
      _count: { _all: true },
    });
    const notaDe = (id: string) => {
      const n = notas.find((x) => x.targetId === id);
      return n?._avg.score ? Math.round(n._avg.score * 10) / 10 : 5;
    };
    return abertas
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
        /** Corrida agendada: horario combinado com o passageiro. */
        scheduledFor: o.ride.scheduledFor,
        /** Desconto de cupom (o motorista recebe do passageiro o valor menos isto). */
        discountCents: o.ride.discountCents,
        // Coordenadas: a tela de oferta desenha embarque e destino no mapa
        // ANTES do motorista aceitar. So o endereco escrito nao basta.
        pickupLat: o.ride.pickupLat,
        pickupLng: o.ride.pickupLng,
        dropoffLat: o.ride.dropoffLat,
        dropoffLng: o.ride.dropoffLng,
        tripDistanceMeters: o.ride.distanceMeters,
        tripDurationSeconds: o.ride.durationSeconds,
        commissionPercent: Number(o.ride.commissionPercent),
        /** O que sobra para o motorista depois da taxa da Central. */
        driverNetCents: liquido(o.ride.estimatedFareCents, Number(o.ride.commissionPercent)),
        passengerName: o.ride.passenger?.name ?? 'Passageiro',
        passengerRating: notaDe(o.ride.passengerId),
        // O motorista precisa saber antes de aceitar como vai receber.
        paymentMethodType: o.ride.paymentMethodType,
      }));
  }

  /**
   * Carros disponiveis perto do passageiro, para o mapa da tela inicial.
   * Posicao arredondada (uns 50 m) e sem identificar o motorista: o
   * passageiro ve que ha carro por perto, nao onde cada um esta parado.
   */
  async carrosPerto(lat: number, lng: number, userId?: string) {
    const perto = await this.prisma.findNearbyDrivers({
      latitude: lat,
      longitude: lng,
      radiusMeters: 5000,
      limit: 12,
      teste: userId ? await this.prisma.contaDeTeste(userId) : false,
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
      category: corrida.category,
      multiplier: Number(corrida.multiplier),
      motorista: await this.prisma.driver.findUnique({
        where: { id: driverId },
        select: { financeModel: true, customCommissionPercent: true, fixedFeeCents: true },
      }),
    });

    // Cupom: o desconto e recalculado sobre o valor final e a plataforma
    // devolve esse valor ao motorista na carteira.
    const cupom = corrida.couponId ? await this.prisma.coupon.findUnique({ where: { id: corrida.couponId } }) : null;
    const descontoCents = cupom ? descontoDoCupom(cupom, orcamento.totalCents) : 0;

    return this.prisma.withTransaction(async (tx) => {
      await tx.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.COMPLETED,
          discountCents: descontoCents,
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
      let saldoFinal = aposComissao;
      if (cupom && descontoCents > 0) {
        saldoFinal = aposComissao + descontoCents;
        await tx.walletTransaction.create({
          data: {
            walletId: carteira.id,
            type: 'BONUS',
            amountCents: descontoCents,
            balanceAfterCents: saldoFinal,
            description: `Cupom ${cupom.code}: desconto pago pela plataforma`,
            rideId,
          },
        });
        await tx.coupon.update({ where: { id: cupom.id }, data: { usedCount: { increment: 1 } } });
      }
      await tx.wallet.update({
        where: { id: carteira.id },
        data: {
          balanceCents: saldoFinal,
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
        discountCents: descontoCents,
        couponCode: cupom?.code ?? null,
        /** O que o motorista recebe do passageiro (o desconto vem na carteira). */
        toCollectCents: orcamento.totalCents - descontoCents,
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
    driverId?: string | null,
  ) {
    const corrida = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!corrida) throw BusinessException.notFound('Corrida nao encontrada.');

    // O motorista e identificado pelo cadastro de motorista (driverId), nao
    // pelo usuario — antes a comparacao era com o usuario e o motorista
    // nunca conseguia cancelar ("Esta corrida nao e sua").
    const ehMotorista = !!driverId && corrida.driverId === driverId && papel === UserRole.DRIVER;
    const ehPassageiro = !ehMotorista && corrida.passengerId === atorId;
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
      multaCents = await this.fare.taxaDeCancelamento(new Date(), corrida.category);
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
    if (!corrida) return { ride: null };
    await this.acompanharProcura(corrida.id);
    return this.detalhe(corrida.id, { userId: passengerId, papel: UserRole.PASSENGER });
  }

  /** Tempo maximo procurando motorista antes de desistir. */
  private static readonly MINUTOS_PROCURANDO = 4;
  /** Agendada comeca 10 min antes e procura ate 5 min depois do horario. */
  private static readonly MINUTOS_PROCURANDO_AGENDADA = 15;
  private rotinaRodando = false;

  /**
   * A cada minuto: dispara as agendadas que estao chegando (10 min antes)
   * e mantem a procura de todas as corridas abertas — mesmo com o
   * aplicativo do passageiro fechado.
   */
  @Interval(60_000)
  async rotinaDeMinuto(): Promise<void> {
    if (this.rotinaRodando) return;
    this.rotinaRodando = true;
    try {
      const agora = Date.now();
      const chegando = await this.prisma.ride.findMany({
        where: { status: RideStatus.SCHEDULED, scheduledFor: { lte: new Date(agora + 10 * 60_000) } },
        take: 50,
      });
      for (const c of chegando) {
        // Servidor ficou parado e o horario ja passou ha muito: nao adianta chamar.
        if (c.scheduledFor && c.scheduledFor.getTime() < agora - 30 * 60_000) {
          await this.prisma.ride.updateMany({
            where: { id: c.id, status: RideStatus.SCHEDULED },
            data: { status: RideStatus.EXPIRED, cancelledAt: new Date(), cancellationReason: 'Horario agendado passou.' },
          });
          continue;
        }
        const mudou = await this.prisma.ride.updateMany({
          where: { id: c.id, status: RideStatus.SCHEDULED },
          data: { status: RideStatus.REQUESTED, requestedAt: new Date() },
        });
        if (mudou.count === 0) continue;
        await this.prisma.rideStatusHistory.create({
          data: { rideId: c.id, status: RideStatus.REQUESTED, note: 'Agendada: inicio da procura.' },
        });
        await this.procurarMotorista(c.id).catch((e) => this.logger.error(`Agendada ${c.id}: ${(e as Error).message}`));
      }

      const procurando = await this.prisma.ride.findMany({
        where: { status: { in: [RideStatus.SEARCHING, RideStatus.REQUESTED] } },
        select: { id: true },
        take: 100,
      });
      for (const c of procurando) {
        await this.acompanharProcura(c.id).catch((e) => this.logger.error(`Procura ${c.id}: ${(e as Error).message}`));
      }
    } catch (e) {
      this.logger.error(`Rotina de minuto: ${(e as Error).message}`);
    } finally {
      this.rotinaRodando = false;
    }
  }

  /** Corridas agendadas do passageiro (proximas primeiro). */
  async agendadas(passengerId: string) {
    const itens = await this.prisma.ride.findMany({
      where: { passengerId, status: RideStatus.SCHEDULED },
      orderBy: { scheduledFor: 'asc' },
    });
    return { items: itens };
  }

  async cupons(passengerId: string) {
    return cuponsDisponiveis(this.prisma, passengerId);
  }

  // ---------------- Motoristas favoritos (guardados no usuario) ----------------

  private async favoritosDe(userId: string): Promise<string[]> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    const m = (u?.metadata ?? {}) as { motoristasFavoritos?: unknown };
    return Array.isArray(m.motoristasFavoritos) ? m.motoristasFavoritos.filter((x): x is string => typeof x === 'string') : [];
  }

  private async gravarFavoritos(userId: string, lista: string[]): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    const meta = u?.metadata && typeof u.metadata === 'object' && !Array.isArray(u.metadata) ? (u.metadata as object) : {};
    await this.prisma.user.update({
      where: { id: userId },
      data: { metadata: { ...meta, motoristasFavoritos: lista.slice(0, 20) } as never },
    });
  }

  async favoritos(userId: string) {
    const ids = await this.favoritosDe(userId);
    if (ids.length === 0) return { items: [] };
    const motoristas = await this.prisma.driver.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        ratingAvg: true,
        totalRides: true,
        status: true,
        user: { select: { name: true } },
        vehicles: { select: { brand: true, model: true, color: true, plate: true }, take: 1 },
        location: { select: { isOnline: true, isAvailable: true } },
      },
    });
    return {
      items: motoristas.map((m) => ({
        driverId: m.id,
        name: m.user.name,
        rating: Number(m.ratingAvg),
        totalRides: m.totalRides,
        vehicle: m.vehicles[0] ? `${m.vehicles[0].brand} ${m.vehicles[0].model}` : '',
        color: m.vehicles[0]?.color ?? '',
        plate: m.vehicles[0]?.plate ?? '',
        online: !!m.location?.isOnline && m.status === 'APPROVED',
      })),
    };
  }

  /** Corridas em que este motorista ja foi (ou esta sendo) o motorista do passageiro. */
  private async jaFoiMotoristaDe(userId: string, driverId: string): Promise<boolean> {
    const n = await this.prisma.ride.count({
      where: {
        passengerId: userId,
        driverId,
        status: {
          in: [
            RideStatus.DRIVER_ASSIGNED,
            RideStatus.DRIVER_ARRIVING,
            RideStatus.DRIVER_WAITING,
            RideStatus.IN_PROGRESS,
            RideStatus.COMPLETED,
          ],
        },
      },
    });
    return n > 0;
  }

  /** Da para favoritar o motorista que ja levou ou que esta vindo buscar. */
  async favoritar(userId: string, driverId: string) {
    if (!(await this.jaFoiMotoristaDe(userId, driverId))) {
      throw BusinessException.validation('Só dá para favoritar um motorista que já aceitou uma corrida sua.');
    }
    const atual = await this.favoritosDe(userId);
    if (!atual.includes(driverId)) await this.gravarFavoritos(userId, [driverId, ...atual]);
    const bloq = await this.bloqueadosDe(userId);
    if (bloq.includes(driverId)) await this.gravarBloqueados(userId, bloq.filter((d) => d !== driverId));
    return this.favoritos(userId);
  }

  // ---------------- Motoristas bloqueados pelo passageiro ----------------

  private async bloqueadosDe(userId: string): Promise<string[]> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    const m = (u?.metadata ?? {}) as { motoristasBloqueados?: unknown };
    return Array.isArray(m.motoristasBloqueados) ? m.motoristasBloqueados.filter((x): x is string => typeof x === 'string') : [];
  }

  private async gravarBloqueados(userId: string, lista: string[]): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } });
    const meta = u?.metadata && typeof u.metadata === 'object' && !Array.isArray(u.metadata) ? (u.metadata as object) : {};
    await this.prisma.user.update({
      where: { id: userId },
      data: { metadata: { ...meta, motoristasBloqueados: lista.slice(0, 50) } as never },
    });
  }

  async bloqueados(userId: string) {
    const ids = await this.bloqueadosDe(userId);
    if (ids.length === 0) return { items: [] };
    const motoristas = await this.prisma.driver.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        user: { select: { name: true } },
        vehicles: { select: { brand: true, model: true, plate: true }, take: 1 },
      },
    });
    return {
      items: motoristas.map((m) => ({
        driverId: m.id,
        name: m.user.name,
        vehicle: m.vehicles[0] ? `${m.vehicles[0].brand} ${m.vehicles[0].model}` : '',
        plate: m.vehicles[0]?.plate ?? '',
      })),
    };
  }

  /** O motorista nao recebe mais corridas deste passageiro. A corrida atual continua (cancelar e outro botao). */
  async bloquear(userId: string, driverId: string) {
    if (!(await this.jaFoiMotoristaDe(userId, driverId))) {
      throw BusinessException.validation('Só dá para bloquear um motorista que já aceitou uma corrida sua.');
    }
    const atual = await this.bloqueadosDe(userId);
    if (!atual.includes(driverId)) await this.gravarBloqueados(userId, [driverId, ...atual]);
    const fav = await this.favoritosDe(userId);
    if (fav.includes(driverId)) await this.gravarFavoritos(userId, fav.filter((d) => d !== driverId));
    return this.bloqueados(userId);
  }

  async desbloquear(userId: string, driverId: string) {
    const atual = await this.bloqueadosDe(userId);
    await this.gravarBloqueados(userId, atual.filter((d) => d !== driverId));
    return this.bloqueados(userId);
  }

  // ---------------- Conversa (chat) da corrida ----------------

  private static readonly COM_CONVERSA: RideStatus[] = [
    RideStatus.DRIVER_ASSIGNED,
    RideStatus.DRIVER_ARRIVING,
    RideStatus.DRIVER_WAITING,
    RideStatus.IN_PROGRESS,
  ];

  private async participante(rideId: string, quem: { userId: string; driverId?: string | null }) {
    const corrida = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: { id: true, passengerId: true, driverId: true, status: true },
    });
    if (!corrida) throw BusinessException.notFound('Corrida nao encontrada.');
    const ehPassageiro = corrida.passengerId === quem.userId;
    const ehMotorista = !!quem.driverId && corrida.driverId === quem.driverId;
    if (!ehPassageiro && !ehMotorista) throw BusinessException.forbidden('Esta corrida nao e sua.');
    return { corrida, papel: ehPassageiro ? 'PASSENGER' : 'DRIVER' };
  }

  /** Mensagens da corrida. Ao ler, as mensagens do outro lado ficam como lidas. */
  async mensagens(rideId: string, quem: { userId: string; driverId?: string | null }, depois?: string) {
    const { corrida } = await this.participante(rideId, quem);
    const desde = depois ? new Date(depois) : null;
    const itens = await this.prisma.rideMessage.findMany({
      where: { rideId, ...(desde && !Number.isNaN(desde.getTime()) ? { createdAt: { gt: desde } } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    await this.prisma.rideMessage.updateMany({
      where: { rideId, authorId: { not: quem.userId }, readAt: null },
      data: { readAt: new Date() },
    });
    return {
      podeEscrever: RidesService.COM_CONVERSA.includes(corrida.status),
      items: itens.map((m) => ({
        id: m.id,
        minha: m.authorId === quem.userId,
        autor: m.authorRole,
        texto: m.text,
        criadaEm: m.createdAt.toISOString(),
        lida: !!m.readAt,
      })),
    };
  }

  async enviarMensagem(rideId: string, quem: { userId: string; driverId?: string | null }, texto: string) {
    const { corrida, papel } = await this.participante(rideId, quem);
    if (!RidesService.COM_CONVERSA.includes(corrida.status)) {
      throw BusinessException.validation('A conversa fica aberta só enquanto a corrida está em andamento.');
    }
    const limpo = texto.trim().slice(0, 500);
    if (!limpo) throw BusinessException.validation('Escreva a mensagem.');
    const m = await this.prisma.rideMessage.create({
      data: { rideId, authorId: quem.userId, authorRole: papel, text: limpo },
    });
    return { id: m.id, minha: true, autor: papel, texto: m.text, criadaEm: m.createdAt.toISOString(), lida: false };
  }

  async desfavoritar(userId: string, driverId: string) {
    const atual = await this.favoritosDe(userId);
    await this.gravarFavoritos(userId, atual.filter((d) => d !== driverId));
    return this.favoritos(userId);
  }

  /**
   * Enquanto o passageiro acompanha a tela, a procura continua: chamado
   * vencido sem resposta abre para os outros motoristas (inclusive quem
   * ficou online depois) e, passado o limite, a corrida e encerrada como
   * "nenhum motorista disponivel" em vez de ficar procurando para sempre.
   */
  async acompanharProcura(rideId: string): Promise<void> {
    const corrida = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!corrida || (corrida.status !== RideStatus.SEARCHING && corrida.status !== RideStatus.REQUESTED)) return;

    const minutos = corrida.scheduledFor ? RidesService.MINUTOS_PROCURANDO_AGENDADA : RidesService.MINUTOS_PROCURANDO;
    const limite = new Date(corrida.requestedAt.getTime() + minutos * 60_000);
    if (new Date() > limite) {
      const mudou = await this.prisma.ride.updateMany({
        where: { id: rideId, status: { in: [RideStatus.SEARCHING, RideStatus.REQUESTED] } },
        data: { status: RideStatus.EXPIRED, cancelledAt: new Date(), cancellationReason: 'Nenhum motorista disponivel.' },
      });
      if (mudou.count > 0) {
        await this.prisma.rideOffer.updateMany({
          where: { rideId, status: OfferStatus.PENDING },
          data: { status: OfferStatus.EXPIRED, respondedAt: new Date() },
        });
        await this.prisma.rideStatusHistory.create({
          data: { rideId, status: RideStatus.EXPIRED, note: 'Nenhum motorista disponivel.' },
        });
      }
      return;
    }

    const abertos = await this.prisma.rideOffer.count({
      where: { rideId, status: OfferStatus.PENDING, expiresAt: { gt: new Date() } },
    });
    if (abertos === 0) await this.procurarMotorista(rideId);
  }

  /** Corrida que o passageiro esta acompanhando (a procura continua por aqui). */
  async acompanharDoPassageiro(userId: string, papel: UserRole, rideId: string, driverId?: string | null) {
    await this.acompanharProcura(rideId);
    return this.detalhe(rideId, { userId, papel, driverId });
  }

  /** Passageiro avalia o motorista depois da corrida concluida (uma vez). */
  /** O motorista avalia o passageiro (1 a 5 estrelas) depois de finalizar. */
  async avaliarPassageiro(driverId: string, userId: string, rideId: string, input: { score: number; tags?: string[] }) {
    const corrida = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!corrida) throw BusinessException.notFound('Corrida nao encontrada.');
    if (corrida.driverId !== driverId) throw BusinessException.forbidden('Esta corrida nao e sua.');
    if (corrida.status !== RideStatus.COMPLETED) throw BusinessException.validation('So da para avaliar depois de finalizar.');
    const ja = await this.prisma.rating.findUnique({ where: { rideId_authorId: { rideId, authorId: userId } } });
    if (ja) return { score: ja.score };
    const r = await this.prisma.rating.create({
      data: { rideId, authorId: userId, targetId: corrida.passengerId, score: input.score, tags: input.tags ?? [] },
    });
    return { score: r.score };
  }

  async avaliar(passengerId: string, rideId: string, input: { score: number; comment?: string; tags?: string[] }) {
    const corrida = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { driver: { select: { id: true, userId: true, ratingAvg: true, ratingCount: true } } },
    });
    if (!corrida) throw BusinessException.notFound('Corrida nao encontrada.');
    if (corrida.passengerId !== passengerId) throw BusinessException.forbidden('Esta corrida nao e sua.');
    if (corrida.status !== RideStatus.COMPLETED || !corrida.driver) {
      throw BusinessException.validation('So da para avaliar corrida concluida.');
    }
    const ja = await this.prisma.rating.findUnique({ where: { rideId_authorId: { rideId, authorId: passengerId } } });
    if (ja) return { rideId, score: ja.score, jaAvaliada: true };

    const motorista = corrida.driver;
    const contagem = motorista.ratingCount;
    const media = Number(motorista.ratingAvg);
    const nova = contagem === 0 ? input.score : (media * contagem + input.score) / (contagem + 1);
    await this.prisma.withTransaction(async (tx) => {
      await tx.rating.create({
        data: {
          rideId,
          authorId: passengerId,
          targetId: motorista.userId,
          targetDriverId: motorista.id,
          score: input.score,
          comment: input.comment,
          tags: input.tags ?? [],
        },
      });
      await tx.driver.update({
        where: { id: motorista.id },
        data: { ratingAvg: new Prisma.Decimal(nova.toFixed(2)), ratingCount: contagem + 1 },
      });
    });
    return { rideId, score: input.score, jaAvaliada: false };
  }

  /** A corrida aberta do motorista, se houver. */
  async atualDoMotorista(driverId: string, userId?: string) {
    const corrida = await this.prisma.ride.findFirst({
      where: { driverId, status: { in: EM_ABERTO } },
      orderBy: { acceptedAt: 'desc' },
    });
    if (!corrida) return { ride: null };
    return userId ? this.detalhe(corrida.id, { userId, papel: UserRole.DRIVER, driverId }) : this.detalhe(corrida.id);
  }

  /**
   * Detalhe da corrida. Com [quem], so o passageiro dela, o motorista dela
   * ou a Central enxergam (antes qualquer conta lia qualquer corrida, com
   * nome e telefone das duas pontas).
   */
  async detalhe(rideId: string, quem?: { userId: string; papel: UserRole; driverId?: string | null }) {
    const corrida = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: { select: { id: true, name: true, phone: true } },
        driver: {
          select: {
            id: true,
            ratingAvg: true,
            totalRides: true,
            user: { select: { name: true, phone: true, avatarUrl: true } },
            documents: {
              where: { type: 'VEHICLE_FRONT' },
              orderBy: { uploadedAt: 'desc' },
              take: 1,
              select: { fileUrl: true },
            },
          },
        },
        vehicle: { select: { plate: true, brand: true, model: true, color: true } },
        ratings: { select: { authorId: true, score: true } },
      },
    });
    if (!corrida) throw BusinessException.notFound('Corrida nao encontrada.');
    if (quem && quem.papel !== UserRole.ADMIN) {
      const ehDono = corrida.passengerId === quem.userId;
      const ehMotorista = !!quem.driverId && corrida.driverId === quem.driverId;
      if (!ehDono && !ehMotorista) throw BusinessException.forbidden('Esta corrida nao e sua.');
    }

    // Onde o carro esta agora: o passageiro acompanha o motorista chegando.
    const comCarro: RideStatus[] = [
      RideStatus.DRIVER_ASSIGNED,
      RideStatus.DRIVER_ARRIVING,
      RideStatus.DRIVER_WAITING,
      RideStatus.IN_PROGRESS,
    ];
    const driverPosition =
      corrida.driverId && comCarro.includes(corrida.status) ? await this.posicaoDoMotorista(corrida.driverId) : null;
    const minhaNota = quem ? (corrida.ratings.find((r) => r.authorId === quem.userId)?.score ?? null) : null;
    const { ratings: _notas, ...semNotas } = corrida;
    // Foto do carro (de frente) que o motorista mandou nos documentos.
    const driver = corrida.driver
      ? (() => {
          const { documents, ...resto } = corrida.driver;
          return { ...resto, fotoCarroUrl: documents[0]?.fileUrl ?? null };
        })()
      : null;
    const mensagensNaoLidas = quem
      ? await this.prisma.rideMessage.count({ where: { rideId, authorId: { not: quem.userId }, readAt: null } })
      : 0;
    let favorito = false;
    let bloqueado = false;
    if (quem && corrida.driverId && corrida.passengerId === quem.userId) {
      favorito = (await this.favoritosDe(quem.userId)).includes(corrida.driverId);
      bloqueado = (await this.bloqueadosDe(quem.userId)).includes(corrida.driverId);
    }
    return { ride: { ...semNotas, driver, driverPosition, minhaNota, mensagensNaoLidas, favorito, bloqueado } };
  }

  async posicaoDoMotorista(driverId: string): Promise<{ latitude: number; longitude: number; updatedAt: string } | null> {
    const linhas = await this.prisma.$queryRaw<Array<{ latitude: number; longitude: number; atualizado: Date }>>`
      SELECT ST_Y(location::geometry) AS "latitude", ST_X(location::geometry) AS "longitude", last_seen_at AS "atualizado"
      FROM driver_locations WHERE driver_id = ${driverId}::uuid LIMIT 1`;
    const l = linhas[0];
    return l ? { latitude: Number(l.latitude), longitude: Number(l.longitude), updatedAt: l.atualizado.toISOString() } : null;
  }

  async historico(userId: string, papel: UserRole, filtro: ListRidesInput) {
    const onde: Prisma.RideWhereInput =
      papel === UserRole.DRIVER ? { driverId: userId } : { passengerId: userId };
    if (filtro.status) onde.status = filtro.status as RideStatus;
    if (filtro.period) {
      // Dia, semana (desde segunda) e mes pela hora de Brasilia.
      const b = new Date(Date.now() - 3 * 3_600_000);
      let inicio = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3));
      if (filtro.period === 'week') inicio = new Date(inicio.getTime() - ((b.getUTCDay() + 6) % 7) * 86_400_000);
      if (filtro.period === 'month') inicio = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1, 3));
      onde.status = RideStatus.COMPLETED;
      onde.finishedAt = { gte: inicio };
    }

    const [total, itens, soma] = await Promise.all([
      this.prisma.ride.count({ where: onde }),
      this.prisma.ride.findMany({
        where: onde,
        orderBy: { requestedAt: 'desc' },
        skip: (filtro.page - 1) * filtro.pageSize,
        take: filtro.pageSize,
      }),
      this.prisma.ride.aggregate({
        where: { ...onde, status: RideStatus.COMPLETED },
        _sum: { finalFareCents: true, commissionCents: true, discountCents: true },
        _count: { _all: true },
      }),
    ]);
    let desempenho: Record<string, number> | undefined;
    if (papel === UserRole.DRIVER && filtro.period) {
      const desde = (onde.finishedAt as { gte: Date }).gte;
      const [ofertas, canceladas, motorista] = await Promise.all([
        this.prisma.rideOffer.groupBy({
          by: ['status'],
          where: { driverId: userId, createdAt: { gte: desde }, status: { not: OfferStatus.PENDING } },
          _count: { _all: true },
        }),
        this.prisma.ride.count({
          where: { driverId: userId, status: RideStatus.CANCELLED_BY_DRIVER, cancelledAt: { gte: desde } },
        }),
        this.prisma.driver.findUnique({ where: { id: userId }, select: { ratingAvg: true } }),
      ]);
      const conta = (s: OfferStatus) => ofertas.find((o) => o.status === s)?._count._all ?? 0;
      const respondidas = conta(OfferStatus.ACCEPTED) + conta(OfferStatus.DECLINED) + conta(OfferStatus.EXPIRED);
      desempenho = {
        offers: respondidas,
        accepted: conta(OfferStatus.ACCEPTED),
        acceptanceRate: respondidas ? Math.round((conta(OfferStatus.ACCEPTED) / respondidas) * 100) : 100,
        cancellations: canceladas,
        ratingAvg: Number(motorista?.ratingAvg ?? 5),
      };
    }
    return {
      total,
      page: filtro.page,
      pageSize: filtro.pageSize,
      items: itens,
      /** Taxa de aceitacao, cancelamentos e nota (so com periodo, para o motorista). */
      performance: desempenho ?? null,
      /** Totais das concluidas no filtro: valor, taxa da Central e liquido. */
      summary: {
        rides: soma._count._all,
        totalCents: soma._sum.finalFareCents ?? 0,
        commissionCents: soma._sum.commissionCents ?? 0,
        netCents: (soma._sum.finalFareCents ?? 0) - (soma._sum.commissionCents ?? 0),
      },
    };
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
