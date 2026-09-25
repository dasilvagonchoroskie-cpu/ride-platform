import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { paginationSchema, UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { VehiclesService } from './vehicles.service';

/// Modalidade unica: a administracao de categoria e tarifa por categoria
/// saiu daqui. Precos agora sao as duas bandeiras, em /admin/tariffs.
@ApiTags('Admin - Veiculos')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminVehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'Lista todos os veiculos cadastrados' })
  listVehicles(@Query(new ZodValidationPipe(paginationSchema)) query: never) {
    return this.vehicles.adminListVehicles(query as never);
  }
}
