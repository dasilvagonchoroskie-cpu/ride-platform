import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createVehicleSchema, updateVehicleSchema, UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { VehiclesService } from './vehicles.service';

@ApiTags('Veiculos do motorista')
@ApiBearerAuth()
@Roles(UserRole.DRIVER, UserRole.ADMIN)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lista os veiculos do motorista autenticado' })
  listMine(@CurrentUser('id') userId: string) {
    return this.vehicles.listMine(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra um veiculo' })
  create(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(createVehicleSchema)) body: never) {
    return this.vehicles.create(userId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um veiculo' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) body: never,
  ) {
    return this.vehicles.update(userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desativa um veiculo' })
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<void> {
    await this.vehicles.remove(userId, id);
  }
}
