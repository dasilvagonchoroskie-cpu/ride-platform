import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DevicePlatform, UserRole } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { hashToken, randomToken } from '../../common/utils/crypto.util';
import { BusinessException } from '../../common/errors/business.exception';
import { ERROR_CODES } from '@ride/shared';
import { JwtPayload } from './strategies/jwt.strategy';

export interface TokenSubject {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  email?: string | null;
  driverId?: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface DeviceContext {
  deviceId: string;
  platform: DevicePlatform;
  appVersion?: string;
  model?: string;
  osVersion?: string;
  fcmToken?: string;
  pushToken?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Resposta perdida na renovacao (tunel, sinal fraco): o servidor ja trocou o
 * refresh token, mas o app nao recebeu o par novo e tenta de novo com o antigo.
 * Dentro desta janela o antigo ainda vale UMA renovacao extra, desde que a
 * sessao que o substituiu continue aberta. Sair, trocar a senha ou desconectar
 * o aparelho revoga o substituto e fecha esta porta na hora.
 */
export const JANELA_REPETIR_RENOVACAO_MS = 2 * 60 * 1000;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private get refreshPepper(): string {
    return this.config.jwt.refreshSecret;
  }

  /** Registra/atualiza o dispositivo e devolve o id interno dele. */
  async upsertDevice(userId: string, device?: DeviceContext): Promise<string | null> {
    if (!device) return null;

    const record = await this.prisma.device.upsert({
      where: { userId_deviceId: { userId, deviceId: device.deviceId } },
      create: {
        userId,
        deviceId: device.deviceId,
        platform: device.platform,
        appVersion: device.appVersion,
        model: device.model,
        osVersion: device.osVersion,
        fcmToken: device.fcmToken ?? device.pushToken,
      },
      update: {
        platform: device.platform,
        appVersion: device.appVersion,
        model: device.model,
        osVersion: device.osVersion,
        fcmToken: device.fcmToken ?? device.pushToken,
        lastSeenAt: new Date(),
      },
    });

    return record.id;
  }

  async issueTokens(subject: TokenSubject, device?: DeviceContext, aparelhoAnterior?: string | null): Promise<IssuedTokens> {
    // Renovacao sem dados do aparelho continua presa ao MESMO aparelho: assim
    // o corte de um aparelho so (Central) tambem vale para o acesso renovado.
    const deviceRowId = device ? await this.upsertDevice(subject.id, device) : (aparelhoAnterior ?? null);

    const payload: JwtPayload = {
      sub: subject.id,
      role: subject.role,
      name: subject.name,
      phone: subject.phone,
      email: subject.email ?? null,
      driverId: subject.driverId ?? null,
      deviceId: deviceRowId,
      type: 'access',
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessTtl,
    });

    const refreshToken = randomToken(48);
    const expiresAt = new Date(Date.now() + this.config.jwt.refreshTtl * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: subject.id,
        deviceId: deviceRowId,
        tokenHash: hashToken(refreshToken, this.refreshPepper),
        expiresAt,
        ip: device?.ip,
        userAgent: device?.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.jwt.accessTtl,
      refreshExpiresIn: this.config.jwt.refreshTtl,
    };
  }

  /** Rotaciona o refresh token (uso unico) e emite um novo par. */
  async rotateRefreshToken(refreshToken: string, device?: DeviceContext): Promise<IssuedTokens & { userId: string }> {
    const tokenHash = hashToken(refreshToken, this.refreshPepper);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { driver: { select: { id: true } } } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw BusinessException.unauthorized('Refresh token invalido ou expirado.', ERROR_CODES.TOKEN_INVALID);
    }

    if (stored.revokedAt) {
      // So vale se foi uma TROCA recente (tem substituto) e a sessao nova segue aberta.
      const recente = Date.now() - stored.revokedAt.getTime() <= JANELA_REPETIR_RENOVACAO_MS;
      const substituto = recente && stored.replacedBy
        ? await this.prisma.refreshToken.findUnique({ where: { tokenHash: stored.replacedBy }, select: { revokedAt: true } })
        : null;
      if (!substituto || substituto.revokedAt) {
        throw BusinessException.unauthorized('Refresh token invalido ou expirado.', ERROR_CODES.TOKEN_INVALID);
      }
    }

    if (stored.user.status === 'BLOCKED' || stored.user.status === 'DELETED') {
      throw BusinessException.forbidden('Conta indisponivel.');
    }

    const issued = await this.issueTokens(
      {
        id: stored.user.id,
        role: stored.user.role,
        name: stored.user.name,
        phone: stored.user.phone,
        email: stored.user.email,
        driverId: stored.user.driver?.id ?? null,
      },
      device,
      stored.deviceId,
    );

    const newHash = hashToken(issued.refreshToken, this.refreshPepper);
    // So fecha o token se ainda estiver aberto: duas renovacoes ao mesmo tempo (app
    // e vigia nativo) nao sobrescrevem o substituto de quem chegou primeiro.
    await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedBy: newHash },
    });

    return { ...issued, userId: stored.user.id };
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken, this.refreshPepper);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async unregisterDevice(userId: string, fcmToken: string): Promise<void> {
    await this.prisma.device.updateMany({
      where: { userId, fcmToken },
      data: { fcmToken: null },
    });
  }
}
