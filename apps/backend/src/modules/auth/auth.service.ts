import { Injectable } from '@nestjs/common';
import { ERROR_CODES, OtpPurpose, UserRole, UserStatus } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/errors/business.exception';
import { comparePassword, hashPassword } from '../../common/utils/crypto.util';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TokenService, DeviceContext, IssuedTokens } from './token.service';
import { OtpService } from './otp.service';
import { cidadeAtendida, lerCidades } from '../operacao/operacao.store';

/** Genero informado no cadastro do passageiro. */
export type Genero = 'FEMININO' | 'MASCULINO' | 'OUTRO' | 'NAO_INFORMAR';

/** Campos extras do usuario guardados em `users.metadata` (sem mudar o banco). */
interface MetaUsuario {
  genero?: Genero;
  cidade?: string;
  cadastroCompleto?: boolean;
  cadastroConcluidoEm?: string;
  [k: string]: unknown;
}

function metaDe(user: { metadata?: unknown }): MetaUsuario {
  const m = user.metadata;
  return m && typeof m === 'object' && !Array.isArray(m) ? { ...(m as MetaUsuario) } : {};
}

/** Erro de unicidade do Prisma (dois cadastros ao mesmo tempo com o mesmo CPF/e-mail). */
function campoDuplicado(e: unknown): string | null {
  const x = e as { code?: string; meta?: { target?: unknown } } | null;
  if (x?.code !== 'P2002') return null;
  const alvo = x.meta?.target;
  return Array.isArray(alvo) ? alvo.join(',') : String(alvo ?? '');
}

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
    /** Cadastro do passageiro (nome, e-mail, genero, CPF, senha e cidade) ja feito. */
    cadastroCompleto: boolean;
    cpf: string | null;
    genero: Genero | null;
    cidade: string | null;
    /** Se ja existe senha (para entrar pelo e-mail). Nunca devolve a senha. */
    temSenha: boolean;
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

    // Enquanto o codigo de teste volta na resposta (sem SMS), o codigo
    // nao prova que a pessoa e dona do telefone. A conta da Central nunca
    // entra por codigo: so por e-mail e senha.
    if (existing?.role === UserRole.ADMIN) {
      throw BusinessException.forbidden('A conta da Central entra so com e-mail e senha.');
    }

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
      cadastroCompleto: metaDe(user).cadastroCompleto === true,
      cpf: user.cpf ?? null,
      genero: metaDe(user).genero ?? null,
      cidade: metaDe(user).cidade ?? null,
      temSenha: !!user.passwordHash,
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

  /**
   * Cadastro do passageiro, depois de confirmar o telefone: nome, e-mail,
   * genero, CPF, senha e cidade. Feito uma vez so; depois disso cada dado
   * muda pela tela Meus dados (a senha, pela troca de senha).
   */
  async concluirCadastro(
    userId: string,
    input: { name: string; email: string; gender: Genero; cpf: string; password: string; city?: string },
  ): Promise<AuthResult['user']> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw BusinessException.notFound('Usuario nao encontrado.');
    if (user.role !== UserRole.PASSENGER) {
      throw BusinessException.forbidden('Este cadastro e so para contas de passageiro.');
    }
    const meta = metaDe(user);
    if (meta.cadastroCompleto === true) {
      throw BusinessException.conflict('Seu cadastro ja foi concluido. Para mudar algum dado, use Meus dados.');
    }

    const cidade = await this.validarCidade(input.city);
    await this.garantirUnicos(userId, input.email, input.cpf);

    try {
      const salvo = await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: input.name.replace(/\s+/g, ' ').trim(),
          email: input.email,
          ...(user.email !== input.email ? { emailVerifiedAt: null } : {}),
          cpf: input.cpf,
          passwordHash: await hashPassword(input.password),
          metadata: {
            ...meta,
            genero: input.gender,
            ...(cidade ? { cidade } : {}),
            cadastroCompleto: true,
            cadastroConcluidoEm: new Date().toISOString(),
          } as never,
        },
        include: { driver: { select: { id: true, status: true, isOnline: true } } },
      });
      return this.paraUsuario(salvo);
    } catch (e) {
      throw this.traduzirDuplicado(e);
    }
  }

  /** Meus dados: nome, e-mail, genero e cidade. O CPF so entra se ainda estiver vazio. */
  async atualizarPerfil(
    userId: string,
    input: { name?: string; email?: string; gender?: Genero; city?: string; cpf?: string },
  ): Promise<AuthResult['user']> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw BusinessException.notFound('Usuario nao encontrado.');

    if (input.cpf && user.cpf && input.cpf !== user.cpf) {
      throw BusinessException.validation('O CPF nao pode ser trocado depois do cadastro. Fale com a Central.');
    }
    const cidade = input.city !== undefined ? await this.validarCidade(input.city) : null;
    await this.garantirUnicos(userId, input.email, input.cpf && !user.cpf ? input.cpf : undefined);

    const meta = metaDe(user);
    try {
      const salvo = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(input.name ? { name: input.name.replace(/\s+/g, ' ').trim() } : {}),
          ...(input.email && input.email !== user.email ? { email: input.email, emailVerifiedAt: null } : {}),
          ...(input.cpf && !user.cpf ? { cpf: input.cpf } : {}),
          ...(input.gender || cidade
            ? {
                metadata: {
                  ...meta,
                  ...(input.gender ? { genero: input.gender } : {}),
                  ...(cidade ? { cidade } : {}),
                } as never,
              }
            : {}),
        },
        include: { driver: { select: { id: true, status: true, isOnline: true } } },
      });
      return this.paraUsuario(salvo);
    } catch (e) {
      throw this.traduzirDuplicado(e);
    }
  }

  /**
   * Esqueci a senha: o codigo que chega no telefone autoriza criar uma
   * senha nova. Ja deixa a pessoa conectada e derruba as outras sessoes.
   */
  async redefinirSenha(params: {
    phone: string;
    code: string;
    newPassword: string;
    device?: DeviceContext;
  }): Promise<AuthResult> {
    const conta = await this.prisma.user.findUnique({ where: { phone: params.phone } });
    if (conta?.role === UserRole.ADMIN) {
      throw BusinessException.forbidden('A senha da Central nao e trocada por codigo.');
    }

    await this.otp.verify({ phone: params.phone, purpose: OtpPurpose.PASSWORD_RESET, code: params.code });

    if (!conta) throw BusinessException.notFound('Nao ha conta com este telefone.');
    this.assertUserActive(conta.status);

    await this.prisma.user.update({
      where: { id: conta.id },
      data: { passwordHash: await hashPassword(params.newPassword), lastLoginAt: new Date() },
    });
    await this.tokens.revokeAllUserTokens(conta.id);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: conta.id },
      include: { driver: { select: { id: true, status: true, isOnline: true } } },
    });
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
    return { ...issued, isNewUser: false, user: this.paraUsuario(user) };
  }

  /** Cidade da lista da Central (nome oficial). Sem lista configurada, aceita o que veio. */
  private async validarCidade(nome?: string): Promise<string | null> {
    if (!nome || !nome.trim()) return null;
    const lista = await lerCidades(this.prisma);
    if (lista.length === 0) return nome.replace(/\s+/g, ' ').trim();
    const oficial = await cidadeAtendida(this.prisma, nome);
    if (!oficial) throw BusinessException.validation('Escolha uma das cidades da lista.');
    return oficial;
  }

  private async garantirUnicos(userId: string, email?: string, cpf?: string): Promise<void> {
    if (email) {
      const dono = await this.prisma.user.findFirst({ where: { email, NOT: { id: userId } }, select: { id: true } });
      if (dono) throw BusinessException.conflict('Este e-mail ja esta em outra conta.', ERROR_CODES.EMAIL_ALREADY_USED);
    }
    if (cpf) {
      const dono = await this.prisma.user.findFirst({ where: { cpf, NOT: { id: userId } }, select: { id: true } });
      if (dono) throw BusinessException.conflict('Este CPF ja esta em outra conta.');
    }
  }

  private traduzirDuplicado(e: unknown): unknown {
    const campo = campoDuplicado(e);
    if (campo === null) return e;
    if (campo.includes('cpf')) return BusinessException.conflict('Este CPF ja esta em outra conta.');
    if (campo.includes('email')) {
      return BusinessException.conflict('Este e-mail ja esta em outra conta.', ERROR_CODES.EMAIL_ALREADY_USED);
    }
    return BusinessException.conflict('Dado ja usado em outra conta.');
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
