import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../../integrations/notifications/notification.service';
import { PushService } from '../../integrations/notifications/push.service';

/** O que aconteceu na conta (R4, Requisicao de continuidade, 11/11/2026). */
export type EventoDeSeguranca =
  | 'SENHA_TROCADA'
  | 'SENHA_RECUPERADA'
  | 'TELEFONE_TROCADO'
  | 'EMAIL_TROCADO'
  | 'RECUPERACAO_PELA_CENTRAL'
  | 'DUAS_ETAPAS_REDEFINIDAS';

const TEXTOS: Record<EventoDeSeguranca, string> = {
  SENHA_TROCADA: 'A senha da sua conta Fortaleza Move foi trocada',
  SENHA_RECUPERADA: 'A senha da sua conta Fortaleza Move foi recuperada pelo "Esqueci minha senha"',
  TELEFONE_TROCADO: 'O telefone da sua conta Fortaleza Move foi trocado',
  EMAIL_TROCADO: 'O e-mail da sua conta Fortaleza Move foi trocado',
  RECUPERACAO_PELA_CENTRAL: 'O acesso à sua conta Fortaleza Move foi recuperado pela Central',
  DUAS_ETAPAS_REDEFINIDAS: 'A verificação em duas etapas da sua conta da Central foi redefinida',
};

/** Enderecos ficticios do teste de ponta a ponta: nenhum e-mail sai para eles. */
export function enderecoDeTeste(email: string): boolean {
  return /@teste\.fortalezamov\.com\.br$/i.test(email);
}

/** "11/11/2026 17:47" no horario de Brasilia. */
export function horarioDeBrasilia(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

/** Texto do aviso. Nunca leva senha, codigo, telefone completo nem documento. */
export function textoDoAviso(evento: EventoDeSeguranca, quando: Date): { titulo: string; texto: string } {
  const titulo = 'Aviso de segurança';
  const texto =
    `${TEXTOS[evento]} em ${horarioDeBrasilia(quando)} (horário de Brasília). ` +
    (evento === 'TELEFONE_TROCADO' || evento === 'EMAIL_TROCADO' ? '' : 'Os outros aparelhos foram desconectados. ') +
    'Se não foi você, recupere a senha agora pelo aplicativo ("Esqueci minha senha") e fale com a Central pelo e-mail fortalezamovegtba@gmail.com.';
  return { titulo, texto };
}

/**
 * Avisos de seguranca (R4): e-mail para o endereco cadastrado e push para os
 * aparelhos ainda ligados a conta. Chamado ANTES do corte das sessoes (o
 * corte apaga os enderecos de push). Nunca derruba quem chamou: falha de
 * envio so vai para o registro, sem dado pessoal.
 */
@Injectable()
export class AvisosDeSeguranca {
  private readonly logger = new Logger(AvisosDeSeguranca.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly push: PushService,
  ) {}

  async avisar(
    userId: string,
    evento: EventoDeSeguranca,
    opcoes: { emailAntigo?: string | null; quando?: Date; exceto?: string | null } = {},
  ): Promise<{ email: boolean; aparelhos: number }> {
    const quando = opcoes.quando ?? new Date();
    const { titulo, texto } = textoDoAviso(evento, quando);
    let email = false;
    let aparelhos = 0;
    try {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, metadata: true } });
      const teste = (u?.metadata as { teste?: boolean } | null)?.teste === true;
      // Para o e-mail atual e, na troca de e-mail, tambem para o antigo.
      const destinos = [...new Set([u?.email, opcoes.emailAntigo].filter((e): e is string => !!e && e.includes('@') && !enderecoDeTeste(e)))];
      // Conta do teste automatico: enderecos ficticios, nenhum e-mail sai.
      if (!teste && this.notifications.emailConfigurado) {
        for (const para of destinos) {
          const r = await this.notifications.send({
            userId,
            channel: NotificationChannel.EMAIL,
            to: para,
            title: titulo,
            body: texto,
            data: { html: htmlDoAviso(titulo, texto) },
          });
          email = email || r.delivered;
        }
      }
      aparelhos = await this.push.paraAparelhosAgora(userId, { tipo: 'aviso', titulo, texto }, 3600, opcoes.exceto);
      await this.prisma.notification.create({
        data: { userId, channel: 'PUSH', status: 'SENT', title: titulo, body: texto, data: { tipo: 'seguranca' }, sentAt: new Date() },
      });
    } catch (e) {
      this.logger.warn(`Aviso de seguranca nao saiu (${evento}): ${(e as Error).message}`);
    }
    return { email, aparelhos };
  }
}

function htmlDoAviso(titulo: string, texto: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#14181F">
  <div style="background:#1E5BB8;color:#fff;font-size:22px;font-weight:bold;padding:14px 20px;border-radius:999px;display:inline-block">Fortaleza Move</div>
  <p style="font-size:18px;font-weight:bold;margin-top:24px">${titulo}</p>
  <p style="font-size:15px;line-height:1.5">${texto}</p>
</div>`;
}
