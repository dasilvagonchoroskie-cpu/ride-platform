import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PainelMotoristaService, type Periodo } from './painel-motorista.service';

const atividadeSchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('day'),
  offset: z.coerce.number().int().min(0).max(36).default(0),
});

const creditoSchema = z.object({
  amountCents: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, 'Valor nao pode ser zero.'),
  description: z.string().max(200).optional(),
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
  constructor(private readonly painel: PainelMotoristaService) {}

  @Get('drivers/:id/wallet')
  @ApiOperation({ summary: 'Carteira de um motorista' })
  carteira(@Param('id') driverId: string) {
    return this.painel.carteira(driverId);
  }

  @Post('drivers/:id/wallet/credit')
  @ApiOperation({ summary: 'Lanca a recarga (ou um ajuste) na carteira do motorista' })
  creditar(
    @Param('id') driverId: string,
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(creditoSchema)) body: { amountCents: number; description?: string },
  ) {
    return this.painel.lancarCredito(driverId, body.amountCents, body.description, adminId);
  }

  @Get('settings/central')
  @ApiOperation({ summary: 'Contato da Central e saldo minimo da carteira' })
  lerCentral() {
    return this.painel.lerConfiguracao();
  }

  @Put('settings/central')
  @ApiOperation({ summary: 'Configura WhatsApp, chave Pix da Central e saldo minimo' })
  configurar(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(centralSchema)) body: never,
  ) {
    return this.painel.configurarCentral(body, adminId);
  }
}
