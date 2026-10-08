import { Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES, OtpPurpose, UserRole, UserStatus } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/errors/business.exception';
import { comparePassword, hashPassword } from '../../common/utils/crypto.util';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TokenService, DeviceContext, IssuedTokens } from './token.service';
import { OtpService } from './otp.service';
import { acharContaComOsMesmosDados, DadosDaPessoa, liberarTelefoneDeContaVazia } from './conta-existente';
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

/** Conta criada pelo e-mail ainda sem telefone (o campo e obrigatorio e unico). */
const PREFIXO_PROVISORIO = 'pend-';

function telefoneProvisorio(): string {
  return `${PREFIXO_PROVISORIO}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function telefonePendente(phone: string | null | undefined): boolean {
  return !phone || phone.startsWith(PREFIXO_PROVISORIO);
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
    /** Entrou pelo e-mail e ainda nao informou o telefone. */
    telefonePendente: boolean;
  };
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
  ) {}

  async requestOtp(params: { phone?: string; email?: string; purpose: OtpPurpose }, ip?: string, chaveTeste?: string) {
    return this.otp.request({ phone: params.phone, email: params.email, purpose: params.purpose }, ip, chaveTeste);
  }

  // ------------------------------------------------------------------
  // Usar a conta que a pessoa ja tem (ex.: a de passageiro) no app do
  // motorista: o cadastro recusa com CONTA_EXISTENTE, o app pede um codigo
  // enviado a ESSA conta e, com ele, entra nela e continua o cadastro.
  // ------------------------------------------------------------------

  private async contaParaVincular(userId: string, dados: DadosDaPessoa) {
    const conta = await acharContaComOsMesmosDados(this.prisma, userId, dados);
    if (!conta) throw BusinessException.notFound('Nenhuma outra conta com estes dados.');
    // O codigo vai para o e-mail da conta (sem SMS); sem e-mail, pelo telefone.
    const alvo: { phone?: string; email?: string } = conta.email ? { email: conta.email } : conta.phone && !conta.phone.startsWith('pend-') ? { phone: conta.phone } : {};
    if (!alvo.phone && !alvo.email) throw BusinessException.validation('Essa conta nao tem telefone nem e-mail para receber o codigo.');
    return { conta, alvo };
  }

  async pedirCodigoVinculo(userId: string, dados: DadosDaPessoa, ip?: string, chaveTeste?: string) {
    const { conta, alvo } = await this.contaParaVincular(userId, dados);
    const r = await this.otp.request({ ...alvo, purpose: 'LOGIN' as OtpPurpose }, ip, chaveTeste);
    // Sem SMS, o codigo do telefone vai para o e-mail da conta: diz para onde foi.
    return { ...r, destino: r.destino ?? conta.destino };
  }

  async entrarNaContaVinculada(
    userId: string,
    dados: DadosDaPessoa,
    code: string,
    device?: DeviceContext,
    chaveTeste?: string,
  ): Promise<AuthResult> {
    const { alvo } = await this.contaParaVincular(userId, dados);
    return this.verifyOtp({ ...alvo, code, purpose: 'LOGIN' as OtpPurpose, role: UserRole.DRIVER, device, chaveTeste });
  }

  /** Canais de entrada que funcionam agora (telefone so com SMS ou em teste). */
  canaisDeLogin() {
    return this.otp.canais();
  }

  /** Login por OTP: cria a conta na primeira entrada (entra pelo telefone, sem senha). */
  async verifyOtp(params: {
    phone?: string;
    email?: string;
    code: string;
    purpose: OtpPurpose;
    role: UserRole;
    device?: DeviceContext;
    chaveTeste?: string;
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
    // Por e-mail com envio de verdade, o codigo prova que a pessoa e dona do
    // endereco — ai a Central pode entrar por codigo tambem.
    if (existing?.role === UserRole.ADMIN) {
      const provado =
        !!params.email && (this.otp.entregaReal({ email: params.email }) || this.otp.chaveTesteValida(params.chaveTeste));
      if (!provado) {
        throw BusinessException.forbidden('A conta da Central entra com o codigo enviado ao e-mail ou com a senha.');
      }
    }

    // Passageiro que abre o aplicativo do motorista vira motorista (a mesma
    // conta continua pedindo corridas no aplicativo do passageiro).
    const viraMotorista = role === UserRole.DRIVER && existing?.role === UserRole.PASSENGER;

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            ...(viraMotorista ? { role: UserRole.DRIVER } : {}),
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
            name: `${role === UserRole.DRIVER ? 'Motorista' : 'Passageiro'}${params.phone ? ` ${params.phone.slice(-4)}` : ''}`,
            phone: params.phone ?? telefoneProvisorio(),
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
    // Antes buscava o usuario pelo proprio token de acesso (nunca achava):
    // a renovacao do login falhava sempre e o app travava em 7 dias.
    const { userId, ...issued } = await this.tokens.rotateRefreshToken(refreshToken, device);
    const me = await this.me(userId);

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

  /** Ver o controlador: so conta nova, vazia, criada ha menos de 30 min. */
  async desfazerContaNova(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driver: { select: { id: true } }, _count: { select: { ridesAsPassenger: true, payments: true, ratingsGiven: true } } },
    });
    if (!u) return;
    const minutos = (Date.now() - u.createdAt.getTime()) / 60_000;
    const usada = u._count.ridesAsPassenger + u._count.payments + u._count.ratingsGiven > 0;
    if (u.role === UserRole.ADMIN || u.driver || usada || minutos > 30) {
      throw BusinessException.validation('Esta conta ja tem uso e nao pode ser desfeita. Toque em Sair para trocar de numero.');
    }
    await this.prisma.user.delete({ where: { id: userId } });
    this.logger.log(`Conta nova desfeita (numero digitado errado): ${userId}`);
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
      phone: telefonePendente(user.phone) ? '' : user.phone,
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
      telefonePendente: telefonePendente(user.phone),
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
    input: { name: string; email: string; gender: Genero; cpf: string; password: string; city?: string; phone?: string },
  ): Promise<AuthResult['user']> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw BusinessException.notFound('Usuario nao encontrado.');
    if (user.role !== UserRole.PASSENGER && user.role !== UserRole.DRIVER) {
      throw BusinessException.forbidden('Este cadastro e so para passageiros.');
    }
    const novoTelefone = await this.validarTelefoneNovo(userId, user.phone, input.phone);
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
          ...(novoTelefone ? { phone: novoTelefone, phoneVerifiedAt: null } : {}),
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
    input: { name?: string; email?: string; gender?: Genero; city?: string; cpf?: string; phone?: string },
  ): Promise<AuthResult['user']> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw BusinessException.notFound('Usuario nao encontrado.');
    const novoTelefone = input.phone ? await this.validarTelefoneNovo(userId, user.phone, input.phone) : null;

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
          ...(novoTelefone ? { phone: novoTelefone, phoneVerifiedAt: null } : {}),
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
    phone?: string;
    email?: string;
    code: string;
    newPassword: string;
    device?: DeviceContext;
    chaveTeste?: string;
  }): Promise<AuthResult> {
    const conta = await this.prisma.user.findFirst({
      where: params.phone ? { phone: params.phone } : { email: params.email },
    });
    if (conta?.role === UserRole.ADMIN) {
      const provado =
        !!params.email && (this.otp.entregaReal({ email: params.email }) || this.otp.chaveTesteValida(params.chaveTeste));
      if (!provado) throw BusinessException.forbidden('A senha da Central so e trocada pelo codigo enviado ao e-mail.');
    }

    await this.otp.verify({
      phone: params.phone,
      email: params.email,
      purpose: OtpPurpose.PASSWORD_RESET,
      code: params.code,
    });

    if (!conta) throw BusinessException.notFound(params.phone ? 'Nao ha conta com este telefone.' : 'Nao ha conta com este e-mail.');
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

  /**
   * Telefone de quem entrou pelo e-mail. Obrigatorio enquanto a conta nao
   * tem telefone; depois disso so muda pela Central.
   */
  private async validarTelefoneNovo(userId: string, atual: string, novo?: string): Promise<string | null> {
    if (!telefonePendente(atual)) {
      if (novo && novo !== atual) {
        throw BusinessException.validation('O telefone nao pode ser trocado por aqui. Fale com a Central.');
      }
      return null;
    }
    if (!novo) throw BusinessException.validation('Informe o seu telefone com DDD.');
    const dono = await this.prisma.user.findFirst({ where: { phone: novo, NOT: { id: userId } }, select: { id: true } });
    if (dono && !(await liberarTelefoneDeContaVazia(this.prisma, novo, userId))) {
      throw BusinessException.conflict('Este telefone ja esta em outra conta.', ERROR_CODES.PHONE_ALREADY_USED);
    }
    return novo;
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
    if (campo.includes('phone')) {
      return BusinessException.conflict('Este telefone ja esta em outra conta.', ERROR_CODES.PHONE_ALREADY_USED);
    }
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
