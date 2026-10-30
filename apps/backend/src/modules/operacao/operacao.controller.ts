import { randomUUID } from 'crypto';
import { Body, Controller, Delete, Get, Param, Post, Put, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { DonoGravaGuard } from '../pracas/so-dono.guard';
import { PracasService } from '../pracas/pracas.service';
import { decodificarFoto } from '../arquivos/arquivos.service';
import { aparenciaDoApp, CHAVE_APARENCIA, gravarAparencia, lerAparencia } from './aparencia';
import { mapaDoApp } from './mapa.config';
import { CaixaDeEntradaService } from '../../integrations/notifications/caixa-de-entrada.service';
import { apagarAviso, gravarCidades, lerAvisos, lerCidades, publicarAviso, whatsappDaCentral } from './operacao.store';

const cidadesSchema = z.object({
  cidades: z
    .array(z.string().trim().min(2, 'Nome de cidade muito curto.').max(60, 'Nome de cidade muito longo.'))
    .max(50, 'No maximo 50 cidades.'),
});

const avisoSchema = z.object({
  titulo: z.string().trim().min(3, 'Titulo muito curto.').max(80, 'Titulo muito longo (ate 80 letras).'),
  texto: z.string().trim().min(3, 'Texto muito curto.').max(500, 'Texto muito longo (ate 500 letras).'),
});

/**
 * O que o aplicativo do passageiro precisa saber ANTES de entrar:
 * cidades atendidas, WhatsApp da Central (Fale conosco) e avisos.
 */
@ApiTags('Aplicativo')
@Public()
@Controller('app')
export class AppPublicoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly pracas: PracasService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Cidades, WhatsApp da Central, avisos, formas de entrar e endereco do mapa' })
  async config() {
    return {
      login: { ...this.auth.canaisDeLogin(), senha: true },
      cidades: await lerCidades(this.prisma),
      whatsapp: await whatsappDaCentral(this.prisma),
      avisos: await lerAvisos(this.prisma),
      // Cidades da operacao: o motorista escolhe onde vai trabalhar no cadastro.
      pracas: (await this.pracas.listar())
        .filter((p) => p.ativa)
        .map((p) => ({ id: p.id, nome: p.nome, uf: p.uf, latitude: p.latitude, longitude: p.longitude, whatsapp: p.whatsapp ?? null })),
      // Mapa: provedor e atribuicao (TomTom). A chave das imagens vem so com
      // login, em GET /geo/mapa.
      mapa: mapaDoApp(),
      // Etapa 6: nome, cor, logo e faixa de aviso do app (pela Central).
      aparencia: aparenciaDoApp(await lerAparencia(this.prisma)),
    };
  }

  @Get('logo')
  @ApiOperation({ summary: 'Logo do app (publico; troca pela Central em Aparencia)' })
  async logo(@Res() res: Response): Promise<void> {
    const a = await lerAparencia(this.prisma);
    const arq = a.logoId ? await this.prisma.arquivo.findUnique({ where: { id: a.logoId } }) : null;
    if (!arq || arq.tipo !== 'LOGO') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Sem logo.' } });
      return;
    }
    res.setHeader('Content-Type', arq.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(arq.dados));
  }
}

const aparenciaSchema = z.object({
  nome: z.string().trim().min(2, 'Nome com 2 ou mais letras.').max(30),
  cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor no formato #RRGGBB.'),
  bannerAtivo: z.boolean(),
  bannerTexto: z.string().trim().max(140, 'A faixa tem no maximo 140 letras.'),
});

const logoSchema = z.object({
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dados: z.string().min(16).max(1_400_000),
});

/** Aparencia do app pela Central (so o dono grava). */
@ApiTags('Admin - Aparencia')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(DonoGravaGuard)
@Controller('admin/aparencia')
export class AdminAparenciaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Nome, cor, logo e faixa de aviso do app do passageiro' })
  async ler() {
    const a = await lerAparencia(this.prisma);
    return { ...a, ...aparenciaDoApp(a) };
  }

  @Put()
  @ApiOperation({ summary: 'Troca nome, cor e faixa de aviso' })
  async gravar(@CurrentUser('id') adminId: string, @Body(new ZodValidationPipe(aparenciaSchema)) body: z.infer<typeof aparenciaSchema>) {
    const a = await gravarAparencia(this.prisma, body, adminId);
    return { ...a, ...aparenciaDoApp(a) };
  }

  @Post('logo')
  @ApiOperation({ summary: 'Troca o logo (JPG, PNG ou WEBP, ate ~1 MB)' })
  async logo(@CurrentUser('id') adminId: string, @Body(new ZodValidationPipe(logoSchema)) body: z.infer<typeof logoSchema>) {
    const dados = decodificarFoto(body.mime, body.dados);
    const antes = await lerAparencia(this.prisma);
    const id = randomUUID();
    await this.prisma.arquivo.create({ data: { id, ownerId: adminId, tipo: 'LOGO', mime: body.mime, tamanho: dados.length, dados } });
    const a = await gravarAparencia(this.prisma, { logoId: id }, adminId);
    if (antes.logoId) await this.prisma.arquivo.deleteMany({ where: { id: antes.logoId, tipo: 'LOGO' } });
    return { ...a, ...aparenciaDoApp(a) };
  }

  @Delete()
  @ApiOperation({ summary: 'Volta tudo ao padrao da montagem do app (nome, cor, logo e faixa)' })
  async voltarAoPadrao() {
    const antes = await lerAparencia(this.prisma);
    await this.prisma.setting.deleteMany({ where: { key: CHAVE_APARENCIA } });
    if (antes.logoId) await this.prisma.arquivo.deleteMany({ where: { id: antes.logoId, tipo: 'LOGO' } });
    const a = await lerAparencia(this.prisma);
    return { ...a, ...aparenciaDoApp(a) };
  }

  @Delete('logo')
  @ApiOperation({ summary: 'Volta para o logo padrao do app' })
  async tirarLogo(@CurrentUser('id') adminId: string) {
    const antes = await lerAparencia(this.prisma);
    const a = await gravarAparencia(this.prisma, { logoId: null }, adminId);
    if (antes.logoId) await this.prisma.arquivo.deleteMany({ where: { id: antes.logoId, tipo: 'LOGO' } });
    return { ...a, ...aparenciaDoApp(a) };
  }
}

@ApiTags('Admin - Operacao')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(DonoGravaGuard)
@Controller('admin/operacao')
export class AdminOperacaoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caixa: CaixaDeEntradaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Cidades atendidas e avisos publicados' })
  async ler() {
    return { cidades: await lerCidades(this.prisma), avisos: await lerAvisos(this.prisma) };
  }

  @Put('cidades')
  @ApiOperation({ summary: 'Troca a lista de cidades atendidas' })
  async cidades(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(cidadesSchema)) body: { cidades: string[] },
  ) {
    return { cidades: await gravarCidades(this.prisma, body.cidades, adminId), avisos: await lerAvisos(this.prisma) };
  }

  @Post('avisos')
  @ApiOperation({ summary: 'Publica um aviso para os passageiros (aparece no sino)' })
  async publicar(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(avisoSchema)) body: { titulo: string; texto: string },
  ) {
    return {
      cidades: await lerCidades(this.prisma),
      avisos: await publicarAviso(this.prisma, body.titulo, body.texto, adminId),
    };
  }

  @Delete('avisos/:id')
  @ApiOperation({ summary: 'Apaga um aviso' })
  async apagar(@CurrentUser('id') adminId: string, @Param('id') id: string) {
    const avisos = await apagarAviso(this.prisma, id, adminId);
    // Some tambem do sino de quem ja tinha recebido.
    await this.caixa.tirarAvisoDaCentral(id);
    return { cidades: await lerCidades(this.prisma), avisos };
  }
}
