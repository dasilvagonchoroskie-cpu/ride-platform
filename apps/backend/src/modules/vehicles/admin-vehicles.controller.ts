import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SoDonoGuard } from '../pracas/so-dono.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createVehicleSchema, paginationSchema, updateVehicleSchema, UserRole } from '@ride/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessException } from '../../common/errors/business.exception';
import { PracasService } from '../pracas/pracas.service';
import { VehiclesService } from './vehicles.service';
import { fotoDoCarroSchema } from './vehicles.controller';

const revisarSchema = z.object({
  aprovar: z.boolean(),
  motivo: z.string().trim().max(300).optional(),
});

/// Carros na Central: lista geral, carros de um motorista, conferir carro
/// novo, cadastrar outro carro, trocar o carro em uso, corrigir e tirar.
@ApiTags('Admin - Veiculos')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminVehiclesController {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly pracas: PracasService,
  ) {}

  @Get('vehicles')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Lista todos os veiculos cadastrados' })
  listVehicles(@Query(new ZodValidationPipe(paginationSchema)) query: never) {
    return this.vehicles.adminListVehicles(query as never);
  }

  @Get('drivers/:id/vehicles')
  @ApiOperation({ summary: 'Carros de um motorista, com a situacao e as fotos' })
  async doMotorista(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.daMinhaCidade(user, id);
    return this.vehicles.carrosDoMotorista(id);
  }

  @Post('drivers/:id/vehicles')
  @ApiOperation({ summary: 'A Central cadastra outro carro para o motorista (ja conferido)' })
  async criar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createVehicleSchema)) body: never,
  ) {
    await this.daMinhaCidade(user, id);
    await this.vehicles.adminCriar(id, user.id, body);
    return this.vehicles.carrosDoMotorista(id);
  }

  @Patch('vehicles/:id/review')
  @ApiOperation({ summary: 'Aprova ou recusa o carro novo (motivo obrigatorio na recusa)' })
  async revisar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(revisarSchema)) body: z.infer<typeof revisarSchema>,
  ) {
    await this.doCarro(user, id);
    return this.vehicles.adminRevisar(id, user.id, body.aprovar, body.motivo);
  }

  @Post('vehicles/:id/usar')
  @ApiOperation({ summary: 'Troca o carro em uso do motorista' })
  async usar(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.doCarro(user, id);
    return this.vehicles.adminUsar(id);
  }

  @Patch('vehicles/:id')
  @ApiOperation({ summary: 'Corrige os dados do carro (inclusive a placa)' })
  async editar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) body: never,
  ) {
    await this.doCarro(user, id);
    return this.vehicles.adminEditar(id, body);
  }

  @Post('vehicles/:id/foto')
  @ApiOperation({ summary: 'Foto do carro ou do CRLV mandada pela Central' })
  async foto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(fotoDoCarroSchema)) body: z.infer<typeof fotoDoCarroSchema>,
  ) {
    await this.doCarro(user, id);
    return this.vehicles.adminFoto(id, user.id, body.tipo, body.mime, body.dados);
  }

  @Delete('vehicles/:id')
  @ApiOperation({ summary: 'Tira o carro do motorista (com corridas no historico ele fica guardado)' })
  async remover(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.doCarro(user, id);
    return this.vehicles.adminRemover(id, user.id);
  }

  private async doCarro(user: AuthenticatedUser, vehicleId: string): Promise<void> {
    const v = await this.vehicles.carroPorId(vehicleId);
    await this.daMinhaCidade(user, v.driverId);
  }

  /** Operador so mexe em motorista da cidade dele (ou ainda sem cidade). */
  private async daMinhaCidade(user: AuthenticatedUser, driverId: string): Promise<void> {
    const praca = await this.pracas.pracaDoMotorista(driverId);
    const minha = await this.pracas.escopoDe(user.id);
    if (minha && praca && praca !== minha) {
      throw BusinessException.forbidden('Este motorista e de outra cidade. Voce so ve e mexe na sua cidade.');
    }
  }
}
