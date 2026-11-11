import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../database/prisma.service';
import { PracasService } from '../pracas/pracas.service';
import { DadosPessoaisService } from './dados-pessoais.service';
import type { DadosDoMotorista, DadosPelaCentral } from './dados-pessoais.service';

const algoMudou = (d: Record<string, unknown>) => Object.values(d).some((v) => v !== undefined && v !== '');

const camposDoMotorista = {
  name: z.string().trim().min(3, 'Informe o nome completo.').max(120).optional(),
  phone: z.string().trim().min(10, 'Telefone com DDD.').max(20).optional(),
  email: z.string().trim().toLowerCase().email('E-mail invalido.').max(160).optional(),
  endereco: z.string().trim().min(5, 'Endereco muito curto.').max(200).optional(),
  pixKey: z.string().trim().min(3).max(200).optional(),
  cnhNumber: z.string().trim().regex(/^\d{9,11}$/, 'CNH: so os numeros (9 a 11).').optional(),
  cnhCategory: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(A|B|C|D|E|AB|AC|AD|AE)$/, 'Categoria da CNH invalida.')
    .optional(),
  cnhExpiresAt: z.coerce.date().optional(),
};

const motoristaSchema = z.object(camposDoMotorista).refine(algoMudou, { message: 'Nada para mudar.' });

const centralSchema = z
  .object({
    ...camposDoMotorista,
    cpf: z.string().trim().regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, 'CPF invalido.').optional(),
    birthDate: z.coerce.date().optional(),
  })
  .refine(algoMudou, { message: 'Nada para mudar.' });

const recusaSchema = z.object({ motivo: z.string().trim().min(3, 'Escreva o motivo.').max(300) });

/** Motorista: ve os dados e pede a mudanca (so vale depois da Central aprovar). */
@ApiTags('drivers')
@ApiBearerAuth()
@Roles(UserRole.DRIVER)
@Controller('driver/meus-dados')
export class MeusDadosMotoristaController {
  constructor(private readonly dados: DadosPessoaisService) {}

  @Get()
  @ApiOperation({ summary: 'Meus dados e o pedido de mudanca (se houver)' })
  ver(@CurrentUser('id') userId: string) {
    return this.dados.meusDados(userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('alteracao')
  @ApiOperation({ summary: 'Pede para mudar os dados; a Central aprova' })
  pedir(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(motoristaSchema)) body: DadosDoMotorista) {
    return this.dados.pedirAlteracao(userId, body);
  }

  @Delete('alteracao')
  @ApiOperation({ summary: 'Desiste do pedido de mudanca' })
  cancelar(@CurrentUser('id') userId: string) {
    return this.dados.cancelarAlteracao(userId);
  }
}

/** Central: muda os dados de qualquer um e aprova os pedidos dos motoristas. */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/dados')
export class DadosPessoaisCentralController {
  constructor(
    private readonly dados: DadosPessoaisService,
    private readonly pracas: PracasService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Revisao de seguranca (Requisicao 1, 11/11/2026): o operador de uma cidade
   * via e mudava os dados pessoais de QUALQUER pessoa (outras cidades,
   * passageiros). Agora: dono ve e muda todos; operador so os motoristas da
   * cidade dele. Passageiros e contas da Central: so o dono (como a lista de
   * passageiros, que ja era so do dono). Fora do alcance: "nao encontrado",
   * sem dizer se a pessoa existe.
   */
  private async exigirAlcance(admin: AuthenticatedUser, userId: string): Promise<void> {
    const minha = await this.pracas.escopoDe(admin.id);
    if (!minha) return; // dono
    const alvo = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, driver: { select: { id: true } } },
    });
    const doMotorista = alvo?.role === UserRole.DRIVER && alvo.driver ? await this.pracas.pracaDoMotorista(alvo.driver.id) : null;
    if (doMotorista !== minha) throw new NotFoundException('Pessoa nao encontrada na sua cidade.');
  }

  @Get('alteracoes')
  @ApiOperation({ summary: 'Pedidos de mudanca de dados dos motoristas (operador: so da cidade dele)' })
  async pendentes(@CurrentUser() admin: AuthenticatedUser) {
    const lista = await this.dados.pendentes();
    const ids = await this.pracas.idsDeMotoristas(await this.pracas.escopoDe(admin.id));
    return ids === null ? lista : lista.filter((p) => p.driverId !== null && ids.includes(p.driverId));
  }

  @Post('alteracoes/:userId/aprovar')
  @HttpCode(HttpStatus.OK)
  async aprovar(@CurrentUser() admin: AuthenticatedUser, @Param('userId', ParseUUIDPipe) userId: string) {
    await this.exigirAlcance(admin, userId);
    return this.dados.aprovar(admin.id, userId);
  }

  @Post('alteracoes/:userId/recusar')
  @HttpCode(HttpStatus.OK)
  async recusar(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(recusaSchema)) body: { motivo: string },
  ) {
    await this.exigirAlcance(admin, userId);
    return this.dados.recusar(admin.id, userId, body.motivo);
  }

  @Get('pessoas/:userId')
  @ApiOperation({ summary: 'Dados de um passageiro ou motorista' })
  async ver(@CurrentUser() admin: AuthenticatedUser, @Param('userId', ParseUUIDPipe) userId: string) {
    await this.exigirAlcance(admin, userId);
    return this.dados.dadosDaPessoa(userId);
  }

  @Patch('pessoas/:userId')
  @ApiOperation({ summary: 'Central muda os dados (passageiro ou motorista)' })
  async editar(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(centralSchema)) body: DadosPelaCentral,
  ) {
    // Conta da Central (e-mail de entrada, telefone): so o dono muda. Um
    // operador de cidade nunca troca o e-mail do dono (tomaria a Central).
    const alvo = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (alvo?.role === UserRole.ADMIN) await this.pracas.exigirDono(admin);
    await this.exigirAlcance(admin, userId);
    return this.dados.editarPelaCentral(admin.id, userId, body);
  }
}
