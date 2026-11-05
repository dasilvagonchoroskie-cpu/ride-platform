import { Module } from '@nestjs/common';
import { PracasModule } from '../pracas/pracas.module';
import { AdminClubeController, ClubeController } from './clube.controller';
import { ClubeService } from './clube.service';

/** Clube de Vantagens (Evandro, 05/11/2026). */
@Module({
  imports: [PracasModule],
  controllers: [AdminClubeController, ClubeController],
  providers: [ClubeService],
})
export class ClubeModule {}
