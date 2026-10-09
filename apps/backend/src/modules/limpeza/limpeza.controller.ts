import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessException } from '../../common/errors/business.exception';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SoDonoGuard } from '../pracas/so-dono.guard';
import { LimpezaService } from './limpeza.service';

/** Limpeza dos dados — so o dono da Central. */
@ApiTags('Admin - Limpeza')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(SoDonoGuard)
@Controller('admin/limpeza')
export class LimpezaController {
  constructor(private readonly limpeza: LimpezaService) {}

  @Get()
  @ApiOperation({ summary: 'Quanto ha de cada coisa (contas de teste, corridas, recargas...)' })
  resumo() {
    return this.limpeza.resumo();
  }

  @Post('teste')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apaga as contas do teste automatico e tudo delas' })
  teste(@CurrentUser('id') adminId: string) {
    return this.limpeza.apagarDadosDeTeste(adminId);
  }

  @Post('zerar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Zera a operacao (corridas, recargas, saques, SOS); contas ficam. Faz copia antes.' })
  zerar(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(z.object({ confirmacao: z.string() }))) body: { confirmacao: string },
  ) {
    if (body.confirmacao.trim().toUpperCase() !== 'ZERAR') {
      throw BusinessException.validation('Para zerar, escreva ZERAR.');
    }
    return this.limpeza.zerarOperacao(adminId);
  }

  @Get('contas')
  @ApiOperation({ summary: 'Contas de passageiro e motorista (com marca de teste)' })
  contas(@Query('busca') busca?: string) {
    return this.limpeza.listarContas(busca);
  }

  @Post('contas/apagar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apaga as contas escolhidas (sem corrida no historico)' })
  apagar(
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }))) body: { ids: string[] },
  ) {
    return this.limpeza.apagarContas(body.ids, adminId);
  }
}
