import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AdminOperacaoController, AppPublicoController } from './operacao.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AppPublicoController, AdminOperacaoController],
})
export class OperacaoModule {}
