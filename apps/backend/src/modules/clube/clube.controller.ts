import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@ride/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { pagina } from '../conta/pagina';
import { DonoGravaGuard } from '../pracas/so-dono.guard';
import { beneficioSchema, categoriasSchema, logoSchema, parceiroSchema, type DadosDoBeneficio, type DadosDoParceiro } from './clube.regras';
import { ClubeService } from './clube.service';

function base(req: Request): string {
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

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
  @ApiOperation({ summary: 'Identificacao digital do motorista logado (QR vale 10 min)' })
  carteirinha(@CurrentUser('id') userId: string, @Req() req: Request) {
    return this.clube.carteirinha(userId, base(req));
  }
}

/** Pagina publica do QR: o comerciante confere se a identificacao e verdadeira. */
@ApiTags('Clube de Vantagens')
@Controller('clube/validar')
export class ValidarCarteirinhaController {
  constructor(private readonly clube: ClubeService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':codigo')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async validar(@Param('codigo') codigo: string, @Res() res: Response): Promise<void> {
    const r = await this.clube.validar(String(codigo).slice(0, 400));
    const cor = r.valida ? '#1E9E5A' : '#D93A3A';
    const corpo = r.valida
      ? `<div class="cartao" style="border-left:6px solid ${cor}"><h2 style="color:${cor}">✔ Identificação válida</h2>
<p><strong>${escapar(r.nome)}</strong> é motorista parceiro da Fortaleza Move.</p>
<p>Identificação: <strong>${escapar(r.codigo)}</strong></p><p>${escapar(r.situacao)}</p>
<p style="color:#666">Conferido agora no servidor da Fortaleza Move. O QR Code muda a cada 10 minutos.</p></div>`
      : `<div class="cartao" style="border-left:6px solid ${cor}"><h2 style="color:${cor}">✘ Identificação não confirmada</h2>
<p>${escapar(r.motivo ?? 'Não foi possível confirmar.')}</p>${'codigo' in r && r.codigo ? `<p>Identificação: ${escapar(r.codigo)}</p>` : ''}</div>`;
    res.send(pagina('Clube de Vantagens Fortaleza Move', corpo));
  }
}
