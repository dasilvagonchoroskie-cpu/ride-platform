import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DriverApprovedGuard } from '../../common/guards/driver-approved.guard';
import { RidesService } from './rides.service';
import {
  cancelRideSchema,
  estimateRideSchema,
  finishRideSchema,
  listRidesSchema,
  requestRideSchema,
  rideLocationSchema,
} from './dto';
import { z } from 'zod';

const avaliacaoSchema = z.object({
  score: z.number().int().min(1, 'De 1 a 5 estrelas.').max(5, 'De 1 a 5 estrelas.'),
  comment: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

const pertoSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

@ApiTags('Corridas - Passageiro')
@ApiBearerAuth()
// Motorista tambem pode pedir corrida como passageiro (mesma conta).
@Roles(UserRole.PASSENGER, UserRole.DRIVER, UserRole.ADMIN)
@Controller('rides')
export class RidesController {
  constructor(private readonly rides: RidesService) {}

  @Post('estimate')
  @ApiOperation({ summary: 'Quanto custa a corrida, por categoria, antes de chamar' })
  estimate(@Body(new ZodValidationPipe(estimateRideSchema)) body: never) {
    return this.rides.estimar(body);
  }

  @Post()
  @ApiOperation({ summary: 'Chama a corrida e comeca a procurar motorista' })
  request(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(requestRideSchema)) body: never) {
    return this.rides.pedir(userId, body);
  }

  @Get('current')
  @ApiOperation({ summary: 'A corrida em andamento do passageiro' })
  current(@CurrentUser('id') userId: string) {
    return this.rides.atualDoPassageiro(userId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Corridas anteriores do passageiro' })
  history(@CurrentUser('id') userId: string, @Query(new ZodValidationPipe(listRidesSchema)) query: never) {
    return this.rides.historico(userId, UserRole.PASSENGER, query);
  }

  @Get('nearby-drivers')
  @ApiOperation({ summary: 'Carros disponiveis perto do passageiro (posicao aproximada)' })
  nearby(@Query(new ZodValidationPipe(pertoSchema)) q: { lat: number; lng: number }) {
    return this.rides.carrosPerto(q.lat, q.lng);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma corrida (so de quem participa dela)' })
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) rideId: string) {
    return this.rides.acompanharDoPassageiro(user.id, user.role, rideId, user.driverId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancela a corrida (pode gerar multa se o motorista ja saiu)' })
  cancel(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) rideId: string,
    @Body(new ZodValidationPipe(cancelRideSchema)) body: never,
  ) {
    return this.rides.cancelar(userId, UserRole.PASSENGER, rideId, body);
  }

  @Post(':id/rate')
  @ApiOperation({ summary: 'Avalia o motorista (1 a 5 estrelas), uma vez por corrida' })
  rate(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) rideId: string,
    @Body(new ZodValidationPipe(avaliacaoSchema)) body: { score: number; comment?: string; tags?: string[] },
  ) {
    return this.rides.avaliar(userId, rideId, body);
  }
}

@ApiTags('Corridas - Motorista')
@ApiBearerAuth()
@Roles(UserRole.DRIVER, UserRole.ADMIN)
@UseGuards(DriverApprovedGuard)
@Controller('driver/rides')
export class DriverRidesController {
  constructor(private readonly rides: RidesService) {}

  @Get('offers')
  @ApiOperation({ summary: 'Chamados abertos para este motorista' })
  offers(@CurrentUser('driverId') driverId: string) {
    return this.rides.chamados(driverId);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Aceita o chamado (o primeiro a aceitar leva)' })
  accept(@CurrentUser('driverId') driverId: string, @Param('id') rideId: string) {
    return this.rides.aceitar(driverId, rideId);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Recusa o chamado e libera para outro motorista' })
  decline(@CurrentUser('driverId') driverId: string, @Param('id') rideId: string) {
    return this.rides.recusar(driverId, rideId);
  }

  @Post(':id/arriving')
  @ApiOperation({ summary: 'Avisa que saiu em direcao ao passageiro' })
  arriving(
    @CurrentUser('driverId') driverId: string,
    @Param('id') rideId: string,
    @Body(new ZodValidationPipe(rideLocationSchema)) body: never,
  ) {
    return this.rides.aCaminho(driverId, rideId, body);
  }

  @Post(':id/arrived')
  @ApiOperation({ summary: 'Avisa que chegou no ponto de embarque' })
  arrived(
    @CurrentUser('driverId') driverId: string,
    @Param('id') rideId: string,
    @Body(new ZodValidationPipe(rideLocationSchema)) body: never,
  ) {
    return this.rides.cheguei(driverId, rideId, body);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Inicia a viagem com o passageiro a bordo' })
  start(
    @CurrentUser('driverId') driverId: string,
    @Param('id') rideId: string,
    @Body(new ZodValidationPipe(rideLocationSchema)) body: never,
  ) {
    return this.rides.iniciar(driverId, rideId, body);
  }

  @Post(':id/finish')
  @ApiOperation({ summary: 'Encerra a corrida; o servidor recalcula o valor e lanca na carteira' })
  finish(
    @CurrentUser('driverId') driverId: string,
    @Param('id') rideId: string,
    @Body(new ZodValidationPipe(finishRideSchema)) body: never,
  ) {
    return this.rides.finalizar(driverId, rideId, body);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancela a corrida que havia aceitado' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) rideId: string,
    @Body(new ZodValidationPipe(cancelRideSchema)) body: never,
  ) {
    return this.rides.cancelar(user.id, UserRole.DRIVER, rideId, body, user.driverId);
  }

  @Get('current')
  @ApiOperation({ summary: 'A corrida em andamento do motorista' })
  current(@CurrentUser('driverId') driverId: string) {
    return this.rides.atualDoMotorista(driverId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Corridas anteriores do motorista' })
  history(@CurrentUser('driverId') driverId: string, @Query(new ZodValidationPipe(listRidesSchema)) query: never) {
    return this.rides.historico(driverId, UserRole.DRIVER, query);
  }
}
