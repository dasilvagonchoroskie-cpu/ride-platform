import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@ride/shared';
import { AppConfigService } from '../../../config/app-config.service';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { SessoesService } from '../sessoes.service';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  name: string;
  phone: string;
  email?: string | null;
  driverId?: string | null;
  deviceId?: string | null;
  type: 'access';
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly sessoes: SessoesService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Sessao cortada (aparelho perdido/vendido) ou conta bloqueada: cai na hora.
    if (!(await this.sessoes.acessoValido(payload.sub, payload.iat, payload.deviceId))) {
      throw new UnauthorizedException('Sessao encerrada. Entre de novo.');
    }
    return {
      id: payload.sub,
      role: payload.role,
      name: payload.name,
      phone: payload.phone,
      email: payload.email ?? null,
      driverId: payload.driverId ?? null,
      deviceId: payload.deviceId ?? null,
    };
  }
}
