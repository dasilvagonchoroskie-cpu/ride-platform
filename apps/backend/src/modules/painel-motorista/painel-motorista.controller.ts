import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PainelMotoristaService, type Periodo } from './painel-motorista.service';
import { PracasService } from '../pracas/pracas.service';
import { SoDonoGuard } from '../pracas/so-dono.guard';
import { BusinessException } from '../../common/errors/business.exception';

const atividadeSchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('day'),
  offset: z.coerce.number().int().min(0).max(36).default(0),
});

const creditoSchema = z.object({
  amountCents: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, 'Valor nao pode ser zero.'),
  /** Adicionar saldo (+) ou remover saldo (-). */
  operation: z.enum(['CREDIT', 'DEBIT']).default('CREDIT'),
  description: z.string().max(200).optional(),
});

const avisoSaldoSchema = z.object({
  /** Cidade (id da praca); sem ela, grava o padrao de todas as cidades. */
  praca: z.string().trim().min(1).max(80).nullable().optional(),
  /** Em centavos; null = sem valor proprio (volta ao padrao ou ao automatico). */
  avisoCents: z.number().int().min(0).max(1_000_000).nullable(),
});

const centralSchema = z.object({
  whatsapp: z.string().regex(/^\d{10,13}$/, 'WhatsApp so com numeros, com DDI e DDD.').nullable().optional(),
  pixKey: z.string().max(140).nullable().optional(),
  pixHolder: z.string().max(120).nullable().optional(),
  minimumCents: z.number().int().min(0).max(100_000).optional(),
  blockWhenInsufficient: z.boolean().optional(),
});

@ApiTags('Motorista - Painel')
@ApiBearerAuth()
@Roles(UserRole.DRIVER, UserRole.ADMIN)
@Controller('driver')
export class PainelMotoristaController {
  constructor(private readonly painel: PainelMotoristaService) {}

  @Get('activity')
  @ApiOperation({ summary: 'Ganhos, corridas, tempo online e trabalhado do dia, semana ou mes' })
  async atividade(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(atividadeSchema)) q: { period: Periodo; offset: number },
  ) {
    return this.painel.atividade(await this.painel.motoristaDo(user), q.period, q.offset);
  }

  @Get('wallet')
  @ApiOperation({ summary: 'Carteira pre-paga: saldo, minimo, contato da Central e historico' })
  async carteira(@CurrentUser() user: AuthenticatedUser) {
    return this.painel.carteira(await this.painel.motoristaDo(user));
  }

  @Get('wallet/resumo')
  @ApiOperation({ summary: 'Saldo, bloqueio e ultimo lancamento (o app pergunta a cada 20 s)' })
  async resumo(@CurrentUser() user: AuthenticatedUser) {
    return this.painel.resumoCarteira(await this.painel.motoristaDo(user));
  }

  @Get('central')
  @ApiOperation({ summary: 'WhatsApp e chave Pix da Central' })
  central() {
    return this.painel.contato();
  }
}

@ApiTags('Admin - Carteira')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminCarteiraController {
  constructor(
    private readonly painel: PainelMotoristaService,
    private readonly pracas: PracasService,
  ) {}

  @Get('drivers/:id/wallet')
  @ApiOperation({ summary: 'Carteira de um motorista' })
  async carteira(@Param('id') driverId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.pracas.exigirAcesso(user, await this.pracas.pracaDoMotorista(driverId));
    return this.painel.carteira(driverId);
  }

  @Post('drivers/:id/wallet/credit')
  @ApiOperation({ summary: 'Lanca a recarga (ou um ajuste) na carteira do motorista' })
  async creditar(
    @Param('id') driverId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(creditoSchema))
    body: { amountCents: number; operation: 'CREDIT' | 'DEBIT'; description?: string },
  ) {
    await this.pracas.exigirAcesso(user, await this.pracas.pracaDoMotorista(driverId));
    return this.painel.lancarCredito(driverId, body.amountCents, body.description, user.id, body.operation);
  }

  @Get('wallets')
  @ApiOperation({ summary: 'Motoristas com o saldo da carteira (por cidade)' })
  async carteiras(@CurrentUser() user: AuthenticatedUser, @Query('praca') praca?: string) {
    return this.painel.carteiras(await this.pracas.idsDeMotoristas(await this.pracas.filtro(user, praca)));
  }

  @Get('settings/aviso-saldo')
  @ApiOperation({ summary: 'Limite do aviso "Saldo se esgotando": padrao e por cidade' })
  async lerAvisoDeSaldo(@CurrentUser() user: AuthenticatedUser, @Query('praca') praca?: string) {
    return this.painel.lerAvisoDeSaldo(await this.pracas.filtro(user, praca));
  }

  @Put('settings/aviso-saldo')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Grava o limite do aviso de saldo da cidade (ou o padrao, sem cidade)' })
  async gravarAvisoDeSaldo(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(avisoSaldoSchema)) body: { praca?: string | null; avisoCents: number | null },
  ) {
    const praca = body.praca ? await this.pracas.filtro(user, body.praca) : null;
    if (body.praca && !praca) throw BusinessException.notFound('Cidade nao encontrada.');
    return this.painel.gravarAvisoDeSaldo(praca, body.avisoCents, user.id);
  }

  @Get('settings/central')
  @ApiOperation({ summary: 'Contato da Central e saldo minimo da carteira' })
  lerCentral() {
    return this.painel.lerConfiguracao();
  }

  @Put('settings/central')
  @UseGuards(SoDonoGuard)
  @ApiOperation({ summary: 'Configura WhatsApp, chave Pix da Central e saldo minimo' })
  configurar(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(centralSchema)) body: never,
  ) {
    return this.painel.configurarCentral(body, adminId);
  }
}
