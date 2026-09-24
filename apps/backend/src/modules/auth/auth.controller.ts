import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req } from '@nestjs/common';
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
  deviceInfoSchema,
  DeviceInfoInput,
  UserRole,
} from '@ride/shared';
import { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { getClientIp, getUserAgent } from '../../common/utils/request.util';
import { AuthService, AuthResult } from './auth.service';

@ApiTags('Autenticacao')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicita codigo OTP por SMS ou e-mail' })
  requestOtp(@Body(new ZodValidationPipe(requestOtpSchema)) body: { phone?: string; email?: string; purpose: string }, @Req() req: Request) {
    return this.auth.requestOtp(
      { phone: body.phone, email: body.email, purpose: body.purpose as never },
      getClientIp(req),
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
  ): Promise<AuthResult> {
    return this.auth.verifyOtp({
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
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renova o par de tokens (rotacao de refresh token)' })
  refresh(@Body(new ZodValidationPipe(refreshTokenSchema)) body: { refreshToken: string }): Promise<AuthResult> {
    return this.auth.refresh(body.refreshToken);
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
