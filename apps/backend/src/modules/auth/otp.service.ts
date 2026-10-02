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

  /** O teste automatico manda esta chave para receber o codigo na resposta. */
  chaveTesteValida(chave?: string): boolean {
    const certa = this.config.otp.chaveTeste;
    return !!certa && !!chave && chave.length === certa.length && safeCompare(chave, certa);
  }

  /**
   * O codigo chega de verdade ao dono do contato? Por e-mail, sim, quando a
   * Brevo esta configurada. Por telefone, ainda nao (sem SMS).
   */
  entregaReal(target: { phone?: string; email?: string }): boolean {
    return !target.phone && !!target.email && this.notifications.emailConfigurado;
  }

  /** Canais de login que funcionam agora (mostrados pelos aplicativos). */
  canais(): { telefone: boolean; email: boolean; emailReal: boolean } {
    const teste = this.config.otp.debugReturn;
    const real = this.notifications.emailConfigurado;
    // emailReal: o codigo sai mesmo pelo e-mail (a Central so entra por codigo assim).
    return { telefone: teste, email: real || teste, emailReal: real };
  }

  /** Cria e envia um novo codigo. Invalida codigos anteriores do mesmo alvo. */
  async request(target: OtpTarget, ip?: string, chaveTeste?: string): Promise<{ expiresIn: number; debugCode?: string; enviadoPor: 'email' | 'tela' }> {
    const { phone, email, purpose } = target;
    // Teste automatico: o codigo volta na resposta e nenhum e-mail sai
    // (os enderecos do teste nao existem).
    const teste = this.chaveTesteValida(chaveTeste);
    const entrega = !teste && this.entregaReal(target);
    const devolver = teste || (this.config.otp.debugReturn && !this.entregaReal(target));
    if (!entrega && !devolver) {
      throw BusinessException.validation(
        phone ? 'Entrada pelo telefone indisponivel no momento. Use o e-mail.' : 'Envio de codigo por e-mail indisponivel no momento.',
      );
    }

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
    } else if (email && entrega) {
      const minutos = Math.round(this.config.otp.ttlSeconds / 60);
      const r = await this.notifications.send({
        userId: email,
        channel: NotificationChannel.EMAIL,
        to: email,
        title: `${code} e o seu codigo Fortaleza Mov`,
        body: `Seu codigo de acesso Fortaleza Mov e ${code}. Ele vale por ${minutos} minutos. Se nao foi voce que pediu, ignore este e-mail.`,
        data: { html: htmlDoCodigo(code, minutos) },
      });
      if (!r.delivered) {
        throw BusinessException.internal('Nao foi possivel enviar o e-mail agora. Tente de novo em instantes.');
      }
    }

    return {
      expiresIn: this.config.otp.ttlSeconds,
      enviadoPor: entrega ? 'email' : 'tela',
      ...(devolver ? { debugCode: code } : {}),
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

/** E-mail simples, legivel no celular, com o codigo bem grande. */
function htmlDoCodigo(code: string, minutos: number): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#14181F">
  <div style="background:#1E5BB8;color:#fff;font-size:22px;font-weight:bold;padding:14px 20px;border-radius:999px;display:inline-block">Fortaleza Mov</div>
  <p style="font-size:17px;margin-top:24px">Seu codigo de acesso:</p>
  <p style="font-size:40px;font-weight:bold;letter-spacing:8px;margin:8px 0;color:#1E5BB8">${code}</p>
  <p style="font-size:15px;color:#667085">Ele vale por ${minutos} minutos. Se nao foi voce que pediu, ignore este e-mail.</p>
</div>`;
}
