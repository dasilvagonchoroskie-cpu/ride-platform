import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { PracasService } from '../pracas/pracas.service';
import { DriversService } from '../drivers/drivers.service';
import { IntegracaoTokenGuard } from '../../common/guards/integracao-token.guard';
import { criarMotoristaSchema, CriarMotoristaInput } from '../drivers/admin-drivers.controller';

/**
 * Ponte CRM -> Central (20/11/2026). O CRM, depois da aprovacao do dono,
 * cria aqui o motorista ja aprovado (mesma logica de "cadastrar pela Central").
 * Protegido so pela chave de integracao; nao usa login de admin.
 */
@ApiTags('Integracao')
@Public()
@UseGuards(IntegracaoTokenGuard)
@Controller('integracao')
export class IntegracaoController {
  constructor(
    private readonly drivers: DriversService,
    private readonly pracas: PracasService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('motoristas')
  @ApiOperation({ summary: 'Cria o motorista aprovado vindo do CRM (chave de integracao)' })
  async criarMotorista(
    @Body(new ZodValidationPipe(criarMotoristaSchema)) body: CriarMotoristaInput,
  ) {
    const admin = await this.prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      throw BusinessException.validation('Nenhum administrador na Central para registrar a aprovacao.');
    }
    const praca = body.praca ? (await this.pracas.buscar(body.praca))?.id : null;
    const { praca: _praca, ...dados } = body;
    const criado = await this.drivers.adminCreate(admin.id, dados as CriarMotoristaInput);
    const u = await this.prisma.user.findUnique({ where: { phone: body.phone }, select: { id: true } });
    if (u && praca) await this.pracas.definirPracaDoMotorista(u.id, praca);
    this.pracas.esquecerMotoristas();
    return criado;
  }

  @Get('pracas')
  @ApiOperation({ summary: 'Lista as cidades abertas na Central (para o CRM direcionar o motorista)' })
  async listarPracas() {
    const todas = await this.pracas.listar();
    const items = todas
      .filter((p) => p.ativa !== false)
      .map((p) => ({ id: p.id, nome: p.nome, uf: p.uf }));
    return { items };
  }
}
