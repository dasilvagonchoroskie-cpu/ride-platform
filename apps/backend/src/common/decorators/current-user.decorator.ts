import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@ride/shared';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  email?: string | null;
  driverId?: string | null;
  deviceId?: string | null;
}

/** Injeta o usuario autenticado (ou um campo especifico dele) no handler. */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
