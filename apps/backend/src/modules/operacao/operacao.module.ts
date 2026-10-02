import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminOperacaoController, AppPublicoController } from './operacao.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AppPublicoController, AdminOperacaoController],
})
export class OperacaoModule {}
