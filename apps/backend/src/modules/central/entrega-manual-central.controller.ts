import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@ride/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  buscarEstabelecimentoSchema,
  cotarCentralSchema,
  entregaCentralSchema,
  type CotarCentralInput,
  type EntregaCentralInput,
} from '../comercio/comercio.regras';
import { ComercioService } from '../comercio/comercio.service';
import { PracasService } from '../pracas/pracas.service';
import { EntregaManualService } from './entrega-manual.service';

/**
 * Lancamento manual de entrega pela Central (13/11/2026), igual ao do
 * motorista: busca a loja, ve o perfil, confere o preco oficial e lanca. So o
 * operador da Central; o operador de cidade so mexe na cidade dele. Todas as
 * portas do Comercio valem no servidor.
 */
@ApiTags('admin-deliveries')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/manual-deliveries')
export class EntregaManualCentralController {
  constructor(
    private readonly comercio: ComercioService,
    private readonly manual: EntregaManualService,
    private readonly pracas: PracasService,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('buscar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Procura o estabelecimento por telefone, e-mail ou nome (so os da cidade do operador)' })
  async buscar(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(buscarEstabelecimentoSchema)) body: { busca: string }) {
    const minha = await this.pracas.escopoDe(user.id);
    return this.comercio.buscarParaCentral(body.busca, async (praca) => !minha || minha === praca);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('estabelecimentos/:id')
  @ApiOperation({ summary: 'Perfil do estabelecimento: entregas concluidas e historico recente' })
  async perfil(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const perfil = await this.comercio.perfilParaCentral(id);
    await this.pracas.exigirAcesso(user, perfil.praca);
    return perfil;
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('cotar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preco oficial da entrega (nao cria nada)' })
  async cotar(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(cotarCentralSchema)) body: CotarCentralInput) {
    const c = await this.comercio.lojaParaCentral(body.comercioId);
    await this.pracas.exigirAcesso(user, await this.comercio.pracaDaLoja(c));
    const { comercioId: _comercioId, ...pedido } = body;
    return this.comercio.cotarParaCentral(c, pedido);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'Lanca a entrega: abre o pedido oficial (despacho automatico ou motorista escolhido)' })
  lancar(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(entregaCentralSchema)) body: EntregaCentralInput) {
    return this.manual.lancarPelaCentral(user, body);
  }
}
