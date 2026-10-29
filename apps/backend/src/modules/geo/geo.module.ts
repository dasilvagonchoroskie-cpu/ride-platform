import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { UsoDoMapaService } from './uso-do-mapa';

@Module({
  controllers: [GeoController],
  providers: [GeoService, UsoDoMapaService],
  exports: [GeoService, UsoDoMapaService],
})
export class GeoModule {}
