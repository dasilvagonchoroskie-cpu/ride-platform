import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessException } from '../../common/errors/business.exception';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PracasService } from '../pracas/pracas.service';
import { RelatoriosService } from './relatorios.service';

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const periodoSchema = z.object({ de: data, ate: data });
const centralSchema = periodoSchema.extend({
  tipo: z.enum(['motorista', 'praca', 'frota']).default('frota'),
  driverId: z.string().uuid().optional(),
  praca: z.string().trim().max(40).optional(),
});

/**
 * Relatorio de faturamento em PDF. Os aplicativos pedem o link (com login)
 * e abrem no navegador do celular; o link vale 15 minutos e nao precisa de
 * login (o navegador nao tem o login do aplicativo).
 */
@ApiTags('Relatorios')
@ApiBearerAuth()
@Controller()
export class RelatoriosController {
  constructor(
    private readonly relatorios: RelatoriosService,
    private readonly pracas: PracasService,
  ) {}

  @Get('driver/relatorio')
  @Roles(UserRole.DRIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Link do PDF de faturamento do proprio motorista (periodo de/ate)' })
  async doMotorista(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(periodoSchema)) q: { de: string; ate: string },
  ) {
    const driverId = await this.relatorios.motoristaDo(user);
    return this.relatorios.link({ tipo: 'motorista', driverId, de: q.de, ate: q.ate });
  }

  @Get('admin/relatorio')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Link do PDF de faturamento: um motorista, uma cidade ou a frota toda' })
  async daCentral(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(centralSchema))
    q: { tipo: 'motorista' | 'praca' | 'frota'; driverId?: string; praca?: string; de: string; ate: string },
  ) {
    const minha = await this.pracas.escopoDe(user.id);
    if (q.tipo === 'motorista') {
      if (!q.driverId) throw BusinessException.validation('Escolha o motorista.');
      await this.pracas.exigirAcesso(user, await this.pracas.pracaDoMotorista(q.driverId));
      return this.relatorios.link({ tipo: 'motorista', driverId: q.driverId, de: q.de, ate: q.ate });
    }
    // Operador de cidade: "frota" e a frota da cidade dele.
    const praca = minha ?? (q.tipo === 'praca' ? q.praca : undefined);
    if (praca) {
      if (!(await this.pracas.buscar(praca))) throw BusinessException.validation('Cidade nao encontrada.');
      return this.relatorios.link({ tipo: 'praca', praca, de: q.de, ate: q.ate });
    }
    return this.relatorios.link({ tipo: 'frota', de: q.de, ate: q.ate });
  }

  @Get('relatorios/:token/:arquivo')
  @Public()
  @ApiOperation({ summary: 'O PDF (link assinado, vale 15 minutos)' })
  async pdf(@Param('token') token: string, @Param('arquivo') arquivo: string, @Res() res: Response): Promise<void> {
    const pedido = this.relatorios.lerLink(token);
    const pdf = await this.relatorios.pdf(pedido);
    const nome = /^[\w.-]{1,80}\.pdf$/.test(arquivo) ? arquivo : 'relatorio.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }
}
