import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RidesModule } from '../rides/rides.module';
import { AdminComercioController, ComercioController } from './comercio.controller';
import { ComercioAvisosService } from './comercio.avisos';
import { ComercioService } from './comercio.service';

/** Quarto aplicativo: Fortaleza Move Comercio (coleta e entrega de encomendas). */
@Module({
  imports: [PrismaModule, RidesModule],
  controllers: [ComercioController, AdminComercioController],
  providers: [ComercioService, ComercioAvisosService],
  exports: [ComercioService],
})
export class ComercioModule {}
