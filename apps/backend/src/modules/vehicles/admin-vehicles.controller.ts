import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createVehicleCategorySchema,
  paginationSchema,
  updateVehicleCategorySchema,
  UserRole,
} from '@ride/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { VehiclesService } from './vehicles.service';

const fareSchema = z.object({
  baseFareCents: z.number().int().min(0),
  perKmCents: z.number().int().min(0),
  perMinuteCents: z.number().int().min(0),
  minFareCents: z.number().int().min(0),
  bookingFeeCents: z.number().int().min(0).optional(),
  cancellationFeeCents: z.number().int().min(0).optional(),
  waitingPerMinuteCents: z.number().int().min(0).optional(),
  surgeEnabled: z.boolean().optional(),
  maxSurgeMultiplier: z.number().min(1).max(10).optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
});

@ApiTags('Admin - Categorias e tarifas')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminVehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('vehicle-categories')
  @ApiOperation({ summary: 'Lista todas as categorias com historico de tarifas' })
  listCategories() {
    return this.vehicles.adminListCategories();
  }

  @Post('vehicle-categories')
  @ApiOperation({ summary: 'Cria uma categoria de veiculo' })
  createCategory(@Body(new ZodValidationPipe(createVehicleCategorySchema)) body: never) {
    return this.vehicles.adminCreateCategory(body);
  }

  @Patch('vehicle-categories/:id')
  @ApiOperation({ summary: 'Atualiza uma categoria' })
  updateCategory(@Param('id') id: string, @Body(new ZodValidationPipe(updateVehicleCategorySchema)) body: never) {
    return this.vehicles.adminUpdateCategory(id, body);
  }

  @Put('vehicle-categories/:id/fare')
  @ApiOperation({ summary: 'Define a tarifa vigente da categoria (valores em centavos)' })
  upsertFare(@Param('id') id: string, @Body(new ZodValidationPipe(fareSchema)) body: never) {
    return this.vehicles.adminUpsertFare(id, body as never);
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'Lista todos os veiculos cadastrados' })
  listVehicles(@Query(new ZodValidationPipe(paginationSchema)) query: never) {
    return this.vehicles.adminListVehicles(query as never);
  }
}
