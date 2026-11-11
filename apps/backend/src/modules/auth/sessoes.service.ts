import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * Corte de sessoes (Evandro, 09/11/2026: vendeu o telefone com os apps
 * instalados e logados). O acesso (JWT de 15 min) nao passava pelo banco;
 * agora cada pedido confere, com um cache curto, se a sessao foi cortada
 * depois de emitida ou se a conta esta bloqueada/excluida.
 *
 * "Cortar" = revoga todos os refresh tokens, apaga os tokens de notificacao,
 * tira o motorista do ar e grava users.metadata.sessoesDesde (ms). Todo
 * token de acesso emitido antes disso deixa de valer na hora; o aparelho
 * cai na tela de login e so volta com o codigo novo.
 */
export interface EstadoDaConta {
  sessoesDesde: number;
  ativa: boolean;
  lidoEm: number;
  /**
   * Corte de UM aparelho (Requisicao 1, 11/11/2026): id interno do aparelho
   * (devices.id, o mesmo que vai no token) -> quando foi cortado (ms). Fica em
   * users.metadata.aparelhosCortados, sem mudar o banco. Entradas com mais de
   * 2 dias saem (o acesso dura 15 min e as renovacoes ja foram revogadas).
   */
  aparelhosCortados?: Record<string, number>;
}

/** Quanto tempo o corte de um aparelho fica guardado na conta. */
export const GUARDA_CORTE_MS = 2 * 24 * 3600 * 1000;

export const CACHE_MS = 30_000;

/** Token emitido (iat, em segundos) antes do corte nao vale mais. */
export function tokenValido(
  estado: Pick<EstadoDaConta, 'sessoesDesde' | 'ativa' | 'aparelhosCortados'>,
  iat?: number,
  aparelho?: string | null,
): boolean {
  if (!estado.ativa) return false;
  const corteDoAparelho = aparelho ? estado.aparelhosCortados?.[aparelho] : undefined;
  // O corte que vale e o mais recente: o da conta toda ou o deste aparelho.
  const desde = Math.max(estado.sessoesDesde || 0, corteDoAparelho || 0);
  if (!desde) return true;
  if (typeof iat !== 'number') return false;
  return iat >= Math.floor(desde / 1000);
}

/** Tira os cortes antigos (mais de 2 dias) para a conta nao crescer sem fim. */
export function cortesRecentes(cortes: unknown, agora: number): Record<string, number> {
  const saida: Record<string, number> = {};
  if (!cortes || typeof cortes !== 'object') return saida;
  for (const [id, quando] of Object.entries(cortes as Record<string, unknown>)) {
    if (typeof quando === 'number' && agora - quando < GUARDA_CORTE_MS) saida[id] = quando;
  }
  return saida;
}

@Injectable()
export class SessoesService {
  private readonly cache = new Map<string, EstadoDaConta>();

  constructor(private readonly prisma: PrismaService) {}

  private async estado(userId: string): Promise<EstadoDaConta> {
    const agora = Date.now();
    const guardado = this.cache.get(userId);
    if (guardado && agora - guardado.lidoEm < CACHE_MS) return guardado;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, metadata: true } });
    const m = (u?.metadata ?? {}) as { sessoesDesde?: unknown; aparelhosCortados?: unknown };
    const estado: EstadoDaConta = {
      sessoesDesde: typeof m.sessoesDesde === 'number' ? m.sessoesDesde : 0,
      ativa: !!u && u.status !== 'BLOCKED' && u.status !== 'DELETED',
      lidoEm: agora,
      aparelhosCortados: cortesRecentes(m.aparelhosCortados, agora),
    };
    // Conta bloqueada nao fica no cache: ao desbloquear, volta na hora.
    if (estado.ativa) {
      if (this.cache.size > 5000) this.cache.clear();
      this.cache.set(userId, estado);
    }
    return estado;
  }

  async acessoValido(userId: string, iat?: number, aparelho?: string | null): Promise<boolean> {
    return tokenValido(await this.estado(userId), iat, aparelho);
  }

  /**
   * Derruba UM aparelho da conta (o resto continua): revoga as renovacoes
   * dele, apaga o aviso (push) dele e grava o corte. O acesso que esse
   * aparelho ja tinha cai na proxima requisicao. Motorista so sai do ar se
   * nao sobrar nenhum outro aparelho com sessao aberta.
   * Devolve null se o aparelho nao for desta conta.
   */
  async cortarAparelho(
    userId: string,
    aparelhoId: string,
  ): Promise<{ sessoesEncerradas: number; motoristaSaiuDoAr: boolean } | null> {
    const desde = Date.now() + 1000;
    const r = await this.prisma.withTransaction(async (tx) => {
      const aparelho = await tx.device.findFirst({ where: { id: aparelhoId, userId }, select: { id: true } });
      if (!aparelho) return null;
      const u = await tx.user.findUnique({ where: { id: userId }, select: { metadata: true } });
      if (!u) return null;
      const meta = (u.metadata ?? {}) as Record<string, unknown>;
      const cortes = { ...cortesRecentes(meta.aparelhosCortados, Date.now()), [aparelhoId]: desde };
      await tx.user.update({
        where: { id: userId },
        data: { metadata: { ...meta, aparelhosCortados: cortes } as Prisma.InputJsonValue },
      });
      const tokens = await tx.refreshToken.updateMany({
        where: { userId, deviceId: aparelhoId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.device.update({ where: { id: aparelhoId }, data: { fcmToken: null } });
      const outrosAbertos = await tx.refreshToken.count({
        where: { userId, deviceId: { not: aparelhoId }, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      let motoristaSaiuDoAr = false;
      if (outrosAbertos === 0) {
        const d = await tx.driver.updateMany({ where: { userId, isOnline: true }, data: { isOnline: false } });
        motoristaSaiuDoAr = d.count > 0;
      }
      return { sessoesEncerradas: tokens.count, motoristaSaiuDoAr };
    });
    this.cache.delete(userId);
    return r;
  }

  /** Derruba todos os aparelhos da conta. Devolve quantas sessoes e aparelhos foram encerrados. */
  async cortar(userId: string): Promise<{ sessoesEncerradas: number; aparelhos: number }> {
    // +1 s: o token emitido no mesmo segundo do corte tambem cai.
    const desde = Date.now() + 1000;
    const r = await this.prisma.withTransaction(async (tx) => {
      const u = await tx.user.findUnique({ where: { id: userId }, select: { metadata: true } });
      if (!u) return null;
      const meta = { ...((u.metadata ?? {}) as Record<string, unknown>), sessoesDesde: desde };
      await tx.user.update({ where: { id: userId }, data: { metadata: meta as Prisma.InputJsonValue } });
      const tokens = await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      const aparelhos = await tx.device.updateMany({ where: { userId }, data: { fcmToken: null } });
      await tx.driver.updateMany({ where: { userId }, data: { isOnline: false } });
      return { sessoesEncerradas: tokens.count, aparelhos: aparelhos.count };
    });
    this.cache.delete(userId);
    return r ?? { sessoesEncerradas: 0, aparelhos: 0 };
  }

  /** Aparelhos que ja entraram na conta, com as sessoes ainda abertas. */
  async aparelhos(userId: string) {
    const lista = await this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        platform: true,
        model: true,
        osVersion: true,
        appVersion: true,
        lastSeenAt: true,
        createdAt: true,
        _count: { select: { refreshTokens: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
      },
    });
    // O codigo da instalacao nao sai inteiro: so o final, para diferenciar.
    return lista.map(({ _count, deviceId, ...d }) => ({
      ...d,
      instalacao: deviceId.length > 6 ? `...${deviceId.slice(-6)}` : deviceId,
      sessoesAbertas: _count.refreshTokens,
    }));
  }
}

@Global()
@Module({ providers: [SessoesService], exports: [SessoesService] })
export class SessoesModule {}
