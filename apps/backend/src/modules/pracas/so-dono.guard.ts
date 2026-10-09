import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UserRole } from '@ride/shared';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PracasService } from './pracas.service';

/**
 * Rota so do dono da Central (tarifas, cupons, comissao, cidades, equipe,
 * limpeza). Operador de cidade recebe "So o dono da Central pode mexer nisto".
 */
@Injectable()
export class SoDonoGuard implements CanActivate {
  constructor(private readonly pracas: PracasService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser; method?: string }>();
    const user = req.user;
    if (!user || user.role !== UserRole.ADMIN) return true; // o RolesGuard ja decidiu
    await this.pracas.exigirDono(user);
    return true;
  }
}

/** So as gravacoes sao do dono; ler (GET) o operador tambem pode. */
@Injectable()
export class DonoGravaGuard implements CanActivate {
  constructor(private readonly pracas: PracasService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser; method?: string }>();
    const user = req.user;
    if (!user || user.role !== UserRole.ADMIN || (req.method ?? 'GET').toUpperCase() === 'GET') return true;
    await this.pracas.exigirDono(user);
    return true;
  }
}
