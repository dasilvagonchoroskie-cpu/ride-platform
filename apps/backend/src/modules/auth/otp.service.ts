import { Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES, OtpPurpose } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { BusinessException } from '../../common/errors/business.exception';
import { hashToken, randomNumericCode, safeCompare } from '../../common/utils/crypto.util';
import { NotificationService } from '../../integrations/notifications/notification.service';
import { NotificationChannel } from '@ride/shared';

export interface OtpTarget {
  phone?: string;
  email?: string;
  purpose: OtpPurpose;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationService,
  ) {}

  private get pepper(): string {
    return this.config.jwt.refreshSecret;
  }

  /** Cria e envia um novo codigo. Invalida codigos anteriores do mesmo alvo. */
  async request(target: OtpTarget, ip?: string): Promise<{ expiresIn: number; debugCode?: string }> {
    const { phone, email, purpose } = target;

    if (!phone && !email) {
      throw BusinessException.validation('Informe telefone ou e-mail.');
    }

    const windowStart = new Date(Date.now() - 60 * 1000);
    const recent = await this.prisma.otpCode.findFirst({
      where: {
        ...(phone ? { phone } : { email }),
        purpose,
        createdAt: { gte: windowStart },
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recent) {
      const seconds = Math.ceil((recent.createdAt.getTime() + 60000 - Date.now()) / 1000);
      throw BusinessException.tooManyRequests(
        `Aguarde ${seconds}s para solicitar um novo codigo.`,
        ERROR_CODES.OTP_COOLDOWN,
      );
    }

    const code = randomNumericCode(this.config.otp.length);
    const expiresAt = new Date(Date.now() + this.config.otp.ttlSeconds * 1000);

    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({
        where: { ...(phone ? { phone } : { email }), purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          phone,
          email,
          purpose,
          codeHash: hashToken(code, this.pepper),
          expiresAt,
          maxAttempts: this.config.otp.maxAttempts,
          ip,
        },
      }),
    ]);

    if (phone) {
      await this.notifications.sendOtpCode(phone, code, this.config.otp.ttlSeconds);
    } else if (email) {
      await this.notifications.send({
        userId: email,
        channel: NotificationChannel.EMAIL,
        to: email,
        title: 'Seu codigo de acesso Ride',
        body: `Seu codigo e ${code}. Valido por ${Math.round(this.config.otp.ttlSeconds / 60)} minutos.`,
      });
      this.logger.log(`[DEV] OTP de e-mail para ${email}: ${code}`);
    }

    return {
      expiresIn: this.config.otp.ttlSeconds,
      ...(this.config.otp.debugReturn ? { debugCode: code } : {}),
    };
  }

  /** Valida o codigo e o consome. Lanca excecao se invalido/expirado. */
  async verify(target: OtpTarget & { code: string }): Promise<void> {
    const { phone, email, purpose, code } = target;

    const record = await this.prisma.otpCode.findFirst({
      where: { ...(phone ? { phone } : { email }), purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw BusinessException.unauthorized('Codigo invalido ou expirado.', ERROR_CODES.OTP_EXPIRED);
    }

    if (record.expiresAt < new Date()) {
      throw BusinessException.unauthorized('Codigo expirado. Solicite um novo.', ERROR_CODES.OTP_EXPIRED);
    }

    if (record.attempts >= record.maxAttempts) {
      throw BusinessException.tooManyRequests(
        'Numero maximo de tentativas excedido. Solicite um novo codigo.',
        ERROR_CODES.OTP_MAX_ATTEMPTS,
      );
    }

    const matches = safeCompare(record.codeHash, hashToken(code, this.pepper));

    if (!matches) {
      await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw BusinessException.unauthorized('Codigo incorreto.', ERROR_CODES.OTP_INVALID);
    }

    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
  }
}
