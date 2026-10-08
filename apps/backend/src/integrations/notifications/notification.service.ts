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

  /** E-mail de verdade ligado: Gmail (script do Google) ou Brevo. */
  get emailConfigurado(): boolean {
    return this.gmailConfigurado || this.brevoConfigurada;
  }

  private get gmailConfigurado(): boolean {
    const m = this.config.mail;
    return !!m.googleScriptUrl && !!m.googleScriptSegredo;
  }

  private get brevoConfigurada(): boolean {
    const m = this.config.mail;
    return !!m.brevoApiKey && !!m.remetente;
  }

  /**
   * Envio pelo Gmail do Evandro, de graca (ate ~100 e-mails por dia): o
   * servidor chama, por HTTPS, um script do Google (Apps Script) publicado
   * na conta dele, e o script manda o e-mail. Nao usa SMTP — o plano gratis
   * do Render bloqueia as portas de SMTP. Codigo do script:
   * scripts/email-gmail/Codigo.gs.
   */
  private async enviarPeloGmail(para: string, assunto: string, texto: string, html?: string) {
    const m = this.config.mail;
    try {
      const r = await fetch(m.googleScriptUrl as string, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ segredo: m.googleScriptSegredo, para, assunto, texto, html, nome: m.remetenteNome }),
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      const corpo = await r.text();
      let resposta: { ok?: boolean; erro?: string; restantes?: number } = {};
      try {
        resposta = JSON.parse(corpo) as typeof resposta;
      } catch {
        this.logger.error(`Script do Gmail respondeu algo inesperado (${r.status}): ${corpo.slice(0, 160)}`);
        return { delivered: false, error: 'Resposta inesperada do Gmail.' };
      }
      if (!resposta.ok) {
        this.logger.error(`Script do Gmail recusou o e-mail: ${resposta.erro ?? 'sem motivo'}`);
        return { delivered: false, error: `Gmail: ${resposta.erro ?? 'recusado'}` };
      }
      this.logger.log(`E-mail enviado pelo Gmail para ${this.mask(para)} (restam ${resposta.restantes ?? '?'} hoje).`);
      return { delivered: true };
    } catch (e) {
      this.logger.error(`Falha ao falar com o script do Gmail: ${(e as Error).message}`);
      return { delivered: false, error: 'Sem conexao com o Gmail.' };
    }
  }

  /**
   * Envia pela API da Brevo (HTTPS). Nao usa SMTP: o plano gratis do
   * Render bloqueia as portas de SMTP.
   */
  private async sendEmail(input: SendNotificationInput): Promise<{ delivered: boolean; error?: string }> {
    const m = this.config.mail;
    const para = input.to ?? '';
    if (!this.emailConfigurado || !para) {
      this.logger.log(`[DEV] E-mail para ${this.mask(para)}: ${input.title}`);
      return { delivered: false, error: 'E-mail nao configurado.' };
    }
    const html = typeof input.data?.html === 'string' ? (input.data.html as string) : undefined;
    if (this.gmailConfigurado) {
      const pelo = await this.enviarPeloGmail(para, input.title, input.body, html);
      // Gmail fora do ar ou cota do dia acabou: tenta a Brevo, se houver.
      if (pelo.delivered || !this.brevoConfigurada) return pelo;
    }
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': m.brevoApiKey as string, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: m.remetenteNome, email: m.remetente },
          to: [{ email: para }],
          subject: input.title,
          textContent: input.body,
          ...(html ? { htmlContent: html } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        const motivo = (await r.text()).slice(0, 200);
        this.logger.error(`Brevo recusou o e-mail (${r.status}): ${motivo}`);
        return { delivered: false, error: `Brevo ${r.status}` };
      }
      this.logger.log(`E-mail enviado para ${this.mask(para)}: ${input.title}`);
      return { delivered: true };
    } catch (e) {
      this.logger.error(`Falha ao falar com a Brevo: ${(e as Error).message}`);
      return { delivered: false, error: 'Sem conexao com o provedor de e-mail.' };
    }
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
