import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Carteirinha do motorista logado: numero e situacao APTO / NAO APTO' })
  carteirinha(@CurrentUser('id') userId: string, @Req() req: Request) {
    return this.clube.carteirinha(userId, base(req));
  }
}

/**
 * Freio da consulta publica por aparelho (alem do limite geral): poucas
 * consultas por minuto e, depois de varios numeros errados, espera.
 */
export class FreioDaConsulta {
  private readonly vistos = new Map<string, { inicio: number; total: number; erros: number; ate: number }>();

  constructor(
    private readonly porMinuto = 8,
    private readonly errosParaEsperar = 5,
    private readonly esperaMs = 15 * 60_000,
  ) {}

  /** null = pode consultar; senao, os segundos que faltam. */
  pode(chave: string, agora = Date.now()): number | null {
    const v = this.vistos.get(chave);
    if (!v) return null;
    if (v.ate > agora) return Math.ceil((v.ate - agora) / 1000);
    if (agora - v.inicio > 60_000) {
      v.inicio = agora;
      v.total = 0;
    }
    return v.total >= this.porMinuto ? Math.ceil((v.inicio + 60_000 - agora) / 1000) : null;
  }

  contar(chave: string, errou: boolean, agora = Date.now()): void {
    if (this.vistos.size > 5000) this.vistos.clear();
    const v = this.vistos.get(chave) ?? { inicio: agora, total: 0, erros: 0, ate: 0 };
    v.total += 1;
    v.erros = errou ? v.erros + 1 : 0;
    if (v.erros >= this.errosParaEsperar) {
      v.ate = agora + this.esperaMs;
      v.erros = 0;
    }
    this.vistos.set(chave, v);
  }
}

/**
 * Quem esta consultando: o endereco que a Cloudflare do Render viu
 * (cf-connecting-ip, que ela regrava) ou o ultimo do x-forwarded-for.
 */
function quem(req: Request): string {
  const cf = String(req.headers['cf-connecting-ip'] ?? '').trim();
  if (cf) return cf;
  const f = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return f[f.length - 1] || req.ip || 'desconhecido';
}

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '';

/**
 * Pagina publica do Clube: o estabelecimento digita o numero da carteirinha
 * e o servidor responde se o motorista esta APTO agora. So le; nada se altera.
 */
@ApiTags('Clube de Vantagens')
@Controller('clube/consulta')
export class ConsultaDoClubeController {
  private readonly freio = new FreioDaConsulta();

  constructor(private readonly clube: ClubeService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  async consultar(@Query('codigo') codigo: string | undefined, @Req() req: Request, @Res() res: Response): Promise<void> {
    const digitado = String(codigo ?? '').slice(0, 30);
    const formulario = `<form method="get" action="" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
<input name="codigo" value="${escapar(digitado)}" placeholder="FM-1A2B3C4D" maxlength="20" autocomplete="off" autocapitalize="characters" required
 style="flex:1;min-width:180px;font-size:20px;padding:10px;border:1px solid #c9ced6;border-radius:8px;text-transform:uppercase">
<button type="submit" style="font-size:18px;padding:10px 18px;border:0;border-radius:8px;background:#1E5BB8;color:#fff">Consultar</button></form>`;
    let resultado = '';
    if (digitado.trim()) {
      const ip = quem(req);
      const espera = this.freio.pode(ip);
      if (espera !== null) {
        res.status(429);
        resultado = `<div class="cartao" style="border-left:6px solid #E8710A"><p>Muitas consultas seguidas. Tente de novo em ${Math.ceil(espera / 60)} minuto(s).</p></div>`;
      } else {
        const r = await this.clube.consultar(digitado);
        this.freio.contar(ip, !r.encontrado);
        if (!r.encontrado) {
          resultado = `<div class="cartao" style="border-left:6px solid #D93A3A"><h2 style="color:#D93A3A">Não encontrado</h2><p>${escapar(r.motivo)}</p></div>`;
        } else {
          const apto = r.situacao === 'APTO';
          const cor = apto ? '#1E9E5A' : '#D93A3A';
          resultado = `<div class="cartao" style="border-left:6px solid ${cor}">
<h2 style="color:${cor};font-size:28px;margin:4px 0">${apto ? '✔ APTO' : '✘ NÃO APTO'}</h2>
<p><strong>${escapar(r.nome)}</strong> · motorista parceiro Fortaleza Move</p>
<p>Identificação: <strong>${escapar(r.codigo)}</strong></p>
<p>${escapar(r.motivo)}</p>
${apto && r.validoAte ? `<p>Vale até ${escapar(dataHora(r.validoAte))}.</p>` : ''}
<p style="color:#666">Conferido agora no servidor (${escapar(dataHora(r.conferidoEm))}). Print ou foto da carteirinha não vale: consulte sempre aqui.</p></div>`;
        }
      }
    }
    const corpo = `<p>Digite o número da carteirinha que o motorista mostrar no aplicativo.</p>${formulario}${resultado}`;
    res.send(pagina('Clube de Vantagens Fortaleza Move — consulta', corpo));
  }
}
