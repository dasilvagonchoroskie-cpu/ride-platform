import { Module } from '@nestjs/common';
import { LimpezaController } from './limpeza.controller';
import { LimpezaService } from './limpeza.service';

/** Limpeza dos dados de teste e "zerar a operacao" (so o dono). */
@Module({
  controllers: [LimpezaController],
  providers: [LimpezaService],
})
export class LimpezaModule {}
