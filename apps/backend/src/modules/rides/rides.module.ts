import { AcompanharCorridaController, CompartilharCorridaController } from './acompanhar.controller';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { GeoModule } from '../geo/geo.module';
import { AdminCuponsController, DriverRidesController, RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { FareService } from './fare.service';
import { EntregasService } from '../entregas/entregas.service';
import { AdminEntregasConfigController, AdminEntregasController, EntregasController } from '../entregas/entregas.controller';

@Module({
  imports: [PrismaModule, GeoModule],
  controllers: [CompartilharCorridaController, AcompanharCorridaController, RidesController, DriverRidesController, AdminCuponsController, EntregasController, AdminEntregasController, AdminEntregasConfigController],
  providers: [RidesService, FareService, EntregasService],
  exports: [RidesService, FareService, EntregasService],
})
export class RidesModule {}
