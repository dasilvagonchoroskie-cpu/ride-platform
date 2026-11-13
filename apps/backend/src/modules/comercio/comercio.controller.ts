import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PracasService } from '../pracas/pracas.service';
import { DonoGravaGuard } from '../pracas/so-dono.guard';
import { atualizarSchema, cadastroSchema, cotarSchema, decisaoSchema, entregaSchema, listaSchema, periodoSchema } from './comercio.regras';
import { ComercioService } from './comercio.service';

const paginaSchema = z.object({ pagina: z.coerce.number().int().min(1).max(500).default(1) });
const configSchema = z.object({ ativo: z.boolean() });
const motivoSchema = z.object({ motivo: z.string().trim().max(300).optional() });
const filtroPedidosSchema = z.object({ praca: z.string().trim().max(80).optional(), status: z.string().trim().max(20).optional(), comercioId: z.string().uuid().optional() });

/** Aplicativo Fortaleza Move Comercio: cada estabelecimento so mexe no que e dele. */
@ApiTags('Comercio')
@ApiBearerAuth()
@Roles(UserRole.PASSENGER)
@Controller('comercio')
export class ComercioController {
  constructor(private readonly comercio: ComercioService) {}

  @Get('meu')
  @ApiOperation({ summary: 'Meu estabelecimento (cadastrado ou nao) e a situacao do cadastro' })
  meu(@CurrentUser('id') userId: string) {
    return this.comercio.meu(userId);
  }

  @Post('cadastro')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cadastra o estabelecimento (fica AGUARDANDO aprovacao da Central)' })
  cadastrar(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(cadastroSchema)) body: Record<string, unknown>) {
    return this.comercio.cadastrar(userId, body);
  }

  @Patch('meu')
  @ApiOperation({ summary: 'Atualiza dados do estabelecimento (o CNPJ nao muda por aqui)' })
  atualizar(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(atualizarSchema)) body: Record<string, unknown>) {
    return this.comercio.atualizar(userId, body);
  }

  @Post('entregas/preco')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Preco da entrega (mecanismo oficial, tarifas ja configuradas); nao cria nada' })
  preco(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(cotarSchema)) body: never) {
    return this.comercio.cotar(userId, body);
  }

  @Post('entregas')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Pede a entrega (entra no despacho oficial; so onde a Central ligou a entrega)' })
  pedir(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(entregaSchema)) body: never) {
    return this.comercio.pedir(userId, body);
  }

  @Get('entregas')
  @ApiOperation({ summary: 'Historico de entregas do estabelecimento' })
  historico(@CurrentUser('id') userId: string, @Query(new ZodValidationPipe(paginaSchema)) q: { pagina: number }) {
    return this.comercio.historico(userId, q.pagina);
  }

  @Get('gastos')
  @ApiOperation({ summary: 'Quanto o estabelecimento gastou com entregas no periodo (padrao: o mes)' })
  gastos(@CurrentUser('id') userId: string, @Query(new ZodValidationPipe(periodoSchema)) q: { de?: Date; ate?: Date }) {
    return this.comercio.gastos(userId, q);
  }

  @Get('entregas/:id')
  @ApiOperation({ summary: 'Acompanha uma entrega (estado real do servidor e posicao do motorista)' })
  detalhe(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.comercio.detalhe(userId, id);
  }

  @Get('entregas/:id/repetir')
  @ApiOperation({ summary: 'Dados da entrega anterior para preencher a tela (nao cria nada)' })
  repetir(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.comercio.repetir(userId, id);
  }

  @Post('entregas/:id/cancelar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela a propria entrega (regras da corrida)' })
  cancelar(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(motivoSchema)) body: { motivo?: string }) {
    return this.comercio.cancelar(userId, id, body.motivo);
  }
}

/** Central: ver os estabelecimentos e as entregas deles (o dono decide; o operador ve a cidade dele). */
@ApiTags('Admin - Comercio')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(DonoGravaGuard)
@Controller('admin/comercios')
export class AdminComercioController {
  constructor(
    private readonly comercio: ComercioService,
    private readonly pracas: PracasService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estabelecimentos cadastrados (da cidade do operador, ou todas para o dono)' })
  async listar(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listaSchema)) q: { situacao?: string; busca?: string; praca?: string }) {
    return this.comercio.adminListar(await this.pracas.filtro(user, q.praca), q);
  }

  @Get('entregas')
  @ApiOperation({ summary: 'Entregas pedidas pelo aplicativo Comercio (origem identificada)' })
  async pedidos(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(filtroPedidosSchema)) q: { praca?: string; status?: string; comercioId?: string }) {
    return this.comercio.adminPedidos(await this.pracas.filtro(user, q.praca), q);
  }

  @Get('config')
  @ApiOperation({ summary: 'Chave geral do Comercio (entregas liberadas ou nao)' })
  config() {
    return this.comercio.lerConfig();
  }

  @Put('config')
  @ApiOperation({ summary: 'Liga ou desliga as entregas do Comercio (so o dono; auditado)' })
  gravarConfig(@CurrentUser('id') adminId: string, @Body(new ZodValidationPipe(configSchema)) body: { ativo: boolean }) {
    return this.comercio.gravarConfig(adminId, body.ativo);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dados cadastrais e gastos de um estabelecimento' })
  async detalhe(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.comercio.adminDetalhe(await this.pracas.escopoDe(user.id), id);
  }

  @Post(':id/decisao')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprovar, rejeitar, suspender ou reativar (so o dono; auditado)' })
  decidir(@CurrentUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(decisaoSchema)) body: { acao: never; motivo?: string }) {
    return this.comercio.adminDecidir(adminId, id, body.acao, body.motivo);
  }
}
