import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DriverStatus, OfferStatus, PayoutStatus, RideStatus, UserRole, UserStatus } from '@prisma/client';
import { haversineKm } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { RidesService } from '../rides/rides.service';
import { regrasDaCarteira, semSaldo } from '../painel-motorista/regras-carteira';
import { PracasService } from '../pracas/pracas.service';

const HORA = 3_600_000;
const DIA = 24 * HORA;

/** Inicio do dia de hoje em Brasilia (UTC-3). */
function inicioDeHoje(): Date {
  const b = new Date(Date.now() - 3 * HORA);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3));
}

const EM_ANDAMENTO: RideStatus[] = ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'DRIVER_WAITING', 'IN_PROGRESS'];
const ABERTAS: RideStatus[] = ['SCHEDULED', 'REQUESTED', 'SEARCHING', ...EM_ANDAMENTO];

export interface CorridaManual {
  passengerName: string;
  passengerPhone: string;
  pickup: { address: string; latitude: number; longitude: number };
  dropoff: { address: string; latitude: number; longitude: number };
  category: string;
  paymentMethodType: 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD';
  driverId?: string;
  scheduledFor?: Date;
}

@Injectable()
export class CentralService {
  private readonly logger = new Logger(CentralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rides: RidesService,
    private readonly pracas: PracasService,
  ) {}

  // ================= Visao geral =================

  /** [praca]: so a cidade (operador, ou o dono filtrando); null = todas. */
  async visaoGeral(praca: string | null = null) {
    const hoje = inicioDeHoje();
    const daPraca = await this.pracas.ondeCorridas(praca);
    const ids = await this.pracas.idsDeMotoristas(praca);
    const dosMotoristas = ids ? { id: { in: ids } } : {};
    const sosDaPraca = await this.pracas.ondeSos(praca);
    const [ativas, concluidasHoje, online, ocupados, soma, sos, pendentes, ultimoPendente] = await Promise.all([
      this.prisma.ride.count({ where: { status: { in: ABERTAS.filter((s) => s !== 'SCHEDULED') }, ...daPraca } }),
      this.prisma.ride.count({ where: { status: RideStatus.COMPLETED, finishedAt: { gte: hoje }, ...daPraca } }),
      this.prisma.driver.count({ where: { isOnline: true, status: DriverStatus.APPROVED, ...dosMotoristas } }),
      this.prisma.ride.count({ where: { status: { in: EM_ANDAMENTO }, ...daPraca } }),
      this.prisma.ride.aggregate({
        where: { status: RideStatus.COMPLETED, finishedAt: { gte: hoje }, ...daPraca },
        _sum: { finalFareCents: true, commissionCents: true },
      }),
      this.prisma.safetyEvent.count({ where: { type: 'PANIC_BUTTON', resolved: false, ...sosDaPraca } }),
      // Cadastros esperando a Central (o painel avisa quando chega um novo).
      // Cadastro sem cidade ainda (sem posicao) aparece para todos.
      this.prisma.driver.count({ where: { status: DriverStatus.PENDING, user: { deletedAt: null }, ...(await this.pendentesDa(praca)) } }),
      this.prisma.driver.findFirst({
        where: { status: DriverStatus.PENDING, user: { deletedAt: null }, ...(await this.pendentesDa(praca)) },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, user: { select: { name: true, phone: true } } },
      }),
    ]);
    return {
      activeRides: ativas,
      completedToday: concluidasHoje,
      driversOnline: online,
      driversBusy: Math.min(ocupados, online),
      driversFree: Math.max(online - ocupados, 0),
      revenueTodayCents: soma._sum.finalFareCents ?? 0,
      commissionTodayCents: soma._sum.commissionCents ?? 0,
      sosActive: sos,
      driversPending: pendentes,
      latestPendingDriver: ultimoPendente
        ? {
            id: ultimoPendente.id,
            name: ultimoPendente.user?.name ?? null,
            phone: ultimoPendente.user?.phone ?? null,
            createdAt: ultimoPendente.createdAt,
          }
        : null,
    };
  }

  /** Pendentes da praca: os da cidade e os que ainda nao tem cidade. */
  private async pendentesDa(praca: string | null): Promise<{ id?: { in: string[] } }> {
    if (!praca) return {};
    const mapa = await this.pracas.mapaDeMotoristas();
    return { id: { in: [...mapa.entries()].filter(([, p]) => p === praca || p === null).map(([id]) => id) } };
  }

  // ================= Despacho =================

  /** Corrida pedida por telefone: a Central preenche e a procura comeca. */
  async criarCorridaManual(adminId: string, input: CorridaManual) {
    const telefone = '+55' + input.passengerPhone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (!/^\+55\d{10,11}$/.test(telefone)) throw BusinessException.validation('Telefone do passageiro invalido (DDD + numero).');

    let passageiro = await this.prisma.user.findFirst({ where: { phone: telefone, deletedAt: null } });
    if (passageiro?.status === UserStatus.BLOCKED) {
      throw BusinessException.validation('Este passageiro esta bloqueado.');
    }
    if (!passageiro) {
      passageiro = await this.prisma.user.create({
        data: {
          name: input.passengerName.trim(),
          phone: telefone,
          role: UserRole.PASSENGER,
          status: UserStatus.ACTIVE,
          phoneVerifiedAt: null,
          metadata: { criadoPelaCentral: true } as never,
        },
      });
    }

    const criada = await this.rides.pedir(passageiro.id, {
      pickup: input.pickup,
      dropoff: input.dropoff,
      paymentMethodType: input.paymentMethodType,
      category: input.category,
      scheduledFor: input.scheduledFor,
    } as never);
    const rideId = (criada as { ride: { id: string } }).ride.id;
    await this.prisma.rideStatusHistory.create({
      data: { rideId, status: RideStatus.REQUESTED, actorId: adminId, actorRole: UserRole.ADMIN, note: 'Corrida criada pela Central.' },
    });
    if (input.driverId && !input.scheduledFor) await this.atribuir(adminId, rideId, input.driverId);
    return { rideId };
  }

  /**
   * Atribuir (ou reatribuir): o chamado vai SO para este motorista, com o
   * alarme dele tocando. Se ele nao aceitar em 60 s, a procura volta a
   * chamar os motoristas mais perto.
   */
  async atribuir(adminId: string, rideId: string, driverId: string) {
    const corrida = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!corrida) throw BusinessException.notFound('Corrida nao encontrada.');
    if (corrida.status === RideStatus.IN_PROGRESS) {
      throw BusinessException.validation('A viagem ja comecou; nao da para trocar o motorista.');
    }
    if (!ABERTAS.includes(corrida.status)) throw BusinessException.validation('Esta corrida ja terminou.');
    if (corrida.driverId === driverId) throw BusinessException.validation('Este motorista ja esta com a corrida.');

    const motorista = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { location: true, vehicles: { where: { isActive: true }, take: 1 }, user: { select: { name: true } } },
    });
    if (!motorista || motorista.status !== DriverStatus.APPROVED) throw BusinessException.validation('Motorista nao aprovado.');
    // Mesma conta no app do passageiro e no do motorista: ninguem leva a
    // propria corrida (evita fraude com cupom e confusao na avaliacao).
    if (motorista.userId === corrida.passengerId) {
      throw BusinessException.validation(
        `${motorista.user.name} e a mesma conta do passageiro desta corrida. Para testar, peça a corrida com outro numero ou e-mail no app do passageiro.`,
      );
    }
    if (!motorista.isOnline) throw BusinessException.validation(`${motorista.user.name} esta desconectado.`);

    const regras = await regrasDaCarteira(this.prisma);
    if (regras.bloquear) {
      const w = await this.prisma.wallet.findUnique({ where: { driverId } });
      if (semSaldo(w?.balanceCents ?? 0, regras.minimoCents)) {
        throw BusinessException.validation(`${motorista.user.name} está sem saldo na carteira. Faça a recarga antes de enviar corridas.`);
      }
    }

    const ocupado = await this.prisma.ride.count({ where: { driverId, status: { in: EM_ANDAMENTO } } });
    if (ocupado > 0) throw BusinessException.validation(`${motorista.user.name} esta em outra corrida.`);

    const anterior = corrida.driverId;
    await this.prisma.withTransaction(async (tx) => {
      await tx.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.SEARCHING,
          driverId: null,
          vehicleId: null,
          acceptedAt: null,
          requestedAt: new Date(),
          category: motorista.vehicles[0]?.category ?? corrida.category,
        },
      });
      if (anterior) {
        await tx.driverLocation.updateMany({ where: { driverId: anterior }, data: { isAvailable: true } });
      }
      await tx.rideOffer.updateMany({
        where: { rideId, status: OfferStatus.PENDING },
        data: { status: OfferStatus.EXPIRED, respondedAt: new Date() },
      });
      await tx.rideOffer.upsert({
        where: { rideId_driverId: { rideId, driverId } },
        create: { rideId, driverId, distanceKm: 0, etaSeconds: 300, expiresAt: new Date(Date.now() + 60_000) },
        update: { status: OfferStatus.PENDING, expiresAt: new Date(Date.now() + 60_000), respondedAt: null },
      });
      await tx.rideStatusHistory.create({
        data: {
          rideId,
          status: RideStatus.SEARCHING,
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          note: anterior ? `Central reatribuiu para ${motorista.user.name}.` : `Central enviou para ${motorista.user.name}.`,
        },
      });
    });
    return { ok: true, driverName: motorista.user.name };
  }

  async cancelar(adminId: string, rideId: string, motivo: string) {
    return this.rides.cancelar(adminId, UserRole.ADMIN, rideId, { reason: motivo || 'Cancelada pela Central.' });
  }

  /** Motoristas online e livres, do mais perto ao mais longe do embarque. */
  /**
   * Motoristas para o despacho (so os online) ou para o mapa da Central
   * ([todos]: tambem os offline, cinza, na ultima posicao conhecida —
   * Evandro, 08/10/2026: "o carro some do mapa quando fica offline").
   */
  async livresPerto(lat: number, lng: number, todos = false, praca: string | null = null) {
    const ids = await this.pracas.idsDeMotoristas(praca);
    const lista = await this.prisma.driver.findMany({
      where: {
        status: DriverStatus.APPROVED,
        ...(todos ? { location: { isNot: null } } : { isOnline: true }),
        ...(ids ? { id: { in: ids } } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
        location: true,
        vehicles: { where: { isActive: true }, take: 1 },
      },
      take: 200,
    });
    const ocupados = new Set(
      (
        await this.prisma.ride.findMany({ where: { status: { in: EM_ANDAMENTO } }, select: { driverId: true } })
      ).map((r) => r.driverId),
    );
    const posicoes = await this.prisma.$queryRaw<
      Array<{ driverId: string; latitude: number; longitude: number; lastSeenAt: Date | null }>
    >`
      SELECT driver_id AS "driverId", ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
             last_seen_at AS "lastSeenAt"
      FROM driver_locations WHERE is_online = TRUE OR ${todos}
    `;
    const pos = new Map(posicoes.map((p) => [p.driverId, p]));
    return lista
      .map((m) => {
        const p = pos.get(m.id);
        return {
          driverId: m.id,
          name: m.user.name,
          phone: m.user.phone,
          busy: ocupados.has(m.id),
          vehicle: m.vehicles[0] ? `${m.vehicles[0].brand} ${m.vehicles[0].model} ${m.vehicles[0].color}` : '',
          plate: m.vehicles[0]?.plate ?? '',
          category: m.vehicles[0]?.category ?? 'CARRO',
          distanceKm: p ? Math.round(haversineKm({ latitude: lat, longitude: lng }, p) * 10) / 10 : null,
          latitude: p ? Number(p.latitude) : null,
          longitude: p ? Number(p.longitude) : null,
          rating: Number(m.ratingAvg),
          online: m.isOnline,
          lastSeenAt: p?.lastSeenAt ?? null,
        };
      })
      .sort((a, b) => Number(b.online) - Number(a.online) || (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  }

  // ================= Motoristas =================

  async modeloFinanceiro(
    driverId: string,
    input: { financeModel: string; commissionPercent?: number; fixedFeeCents?: number; monthlyFeeCents?: number },
  ) {
    const dados: Record<string, unknown> = { financeModel: input.financeModel };
    if (input.financeModel === 'PERCENTUAL') {
      if (input.commissionPercent == null) throw BusinessException.validation('Informe a comissao (%).');
      dados.customCommissionPercent = input.commissionPercent;
    }
    if (input.financeModel === 'TAXA_FIXA') {
      if (!input.fixedFeeCents) throw BusinessException.validation('Informe a taxa fixa por corrida.');
      dados.fixedFeeCents = input.fixedFeeCents;
    }
    if (input.financeModel === 'MENSALIDADE') {
      if (!input.monthlyFeeCents) throw BusinessException.validation('Informe o valor da mensalidade.');
      const atual = await this.prisma.driver.findUnique({ where: { id: driverId } });
      dados.monthlyFeeCents = input.monthlyFeeCents;
      // Mudou para mensalidade agora: a primeira e cobrada na rotina.
      if (atual?.financeModel !== 'MENSALIDADE') dados.monthlyPaidUntil = null;
    }
    return this.prisma.driver.update({
      where: { id: driverId },
      data: dados as never,
      select: {
        id: true,
        financeModel: true,
        customCommissionPercent: true,
        fixedFeeCents: true,
        monthlyFeeCents: true,
        monthlyPaidUntil: true,
      },
    });
  }

  async categoriaDoVeiculo(driverId: string, categoria: string) {
    const r = await this.prisma.vehicle.updateMany({ where: { driverId, isActive: true }, data: { category: categoria } });
    if (r.count === 0) throw BusinessException.validation('Este motorista nao tem veiculo ativo.');
    return { ok: true, category: categoria };
  }

  /** Mensalidade: a cada hora confere quem venceu e desconta da carteira. */
  private ultimaMensalidade = 0;
  @Interval(60_000)
  async cobrarMensalidades(): Promise<void> {
    if (Date.now() - this.ultimaMensalidade < HORA / 4) return;
    this.ultimaMensalidade = Date.now();
    try {
      const vencidos = await this.prisma.driver.findMany({
        where: {
          financeModel: 'MENSALIDADE',
          monthlyFeeCents: { gt: 0 },
          OR: [{ monthlyPaidUntil: null }, { monthlyPaidUntil: { lt: new Date() } }],
        },
        take: 100,
      });
      for (const d of vencidos) {
        const valor = d.monthlyFeeCents ?? 0;
        const base = d.monthlyPaidUntil && d.monthlyPaidUntil.getTime() > Date.now() - 31 * DIA ? d.monthlyPaidUntil : new Date();
        const ate = new Date(base);
        ate.setMonth(ate.getMonth() + 1);
        await this.prisma.withTransaction(async (tx) => {
          const w = await tx.wallet.upsert({ where: { driverId: d.id }, update: {}, create: { driverId: d.id } });
          const saldo = w.balanceCents - valor;
          await tx.walletTransaction.create({
            data: {
              walletId: w.id,
              type: 'ADJUSTMENT',
              amountCents: -valor,
              balanceAfterCents: saldo,
              description: `Mensalidade ate ${ate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
            },
          });
          await tx.wallet.update({ where: { id: w.id }, data: { balanceCents: saldo } });
          await tx.driver.update({ where: { id: d.id }, data: { monthlyPaidUntil: ate } });
        });
      }
    } catch (e) {
      this.logger.error(`Mensalidades: ${(e as Error).message}`);
    }
  }

  // ================= Passageiros =================

  async passageiros(busca?: string, status?: UserStatus) {
    const termo = busca?.trim();
    const digitos = termo?.replace(/\D/g, '');
    const itens = await this.prisma.user.findMany({
      where: {
        role: UserRole.PASSENGER,
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(termo
          ? {
              OR: [
                { name: { contains: termo, mode: 'insensitive' } },
                ...(digitos && digitos.length >= 3 ? [{ phone: { contains: digitos } }] : []),
                { email: { contains: termo, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        blockedReason: true,
        createdAt: true,
        _count: { select: { ridesAsPassenger: true } },
      },
    });
    return { items: itens.map(({ _count, ...u }) => ({ ...u, rides: _count.ridesAsPassenger })) };
  }

  async bloquearPassageiro(adminId: string, userId: string, bloquear: boolean, motivo: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw BusinessException.notFound('Passageiro nao encontrado.');
    if (u.role === UserRole.ADMIN) throw BusinessException.forbidden('Nao e possivel bloquear um administrador.');
    if (!motivo.trim()) throw BusinessException.validation('Escreva o motivo.');
    await this.prisma.withTransaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: bloquear ? UserStatus.BLOCKED : UserStatus.ACTIVE, blockedReason: bloquear ? motivo : null },
      });
      if (bloquear) {
        await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: bloquear ? 'BLOQUEIO' : 'DESBLOQUEIO',
          entity: 'user',
          entityId: userId,
          after: { motivo } as never,
        },
      });
    });
    return this.historicoDoUsuario(userId);
  }

  async historicoDoUsuario(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, name: true } });
    if (!u) throw BusinessException.notFound('Usuario nao encontrado.');
    const logs = await this.prisma.auditLog.findMany({
      where: { entity: 'user', entityId: userId, action: { in: ['BLOQUEIO', 'DESBLOQUEIO'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { actor: { select: { name: true } } },
    });
    return {
      ...u,
      history: logs.map((l) => ({
        action: l.action,
        reason: (l.after as { motivo?: string } | null)?.motivo ?? '',
        by: l.actor?.name ?? 'Central',
        at: l.createdAt,
      })),
    };
  }

  // ================= Saques (PIX) =================

  async pedirSaque(userId: string, valorCents: number, chavePix?: string) {
    const d = await this.prisma.driver.findUnique({ where: { userId }, include: { wallet: true } });
    if (!d) throw BusinessException.forbidden('So motorista pede saque.');
    const chave = (chavePix ?? d.pixKey ?? '').trim();
    if (!chave) throw BusinessException.validation('Informe a chave PIX.');
    const saldo = d.wallet?.balanceCents ?? 0;
    if (valorCents <= 0 || valorCents > saldo) throw BusinessException.validation('Valor maior que o saldo da carteira.');
    const aberto = await this.prisma.payout.count({ where: { driverId: d.id, status: { in: ['REQUESTED', 'PROCESSING'] } } });
    if (aberto > 0) throw BusinessException.validation('Ja existe um saque esperando a Central.');
    if (chavePix && chavePix !== d.pixKey) await this.prisma.driver.update({ where: { id: d.id }, data: { pixKey: chave } });
    return this.prisma.payout.create({ data: { driverId: d.id, amountCents: valorCents, pixKey: chave, provider: 'manual' } });
  }

  async meusSaques(userId: string) {
    const d = await this.prisma.driver.findUnique({ where: { userId }, select: { id: true } });
    if (!d) return { items: [] };
    return { items: await this.prisma.payout.findMany({ where: { driverId: d.id }, orderBy: { requestedAt: 'desc' }, take: 30 }) };
  }

  async saques(status?: PayoutStatus, praca: string | null = null) {
    const ids = await this.pracas.idsDeMotoristas(praca);
    const itens = await this.prisma.payout.findMany({
      where: { ...(status ? { status } : {}), ...(ids ? { driverId: { in: ids } } : {}) },
      orderBy: { requestedAt: 'desc' },
      take: 100,
      include: { driver: { include: { user: { select: { name: true, phone: true } }, wallet: true } } },
    });
    return {
      items: itens.map((p) => ({
        id: p.id,
        driverId: p.driverId,
        driverName: p.driver.user.name,
        driverPhone: p.driver.user.phone,
        pixKey: p.pixKey,
        amountCents: p.amountCents,
        balanceCents: p.driver.wallet?.balanceCents ?? 0,
        status: p.status,
        failureReason: p.failureReason,
        requestedAt: p.requestedAt,
        processedAt: p.processedAt,
      })),
    };
  }

  /** Central confirma que fez o PIX (desconta da carteira) ou recusa. */
  async decidirSaque(adminId: string, payoutId: string, pago: boolean, motivo?: string) {
    const p = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!p) throw BusinessException.notFound('Saque nao encontrado.');
    if (p.status !== 'REQUESTED' && p.status !== 'PROCESSING') throw BusinessException.validation('Este saque ja foi decidido.');
    if (!pago) {
      return this.prisma.payout.update({
        where: { id: payoutId },
        data: { status: 'FAILED', failureReason: motivo?.trim() || 'Recusado pela Central.', processedAt: new Date() },
      });
    }
    return this.prisma.withTransaction(async (tx) => {
      const w = await tx.wallet.upsert({ where: { driverId: p.driverId }, update: {}, create: { driverId: p.driverId } });
      if (w.balanceCents < p.amountCents) throw BusinessException.validation('Saldo da carteira ficou menor que o saque.');
      const saldo = w.balanceCents - p.amountCents;
      await tx.walletTransaction.create({
        data: {
          walletId: w.id,
          type: 'PAYOUT',
          amountCents: -p.amountCents,
          balanceAfterCents: saldo,
          payoutId: p.id,
          description: `Saque PIX para ${p.pixKey ?? ''}`.slice(0, 200),
        },
      });
      await tx.wallet.update({ where: { id: w.id }, data: { balanceCents: saldo } });
      await tx.auditLog.create({
        data: { actorId: adminId, actorRole: UserRole.ADMIN, action: 'SAQUE_PAGO', entity: 'payout', entityId: p.id },
      });
      return tx.payout.update({ where: { id: payoutId }, data: { status: 'PAID', processedAt: new Date() } });
    });
  }

  // ================= Relatorio financeiro =================

  async financeiro(dias: number, praca: string | null = null) {
    const desde = new Date(inicioDeHoje().getTime() - (Math.max(dias, 1) - 1) * DIA);
    const daPraca = await this.pracas.ondeCorridas(praca);
    const ids = await this.pracas.idsDeMotoristas(praca);
    const concluidas = await this.prisma.ride.groupBy({
      by: ['paymentMethodType'],
      where: { status: RideStatus.COMPLETED, finishedAt: { gte: desde }, ...daPraca },
      _sum: { finalFareCents: true, commissionCents: true, discountCents: true },
      _count: { _all: true },
    });
    const pagos = await this.prisma.payout.aggregate({
      where: { status: 'PAID', processedAt: { gte: desde }, ...(ids ? { driverId: { in: ids } } : {}) },
      _sum: { amountCents: true },
      _count: { _all: true },
    });
    const creditos = await this.prisma.walletTransaction.aggregate({
      where: {
        createdAt: { gte: desde },
        type: 'ADJUSTMENT',
        amountCents: { gt: 0 },
        ...(ids ? { wallet: { driverId: { in: ids } } } : {}),
      },
      _sum: { amountCents: true },
    });
    const porForma = concluidas.map((c) => ({
      paymentMethodType: c.paymentMethodType,
      rides: c._count._all,
      totalCents: (c._sum.finalFareCents ?? 0) - (c._sum.discountCents ?? 0),
      commissionCents: c._sum.commissionCents ?? 0,
      couponCents: c._sum.discountCents ?? 0,
    }));
    const soma = (f: (x: (typeof porForma)[number]) => number) => porForma.reduce((t, x) => t + f(x), 0);
    return {
      since: desde,
      byPaymentMethod: porForma,
      cashCents: soma((x) => (x.paymentMethodType === 'CASH' ? x.totalCents : 0)),
      pixAndAppCents: soma((x) => (x.paymentMethodType !== 'CASH' ? x.totalCents : 0)),
      totalCents: soma((x) => x.totalCents),
      commissionCents: soma((x) => x.commissionCents),
      couponCents: soma((x) => x.couponCents),
      rides: soma((x) => x.rides),
      payoutsPaidCents: pagos._sum.amountCents ?? 0,
      payoutsPaid: pagos._count._all,
      creditsSoldCents: creditos._sum.amountCents ?? 0,
    };
  }

  // ================= SOS =================

  async acionarSos(userId: string, input: { latitude: number; longitude: number; rideId?: string }) {
    const aberto = await this.prisma.safetyEvent.findFirst({
      where: { userId, type: 'PANIC_BUTTON', resolved: false, createdAt: { gt: new Date(Date.now() - 2 * HORA) } },
    });
    // Corrida em andamento de quem apertou (se o app nao mandou).
    let rideId = input.rideId ?? null;
    if (!rideId) {
      const d = await this.prisma.driver.findUnique({ where: { userId }, select: { id: true } });
      const r = await this.prisma.ride.findFirst({
        where: { status: { in: EM_ANDAMENTO }, OR: [{ passengerId: userId }, ...(d ? [{ driverId: d.id }] : [])] },
        select: { id: true },
      });
      rideId = r?.id ?? null;
    }
    if (aberto) {
      return this.prisma.safetyEvent.update({
        where: { id: aberto.id },
        data: { latitude: input.latitude, longitude: input.longitude, rideId: aberto.rideId ?? rideId },
      });
    }
    return this.prisma.safetyEvent.create({
      data: { userId, type: 'PANIC_BUTTON', latitude: input.latitude, longitude: input.longitude, rideId, metadata: { atualizadoEm: new Date().toISOString() } as never },
    });
  }

  async posicaoSos(userId: string, id: string, input: { latitude: number; longitude: number }) {
    const e = await this.prisma.safetyEvent.findUnique({ where: { id } });
    if (!e || e.userId !== userId) throw BusinessException.notFound('Alerta nao encontrado.');
    if (e.resolved) return { resolved: true };
    await this.prisma.safetyEvent.update({
      where: { id },
      data: { latitude: input.latitude, longitude: input.longitude, metadata: { atualizadoEm: new Date().toISOString() } as never },
    });
    return { resolved: false };
  }

  async alertas(resolvidos: boolean, praca: string | null = null) {
    const eventos = await this.prisma.safetyEvent.findMany({
      where: { type: 'PANIC_BUTTON', resolved: resolvidos, ...(await this.pracas.ondeSos(praca)) },
      orderBy: { createdAt: 'desc' },
      take: resolvidos ? 50 : 20,
      include: {
        user: { select: { id: true, name: true, phone: true, role: true, metadata: true } },
        ride: {
          include: {
            passenger: { select: { name: true, phone: true } },
            driver: { include: { user: { select: { name: true, phone: true } } } },
            vehicle: { select: { plate: true, brand: true, model: true, color: true } },
          },
        },
      },
    });
    return {
      items: eventos.map((e) => {
        const meta = (e.user.metadata ?? {}) as { contatosEmergencia?: Array<{ nome?: string; telefone?: string }> };
        const contatos = Array.isArray(meta.contatosEmergencia) ? meta.contatosEmergencia : [];
        return {
          id: e.id,
          createdAt: e.createdAt,
          updatedAt: (e.metadata as { atualizadoEm?: string } | null)?.atualizadoEm ?? e.createdAt,
          latitude: e.latitude,
          longitude: e.longitude,
          resolved: e.resolved,
          note: (e.metadata as { resolucao?: string } | null)?.resolucao ?? null,
          who: { name: e.user.name, phone: e.user.phone, role: e.user.role },
          emergencyContacts: contatos
            .filter((c) => c && c.telefone)
            .map((c) => ({ name: c.nome ?? 'Contato', phone: c.telefone! })),
          ride: e.ride
            ? {
                code: e.ride.code,
                status: e.ride.status,
                pickupAddress: e.ride.pickupAddress,
                dropoffAddress: e.ride.dropoffAddress,
                passenger: { name: e.ride.passenger.name, phone: e.ride.passenger.phone },
                driver: e.ride.driver ? { name: e.ride.driver.user.name, phone: e.ride.driver.user.phone } : null,
                vehicle: e.ride.vehicle
                  ? `${e.ride.vehicle.brand} ${e.ride.vehicle.model} ${e.ride.vehicle.color} - ${e.ride.vehicle.plate}`
                  : null,
              }
            : null,
        };
      }),
    };
  }

  async resolverSos(adminId: string, id: string, nota: string) {
    const e = await this.prisma.safetyEvent.findUnique({ where: { id } });
    if (!e) throw BusinessException.notFound('Alerta nao encontrado.');
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    await this.prisma.safetyEvent.update({
      where: { id },
      data: { resolved: true, metadata: { ...meta, resolucao: nota || 'Atendido pela Central.', resolvidoPor: adminId, resolvidoEm: new Date().toISOString() } as never },
    });
    return { ok: true };
  }
}
