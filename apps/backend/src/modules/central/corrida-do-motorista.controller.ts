import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ponto } from './central.controller';
import { CentralService } from './central.service';
import type { CorridaDoMotorista } from './central.service';

const buscarSchema = z.object({ contato: z.string().trim().min(5).max(120) });

const corridaSchema = z.object({
  contato: z.string().trim().min(5).max(120),
  passengerName: z.string().trim().min(2).max(120).optional(),
  pickup: ponto,
  dropoff: ponto.optional(),
});

/**
 * Corrida manual lancada pelo proprio motorista (Evandro, 09/10/2026):
 * passageiro que chamou na rua ou ligou para ele. A comissao da Central e
 * cobrada igual as outras corridas.
 */
@ApiTags('driver-rides')
@ApiBearerAuth()
@Roles(UserRole.DRIVER)
@Controller('driver/manual-rides')
export class CorridaDoMotoristaController {
  constructor(private readonly central: CentralService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('buscar-passageiro')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confere se o telefone/e-mail tem conta (devolve so o primeiro nome)' })
  buscar(@Body(new ZodValidationPipe(buscarSchema)) body: { contato: string }) {
    return this.central.buscarPassageiroParaMotorista(body.contato);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'Abre a corrida manual ja com este motorista no local de embarque' })
  criar(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(corridaSchema)) body: CorridaDoMotorista) {
    return this.central.criarCorridaDoMotorista(user.id, body);
  }
}
