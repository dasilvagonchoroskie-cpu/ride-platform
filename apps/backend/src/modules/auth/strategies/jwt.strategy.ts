import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@ride/shared';
import { AppConfigService } from '../../../config/app-config.service';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

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
  constructor(config: AppConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.accessSecret,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
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
