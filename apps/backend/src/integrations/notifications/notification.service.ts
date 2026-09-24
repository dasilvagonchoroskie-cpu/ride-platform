import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@ride/shared';
import { AppConfigService } from '../../config/app-config.service';

export interface SendNotificationInput {
  userId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  to?: string | null;
  data?: Record<string, unknown>;
}

/**
 * Envio de notificacoes (push/SMS/e-mail).
 * Em desenvolvimento os envios sao apenas logados; a integracao real com
 * FCM/SMTP entra na fase de notificacoes (F8).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly config: AppConfigService) {}

  async send(input: SendNotificationInput): Promise<{ delivered: boolean; error?: string }> {
    switch (input.channel) {
      case NotificationChannel.PUSH:
        return this.sendPush(input);
      case NotificationChannel.EMAIL:
        return this.sendEmail(input);
      case NotificationChannel.SMS:
      case NotificationChannel.WHATSAPP:
        return this.sendSms(input);
      default:
        return { delivered: false, error: 'Canal nao suportado.' };
    }
  }

  /** OTP por SMS. Em dev, imprime no log (nunca em producao). */
  async sendOtpCode(to: string, code: string, ttlSeconds: number): Promise<void> {
    if (this.config.isProduction) {
      // TODO(F8): integrar provedor de SMS real (Twilio/Zenvia).
      this.logger.log(`OTP enviado para ${this.mask(to)} (validade ${ttlSeconds}s).`);
      return;
    }
    this.logger.log(`[DEV] OTP para ${to}: ${code} (validade ${ttlSeconds}s)`);
  }

  private async sendPush(input: SendNotificationInput): Promise<{ delivered: boolean; error?: string }> {
    const { projectId, clientEmail, privateKey } = this.config.fcm;
    if (!projectId || !clientEmail || !privateKey) {
      this.logger.log(`[DEV] Push para ${input.userId}: ${input.title} - ${input.body}`);
      return { delivered: false, error: 'FCM nao configurado.' };
    }
    // TODO(F8): assinar JWT do service account e chamar a API v1 do FCM.
    this.logger.log(`Push enfileirado para ${input.userId}: ${input.title}`);
    return { delivered: true };
  }

  private async sendEmail(input: SendNotificationInput): Promise<{ delivered: boolean; error?: string }> {
    if (!this.config.mail.host) {
      this.logger.log(`[DEV] E-mail para ${input.to ?? input.userId}: ${input.title} - ${input.body}`);
      return { delivered: false, error: 'SMTP nao configurado.' };
    }
    // TODO(F8): enviar via SMTP (nodemailer) usando config.mail.
    this.logger.log(`E-mail enfileirado para ${input.to ?? input.userId}: ${input.title}`);
    return { delivered: true };
  }

  private async sendSms(input: SendNotificationInput): Promise<{ delivered: boolean; error?: string }> {
    this.logger.log(`[DEV] SMS para ${this.mask(input.to ?? '')}: ${input.body}`);
    return { delivered: true };
  }

  private mask(value: string): string {
    if (value.length <= 4) return '****';
    return `${value.slice(0, 4)}****${value.slice(-2)}`;
  }
}
