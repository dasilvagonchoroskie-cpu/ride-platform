import { Global, Module } from '@nestjs/common';
import { PracasController } from './pracas.controller';
import { PracasService } from './pracas.service';
import { DonoGravaGuard, SoDonoGuard } from './so-dono.guard';

/** Cidades (pracas) e escopo de cada conta da Central — usado por todos os modulos. */
@Global()
@Module({
  controllers: [PracasController],
  providers: [PracasService, SoDonoGuard, DonoGravaGuard],
  exports: [PracasService, SoDonoGuard, DonoGravaGuard],
})
export class PracasModule {}
