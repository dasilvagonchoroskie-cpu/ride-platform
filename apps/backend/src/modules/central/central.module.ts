import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RidesModule } from '../rides/rides.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { AdminCentralController, DriverPayoutsController, SafetyController } from './central.controller';
import { CorridaDoMotoristaController } from './corrida-do-motorista.controller';
import { CentralService } from './central.service';

@Module({
  imports: [PrismaModule, RidesModule, VehiclesModule],
  controllers: [AdminCentralController, SafetyController, DriverPayoutsController, CorridaDoMotoristaController],
  providers: [CentralService],
  exports: [CentralService],
})
export class CentralModule {}
