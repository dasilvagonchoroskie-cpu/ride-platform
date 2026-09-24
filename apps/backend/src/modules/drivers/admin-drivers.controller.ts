import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { listDriversSchema, paginationSchema, reviewDriverSchema, UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DriversService } from './drivers.service';

@ApiTags('Admin - Motoristas')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/drivers')
export class AdminDriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  @ApiOperation({ summary: 'Lista motoristas com filtros e progresso de documentos' })
  list(@Query(new ZodValidationPipe(paginationSchema.merge(listDriversSchema))) query: never) {
    return this.drivers.adminList(query as never);
  }

  @Get('active/map')
  @ApiOperation({ summary: 'Motoristas online com posicao atual (mapa do admin)' })
  activeMap() {
    return this.drivers.adminActiveDrivers();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do motorista com documentos e URLs assinadas' })
  detail(@Param('id') id: string) {
    return this.drivers.adminDetail(id);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Aprova, reprova ou suspende o motorista' })
  review(
    @Param('id') id: string,
    @CurrentUser('id') reviewerId: string,
    @Body(new ZodValidationPipe(reviewDriverSchema)) body: never,
  ) {
    return this.drivers.adminReview(id, reviewerId, body);
  }
}
