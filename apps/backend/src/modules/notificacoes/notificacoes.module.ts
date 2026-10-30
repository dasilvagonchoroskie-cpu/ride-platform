import { Module } from '@nestjs/common';
import { NotificacoesController } from './notificacoes.controller';

@Module({ controllers: [NotificacoesController] })
export class NotificacoesModule {}
