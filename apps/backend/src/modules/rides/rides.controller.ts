import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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

const pertoSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

@ApiTags('Corridas - Passageiro')
@ApiBearerAuth()
@Roles(UserRole.PASSENGER, UserRole.ADMIN)
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
  @ApiOperation({ summary: 'Detalhe de uma corrida' })
  detail(@Param('id') rideId: string) {
    return this.rides.detalhe(rideId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancela a corrida (pode gerar multa se o motorista ja saiu)' })
  cancel(
    @CurrentUser('id') userId: string,
    @Param('id') rideId: string,
    @Body(new ZodValidationPipe(cancelRideSchema)) body: never,
  ) {
    return this.rides.cancelar(userId, UserRole.PASSENGER, rideId, body);
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
    @CurrentUser('id') userId: string,
    @Param('id') rideId: string,
    @Body(new ZodValidationPipe(cancelRideSchema)) body: never,
  ) {
    return this.rides.cancelar(userId, UserRole.DRIVER, rideId, body);
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
