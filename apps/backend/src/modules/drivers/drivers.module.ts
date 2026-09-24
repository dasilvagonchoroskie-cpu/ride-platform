import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { AdminDriversController } from './admin-drivers.controller';
import { DriversService } from './drivers.service';
import { DriversRepository } from './drivers.repository';
import { DriverApprovedGuard } from '../../common/guards/driver-approved.guard';

@Module({
  controllers: [DriversController, AdminDriversController],
  providers: [DriversService, DriversRepository, DriverApprovedGuard],
  exports: [DriversService],
})
export class DriversModule {}
