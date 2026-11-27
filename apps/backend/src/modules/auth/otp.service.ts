import { Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES, OtpPurpose, UserRole } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { BusinessException } from '../../common/errors/business.exception';
import { hashToken, randomNumericCode, safeCompare } from '../../common/utils/crypto.util';
import { NotificationService } from '../../integrations/notifications/notification.service';
import { NotificationChannel } from '@ride/shared';
import { contaVaziaSemEmail } from './conta-existente';
import { origemDoPedido } from './origem-do-pedido';
import { reconhecerPedinte } from './pedinte-conhecido';
import { LIMITE_DE_CODIGOS, reservarTentativaDeFora, umDeCadaVez } from './limites-de-codigo';

/** Enderecos que somente os testes automaticos usam. */
const DOMINIO_DE_TESTE = '@teste.fortalezamov.com.br';

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

  /**
   * Modo dos testes automaticos: so existe com a chave certa e so em conta de
   * teste (conta ja marcada como teste, ou endereco novo do dominio de teste).
   * Conta da Central e conta de verdade seguem as regras normais.
   */
  async modoDeTeste(target: { phone?: string; email?: string }, chave?: string): Promise<boolean> {
    if (!this.chaveTesteValida(chave)) return false;
    const { phone, email } = target;
    if (Boolean(phone) === Boolean(email)) return false;
    const conta = await this.prisma.user.findFirst({
      where: phone ? { phone } : { email },
      select: { role: true, metadata: true },
    });
    if (!conta) return !!email && email.endsWith(DOMINIO_DE_TESTE);
    const meta = conta.metadata as { teste?: unknown } | null;
    return conta.role !== UserRole.ADMIN && meta?.teste === true;
  }

  private chaveTesteValida(chave?: string): boolean {
    const certa = this.config.otp.chaveTeste;
    return !!certa && !!chave && chave.length === certa.length && safeCompare(chave, certa);
  }

  /**
   * Conta de REVISAO da loja (Google Play): entrada por e-mail com codigo fixo, so para os
   * e-mails da lista OTP_CONTAS_REVISAO. Nunca para telefone, para Central (dono/operador)
   * nem para trocar telefone/senha. Sem a variavel, nada disso existe.
   */
  private async codigoDeRevisao(target: OtpTarget): Promise<string | null> {
    const { phone, email, purpose } = target;
    if (phone || !email) return null;
    if (purpose !== OtpPurpose.LOGIN && purpose !== OtpPurpose.EMAIL_VERIFICATION) return null;
    const fixo = this.config.otp.contasRevisao?.[email.trim().toLowerCase()];
    if (!fixo) return null;
    const dono = await this.prisma.user.findUnique({ where: { email }, select: { role: true } });
    if (dono && dono.role !== UserRole.PASSENGER && dono.role !== UserRole.DRIVER) return null;
    return fixo;
  }

  /**
   * O codigo chega de verdade ao dono do contato? Por e-mail, sim, quando a
   * Brevo esta configurada. Por telefone, ainda nao (sem SMS).
   */
  entregaReal(target: { phone?: string; email?: string }): boolean {
    return !target.phone && !!target.email && this.notifications.emailConfigurado;
  }

  /**
   * Canais de login que funcionam agora (mostrados pelos aplicativos).
   * Telefone sem SMS: o codigo vai para o e-mail da conta daquele telefone
   * (gratis). Por isso, com e-mail ligado, entrar pelo telefone funciona.
   */
  canais(): { telefone: boolean; email: boolean; emailReal: boolean } {
    const teste = this.config.otp.debugReturn;
    const real = this.notifications.emailConfigurado;
    // emailReal: o codigo sai mesmo pelo e-mail (a Central so entra por codigo assim).
    return { telefone: teste || real, email: real || teste, emailReal: real };
  }

  /** "e•••@gmail.com" */
  private mascararEmail(e: string): string {
    const [nome, dominio] = e.split('@');
    return `${nome.slice(0, 1)}•••@${dominio ?? ''}`;
  }

  /** Recusa o pedido quando algum teto da ultima hora (ou do dia) estourou. */
  private async conferirLimites(
    alvo: { phone: string } | { email: string },
    origem?: string,
    instalacao?: string,
  ): Promise<void> {
    const agora = Date.now();
    const umaHora = { gte: new Date(agora - 60 * 60 * 1000) };
    const contar = (where: Record<string, unknown>) => this.prisma.otpCode.count({ where: where as never });
    const recusar = (mensagem: string) => {
      throw BusinessException.tooManyRequests(mensagem, ERROR_CODES.OTP_COOLDOWN);
    };
    const daConta = 'Muitos codigos pedidos para esta conta. Entre com a sua senha, espere um pouco ou fale com a Central.';

    // Sem a origem (chamada interna), vale o limite mais apertado pela conta.
    const meus = await contar({ ...alvo, ...(origem ? { ip: origem } : {}), createdAt: umaHora });
    if (meus >= LIMITE_DE_CODIGOS.porPessoaEContaNaHora) recusar(daConta);
    if (!origem) return;
    const umDia = { gte: new Date(agora - 24 * 60 * 60 * 1000) };
    // Aparelho ou conexao que ja entrou na conta nao divide o teto com quem e de fora.
    const conta = await this.prisma.user.findFirst({ where: alvo, select: { id: true } });
    const { conhecido } = await reconhecerPedinte(this.prisma, conta?.id, { instalacao, origem });
    if (conhecido) {
      const meusNoDia = await contar({ ...alvo, ip: origem, createdAt: umDia });
      if (meusNoDia >= LIMITE_DE_CODIGOS.porConhecidoNoDia) recusar(daConta);
    } else {
      if ((await contar({ ...alvo, createdAt: umaHora })) >= LIMITE_DE_CODIGOS.porContaNaHora) recusar(daConta);
      if ((await contar({ ...alvo, createdAt: umDia })) >= LIMITE_DE_CODIGOS.porContaNoDia) recusar(daConta);
    }
    if ((await contar({ ip: origem, createdAt: umaHora })) >= LIMITE_DE_CODIGOS.porPessoaNaHora) {
      recusar('Muitos codigos pedidos desta conexao. Espere um pouco e tente de novo.');
    }
  }

  /**
   * Cria e envia um novo codigo. Invalida os codigos anteriores que a mesma
   * pessoa pediu para o mesmo telefone ou e-mail.
   */
  async request(
    target: OtpTarget,
    ip?: string,
    chaveTeste?: string,
    instalacao?: string,
  ): Promise<{ expiresIn: number; debugCode?: string; enviadoPor: 'email' | 'tela'; destino?: string }> {
    const { phone, email, purpose } = target;
    const origem = origemDoPedido(ip);
    const daMesmaOrigem = origem ? { ip: origem } : {};
    const fixo = await this.codigoDeRevisao(target);
    if (fixo) {
      // Conta de revisao: grava o codigo fixo (mesmas regras de validade e tentativas do
      // verify) e NAO envia e-mail nem devolve codigo na resposta. O limite de 6 pedidos
      // por hora continua valendo: sem ele, pedir codigo novo zeraria as tentativas e
      // daria para adivinhar o codigo fixo.
      await umDeCadaVez(`destino:${email}`, async () => {
        const umaHoraRev = new Date(Date.now() - 60 * 60 * 1000);
        const pedidosRev = await this.prisma.otpCode.count({ where: { email, createdAt: { gte: umaHoraRev } } });
        if (pedidosRev >= 6) {
          throw BusinessException.tooManyRequests(
            'Muitos codigos pedidos para esta conta. Espere uma hora ou fale com a Central.',
            ERROR_CODES.OTP_COOLDOWN,
          );
        }
        await this.prisma.$transaction([
          this.prisma.otpCode.updateMany({ where: { email, purpose, consumedAt: null }, data: { consumedAt: new Date() } }),
          this.prisma.otpCode.create({
            data: {
              email,
              purpose,
              codeHash: hashToken(fixo, this.pepper),
              expiresAt: new Date(Date.now() + this.config.otp.ttlSeconds * 1000),
              maxAttempts: this.config.otp.maxAttempts,
              ip: origem,
            },
          }),
        ]);
      });
      this.logger.warn(`Conta de revisao da loja pediu entrada (${this.mascararEmail(email!)}).`);
      return { expiresIn: this.config.otp.ttlSeconds, enviadoPor: 'email', destino: `e-mail ${this.mascararEmail(email!)}` };
    }
    // Teste automatico: o codigo volta na resposta e nenhum e-mail sai
    // (os enderecos do teste nao existem).
    const teste = await this.modoDeTeste(target, chaveTeste);

    // Sem SMS (custa dinheiro): quem entra pelo telefone recebe o codigo no
    // e-mail da conta daquele telefone (decisao do Evandro, 08/10/2026:
    // evitar custo agora). O codigo continua valendo para o telefone.
    let emailDoTelefone: string | null = null;
    let donoDoTelefone: string | null = null;
    if (phone && !teste && this.notifications.emailConfigurado) {
      const dono = await this.prisma.user.findUnique({ where: { phone }, select: { id: true, email: true } });
      emailDoTelefone = dono?.email ?? null;
      donoDoTelefone = dono?.id ?? null;
    }
    // R2 (11/11/2026): trocar o telefone so com o codigo no E-MAIL da conta.
    // Nunca na tela (nem com OTP_DEBUG_RETURN ligado): o controle de um chip
    // sozinho nao basta para mexer na conta.
    if (purpose === OtpPurpose.PHONE_VERIFICATION && phone && !teste && !emailDoTelefone) {
      throw new BusinessException(
        ERROR_CODES.TELEFONE_SEM_EMAIL,
        'Para trocar o telefone, a conta precisa de um e-mail. Cadastre o seu e-mail em Meus dados e tente de novo.',
        422,
      );
    }
    const entrega = !teste && (this.entregaReal(target) || !!emailDoTelefone);
    const devolver = teste || (this.config.otp.debugReturn && !entrega);
    if (!entrega && !devolver) {
      if (phone && (!donoDoTelefone || (await contaVaziaSemEmail(this.prisma, donoDoTelefone)))) {
        // Telefone novo: sem SMS, a conta nasce pelo e-mail (o app pede o
        // e-mail e manda o codigo para ele). Evandro, 08/10/2026: codigo por
        // e-mail para todos, passageiro e motorista.
        throw new BusinessException(
          ERROR_CODES.TELEFONE_SEM_CONTA,
          'Este telefone ainda nao tem conta. Para criar a sua, informe o seu e-mail: o codigo de confirmacao chega nele.',
          404,
        );
      }
      throw new BusinessException(
        phone ? ERROR_CODES.TELEFONE_SEM_EMAIL : ERROR_CODES.VALIDATION_ERROR,
        phone
          ? 'Esta conta nao tem e-mail para receber o codigo. Entre com o seu e-mail ou peca a Central para cadastrar o e-mail.'
          : 'Envio de codigo por e-mail indisponivel no momento.',
        422,
      );
    }

    if (!phone && !email) {
      throw BusinessException.validation('Informe telefone ou e-mail.');
    }

    const code = randomNumericCode(this.config.otp.length);
    const expiresAt = new Date(Date.now() + this.config.otp.ttlSeconds * 1000);
    const destinoDoCodigo = phone ? { phone } : { email: email! };

    // Conferir os limites e gravar acontecem em fila: primeiro a da origem,
    // depois a do destino (sempre nesta ordem).
    const conferirEGravar = () =>
      umDeCadaVez(`destino:${phone ?? email}`, async () => {
        // Protecao da conta e do limite de envio de e-mails.
        if (!teste) await this.conferirLimites(destinoDoCodigo, origem, instalacao);

        const windowStart = new Date(Date.now() - 60 * 1000);
        const recent = await this.prisma.otpCode.findFirst({
          where: { ...destinoDoCodigo, ...daMesmaOrigem, purpose, createdAt: { gte: windowStart }, consumedAt: null },
          orderBy: { createdAt: 'desc' },
        });

        if (recent) {
          const seconds = Math.ceil((recent.createdAt.getTime() + 60000 - Date.now()) / 1000);
          throw BusinessException.tooManyRequests(
            `Aguarde ${seconds}s para solicitar um novo codigo.`,
            ERROR_CODES.OTP_COOLDOWN,
          );
        }

        await this.prisma.$transaction([
          this.prisma.otpCode.updateMany({
            where: { ...destinoDoCodigo, ...daMesmaOrigem, purpose, consumedAt: null },
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
              ip: origem,
            },
          }),
        ]);
      });
    await (origem ? umDeCadaVez(`origem:${origem}`, conferirEGravar) : conferirEGravar());

    const paraEmail = entrega ? (emailDoTelefone ?? email ?? null) : null;
    if (phone && !paraEmail) {
      await this.notifications.sendOtpCode(phone, code, this.config.otp.ttlSeconds);
    } else if (paraEmail) {
      const minutos = Math.round(this.config.otp.ttlSeconds / 60);
      const r = await this.notifications.send({
        userId: paraEmail,
        channel: NotificationChannel.EMAIL,
        to: paraEmail,
        title: `${code} é o seu código Fortaleza Move`,
        body:
          `Seu código de acesso Fortaleza Move é ${code}. Ele vale por ${minutos} minutos.\n\n` +
          'Não passe este código para ninguém. A Fortaleza Move nunca pede o seu código por telefone, WhatsApp ou mensagem.\n' +
          'Se não foi você que pediu, ignore este e-mail: sem o código ninguém entra na sua conta.',
        data: { html: htmlDoCodigo(code, minutos) },
      });
      if (!r.delivered) {
        throw BusinessException.internal('Nao foi possivel enviar o e-mail agora. Tente de novo em instantes.');
      }
    }

    return {
      expiresIn: this.config.otp.ttlSeconds,
      enviadoPor: entrega ? 'email' : 'tela',
      ...(emailDoTelefone && entrega ? { destino: `e-mail ${this.mascararEmail(emailDoTelefone)}` } : {}),
      ...(devolver ? { debugCode: code } : {}),
    };
  }

  /**
   * Valida o codigo e o consome. Lanca excecao se invalido/expirado.
   *
   * Quem pediu o codigo confere o proprio codigo, com as proprias
   * tentativas. Quem confere de outra origem (celular que trocou de rede)
   * confere o codigo mais novo, com uma contagem separada.
   */
  async verify(target: OtpTarget & { code: string; ip?: string }): Promise<void> {
    const { phone, email, purpose, code } = target;

    // Telefone ou e-mail: exatamente um.
    if (Boolean(phone) === Boolean(email)) {
      throw BusinessException.validation('Informe o telefone ou o e-mail.');
    }

    const alvo = { ...(phone ? { phone } : { email }), purpose, consumedAt: null };
    const origem = origemDoPedido(target.ip);
    const meu = origem
      ? await this.prisma.otpCode.findFirst({
          where: { ...alvo, ip: origem, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const record = meu ?? (await this.prisma.otpCode.findFirst({ where: alvo, orderBy: { createdAt: 'desc' } }));

    if (!record) {
      throw BusinessException.unauthorized('Codigo invalido ou expirado.', ERROR_CODES.OTP_EXPIRED);
    }

    if (record.expiresAt < new Date()) {
      throw BusinessException.unauthorized('Codigo expirado. Solicite um novo.', ERROR_CODES.OTP_EXPIRED);
    }

    const esgotado = () =>
      BusinessException.tooManyRequests(
        'Numero maximo de tentativas excedido. Solicite um novo codigo.',
        ERROR_CODES.OTP_MAX_ATTEMPTS,
      );

    // Conta de revisao da loja (codigo fixo): uma contagem so, para todos.
    const separada = !meu && !!origem && !!record.ip && record.ip !== origem && !(await this.codigoDeRevisao(target));

    // Conta a tentativa e depois compara.
    if (separada) {
      if (!reservarTentativaDeFora(record.id, record.maxAttempts, record.expiresAt)) throw esgotado();
    } else {
      if (record.attempts >= record.maxAttempts) throw esgotado();
      const contada = await this.prisma.otpCode.updateMany({
        where: { id: record.id, consumedAt: null, attempts: { lt: record.maxAttempts } },
        data: { attempts: { increment: 1 } },
      });
      if (contada.count !== 1) throw esgotado();
    }

    if (!safeCompare(record.codeHash, hashToken(code, this.pepper))) {
      throw BusinessException.unauthorized('Codigo incorreto.', ERROR_CODES.OTP_INVALID);
    }

    // O codigo certo vale uma unica vez, e leva junto os outros pendentes.
    const usado = await this.prisma.otpCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (usado.count !== 1) {
      throw BusinessException.unauthorized('Codigo invalido ou expirado.', ERROR_CODES.OTP_EXPIRED);
    }
    await this.prisma.otpCode.updateMany({ where: alvo, data: { consumedAt: new Date() } });
  }
}

/** E-mail simples, legivel no celular, com o codigo bem grande. */
function htmlDoCodigo(code: string, minutos: number): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#14181F">
  <div style="background:#1E5BB8;color:#fff;font-size:22px;font-weight:bold;padding:14px 20px;border-radius:999px;display:inline-block">Fortaleza Move</div>
  <p style="font-size:17px;margin-top:24px">Seu código de acesso:</p>
  <p style="font-size:40px;font-weight:bold;letter-spacing:8px;margin:8px 0;color:#1E5BB8">${code}</p>
  <p style="font-size:15px;color:#667085">Ele vale por ${minutos} minutos.</p>
  <p style="font-size:15px;color:#B42318;font-weight:bold">Não passe este código para ninguém. A Fortaleza Move nunca pede o seu código por telefone, WhatsApp ou mensagem.</p>
  <p style="font-size:14px;color:#667085">Se não foi você que pediu, ignore este e-mail: sem o código ninguém entra na sua conta.</p>
</div>`;
}
