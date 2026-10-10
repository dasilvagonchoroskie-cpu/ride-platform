import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RidesModule } from '../rides/rides.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { AdminCentralController, DriverPayoutsController, SafetyController } from './central.controller';
import { CorridaDoMotoristaController } from './corrida-do-motorista.controller';
import { CentralService } from './central.service';
import { DadosPessoaisCentralController, MeusDadosMotoristaController } from './dados-pessoais.controller';
import { DadosPessoaisService } from './dados-pessoais.service';

@Module({
  imports: [PrismaModule, RidesModule, VehiclesModule],
  controllers: [AdminCentralController, SafetyController, DriverPayoutsController, CorridaDoMotoristaController, MeusDadosMotoristaController, DadosPessoaisCentralController],
  providers: [CentralService, DadosPessoaisService],
  exports: [CentralService],
})
export class CentralModule {}
