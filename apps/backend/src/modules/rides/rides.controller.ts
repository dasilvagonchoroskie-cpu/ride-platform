import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DriverApprovedGuard } from '../../common/guards/driver-approved.guard';
import { RidesService } from './rides.service';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/errors/business.exception';
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
  @ApiOperation({ summary: 'Quanto custa a corrida antes de chamar (com cupom e horario agendado, se houver)' })
  estimate(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(estimateRideSchema)) body: never) {
    return this.rides.estimar(body, userId);
  }

  @Get('scheduled')
  @ApiOperation({ summary: 'Corridas agendadas do passageiro' })
  scheduled(@CurrentUser('id') userId: string) {
    return this.rides.agendadas(userId);
  }

  @Get('coupons')
  @ApiOperation({ summary: 'Cupons que o passageiro ainda pode usar' })
  coupons(@CurrentUser('id') userId: string) {
    return this.rides.cupons(userId);
  }

  @Get('favoritos')
  @ApiOperation({ summary: 'Motoristas favoritos do passageiro' })
  favoritos(@CurrentUser('id') userId: string) {
    return this.rides.favoritos(userId);
  }

  @Post('favoritos/:driverId')
  @ApiOperation({ summary: 'Favorita um motorista que ja levou o passageiro' })
  favoritar(@CurrentUser('id') userId: string, @Param('driverId', new ParseUUIDPipe()) driverId: string) {
    return this.rides.favoritar(userId, driverId);
  }

  @Delete('favoritos/:driverId')
  @ApiOperation({ summary: 'Tira o motorista dos favoritos' })
  desfavoritar(@CurrentUser('id') userId: string, @Param('driverId', new ParseUUIDPipe()) driverId: string) {
    return this.rides.desfavoritar(userId, driverId);
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

  @Post(':id/rate')
  @ApiOperation({ summary: 'Motorista avalia o passageiro (1 a 5 estrelas)' })
  ratePassenger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(z.object({ score: z.number().int().min(1).max(5), tags: z.array(z.string().max(40)).max(10).optional() })))
    body: { score: number; tags?: string[] },
  ) {
    return this.rides.avaliarPassageiro(user.driverId ?? '', user.id, id, body);
  }

  @Get('history')
  @ApiOperation({ summary: 'Corridas anteriores do motorista' })
  history(@CurrentUser('driverId') driverId: string, @Query(new ZodValidationPipe(listRidesSchema)) query: never) {
    return this.rides.historico(driverId, UserRole.DRIVER, query);
  }
}

const cupomSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,30}$/, 'Codigo com 3 a 30 letras e numeros, sem espacos.'),
  description: z.string().trim().max(200).optional(),
  discountType: z.enum(['PERCENT', 'FIXED']),
  discountValue: z.number().int().min(1).max(100_000),
  maxDiscountCents: z.number().int().min(1).max(100_000).optional(),
  minFareCents: z.number().int().min(0).max(100_000).default(0),
  maxUses: z.number().int().min(1).max(100_000).default(100),
  maxUsesPerUser: z.number().int().min(1).max(100).default(1),
  expiresAt: z.coerce.date().optional(),
});

/** Central: cupons de desconto (o desconto e pago pela plataforma ao motorista). */
@ApiTags('Admin - Cupons')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/coupons')
export class AdminCuponsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Todos os cupons' })
  async listar() {
    return { items: await this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }) };
  }

  @Post()
  @ApiOperation({ summary: 'Cria um cupom' })
  async criar(@Body(new ZodValidationPipe(cupomSchema)) body: z.infer<typeof cupomSchema>) {
    if (body.discountType === 'PERCENT' && body.discountValue > 100) {
      throw BusinessException.validation('Percentual de 1 a 100.');
    }
    const existe = await this.prisma.coupon.findUnique({ where: { code: body.code } });
    if (existe) throw BusinessException.conflict('Ja existe um cupom com este codigo.');
    return this.prisma.coupon.create({ data: body });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Liga ou desliga o cupom' })
  async alterar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(z.object({ isActive: z.boolean() }))) body: { isActive: boolean },
  ) {
    return this.prisma.coupon.update({ where: { id }, data: { isActive: body.isActive } });
  }
}
