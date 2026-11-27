import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { UserRole, UserStatus } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { BusinessException } from '../../common/errors/business.exception';
import { AuthResult, AuthService } from './auth.service';
import { DeviceContext, TokenService } from './token.service';
import { AvisosDeSeguranca } from './avisos-de-seguranca';
import { SessoesService } from './sessoes.service';
import { randomToken } from '../../common/utils/crypto.util';
import {
  ChavesDoGoogle,
  ContaGoogle,
  FORMATO_ID_DO_CLIENTE,
  GoogleForaDoAr,
  TokenGoogleRecusado,
  lerContaGoogle,
  ligacaoGoogle,
} from './google-token';

/** O Google nao garante o endereco: o aplicativo segue com o codigo por e-mail. */
export interface PrecisaDoCodigo {
  precisaCodigoEmail: true;
  email: string;
}

const COM_MOTORISTA = { driver: { select: { id: true, status: true, isOnline: true } } } as const;
type ContaDoBanco = Prisma.UserGetPayload<{ include: typeof COM_MOTORISTA }>;

@Injectable()
export class GoogleLoginService {
  private readonly logger = new Logger(GoogleLoginService.name);
  private readonly chaves = new ChavesDoGoogle();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly avisos: AvisosDeSeguranca,
    private readonly sessoes: SessoesService,
  ) {}

  /**
   * Codigo do cliente "Aplicativo da Web" no Google (nao e segredo). Sem ele
   * configurado no servidor, o botao nem aparece nos aplicativos.
   */
  idDoCliente(): string | null {
    const id = this.config.googleLogin.clientId?.trim() ?? '';
    return FORMATO_ID_DO_CLIENTE.test(id) ? id : null;
  }

  async entrar(params: { idToken: string; role: UserRole; device?: DeviceContext }): Promise<AuthResult | PrecisaDoCodigo> {
    const conta = await this.conferir(params.idToken);
    const papel = params.role === UserRole.DRIVER ? UserRole.DRIVER : UserRole.PASSENGER;

    const r = await this.prisma.$transaction(async (tx) => {
      // Duas entradas ao mesmo tempo da mesma pessoa: uma de cada vez.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`entrada-google:${conta.email}`}))`;
      return this.acharOuCriar(tx, conta, papel);
    });
    if ('precisaCodigoEmail' in r) return r;

    if (r.ligouAgora) await this.avisos.avisar(r.user.id, 'GOOGLE_LIGADO');

    // Primeira confirmacao do endereco: a conta recomeca com um acesso so,
    // o deste aparelho.
    let aparelho = params.device;
    if (r.soEste) {
      aparelho ??= { deviceId: `google-${randomToken(12)}`, platform: 'WEB' as never };
      await this.sessoes.cortar(r.user.id, await this.tokens.upsertDevice(r.user.id, aparelho));
    }

    const issued = await this.tokens.issueTokens(
      {
        id: r.user.id,
        role: r.user.role as UserRole,
        name: r.user.name,
        phone: r.user.phone,
        email: r.user.email,
        driverId: r.user.driver?.id ?? null,
      },
      aparelho,
    );
    return { ...issued, isNewUser: r.nova, user: await this.auth.me(r.user.id) };
  }

  private async conferir(idToken: string): Promise<ContaGoogle> {
    const idDoCliente = this.idDoCliente();
    if (!idDoCliente) throw BusinessException.validation('Entrar com Google ainda nao esta ligado. Use o codigo por e-mail.');
    try {
      return await lerContaGoogle(idToken, idDoCliente, this.chaves);
    } catch (e) {
      if (e instanceof GoogleForaDoAr) {
        throw BusinessException.validation('Nao deu para falar com o Google agora. Tente de novo ou entre com o codigo por e-mail.');
      }
      if (e instanceof TokenGoogleRecusado) {
        this.logger.warn(`Entrada pelo Google recusada: ${e.message}`);
        throw BusinessException.unauthorized('O Google nao confirmou esta entrada. Tente de novo.');
      }
      throw e;
    }
  }

  private async acharOuCriar(
    tx: Prisma.TransactionClient,
    google: ContaGoogle,
    papel: UserRole,
  ): Promise<PrecisaDoCodigo | { user: ContaDoBanco; nova: boolean; ligouAgora: boolean; soEste: boolean }> {
    const pelaConta = await tx.user.findFirst({
      where: { metadata: { path: ['google', 'sub'], equals: google.sub }, status: { not: UserStatus.DELETED } },
      include: COM_MOTORISTA,
    });
    const jaLigada = pelaConta && ligacaoGoogle(pelaConta)?.sub === google.sub ? pelaConta : null;
    const existente = jaLigada ?? (await tx.user.findFirst({ where: { email: google.email }, include: COM_MOTORISTA }));

    // A Central continua entrando so por e-mail (com as duas etapas).
    if (existente?.role === UserRole.ADMIN) {
      throw BusinessException.forbidden('A conta da Central entra com o codigo enviado ao e-mail ou com a senha.');
    }

    if (!jaLigada) {
      if (!google.autoritativo) return { precisaCodigoEmail: true, email: google.email };
      // O endereco esta numa conta ligada a OUTRA conta Google (endereco que
      // mudou de dono): so entra provando o e-mail pelo codigo.
      const outra = existente ? ligacaoGoogle(existente) : null;
      if (outra && outra.sub !== google.sub) return { precisaCodigoEmail: true, email: google.email };
    }

    const agora = new Date();
    const ligacao = { sub: google.sub, email: google.email, ligadoEm: agora.toISOString() };

    if (!existente) {
      const nome = google.nome && google.nome.length >= 3 ? google.nome : papel === UserRole.DRIVER ? 'Motorista' : 'Passageiro';
      const user = await tx.user.create({
        data: {
          role: papel,
          status: UserStatus.ACTIVE,
          name: nome,
          // Falta o telefone: o cadastro pede (o campo e obrigatorio e unico).
          phone: `pend-${agora.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          email: google.email,
          emailVerifiedAt: agora,
          lastLoginAt: agora,
          metadata: { google: ligacao },
        },
        include: COM_MOTORISTA,
      });
      return { user, nova: true, ligouAgora: false, soEste: false };
    }

    if (existente.status === UserStatus.BLOCKED) throw BusinessException.forbidden('Conta bloqueada. Fale com o suporte.');
    if (existente.status === UserStatus.DELETED) throw BusinessException.forbidden('Conta removida.');

    const meta =
      existente.metadata && typeof existente.metadata === 'object' && !Array.isArray(existente.metadata)
        ? (existente.metadata as Prisma.JsonObject)
        : {};
    // Primeira confirmacao do endereco: os acessos antigos nao sao mantidos.
    const soEste = !jaLigada && !existente.emailVerifiedAt;

    const user = await tx.user.update({
      where: { id: existente.id },
      data: {
        // Mesma regra da entrada por codigo: passageiro que abre o app do motorista.
        ...(papel === UserRole.DRIVER && existente.role === UserRole.PASSENGER ? { role: UserRole.DRIVER } : {}),
        lastLoginAt: agora,
        emailVerifiedAt: existente.emailVerifiedAt ?? agora,
        ...(soEste ? { passwordHash: null } : {}),
        ...(jaLigada ? {} : { metadata: { ...meta, google: ligacao } }),
      },
      include: COM_MOTORISTA,
    });
    return { user, nova: false, ligouAgora: !jaLigada, soEste };
  }
}
