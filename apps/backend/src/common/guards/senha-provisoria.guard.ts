import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, UserRole } from '@ride/shared';
import { BusinessException } from '../errors/business.exception';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PracasService } from '../../modules/pracas/pracas.service';

/**
 * Operador da Central com senha provisoria (etapa 7): so consegue entrar,
 * ver quem e e trocar a senha. Todo o resto responde SENHA_PROVISORIA ate a
 * troca — a Central abre a tela "Troque a sua senha".
 */
@Injectable()
export class SenhaProvisoriaGuard implements CanActivate {
  constructor(private readonly pracas: PracasService) {}

  static readonly LIVRES = [/^\/api\/auth\//, /^\/api\/health/, /^\/api\/app\/config/, /^\/api\/legal\//, /^\/api\/admin\/eu$/];

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser; originalUrl?: string; url?: string }>();
    const user = req.user;
    if (!user || user.role !== UserRole.ADMIN) return true;
    const caminho = (req.originalUrl ?? req.url ?? '').split('?')[0];
    if (SenhaProvisoriaGuard.LIVRES.some((r) => r.test(caminho))) return true;
    if (!(await this.pracas.senhaProvisoria(user.id))) return true;
    throw new BusinessException(
      ERROR_CODES.SENHA_PROVISORIA,
      'Troque a senha provisoria antes de usar a Central.',
      HttpStatus.FORBIDDEN,
    );
  }
}
