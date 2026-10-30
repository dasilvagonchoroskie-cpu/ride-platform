import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, multiplierSchema, saveCategorySchema } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { TariffsService } from './tariffs.service';
import { DonoGravaGuard } from '../pracas/so-dono.guard';
import { updateTariffsSchema } from './dto';
import { z } from 'zod';
import { BusinessException } from '../../common/errors/business.exception';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PracasService } from '../pracas/pracas.service';

const cobrancaSchema = z.object({ modo: z.enum(['TAXIMETRO', 'FECHADO']) });

@ApiTags('Admin - Bandeiras')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@UseGuards(DonoGravaGuard)
@Controller('admin/tariffs')
export class TariffsController {
  constructor(
    private readonly tariffs: TariffsService,
    private readonly pracas: PracasService,
  ) {}

  /** Cidade pedida (?praca=...) que existe; operador fica sempre na dele. */
  private async cidade(userId: string, praca?: string): Promise<string | null> {
    const minha = await this.pracas.escopoDe(userId);
    if (minha) return minha;
    if (!praca) return null;
    const p = await this.pracas.buscar(praca);
    if (!p) throw BusinessException.notFound('Cidade nao encontrada.');
    return p.id;
  }

  @Get()
  @ApiOperation({ summary: 'Categorias e bandeiras (?praca=: valores daquela cidade)' })
  async list(@CurrentUser('id') userId: string, @Query('praca') praca?: string) {
    return this.tariffs.listar(await this.cidade(userId, praca));
  }

  @Put()
  @ApiOperation({ summary: 'Altera as duas bandeiras do Carro; vale na corrida seguinte' })
  update(@Body(new ZodValidationPipe(updateTariffsSchema)) body: never) {
    return this.tariffs.salvar(body);
  }

  @Put('multiplicador')
  @ApiOperation({ summary: 'Multiplicador dinamico (cidade toda e zonas)' })
  multiplicador(@Body(new ZodValidationPipe(multiplierSchema)) body: never) {
    return this.tariffs.salvarMultiplicador(body);
  }

  @Put('cobranca')
  @ApiOperation({ summary: 'Como cobrar a corrida: TAXIMETRO (pelo trajeto) ou FECHADO (o estimado)' })
  cobranca(@Body(new ZodValidationPipe(cobrancaSchema)) body: { modo: 'TAXIMETRO' | 'FECHADO' }) {
    return this.tariffs.salvarCobranca(body.modo);
  }

  @Put('categoria/:codigo')
  @ApiOperation({ summary: 'Cria (codigo NOVA) ou altera uma categoria (?praca=: so naquela cidade)' })
  async categoria(
    @CurrentUser('id') userId: string,
    @Param('codigo') codigo: string,
    @Body(new ZodValidationPipe(saveCategorySchema)) body: never,
    @Query('praca') praca?: string,
  ) {
    return this.tariffs.salvarCategoria(codigo, body, await this.cidade(userId, praca), userId);
  }

  @Delete('categoria/:codigo')
  @ApiOperation({ summary: 'A categoria volta aos valores padrao nesta cidade (?praca= obrigatorio)' })
  async voltarAoPadrao(@CurrentUser('id') userId: string, @Param('codigo') codigo: string, @Query('praca') praca?: string) {
    const cidade = await this.cidade(userId, praca);
    if (!cidade) throw BusinessException.validation('Escolha a cidade.');
    return this.tariffs.voltarAoPadrao(codigo, cidade, userId);
  }
}
