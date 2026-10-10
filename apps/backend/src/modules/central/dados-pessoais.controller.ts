import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
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
  constructor(private readonly dados: DadosPessoaisService) {}

  @Get('alteracoes')
  @ApiOperation({ summary: 'Pedidos de mudanca de dados dos motoristas' })
  pendentes() {
    return this.dados.pendentes();
  }

  @Post('alteracoes/:userId/aprovar')
  @HttpCode(HttpStatus.OK)
  aprovar(@CurrentUser('id') adminId: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.dados.aprovar(adminId, userId);
  }

  @Post('alteracoes/:userId/recusar')
  @HttpCode(HttpStatus.OK)
  recusar(
    @CurrentUser('id') adminId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(recusaSchema)) body: { motivo: string },
  ) {
    return this.dados.recusar(adminId, userId, body.motivo);
  }

  @Get('pessoas/:userId')
  @ApiOperation({ summary: 'Dados de um passageiro ou motorista' })
  ver(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.dados.dadosDaPessoa(userId);
  }

  @Patch('pessoas/:userId')
  @ApiOperation({ summary: 'Central muda os dados (passageiro ou motorista)' })
  editar(
    @CurrentUser('id') adminId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(centralSchema)) body: DadosPelaCentral,
  ) {
    return this.dados.editarPelaCentral(adminId, userId, body);
  }
}
