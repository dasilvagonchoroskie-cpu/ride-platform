import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CaixaDeEntradaService, MAX_NA_LISTA } from '../../integrations/notifications/caixa-de-entrada.service';

const idsSchema = z.object({ ids: z.array(z.string().uuid()).max(MAX_NA_LISTA * 2).optional() });
const apagarSchema = z
  .object({ ids: z.array(z.string().uuid()).max(MAX_NA_LISTA * 2).optional(), todas: z.boolean().optional() })
  .refine((b) => b.ids !== undefined || b.todas === true, { message: 'Diga quais (ids) ou todas: true.' });

/**
 * Sino dos aplicativos (passageiro, motorista e Central): cada conta ve,
 * marca como lida e apaga so as proprias notificacoes.
 */
@ApiTags('Notificacoes (sino)')
@ApiBearerAuth()
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly caixa: CaixaDeEntradaService) {}

  @Get()
  @ApiOperation({ summary: 'Notificacoes da conta (ultimos 30 dias, as mais novas primeiro) e quantas nao foram lidas' })
  listar(@CurrentUser() user: AuthenticatedUser) {
    return this.caixa.listar(user);
  }

  @Get('nao-lidas')
  @ApiOperation({ summary: 'So o numero de nao lidas (ponto vermelho do sino)' })
  naoLidas(@CurrentUser() user: AuthenticatedUser) {
    return this.caixa.naoLidas(user);
  }

  @Post('lidas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca como lidas: todas (sem ids) ou so as ids' })
  lidas(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(idsSchema)) body: { ids?: string[] }) {
    return this.caixa.marcarLidas(userId, body.ids);
  }

  @Post('apagar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apaga da conta: as ids ou todas (todas: true)' })
  apagarVarias(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(apagarSchema)) body: { ids?: string[]; todas?: boolean },
  ) {
    return this.caixa.apagar(userId, body.ids);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Apaga uma notificacao da conta' })
  apagar(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.caixa.apagar(userId, [id]);
  }
}
