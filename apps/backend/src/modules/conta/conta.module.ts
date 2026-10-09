import { Module } from '@nestjs/common';
import { CentralModule } from '../central/central.module';
import { DriversModule } from '../drivers/drivers.module';
import { ContaController } from './conta.controller';
import { ContaService } from './conta.service';

@Module({
  imports: [DriversModule, CentralModule],
  controllers: [ContaController],
  providers: [ContaService],
})
export class ContaModule {}
