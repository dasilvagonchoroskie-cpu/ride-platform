import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PracasService } from '../pracas/pracas.service';

/** Rotas que a Central ja pedia e o servidor nao tinha (davam 404). */
@ApiTags('Admin - Painel')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly pracas: PracasService,
  ) {}

  @Get('rides/active')
  @ApiOperation({ summary: 'Corridas acontecendo agora (por cidade)' })
  async ativas(@CurrentUser() user: AuthenticatedUser, @Query('praca') praca?: string) {
    return this.reports.corridasAtivas(await this.pracas.ondeCorridas(await this.pracas.filtro(user, praca)));
  }

  @Get('reports/summary')
  @ApiOperation({ summary: 'Resumo financeiro e operacional (horario de Brasilia, por cidade)' })
  async resumo(@CurrentUser() user: AuthenticatedUser, @Query('praca') praca?: string) {
    const filtro = await this.pracas.filtro(user, praca);
    return this.reports.resumo(await this.pracas.ondeCorridas(filtro), await this.pracas.idsDeMotoristas(filtro));
  }
}
