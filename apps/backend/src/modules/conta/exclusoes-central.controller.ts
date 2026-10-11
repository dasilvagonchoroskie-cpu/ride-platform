import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SoDonoGuard } from '../pracas/so-dono.guard';
import { ContaService } from './conta.service';

const resolverSchema = z.object({
  como: z.enum(['SEM_CONTA', 'RESOLVIDO']),
  observacao: z.string().trim().max(300).optional(),
});

/**
 * Central: pedidos de exclusao de conta feitos pela pagina da internet
 * (exigencia da Google Play; 11/10/2026). So o dono da Central atende.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(SoDonoGuard)
@Controller('admin/exclusoes')
export class ExclusoesCentralController {
  constructor(private readonly conta: ContaService) {}

  @Get()
  @ApiOperation({ summary: 'Pedidos de exclusao de conta esperando a Central (com a conta achada)' })
  pendentes() {
    return this.conta.pedidosDeExclusao();
  }

  @Post(':id/excluir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exclui a conta do pedido e marca como atendido' })
  excluir(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') adminId: string) {
    return this.conta.atenderExcluindo(id, adminId);
  }

  @Post(':id/resolver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca o pedido como atendido sem excluir (sem conta ou resolvido de outro jeito)' })
  resolver(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
    @Body(new ZodValidationPipe(resolverSchema)) body: { como: 'SEM_CONTA' | 'RESOLVIDO'; observacao?: string },
  ) {
    return this.conta.atenderSemExcluir(id, adminId, body.como, body.observacao ?? null);
  }
}
