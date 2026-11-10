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
}

export const CACHE_MS = 30_000;

/** Token emitido (iat, em segundos) antes do corte nao vale mais. */
export function tokenValido(estado: Pick<EstadoDaConta, 'sessoesDesde' | 'ativa'>, iat?: number): boolean {
  if (!estado.ativa) return false;
  if (!estado.sessoesDesde) return true;
  if (typeof iat !== 'number') return false;
  return iat >= Math.floor(estado.sessoesDesde / 1000);
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
    const m = (u?.metadata ?? {}) as { sessoesDesde?: unknown };
    const estado: EstadoDaConta = {
      sessoesDesde: typeof m.sessoesDesde === 'number' ? m.sessoesDesde : 0,
      ativa: !!u && u.status !== 'BLOCKED' && u.status !== 'DELETED',
      lidoEm: agora,
    };
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(userId, estado);
    return estado;
  }

  async acessoValido(userId: string, iat?: number): Promise<boolean> {
    return tokenValido(await this.estado(userId), iat);
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
        platform: true,
        model: true,
        osVersion: true,
        appVersion: true,
        lastSeenAt: true,
        createdAt: true,
        _count: { select: { refreshTokens: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
      },
    });
    return lista.map(({ _count, ...d }) => ({ ...d, sessoesAbertas: _count.refreshTokens }));
  }
}

@Global()
@Module({ providers: [SessoesService], exports: [SessoesService] })
export class SessoesModule {}
