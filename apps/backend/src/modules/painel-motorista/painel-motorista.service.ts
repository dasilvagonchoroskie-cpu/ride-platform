import { Injectable } from '@nestjs/common';
import { OfferStatus, RideStatus, UserRole } from '@prisma/client';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { segundosOnline } from './jornada';

/** Brasilia (UTC-3, sem horario de verao desde 2019). */
const FUSO_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Chaves de configuracao da Central (tabela settings). */
const CHAVE_CONTATO = 'central.contato';
const CHAVE_MINIMO = 'carteira.minimoCents';

/** Contato padrao da Central enquanto o dono nao configura outro. */
const CONTATO_PADRAO = { whatsapp: '5564996472794', pixKey: null as string | null, pixHolder: null as string | null };
const MINIMO_PADRAO_CENTS = 200;

export type Periodo = 'day' | 'week' | 'month';

export interface ContatoCentral {
  whatsapp: string | null;
  pixKey: string | null;
  pixHolder: string | null;
}

/** 00:00 de Brasilia do dia (a, m, d) — em UTC. Aceita dia/mes fora da faixa. */
function meiaNoite(a: number, m: number, d: number): Date {
  return new Date(Date.UTC(a, m, d) + FUSO_MS);
}

/** "2026-09-21" do dia de Brasilia que contem o instante. */
function diaLocal(instante: Date): string {
  return new Date(instante.getTime() - FUSO_MS).toISOString().slice(0, 10);
}

@Injectable()
export class PainelMotoristaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Intervalo do periodo pedido: hoje, esta semana (seg-dom) ou este mes, recuando `offset`. */
  static intervalo(periodo: Periodo, offset: number, agora = new Date()) {
    const l = new Date(agora.getTime() - FUSO_MS);
    const a = l.getUTCFullYear();
    const m = l.getUTCMonth();
    const d = l.getUTCDate();

    if (periodo === 'day') {
      const de = meiaNoite(a, m, d - offset);
      return { de, ate: new Date(de.getTime() + DIA_MS), dias: 1 };
    }
    if (periodo === 'week') {
      const desdeSegunda = (l.getUTCDay() + 6) % 7;
      const de = meiaNoite(a, m, d - desdeSegunda - 7 * offset);
      return { de, ate: new Date(de.getTime() + 7 * DIA_MS), dias: 7 };
    }
    const de = meiaNoite(a, m - offset, 1);
    const ate = meiaNoite(a, m - offset + 1, 1);
    return { de, ate, dias: Math.round((ate.getTime() - de.getTime()) / DIA_MS) };
  }

  /** Tela "Atividades": ganhos, corridas, tempo online e trabalhado, grafico por dia. */
  async atividade(driverId: string | null | undefined, periodo: Periodo, offset: number) {
    const id = this.exigirMotorista(driverId);
    const { de, ate, dias } = PainelMotoristaService.intervalo(periodo, offset);

    const corridas = await this.prisma.ride.findMany({
      where: { driverId: id, status: RideStatus.COMPLETED, finishedAt: { gte: de, lt: ate } },
      orderBy: { finishedAt: 'desc' },
    });

    const barras = new Map<string, { earningCents: number; rides: number }>();
    for (let i = 0; i < dias; i++) {
      barras.set(diaLocal(new Date(de.getTime() + i * DIA_MS)), { earningCents: 0, rides: 0 });
    }

    let ganhos = 0;
    let tarifas = 0;
    let comissoes = 0;
    let trabalhadoMs = 0;
    for (const c of corridas) {
      ganhos += c.driverEarningCents;
      tarifas += c.finalFareCents ?? c.estimatedFareCents;
      comissoes += c.commissionCents;
      const fim = c.finishedAt ?? c.updatedAt;
      const inicio = c.acceptedAt ?? c.startedAt ?? c.requestedAt;
      trabalhadoMs += Math.max(0, fim.getTime() - inicio.getTime());
      const barra = barras.get(diaLocal(fim));
      if (barra) {
        barra.earningCents += c.driverEarningCents;
        barra.rides += 1;
      }
    }

    return {
      period: periodo,
      offset,
      from: de.toISOString(),
      to: ate.toISOString(),
      earningCents: ganhos,
      fareCents: tarifas,
      commissionCents: comissoes,
      rides: corridas.length,
      onlineSeconds: await segundosOnline(this.prisma, id, de, ate),
      workedSeconds: Math.round(trabalhadoMs / 1000),
      acceptanceRate: await this.taxaDeAceitacao(id),
      buckets: [...barras.entries()].map(([date, v]) => ({ date, ...v })),
      items: corridas.slice(0, 60).map((c) => ({
        id: c.id,
        code: c.code,
        finishedAt: (c.finishedAt ?? c.updatedAt).toISOString(),
        pickupAddress: c.pickupAddress,
        dropoffAddress: c.dropoffAddress,
        fareCents: c.finalFareCents ?? c.estimatedFareCents,
        commissionCents: c.commissionCents,
        earningCents: c.driverEarningCents,
        distanceMeters: c.distanceMeters,
        durationSeconds: c.durationSeconds,
        flag: c.fareFlag,
      })),
    };
  }

  /**
   * Chamados atendidos nos ultimos 30 dias sobre o total recebido.
   * Recusado ou deixado expirar conta contra; sem chamados, 100%.
   */
  async taxaDeAceitacao(driverId: string): Promise<number> {
    const desde = new Date(Date.now() - 30 * DIA_MS);
    const agora = new Date();
    const [aceitos, total] = await Promise.all([
      this.prisma.rideOffer.count({ where: { driverId, createdAt: { gte: desde }, status: OfferStatus.ACCEPTED } }),
      this.prisma.rideOffer.count({
        where: {
          driverId,
          createdAt: { gte: desde },
          OR: [
            { status: { in: [OfferStatus.ACCEPTED, OfferStatus.DECLINED, OfferStatus.EXPIRED] } },
            { status: OfferStatus.PENDING, expiresAt: { lt: agora } },
          ],
        },
      }),
    ]);
    return total === 0 ? 100 : Math.round((aceitos / total) * 100);
  }

  /**
   * Carteira pre-paga: o passageiro paga o motorista direto (o dinheiro
   * nao passa pela plataforma); a carteira so guarda os creditos que o
   * motorista compra com a Central e a comissao descontada a cada corrida.
   */
  async carteira(driverId: string | null | undefined) {
    const id = this.exigirMotorista(driverId);
    const carteira = await this.prisma.wallet.upsert({
      where: { driverId: id },
      update: {},
      create: { driverId: id },
    });
    const lancamentos = await this.prisma.walletTransaction.findMany({
      where: { walletId: carteira.id },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { ride: { select: { code: true } } },
    });
    const minimo = await this.minimoCents();
    const saldo = carteira.balanceCents;

    return {
      balanceCents: saldo,
      minimumCents: minimo,
      // ok: tranquilo | low: se esgotando | insufficient: abaixo do minimo
      status: saldo < minimo ? 'insufficient' : saldo < minimo * 3 ? 'low' : 'ok',
      central: await this.contato(),
      transactions: lancamentos.map((t) => ({
        id: t.id,
        type: t.type,
        amountCents: t.amountCents,
        balanceAfterCents: t.balanceAfterCents,
        description: t.description,
        rideCode: t.ride?.code ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  /** Central lanca a recarga que o motorista pagou por Pix (ou um ajuste). */
  async lancarCredito(driverId: string, valorCents: number, descricao: string | undefined, adminId: string) {
    const motorista = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!motorista) throw BusinessException.notFound('Motorista nao encontrado.');

    await this.prisma.withTransaction(async (tx) => {
      const carteira = await tx.wallet.upsert({ where: { driverId }, update: {}, create: { driverId } });
      const saldo = carteira.balanceCents + valorCents;
      await tx.walletTransaction.create({
        data: {
          walletId: carteira.id,
          type: 'ADJUSTMENT',
          amountCents: valorCents,
          balanceAfterCents: saldo,
          description: (descricao?.trim() || (valorCents > 0 ? 'Recarga via Pix' : 'Ajuste da Central')).slice(0, 200),
        },
      });
      await tx.wallet.update({ where: { id: carteira.id }, data: { balanceCents: saldo } });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorRole: UserRole.ADMIN,
          action: 'WALLET_CREDIT',
          entity: 'driver',
          entityId: driverId,
          after: { valorCents, descricao: descricao ?? null, saldoCents: saldo },
        },
      });
    });

    return this.carteira(driverId);
  }

  async contato(): Promise<ContatoCentral> {
    const s = await this.prisma.setting.findUnique({ where: { key: CHAVE_CONTATO } });
    const v = (s?.value ?? {}) as unknown as Partial<ContatoCentral>;
    return {
      whatsapp: v.whatsapp ?? CONTATO_PADRAO.whatsapp,
      pixKey: v.pixKey ?? CONTATO_PADRAO.pixKey,
      pixHolder: v.pixHolder ?? CONTATO_PADRAO.pixHolder,
    };
  }

  async minimoCents(): Promise<number> {
    const s = await this.prisma.setting.findUnique({ where: { key: CHAVE_MINIMO } });
    const v = s?.value;
    return typeof v === 'number' ? v : MINIMO_PADRAO_CENTS;
  }

  async configurarCentral(
    input: { whatsapp?: string | null; pixKey?: string | null; pixHolder?: string | null; minimumCents?: number },
    adminId: string,
  ) {
    const atual = await this.contato();
    const novo: ContatoCentral = {
      whatsapp: input.whatsapp !== undefined ? input.whatsapp : atual.whatsapp,
      pixKey: input.pixKey !== undefined ? input.pixKey : atual.pixKey,
      pixHolder: input.pixHolder !== undefined ? input.pixHolder : atual.pixHolder,
    };
    await this.prisma.setting.upsert({
      where: { key: CHAVE_CONTATO },
      update: { value: novo as never, updatedBy: adminId },
      create: { key: CHAVE_CONTATO, value: novo as never, updatedBy: adminId, description: 'WhatsApp e chave Pix da Central' },
    });
    if (input.minimumCents !== undefined) {
      await this.prisma.setting.upsert({
        where: { key: CHAVE_MINIMO },
        update: { value: input.minimumCents, updatedBy: adminId },
        create: { key: CHAVE_MINIMO, value: input.minimumCents, updatedBy: adminId, description: 'Saldo minimo da carteira' },
      });
    }
    return { central: await this.contato(), minimumCents: await this.minimoCents() };
  }

  private exigirMotorista(driverId: string | null | undefined): string {
    if (!driverId) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');
    return driverId;
  }
}
