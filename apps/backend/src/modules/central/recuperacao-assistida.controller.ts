import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@ride/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SoDonoGuard } from '../pracas/so-dono.guard';
import { PedidoDeRecuperacao, recuperacaoSchema, RecuperacaoAssistidaService } from './recuperacao-assistida';

/** R3: "Recuperar acesso" da Central (so o dono). Regras em recuperacao-assistida.ts. */
@ApiTags('Admin - Central')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class RecuperacaoAssistidaController {
  constructor(private readonly recuperacao: RecuperacaoAssistidaService) {}

  @Post('usuarios/:id/recuperar-acesso')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SoDonoGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Recupera o acesso de quem perdeu o telefone e o e-mail (documento conferido) — so o dono' })
  recuperar(
    @CurrentUser('id') donoId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(recuperacaoSchema)) body: PedidoDeRecuperacao,
  ) {
    return this.recuperacao.recuperar(donoId, id, body);
  }
}
