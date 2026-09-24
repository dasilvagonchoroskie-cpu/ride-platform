import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { TariffsService } from './tariffs.service';
import { updateTariffsSchema } from './dto';

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
  @ApiOperation({ summary: 'Altera as duas bandeiras; vale na corrida seguinte' })
  update(@Body(new ZodValidationPipe(updateTariffsSchema)) body: never) {
    return this.tariffs.salvar(body);
  }
}
