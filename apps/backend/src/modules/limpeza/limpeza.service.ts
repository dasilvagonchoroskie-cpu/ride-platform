import { Injectable, Logger } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { PracasService } from '../pracas/pracas.service';

/**
 * Limpeza dos dados (Evandro, 08/10/2026: "esses registros que foram de
 * teste tem que eliminar, tem que ter a opcao de limpar").
 *
 * - Dados de teste: contas criadas pelo teste automatico (e tudo delas).
 * - Zerar a operacao: comecar do zero antes de operar de verdade — apaga
 *   corridas, recargas, saques, SOS e avaliacoes; carteiras voltam a zero.
 *   Contas, carros, documentos, tarifas e configuracoes ficam.
 * - Apagar contas escolhidas (as que nao tem corrida).
 * Antes de zerar, copia todas as tabelas para um schema de reserva no
 * proprio banco (backup_AAAAMMDD_HHMM), guardando as 3 ultimas copias.
 */
@Injectable()
export class LimpezaService {
  private readonly logger = new Logger(LimpezaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pracas: PracasService,
  ) {}

  /** Nomes e e-mails que so o teste automatico usa. */
  static readonly NOMES_DE_TESTE = [
    'Motorista Teste Automatico',
    'Passageiro Teste Automatico',
    'Passageiro Teste',
    'Pessoa Dois Apps',
    'Motorista Pela Central',
    'Passageiro Vira Motorista',
    'Passageira Email Teste',
  ];

  private ondeTeste(): Prisma.UserWhereInput {
    return {
      role: { not: UserRole.ADMIN },
      OR: [
        { metadata: { path: ['teste'], equals: true } },
        { email: { endsWith: '@teste.fortalezamov.com.br' } },
        { name: { in: LimpezaService.NOMES_DE_TESTE } },
        // Contas excluidas (telefone "excl-...") NAO entram aqui: podem ser
        // clientes de verdade com corridas no financeiro. As do teste
        // automatico continuam com a marca "teste" e saem pela linha acima.
      ],
    };
  }

  async resumo() {
    const [contasTeste, corridas, movimentos, saques, sos, avaliacoes, contas, cuponsTeste] = await Promise.all([
      this.prisma.user.count({ where: this.ondeTeste() }),
      this.prisma.ride.count(),
      this.prisma.walletTransaction.count(),
      this.prisma.payout.count(),
      this.prisma.safetyEvent.count(),
      this.prisma.rating.count(),
      this.prisma.user.count({ where: { role: { not: UserRole.ADMIN }, deletedAt: null } }),
      this.prisma.coupon.count({ where: { code: { startsWith: 'TESTE' } } }),
    ]);
    const backups = await this.backups();
    return { contasTeste, corridas, movimentos, saques, sos, avaliacoes, contas, cuponsTeste, ultimaCopia: backups[0] ?? null };
  }

  // ------------------------------------------------------------------
  // Dados de teste
  // ------------------------------------------------------------------

  async apagarDadosDeTeste(adminId: string) {
    const contas = await this.prisma.user.findMany({ where: this.ondeTeste(), select: { id: true } });
    const r = await this.apagarUsuarios(contas.map((c) => c.id), { comCorridas: true });
    // Cupons do teste (TESTE + numeros).
    const cupons = await this.prisma.$executeRaw`DELETE FROM coupons WHERE code ~ '^TESTE[0-9]+$'`;
    await this.registrar(adminId, 'LIMPEZA_TESTE', { ...r, cupons });
    this.pracas.esquecerMotoristas();
    return { ...r, cupons };
  }

  // ------------------------------------------------------------------
  // Zerar a operacao
  // ------------------------------------------------------------------

  async zerarOperacao(adminId: string) {
    let copia: string;
    try {
      copia = await this.copiaDeSeguranca();
    } catch (e) {
      this.logger.error(`Copia de seguranca falhou: ${(e as Error).message}`);
      throw BusinessException.validation('Nao foi possivel fazer a copia de seguranca antes de zerar. Nada foi apagado.');
    }
    const teste = await this.apagarDadosDeTeste(adminId);
    const r = await this.prisma.withTransaction(async (tx) => {
      const avaliacoes = await tx.rating.deleteMany({});
      await tx.payment.deleteMany({});
      const sos = await tx.safetyEvent.deleteMany({});
      const movimentos = await tx.walletTransaction.deleteMany({});
      const saques = await tx.payout.deleteMany({});
      const corridas = await tx.ride.deleteMany({});
      await tx.driverOnlineSession.deleteMany({});
      await tx.notification.deleteMany({});
      await tx.wallet.updateMany({ data: { balanceCents: 0, blockedCents: 0, totalEarnedCents: 0, totalWithdrawnCents: 0 } });
      await tx.driver.updateMany({
        data: {
          totalRides: 0,
          totalCancelled: 0,
          ratingAvg: new Prisma.Decimal(5),
          ratingCount: 0,
          acceptanceRate: new Prisma.Decimal(100),
          monthlyPaidUntil: null,
        },
      });
      await tx.coupon.updateMany({ data: { usedCount: 0 } });
      return {
        corridas: corridas.count,
        movimentos: movimentos.count,
        saques: saques.count,
        sos: sos.count,
        avaliacoes: avaliacoes.count,
      };
    });
    await this.registrar(adminId, 'ZERAR_OPERACAO', { ...r, copia });
    this.logger.warn(`Operacao zerada por ${adminId}: ${JSON.stringify(r)} (copia em ${copia})`);
    return { ...r, contasTesteApagadas: teste.contas, copia };
  }

  // ------------------------------------------------------------------
  // Contas
  // ------------------------------------------------------------------

  async listarContas(busca?: string) {
    const termo = busca?.trim();
    const digitos = termo?.replace(/\D/g, '');
    const contas = await this.prisma.user.findMany({
      where: {
        role: { not: UserRole.ADMIN },
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
      take: 500,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        metadata: true,
        createdAt: true,
        driver: { select: { id: true, status: true, _count: { select: { rides: true } } } },
        _count: { select: { ridesAsPassenger: true } },
      },
    });
    const teste = new Set(
      (await this.prisma.user.findMany({ where: this.ondeTeste(), select: { id: true } })).map((u) => u.id),
    );
    return {
      items: contas.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone.startsWith('pend-') || c.phone.startsWith('excl-') ? '' : c.phone,
        email: c.email,
        motorista: !!c.driver,
        driverStatus: c.driver?.status ?? null,
        status: c.status,
        corridas: c._count.ridesAsPassenger + (c.driver?._count.rides ?? 0),
        teste: teste.has(c.id),
        createdAt: c.createdAt,
      })),
    };
  }

  /** Apaga as contas escolhidas. Conta com corrida so sai zerando a operacao. */
  async apagarContas(ids: string[], adminId: string) {
    if (ids.includes(adminId)) throw BusinessException.validation('Voce nao pode apagar a sua propria conta.');
    const contas = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, role: true, _count: { select: { ridesAsPassenger: true } }, driver: { select: { _count: { select: { rides: true } } } } },
    });
    const recusadas: Array<{ id: string; nome: string; motivo: string }> = [];
    const apagar: string[] = [];
    for (const c of contas) {
      if (c.role === UserRole.ADMIN) recusadas.push({ id: c.id, nome: c.name, motivo: 'Conta da Central (apague em Equipe).' });
      else if (c._count.ridesAsPassenger + (c.driver?._count.rides ?? 0) > 0) {
        recusadas.push({ id: c.id, nome: c.name, motivo: 'Tem corridas no historico (zere a operacao antes, ou bloqueie).' });
      } else apagar.push(c.id);
    }
    const r = await this.apagarUsuarios(apagar, { comCorridas: false });
    await this.registrar(adminId, 'APAGAR_CONTAS', { ...r, recusadas: recusadas.length });
    this.pracas.esquecerMotoristas();
    return { ...r, recusadas };
  }

  /**
   * Apaga as contas e tudo o que e delas: motorista, carteira, carros,
   * documentos, fotos, aparelhos e logins. [comCorridas]: tambem as
   * corridas delas (so na limpeza do teste).
   */
  private async apagarUsuarios(ids: string[], opcoes: { comCorridas: boolean }) {
    if (ids.length === 0) return { contas: 0, corridas: 0 };
    return this.prisma.withTransaction(async (tx) => {
      const motoristas = (await tx.driver.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((d) => d.id);
      let corridas = 0;
      if (opcoes.comCorridas) {
        const rides = (
          await tx.ride.findMany({
            where: { OR: [{ passengerId: { in: ids } }, ...(motoristas.length ? [{ driverId: { in: motoristas } }] : [])] },
            select: { id: true },
          })
        ).map((r) => r.id);
        if (rides.length) {
          await tx.rating.deleteMany({ where: { rideId: { in: rides } } });
          await tx.payment.deleteMany({ where: { rideId: { in: rides } } });
          await tx.walletTransaction.deleteMany({ where: { rideId: { in: rides }, wallet: { driverId: { in: motoristas } } } });
          corridas = (await tx.ride.deleteMany({ where: { id: { in: rides } } })).count;
        }
      }
      await tx.rating.deleteMany({ where: { OR: [{ authorId: { in: ids } }, { targetId: { in: ids } }] } });
      await tx.payment.deleteMany({ where: { payerId: { in: ids } } });
      await tx.$executeRaw`DELETE FROM arquivos WHERE owner_id = ANY(${ids}::uuid[])`;
      const contas = await tx.user.deleteMany({ where: { id: { in: ids } } });
      return { contas: contas.count, corridas };
    });
  }

  // ------------------------------------------------------------------
  // Copia de seguranca
  // ------------------------------------------------------------------

  private async backups(): Promise<string[]> {
    const linhas = await this.prisma.$queryRaw<Array<{ nome: string }>>`
      SELECT nspname AS nome FROM pg_namespace WHERE nspname LIKE 'backup\\_%' ORDER BY nspname DESC`;
    return linhas.map((l) => l.nome);
  }

  /** Copia todas as tabelas para backup_AAAAMMDD_HHMM (fica so no banco, sem acesso de fora). */
  async copiaDeSeguranca(): Promise<string> {
    const b = new Date(Date.now() - 3 * 3_600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    const nome = `backup_${b.getUTCFullYear()}${p(b.getUTCMonth() + 1)}${p(b.getUTCDate())}_${p(b.getUTCHours())}${p(b.getUTCMinutes())}`;
    const tabelas = await this.prisma.$queryRaw<Array<{ nome: string }>>`
      SELECT c.relname AS nome FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT IN ('spatial_ref_sys', 'arquivos')`;
    // As fotos (tabela arquivos) ficam de fora: pesam muito e zerar a
    // operacao nao apaga foto de conta que fica.
    await this.prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${nome}"`);
    await this.prisma.$executeRawUnsafe(`REVOKE ALL ON SCHEMA "${nome}" FROM PUBLIC`);
    for (const t of tabelas) {
      if (!/^[a-z_][a-z0-9_]*$/.test(t.nome)) continue;
      await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${nome}"."${t.nome}"`);
      await this.prisma.$executeRawUnsafe(`CREATE TABLE "${nome}"."${t.nome}" AS TABLE public."${t.nome}"`);
    }
    // Guarda so as 3 copias mais novas (o banco gratis tem espaco limitado).
    const todas = await this.backups();
    for (const velha of todas.slice(3)) {
      if (/^backup_[0-9_]+$/.test(velha)) await this.prisma.$executeRawUnsafe(`DROP SCHEMA "${velha}" CASCADE`);
    }
    return nome;
  }

  private async registrar(adminId: string, acao: string, dados: Record<string, unknown>) {
    await this.prisma.auditLog
      .create({ data: { actorId: adminId, actorRole: UserRole.ADMIN, action: acao, entity: 'limpeza', after: dados as never } })
      .catch(() => undefined);
  }
}
