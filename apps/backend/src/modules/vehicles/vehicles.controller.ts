import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createVehicleSchema, updateVehicleSchema, UserRole } from '@ride/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { VehiclesService } from './vehicles.service';

export const fotoDoCarroSchema = z.object({
  tipo: z.enum(['FOTO', 'CRLV']),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dados: z.string().min(16).max(3_000_000),
});

@ApiTags('Veiculos do motorista')
@ApiBearerAuth()
@Roles(UserRole.DRIVER, UserRole.ADMIN)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Carros do motorista, com a situacao de cada um (em uso, guardado, para a Central conferir...)' })
  listMine(@CurrentUser('id') userId: string) {
    return this.vehicles.listMine(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra um carro (motorista ja aprovado: a Central confere antes de usar)' })
  create(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(createVehicleSchema)) body: never) {
    return this.vehicles.create(userId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Corrige marca, modelo, ano e cor (outra placa = outro carro)' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) body: never,
  ) {
    return this.vehicles.update(userId, id, body);
  }

  @Post(':id/usar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Passa a trabalhar com este carro (um carro em uso por vez)' })
  usar(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.usar(userId, id);
  }

  @Post(':id/foto')
  @ApiOperation({ summary: 'Foto do carro (de frente, com a placa) ou do CRLV do carro novo' })
  foto(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(fotoDoCarroSchema)) body: z.infer<typeof fotoDoCarroSchema>,
  ) {
    return this.vehicles.foto(userId, id, body.tipo, body.mime, body.dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tira o carro (com corridas no historico ele fica guardado, escondido)' })
  async remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.vehicles.remove(userId, id);
  }
}
