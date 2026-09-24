import { Module } from '@nestjs/common';
import { VehicleCategoriesController, VehiclesController } from './vehicles.controller';
import { AdminVehiclesController } from './admin-vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  controllers: [VehicleCategoriesController, VehiclesController, AdminVehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
