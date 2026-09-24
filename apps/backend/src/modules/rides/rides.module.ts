import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { DriverRidesController, RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { FareService } from './fare.service';

@Module({
  imports: [PrismaModule],
  controllers: [RidesController, DriverRidesController],
  providers: [RidesService, FareService],
  exports: [RidesService, FareService],
})
export class RidesModule {}
