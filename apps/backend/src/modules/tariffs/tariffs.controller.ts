import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, multiplierSchema, saveCategorySchema } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { TariffsService } from './tariffs.service';
import { updateTariffsSchema } from './dto';
import { z } from 'zod';

const cobrancaSchema = z.object({ modo: z.enum(['TAXIMETRO', 'FECHADO']) });

@ApiTags('Admin - Bandeiras')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/tariffs')
export class TariffsController {
  constructor(private readonly tariffs: TariffsService) {}

  @Get()
  @ApiOperation({ summary: 'Valores atuais das duas bandeiras' })
  list() {
    return this.tariffs.listar();
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
  @ApiOperation({ summary: 'Cria (codigo NOVA) ou altera uma categoria com as duas bandeiras' })
  categoria(@Param('codigo') codigo: string, @Body(new ZodValidationPipe(saveCategorySchema)) body: never) {
    return this.tariffs.salvarCategoria(codigo, body);
  }
}
