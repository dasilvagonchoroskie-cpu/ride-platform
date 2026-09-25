import { Injectable } from '@nestjs/common';
import { ERROR_CODES, OtpPurpose, UserRole, UserStatus } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/errors/business.exception';
import { comparePassword, hashPassword } from '../../common/utils/crypto.util';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TokenService, DeviceContext, IssuedTokens } from './token.service';
import { OtpService } from './otp.service';

export interface AuthResult extends IssuedTokens {
  user: {
    id: string;
    role: UserRole;
    name: string;
    phone: string;
    email: string | null;
    avatarUrl: string | null;
    status: UserStatus;
    driverId: string | null;
    driverStatus: string | null;
    isOnline: boolean | null;
    /** Falso enquanto a pessoa nao tocou em "Aceito os Termos" no app. */
    termsAccepted: boolean;
    termsVersion: string | null;
  };
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
  ) {}

  async requestOtp(params: { phone?: string; email?: string; purpose: OtpPurpose }, ip?: string) {
    return this.otp.request({ phone: params.phone, email: params.email, purpose: params.purpose }, ip);
  }

  /** Login por OTP: cria a conta na primeira entrada (entra pelo telefone, sem senha). */
  async verifyOtp(params: {
    phone?: string;
    email?: string;
    code: string;
    purpose: OtpPurpose;
    role: UserRole;
    device?: DeviceContext;
  }): Promise<AuthResult> {
    await this.otp.verify({
      phone: params.phone,
      email: params.email,
      purpose: params.purpose,
      code: params.code,
    });

    const role = params.role === UserRole.DRIVER ? UserRole.DRIVER : UserRole.PASSENGER;

    const existing = await this.prisma.user.findFirst({
      where: params.phone ? { phone: params.phone } : { email: params.email },
      include: { driver: { select: { id: true, status: true, isOnline: true } } },
    });

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            lastLoginAt: new Date(),
            ...(params.phone ? { phoneVerifiedAt: new Date() } : {}),
            ...(params.email ? { emailVerifiedAt: new Date() } : {}),
          },
          include: { driver: { select: { id: true, status: true, isOnline: true } } },
        })
      : await this.prisma.user.create({
          data: {
            role,
            status: UserStatus.ACTIVE,
            name: params.phone ? `Passageiro ${params.phone.slice(-4)}` : 'Novo usuario',
            phone: params.phone ?? `pending-${Date.now()}`,
            email: params.email,
            phoneVerifiedAt: params.phone ? new Date() : null,
            emailVerifiedAt: params.email ? new Date() : null,
            lastLoginAt: new Date(),
          },
          include: { driver: { select: { id: true, status: true, isOnline: true } } },
        });

    this.assertUserActive(user.status);

    const issued = await this.tokens.issueTokens(
      {
        id: user.id,
        role: user.role,
        name: user.name,
        phone: user.phone,
        email: user.email,
        driverId: user.driver?.id ?? null,
      },
      params.device,
    );

    return {
      ...issued,
      isNewUser: !existing,
      user: this.paraUsuario(user),
    };
  }

  async registerWithPassword(params: {
    phone: string;
    name: string;
    email?: string;
    password: string;
    device?: DeviceContext;
  }): Promise<AuthResult> {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ phone: params.phone }, ...(params.email ? [{ email: params.email }] : [])] },
    });

    if (exists?.phone === params.phone) {
      throw BusinessException.conflict('Telefone ja cadastrado.', ERROR_CODES.PHONE_ALREADY_USED);
    }
    if (params.email && exists?.email === params.email) {
      throw BusinessException.conflict('E-mail ja cadastrado.', ERROR_CODES.EMAIL_ALREADY_USED);
    }

    const user = await this.prisma.user.create({
      data: {
        role: UserRole.PASSENGER,
        status: UserStatus.ACTIVE,
        name: params.name,
        phone: params.phone,
        email: params.email,
        passwordHash: await hashPassword(params.password),
        phoneVerifiedAt: new Date(),
        lastLoginAt: new Date(),
      },
      include: { driver: { select: { id: true, status: true, isOnline: true } } },
    });

    const issued = await this.tokens.issueTokens(
      {
        id: user.id,
        role: user.role,
        name: user.name,
        phone: user.phone,
        email: user.email,
        driverId: null,
      },
      params.device,
    );

    return {
      ...issued,
      isNewUser: true,
      user: this.paraUsuario(user),
    };
  }

  async loginWithPassword(params: {
    phone?: string;
    email?: string;
    password: string;
    device?: DeviceContext;
  }): Promise<AuthResult> {
    const user = await this.prisma.user.findFirst({
      where: params.phone ? { phone: params.phone } : { email: params.email },
      include: { driver: { select: { id: true, status: true, isOnline: true } } },
    });

    if (!user?.passwordHash) {
      throw BusinessException.unauthorized('Credenciais invalidas.', ERROR_CODES.INVALID_CREDENTIALS);
    }

    const valid = await comparePassword(params.password, user.passwordHash);
    if (!valid) {
      throw BusinessException.unauthorized('Credenciais invalidas.', ERROR_CODES.INVALID_CREDENTIALS);
    }

    this.assertUserActive(user.status);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const issued = await this.tokens.issueTokens(
      {
        id: user.id,
        role: user.role,
        name: user.name,
        phone: user.phone,
        email: user.email,
        driverId: user.driver?.id ?? null,
      },
      params.device,
    );

    return {
      ...issued,
      isNewUser: false,
      user: this.paraUsuario(user),
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw BusinessException.notFound('Usuario nao encontrado.');

    if (user.passwordHash) {
      const valid = await comparePassword(currentPassword, user.passwordHash);
      if (!valid) {
        throw BusinessException.unauthorized('Senha atual incorreta.', ERROR_CODES.INVALID_CREDENTIALS);
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });

    await this.tokens.revokeAllUserTokens(userId);
  }

  async refresh(refreshToken: string, device?: DeviceContext): Promise<AuthResult> {
    const issued = await this.tokens.rotateRefreshToken(refreshToken, device);
    const me = await this.me(issued.accessToken);

    return { ...issued, isNewUser: false, user: me };
  }

  async logout(userId: string, refreshToken?: string, fcmToken?: string, allDevices = false): Promise<void> {
    if (allDevices) {
      await this.tokens.revokeAllUserTokens(userId);
    } else if (refreshToken) {
      await this.tokens.revokeRefreshToken(refreshToken);
    }
    if (fcmToken) {
      await this.tokens.unregisterDevice(userId, fcmToken);
    }
  }

  async me(userIdOrToken: string): Promise<AuthResult['user']> {
    const user = await this.prisma.user.findUnique({
      where: { id: userIdOrToken },
      include: { driver: { select: { id: true, status: true, isOnline: true } } },
    });

    if (!user) throw BusinessException.notFound('Usuario nao encontrado.');

    return this.paraUsuario(user);
  }

  /**
   * Monta o retrato publico do usuario a partir da linha do banco.
   *
   * Um lugar so: assim um campo novo (como o aceite dos termos) so
   * precisa ser lembrado aqui, nao nos quatro pontos que devolvem
   * usuario para o aplicativo.
   */
  private paraUsuario(user: any): AuthResult['user'] {
    return {
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
      email: user.email,
      avatarUrl: user.avatarUrl,
      status: user.status,
      driverId: user.driver?.id ?? null,
      driverStatus: user.driver?.status ?? null,
      isOnline: user.driver?.isOnline ?? null,
      termsAccepted: user.termsAcceptedAt != null,
      termsVersion: user.termsVersion ?? null,
    };
  }

  /**
   * Registra que a pessoa tocou em "Aceito os Termos".
   *
   * So grava para frente: uma vez aceito, aceitar de novo so atualiza a
   * versao (por exemplo quando os termos mudam), nunca apaga o aceite
   * anterior.
   */
  async acceptTerms(userId: string, version: string): Promise<AuthResult['user']> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { termsAcceptedAt: new Date(), termsVersion: version },
      include: { driver: { select: { id: true, status: true, isOnline: true } } },
    });
    return this.paraUsuario(user);
  }

  async registerDevice(current: AuthenticatedUser, device: DeviceContext): Promise<{ deviceId: string }> {
    const id = await this.tokens.upsertDevice(current.id, device);
    if (!id) throw BusinessException.validation('Dados do dispositivo invalidos.');
    return { deviceId: id };
  }

  private assertUserActive(status: UserStatus): void {
    if (status === UserStatus.BLOCKED) {
      throw BusinessException.forbidden('Conta bloqueada. Fale com o suporte.');
    }
    if (status === UserStatus.DELETED) {
      throw BusinessException.forbidden('Conta removida.');
    }
  }
}
