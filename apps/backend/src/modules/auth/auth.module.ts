import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { DoisFatoresService } from './dois-fatores';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AvisosDeSeguranca } from './avisos-de-seguranca';
import { GoogleLoginService } from './google-login.service';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, OtpService, TokenService, JwtStrategy, DoisFatoresService, AvisosDeSeguranca, GoogleLoginService],
  exports: [AuthService, TokenService, AvisosDeSeguranca, OtpService, DoisFatoresService, GoogleLoginService],
})
export class AuthModule {}
