import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ERROR_CODES, DriverStatus } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../errors/business.exception';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Garante que o usuario autenticado e um motorista aprovado.
 * Tambem injeta `driverId` atualizado no request.user.
 */
@Injectable()
export class DriverApprovedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) throw BusinessException.unauthorized();

    const driver = await this.prisma.driver.findUnique({
      where: { userId: user.id },
      select: { id: true, status: true },
    });

    if (!driver) {
      throw BusinessException.forbidden('Cadastro de motorista nao encontrado.');
    }

    if (driver.status !== DriverStatus.APPROVED) {
      throw new BusinessException(
        ERROR_CODES.DRIVER_NOT_APPROVED,
        'Sua conta de motorista ainda nao foi aprovada.',
        403,
      );
    }

    user.driverId = driver.id;
    return true;
  }
}
