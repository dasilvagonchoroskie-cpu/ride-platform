import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  loginPasswordSchema,
  logoutSchema,
  refreshTokenSchema,
  registerPasswordSchema,
  requestOtpSchema,
  verifyOtpSchema,
  acceptTermsSchema,
  AcceptTermsInput,
  deviceInfoSchema,
  DeviceInfoInput,
  UserRole,
  cpfSchema,
  emailSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
} from '@ride/shared';
import { z } from 'zod';
import { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { getClientIp, getUserAgent } from '../../common/utils/request.util';
import { AuthService, AuthResult, Genero } from './auth.service';

const generoSchema = z.enum(['FEMININO', 'MASCULINO', 'OUTRO', 'NAO_INFORMAR'], {
  errorMap: () => ({ message: 'Selecione o genero.' }),
});

/** "Nome e sobrenome", igual ao do CPF: pelo menos duas palavras. */
const nomeCompletoSchema = nameSchema.refine(
  (v) => v.split(/\s+/).filter((p) => p.length >= 2).length >= 2,
  'Informe nome e sobrenome.',
);

const cidadeSchema = z.string().trim().min(2, 'Escolha a cidade.').max(60);

const cadastroSchema = z.object({
  name: nomeCompletoSchema,
  email: emailSchema,
  gender: generoSchema,
  cpf: cpfSchema,
  password: passwordSchema,
  city: cidadeSchema.optional(),
  phone: phoneSchema.optional(),
});

const perfilSchema = z
  .object({
    name: nomeCompletoSchema.optional(),
    email: emailSchema.optional(),
    gender: generoSchema.optional(),
    city: cidadeSchema.optional(),
    cpf: cpfSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Nada para atualizar.' });

const redefinirSchema = z
  .object({
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    code: z.string().trim().regex(/^\d{4,8}$/, 'Codigo invalido.'),
    newPassword: passwordSchema,
    device: deviceInfoSchema.optional(),
  })
  .refine((d) => Boolean(d.phone) !== Boolean(d.email), { message: 'Informe o telefone ou o e-mail.', path: ['phone'] });

/** Os mesmos dados que o app mandou no cadastro de motorista. */
const vinculoSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  cpf: z.string().regex(/^\d{11}$/).optional(),
  cnhNumber: z.string().regex(/^\d{9,11}$/).optional(),
  phone: z.string().regex(/^\+55\d{10,11}$/).optional(),
});

@ApiTags('Autenticacao')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicita codigo OTP por SMS ou e-mail' })
  requestOtp(
    @Body(new ZodValidationPipe(requestOtpSchema)) body: { phone?: string; email?: string; purpose: string },
    @Req() req: Request,
    @Headers('x-chave-teste') chaveTeste?: string,
  ) {
    return this.auth.requestOtp(
      { phone: body.phone, email: body.email, purpose: body.purpose as never },
      getClientIp(req),
      chaveTeste,
    );
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valida o OTP e autentica (cria a conta se nao existir)' })
  verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema))
    body: { phone?: string; email?: string; code: string; purpose: string; role: UserRole; device?: DeviceInfoInput },
    @Req() req: Request,
    @Headers('x-chave-teste') chaveTeste?: string,
  ): Promise<AuthResult> {
    return this.auth.verifyOtp({
      chaveTeste,
      phone: body.phone,
      email: body.email,
      code: body.code,
      purpose: body.purpose as never,
      role: body.role,
      device: body.device
        ? { ...body.device, ip: getClientIp(req), userAgent: getUserAgent(req) }
        : undefined,
    });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/register')
  @ApiOperation({ summary: 'Cadastro com telefone e senha' })
  register(
    @Body(new ZodValidationPipe(registerPasswordSchema))
    body: { phone: string; name: string; email?: string; password: string },
    @Req() req: Request,
  ): Promise<AuthResult> {
    return this.auth.registerWithPassword({
      ...body,
      device: { deviceId: 'web', platform: 'WEB' as never, ip: getClientIp(req), userAgent: getUserAgent(req) },
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login com telefone/e-mail e senha' })
  login(
    @Body(new ZodValidationPipe(loginPasswordSchema))
    body: { phone?: string; email?: string; password: string; device?: DeviceInfoInput },
    @Req() req: Request,
  ): Promise<AuthResult> {
    return this.auth.loginWithPassword({
      phone: body.phone,
      email: body.email,
      password: body.password,
      device: body.device
        ? { ...body.device, ip: getClientIp(req), userAgent: getUserAgent(req) }
        : undefined,
    });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Esqueci a senha: codigo do telefone + senha nova (ja entra na conta)' })
  resetPassword(
    @Body(new ZodValidationPipe(redefinirSchema))
    body: { phone?: string; email?: string; code: string; newPassword: string; device?: DeviceInfoInput },
    @Req() req: Request,
    @Headers('x-chave-teste') chaveTeste?: string,
  ): Promise<AuthResult> {
    return this.auth.redefinirSenha({
      chaveTeste,
      phone: body.phone,
      email: body.email,
      code: body.code,
      newPassword: body.newPassword,
      device: body.device ? { ...body.device, ip: getClientIp(req), userAgent: getUserAgent(req) } : undefined,
    });
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('cadastro')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cadastro do passageiro: nome, e-mail, genero, CPF, senha e cidade (uma vez)' })
  cadastro(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(cadastroSchema))
    body: { name: string; email: string; gender: Genero; cpf: string; password: string; city?: string; phone?: string },
  ) {
    return this.auth.concluirCadastro(user.id, body);
  }

  @ApiBearerAuth()
  @Patch('perfil')
  @ApiOperation({ summary: 'Meus dados: nome, e-mail, genero e cidade (CPF so se ainda nao tiver)' })
  perfil(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(perfilSchema))
    body: { name?: string; email?: string; gender?: Genero; city?: string; cpf?: string; phone?: string },
  ) {
    return this.auth.atualizarPerfil(user.id, body);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renova o par de tokens (rotacao de refresh token)' })
  refresh(@Body(new ZodValidationPipe(refreshTokenSchema)) body: { refreshToken: string }): Promise<AuthResult> {
    return this.auth.refresh(body.refreshToken);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('vincular-conta/codigo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manda o codigo para a conta que ja tem os mesmos dados (usar a mesma conta no app do motorista)' })
  pedirCodigoVinculo(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(vinculoSchema)) body: { email?: string; cpf?: string; cnhNumber?: string; phone?: string },
    @Req() req: Request,
    @Headers('x-chave-teste') chaveTeste?: string,
  ) {
    return this.auth.pedirCodigoVinculo(user.id, body, getClientIp(req), chaveTeste);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('vincular-conta/entrar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confere o codigo e entra na conta que ja existe' })
  entrarNaContaVinculada(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(vinculoSchema.extend({ code: z.string().regex(/^\d{4,8}$/, 'Codigo invalido.') })))
    body: { email?: string; cpf?: string; cnhNumber?: string; phone?: string; code: string },
    @Req() req: Request,
    @Headers('x-chave-teste') chaveTeste?: string,
  ): Promise<AuthResult> {
    return this.auth.entrarNaContaVinculada(
      user.id,
      body,
      body.code,
      { deviceId: 'vinculo-de-conta', platform: 'ANDROID' as never, ip: getClientIp(req), userAgent: getUserAgent(req) },
      chaveTeste,
    );
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Encerra a sessao atual (ou todas)' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(logoutSchema)) body: { refreshToken?: string; fcmToken?: string; allDevices: boolean },
  ): Promise<void> {
    await this.auth.logout(user.id, body.refreshToken, body.fcmToken, body.allDevices);
  }

  @ApiBearerAuth()
  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Troca a senha do usuario autenticado' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Retorna o usuario autenticado' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  @ApiBearerAuth()
  @Post('accept-terms')
  @ApiOperation({ summary: 'Registra o aceite dos Termos de Uso / Politica de Privacidade' })
  acceptTerms(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(acceptTermsSchema)) body: AcceptTermsInput,
  ) {
    return this.auth.acceptTerms(user.id, body.version);
  }

  @ApiBearerAuth()
  @Post('devices')
  @ApiOperation({ summary: 'Registra/atualiza o dispositivo e o token de push' })
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(deviceInfoSchema)) body: DeviceInfoInput,
  ) {
    return this.auth.registerDevice(user, {
      deviceId: body.deviceId,
      platform: body.platform as never,
      appVersion: body.appVersion,
      model: body.model,
      osVersion: body.osVersion,
      fcmToken: body.fcmToken ?? body.pushToken,
    });
  }
}
