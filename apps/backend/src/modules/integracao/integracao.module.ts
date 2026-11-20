import { Module } from '@nestjs/common';
import { IntegracaoController } from './integracao.controller';
import { DriversModule } from '../drivers/drivers.module';
import { PracasModule } from '../pracas/pracas.module';
import { IntegracaoTokenGuard } from '../../common/guards/integracao-token.guard';

@Module({
  imports: [DriversModule, PracasModule],
  controllers: [IntegracaoController],
  providers: [IntegracaoTokenGuard],
})
export class IntegracaoModule {}
