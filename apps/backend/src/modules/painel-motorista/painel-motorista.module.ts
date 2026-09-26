import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AdminCarteiraController, PainelMotoristaController } from './painel-motorista.controller';
import { PainelMotoristaService } from './painel-motorista.service';

@Module({
  imports: [PrismaModule],
  controllers: [PainelMotoristaController, AdminCarteiraController],
  providers: [PainelMotoristaService],
  exports: [PainelMotoristaService],
})
export class PainelMotoristaModule {}
