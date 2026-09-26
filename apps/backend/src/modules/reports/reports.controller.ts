import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

/** Rotas que a Central ja pedia e o servidor nao tinha (davam 404). */
@ApiTags('Admin - Painel')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('rides/active')
  @ApiOperation({ summary: 'Corridas acontecendo agora' })
  ativas() {
    return this.reports.corridasAtivas();
  }

  @Get('reports/summary')
  @ApiOperation({ summary: 'Resumo financeiro e operacional (horario de Brasilia)' })
  resumo() {
    return this.reports.resumo();
  }
}
