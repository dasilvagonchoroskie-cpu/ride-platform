import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RidesModule } from '../rides/rides.module';
import { AdminCentralController, DriverPayoutsController, SafetyController } from './central.controller';
import { CentralService } from './central.service';

@Module({
  imports: [PrismaModule, RidesModule],
  controllers: [AdminCentralController, SafetyController, DriverPayoutsController],
  providers: [CentralService],
})
export class CentralModule {}
