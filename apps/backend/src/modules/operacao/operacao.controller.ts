import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
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
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Cidades, WhatsApp da Central, avisos e formas de entrar que funcionam agora' })
  async config() {
    return {
      login: { ...this.auth.canaisDeLogin(), senha: true },
      cidades: await lerCidades(this.prisma),
      whatsapp: await whatsappDaCentral(this.prisma),
      avisos: await lerAvisos(this.prisma),
    };
  }
}

@ApiTags('Admin - Operacao')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/operacao')
export class AdminOperacaoController {
  constructor(private readonly prisma: PrismaService) {}

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
    return { cidades: await lerCidades(this.prisma), avisos: await apagarAviso(this.prisma, id, adminId) };
  }
}
