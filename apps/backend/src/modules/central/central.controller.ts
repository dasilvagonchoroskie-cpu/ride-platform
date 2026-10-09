import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PayoutStatus, UserStatus } from '@prisma/client';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { PracasService } from '../pracas/pracas.service';
import { SoDonoGuard } from '../pracas/so-dono.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CentralService } from './central.service';
import type { CorridaManual } from './central.service';

const ponto = z.object({
  address: z.string().trim().min(3).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const corridaManualSchema = z.object({
  passengerName: z.string().trim().min(2).max(120),
  passengerPhone: z.string().trim().min(10).max(20),
  pickup: ponto,
  dropoff: ponto,
  category: z.string().trim().toUpperCase().max(20).default('CARRO'),
  paymentMethodType: z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD']).default('CASH'),
  driverId: z.string().uuid().optional(),
  scheduledFor: z.coerce.date().optional(),
});

const financeiroSchema = z.object({
  financeModel: z.enum(['PADRAO', 'PERCENTUAL', 'TAXA_FIXA', 'MENSALIDADE']),
  commissionPercent: z.number().min(0).max(100).optional(),
  fixedFeeCents: z.number().int().min(1).max(100_000).optional(),
  monthlyFeeCents: z.number().int().min(1).max(10_000_000).optional(),
});

const coordsSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

/** Painel da Central: visao geral, despacho, motoristas, passageiros, saques e SOS. */
@ApiTags('Admin - Central')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminCentralController {
  constructor(
    private readonly central: CentralService,
    private readonly pracas: PracasService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Indicadores do mapa: corridas ativas, concluidas hoje, motoristas, faturamento (por cidade)' })
  async overview(@CurrentUser() user: AuthenticatedUser, @Query('praca') praca?: string) {
    return this.central.visaoGeral(await this.pracas.filtro(user, praca));
  }

  @Post('rides')
  @ApiOperation({ summary: 'Cria corrida pedida por telefone' })
  async criar(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(corridaManualSchema)) body: CorridaManual) {
    await this.pracas.exigirAcesso(user, (await this.pracas.doPonto(body.pickup))?.id ?? null);
    if (body.driverId) await this.pracas.exigirAcesso(user, await this.pracas.pracaDoMotorista(body.driverId));
    return this.central.criarCorridaManual(user.id, body);
  }

  @Post('rides/:id/assign')
  @ApiOperation({ summary: 'Envia (ou reenvia) a corrida para um motorista especifico' })
  async atribuir(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(z.object({ driverId: z.string().uuid() }))) body: { driverId: string },
  ) {
    await this.pracas.exigirAcesso(user, await this.pracas.pracaDaCorrida(id));
    await this.pracas.exigirAcesso(user, await this.pracas.pracaDoMotorista(body.driverId));
    return this.central.atribuir(user.id, id, body.driverId);
  }

  @Post('rides/:id/cancel')
  @ApiOperation({ summary: 'Central cancela a corrida (sem multa)' })
  async cancelar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(z.object({ reason: z.string().trim().max(300).default('') }))) body: { reason: string },
  ) {
    await this.pracas.exigirAcesso(user, await this.pracas.pracaDaCorrida(id));
    return this.central.cancelar(user.id, id, body.reason);
  }

  @Get('dispatch/drivers')
  @ApiOperation({ summary: 'Motoristas online (todos=1: tambem os offline, na ultima posicao), do mais perto ao mais longe' })
  async livres(
    @CurrentUser() user: AuthenticatedUser,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('todos') todos?: string,
    @Query('praca') praca?: string,
  ) {
    return this.central.livresPerto(
      Number(lat) || 0,
      Number(lng) || 0,
      todos === '1' || todos === 'true',
      await this.pracas.filtro(user, praca),
    );
  }

  @Patch('drivers/:id/finance')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Modelo financeiro do motorista (%, taxa fixa ou mensalidade) — so o dono' })
  financeiro(@Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(financeiroSchema)) body: never) {
    return this.central.modeloFinanceiro(id, body);
  }

  @Patch('drivers/:id/category')
  @ApiOperation({ summary: 'Categoria do veiculo do motorista' })
  async categoria(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(z.object({ category: z.string().trim().toUpperCase().min(2).max(20) }))) body: { category: string },
  ) {
    await this.pracas.exigirAcesso(user, await this.pracas.pracaDoMotorista(id));
    return this.central.categoriaDoVeiculo(id, body.category);
  }

  @Get('passengers')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Passageiros, com busca por nome ou telefone' })
  passageiros(@Query('search') search?: string, @Query('status') status?: string) {
    const st = status === 'BLOCKED' || status === 'ACTIVE' ? (status as UserStatus) : undefined;
    return this.central.passageiros(search, st);
  }

  @Get('passengers/:id/history')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Historico de bloqueios e desbloqueios' })
  historico(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.central.historicoDoUsuario(id);
  }

  @Patch('passengers/:id/block')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Bloqueia ou desbloqueia o passageiro (motivo obrigatorio)' })
  bloquear(
    @CurrentUser('id') adminId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(z.object({ blocked: z.boolean(), reason: z.string().trim().min(3).max(300) })))
    body: { blocked: boolean; reason: string },
  ) {
    return this.central.bloquearPassageiro(adminId, id, body.blocked, body.reason);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Pedidos de saque PIX dos motoristas' })
  async saques(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string, @Query('praca') praca?: string) {
    const ok = ['REQUESTED', 'PROCESSING', 'PAID', 'FAILED'].includes(status ?? '');
    return this.central.saques(ok ? (status as PayoutStatus) : undefined, await this.pracas.filtro(user, praca));
  }

  @Patch('payouts/:id')
  @ApiOperation({ summary: 'Confirma que o PIX foi feito (desconta da carteira) ou recusa' })
  async decidir(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(z.object({ paid: z.boolean(), reason: z.string().trim().max(300).optional() })))
    body: { paid: boolean; reason?: string },
  ) {
    const p = await this.prisma.payout.findUnique({ where: { id }, select: { driverId: true } });
    if (p) await this.pracas.exigirAcesso(user, await this.pracas.pracaDoMotorista(p.driverId));
    return this.central.decidirSaque(user.id, id, body.paid, body.reason);
  }

  @Get('reports/finance')
  @ApiOperation({ summary: 'Receitas: dinheiro x PIX/aplicativo, comissao, cupons e saques (por cidade)' })
  async relatorio(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string, @Query('praca') praca?: string) {
    return this.central.financeiro(Math.min(Math.max(Number(days) || 1, 1), 366), await this.pracas.filtro(user, praca));
  }

  @Get('safety')
  @ApiOperation({ summary: 'Alertas de SOS (abertos ou resolvidos)' })
  async alertas(@CurrentUser() user: AuthenticatedUser, @Query('resolved') resolved?: string, @Query('praca') praca?: string) {
    return this.central.alertas(resolved === 'true', await this.pracas.filtro(user, praca));
  }

  @Patch('safety/:id/resolve')
  @ApiOperation({ summary: 'Encerra o alerta de SOS' })
  async resolver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(z.object({ note: z.string().trim().max(300).default('') }))) body: { note: string },
  ) {
    const e = await this.prisma.safetyEvent.findUnique({ where: { id }, select: { latitude: true, longitude: true } });
    if (e?.latitude != null && e.longitude != null) {
      await this.pracas.exigirAcesso(user, (await this.pracas.doPonto({ latitude: e.latitude, longitude: e.longitude }))?.id ?? null);
    }
    return this.central.resolverSos(user.id, id, body.note);
  }
}

/** SOS: qualquer pessoa logada (passageiro ou motorista) pode acionar. */
@ApiTags('Seguranca')
@ApiBearerAuth()
@Controller('safety')
export class SafetyController {
  constructor(private readonly central: CentralService) {}

  @Post('sos')
  @ApiOperation({ summary: 'Aciona o SOS com a posicao atual' })
  sos(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(coordsSchema.extend({ rideId: z.string().uuid().optional() })))
    body: { latitude: number; longitude: number; rideId?: string },
  ) {
    return this.central.acionarSos(userId, body);
  }

  @Post('sos/:id/location')
  @ApiOperation({ summary: 'Atualiza a posicao enquanto o SOS esta aberto' })
  posicao(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(coordsSchema)) body: { latitude: number; longitude: number },
  ) {
    return this.central.posicaoSos(userId, id, body);
  }
}

/** Saque do saldo da carteira (o motorista pede; a Central faz o PIX). */
@ApiTags('Motorista - Saques')
@ApiBearerAuth()
@Roles(UserRole.DRIVER)
@Controller('driver/payouts')
export class DriverPayoutsController {
  constructor(private readonly central: CentralService) {}

  @Get()
  @ApiOperation({ summary: 'Meus pedidos de saque' })
  meus(@CurrentUser('id') userId: string) {
    return this.central.meusSaques(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Pede saque PIX do saldo da carteira' })
  pedir(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(z.object({ amountCents: z.number().int().min(100), pixKey: z.string().trim().max(200).optional() })))
    body: { amountCents: number; pixKey?: string },
  ) {
    return this.central.pedirSaque(userId, body.amountCents, body.pixKey);
  }
}
