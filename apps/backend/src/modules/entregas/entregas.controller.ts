import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PracasService } from '../pracas/pracas.service';
import { DonoGravaGuard } from '../pracas/so-dono.guard';
import { VEICULOS } from './entregas.regras';
import { EntregasService } from './entregas.service';

const pontoSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const configSchema = z.object({
  praca: z.string().trim().min(1).max(80),
  ligada: z.boolean(),
  veiculos: z.enum(VEICULOS),
});

/** App do cliente: mostra o botao "Entrega" so onde esta ligada. */
@ApiTags('Entregas')
@ApiBearerAuth()
@Controller('entregas')
export class EntregasController {
  constructor(private readonly entregas: EntregasService) {}

  @Get('disponivel')
  @ApiOperation({ summary: 'Entrega ligada na cidade deste ponto (coleta)? E com quais veiculos' })
  disponivel(@Query(new ZodValidationPipe(pontoSchema)) q: { lat: number; lng: number }) {
    return this.entregas.disponivel({ latitude: q.lat, longitude: q.lng });
  }
}

/** Central: pedidos de entrega da cidade e liberar codigo (dono e operador da cidade). */
@ApiTags('Admin - Entregas')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/entregas')
export class AdminEntregasController {
  constructor(
    private readonly entregas: EntregasService,
    private readonly pracas: PracasService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Pedidos de entrega (da cidade escolhida, ou da cidade do operador), com o status' })
  async listar(@CurrentUser() user: AuthenticatedUser, @Query('praca') praca?: string, @Query('status') status?: string) {
    return this.entregas.listarParaCentral(await this.pracas.filtro(user, praca), status);
  }

  @Post(':rideId/liberar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Codigo errado 5 vezes: libera mais 5 tentativas (a Central conferiu com quem recebe)' })
  async liberar(@CurrentUser() user: AuthenticatedUser, @Param('rideId', ParseUUIDPipe) rideId: string) {
    await this.entregas.liberarTentativas(rideId, user.id, await this.pracas.escopoDe(user.id));
    return { liberada: true };
  }
}

/** Central: liga e desliga a entrega por cidade (so o dono grava; o operador ve). */
@ApiTags('Admin - Entregas')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(DonoGravaGuard)
@Controller('admin/entregas-config')
export class AdminEntregasConfigController {
  constructor(private readonly entregas: EntregasService) {}

  @Get()
  @ApiOperation({ summary: 'Entrega ligada ou desligada em cada cidade, e com quais veiculos' })
  config() {
    return this.entregas.lerConfig();
  }

  @Put()
  @ApiOperation({ summary: 'Liga ou desliga a entrega numa cidade (carro, moto ou os dois)' })
  gravar(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(configSchema)) body: { praca: string; ligada: boolean; veiculos: 'CARRO' | 'MOTO' | 'TODOS' },
  ) {
    return this.entregas.gravarConfig(body.praca, { ligada: body.ligada, veiculos: body.veiculos }, adminId);
  }
}
