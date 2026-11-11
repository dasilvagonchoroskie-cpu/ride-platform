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

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, OtpService, TokenService, JwtStrategy, DoisFatoresService, AvisosDeSeguranca],
  exports: [AuthService, TokenService, AvisosDeSeguranca, OtpService, DoisFatoresService],
})
export class AuthModule {}
