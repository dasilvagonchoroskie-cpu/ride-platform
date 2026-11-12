import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@ride/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  buscarEstabelecimentoSchema,
  cotarManualSchema,
  entregaManualSchema,
  type CotarManualInput,
  type EntregaManualInput,
} from '../comercio/comercio.regras';
import { ComercioService } from '../comercio/comercio.service';
import { EntregaManualService } from './entrega-manual.service';

/**
 * Lancamento manual de entrega do Comercio pelo motorista (12/11/2026). So o
 * motorista logado, so lojas da cidade dele, e todas as portas do Comercio
 * valem no servidor, independente do que o aplicativo mostra.
 */
@ApiTags('driver-deliveries')
@ApiBearerAuth()
@Roles(UserRole.DRIVER)
@Controller('driver/manual-deliveries')
export class EntregaManualController {
  constructor(
    private readonly comercio: ComercioService,
    private readonly manual: EntregaManualService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('buscar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Procura o estabelecimento por telefone, e-mail ou nome (so os da cidade do motorista)' })
  buscar(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(buscarEstabelecimentoSchema)) body: { busca: string }) {
    return this.comercio.buscarParaMotorista(userId, body.busca);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('estabelecimentos/:id')
  @ApiOperation({ summary: 'Perfil do estabelecimento: entregas concluidas e historico recente' })
  perfil(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.comercio.perfilParaMotorista(userId, id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('cotar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preco oficial da entrega pelo veiculo do motorista (nao cria nada)' })
  cotar(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(cotarManualSchema)) body: CotarManualInput) {
    return this.comercio.cotarParaMotorista(userId, body);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'Lanca a entrega: abre o pedido oficial e ja entrega a este motorista' })
  lancar(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(entregaManualSchema)) body: EntregaManualInput) {
    return this.manual.lancar(userId, body);
  }
}
