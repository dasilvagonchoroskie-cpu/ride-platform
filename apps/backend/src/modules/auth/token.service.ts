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

  async issueTokens(subject: TokenSubject, device?: DeviceContext): Promise<IssuedTokens> {
    const deviceRowId = await this.upsertDevice(subject.id, device);

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
  async rotateRefreshToken(refreshToken: string, device?: DeviceContext): Promise<IssuedTokens> {
    const tokenHash = hashToken(refreshToken, this.refreshPepper);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { driver: { select: { id: true } } } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw BusinessException.unauthorized('Refresh token invalido ou expirado.', ERROR_CODES.TOKEN_INVALID);
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
    );

    const newHash = hashToken(issued.refreshToken, this.refreshPepper);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedBy: newHash },
    });

    return issued;
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
