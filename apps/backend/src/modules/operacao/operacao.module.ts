import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAparenciaController, AdminOperacaoController, AppPublicoController } from './operacao.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AppPublicoController, AdminOperacaoController, AdminAparenciaController],
})
export class OperacaoModule {}
