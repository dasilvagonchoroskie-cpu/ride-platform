import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { GeoModule } from '../geo/geo.module';
import { AdminCuponsController, DriverRidesController, RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { FareService } from './fare.service';

@Module({
  imports: [PrismaModule, GeoModule],
  controllers: [RidesController, DriverRidesController, AdminCuponsController],
  providers: [RidesService, FareService],
  exports: [RidesService, FareService],
})
export class RidesModule {}
