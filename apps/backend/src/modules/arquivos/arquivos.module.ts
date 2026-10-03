import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ArquivosController } from './arquivos.controller';
import { ArquivosService } from './arquivos.service';

@Module({
  imports: [PrismaModule],
  controllers: [ArquivosController],
  providers: [ArquivosService],
})
export class ArquivosModule {}
