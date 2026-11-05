import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DonoGravaGuard } from '../pracas/so-dono.guard';
import { beneficioSchema, categoriasSchema, logoSchema, parceiroSchema, type DadosDoBeneficio, type DadosDoParceiro } from './clube.regras';
import { ClubeService } from './clube.service';

/** Central: cadastro do clube. Ler: dono e operador; gravar: so o dono. */
@ApiTags('Admin - Clube de Vantagens')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(DonoGravaGuard)
@Controller('admin/clube')
export class AdminClubeController {
  constructor(private readonly clube: ClubeService) {}

  @Get('parceiros')
  @ApiOperation({ summary: 'Todos os parceiros (ativos e inativos), com os beneficios' })
  listar(@Query('situacao') situacao?: string) {
    return this.clube.listarParaCentral(situacao === 'ativos' || situacao === 'inativos' ? situacao : undefined);
  }

  @Post('parceiros')
  @ApiOperation({ summary: 'Cadastra um estabelecimento parceiro' })
  criar(@CurrentUser('id') adminId: string, @Body(new ZodValidationPipe(parceiroSchema)) body: DadosDoParceiro) {
    return this.clube.criar(adminId, body);
  }

  @Put('parceiros/:id')
  @ApiOperation({ summary: 'Edita o parceiro' })
  editar(@CurrentUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(parceiroSchema)) body: DadosDoParceiro) {
    return this.clube.editar(adminId, id, body);
  }

  @Patch('parceiros/:id/ativo')
  @ApiOperation({ summary: 'Ativa ou desativa o parceiro (desativado some do app do motorista)' })
  ativar(@CurrentUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(z.object({ ativo: z.boolean() }))) body: { ativo: boolean }) {
    return this.clube.ativar(adminId, id, body.ativo);
  }

  @Delete('parceiros/:id')
  @ApiOperation({ summary: 'Exclui o parceiro, os beneficios e o logotipo' })
  excluir(@CurrentUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.clube.excluir(adminId, id);
  }

  @Post('parceiros/:id/logo')
  @ApiOperation({ summary: 'Logotipo do parceiro (JPG, PNG ou WEBP, ate 500 KB)' })
  logo(@CurrentUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(logoSchema)) body: { mime: string; dados: string }) {
    return this.clube.logo(adminId, id, body.mime, body.dados);
  }

  @Post('parceiros/:id/beneficios')
  @ApiOperation({ summary: 'Novo beneficio do parceiro (condicoes livres, sem percentual fixo)' })
  criarBeneficio(@CurrentUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(beneficioSchema)) body: DadosDoBeneficio) {
    return this.clube.criarBeneficio(adminId, id, body);
  }

  @Put('parceiros/:id/beneficios/:beneficio')
  editarBeneficio(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('beneficio', ParseUUIDPipe) beneficio: string,
    @Body(new ZodValidationPipe(beneficioSchema)) body: DadosDoBeneficio,
  ) {
    return this.clube.editarBeneficio(adminId, id, beneficio, body);
  }

  @Delete('parceiros/:id/beneficios/:beneficio')
  excluirBeneficio(@CurrentUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string, @Param('beneficio', ParseUUIDPipe) beneficio: string) {
    return this.clube.excluirBeneficio(adminId, id, beneficio);
  }

  @Get('categorias')
  categorias() {
    return this.clube.categorias();
  }

  @Put('categorias')
  gravarCategorias(@CurrentUser('id') adminId: string, @Body(new ZodValidationPipe(categoriasSchema)) body: { categorias: string[] }) {
    return this.clube.gravarCategorias(adminId, body.categorias);
  }
}

/** App do motorista: so consulta os parceiros ativos e a carteirinha dele. */
@ApiTags('Clube de Vantagens')
@ApiBearerAuth()
@Roles(UserRole.DRIVER)
@Controller('clube')
export class ClubeController {
  constructor(private readonly clube: ClubeService) {}

  @Get('parceiros')
  @ApiOperation({ summary: 'Parceiros ativos, com os beneficios ativos' })
  listar() {
    return this.clube.listarParaMotorista();
  }

  @Get('parceiros/:id')
  detalhe(@Param('id', ParseUUIDPipe) id: string) {
    return this.clube.detalheParaMotorista(id);
  }

  @Get('carteirinha')
  @ApiOperation({ summary: 'Carteirinha do motorista logado: numero e situacao APTO / NAO APTO' })
  carteirinha(@CurrentUser('id') userId: string) {
    return this.clube.carteirinha(userId);
  }
}
