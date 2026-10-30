import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PushService } from './push.service';
import { CaixaDeEntradaService } from './caixa-de-entrada.service';

@Global()
@Module({
  providers: [NotificationService, PushService, CaixaDeEntradaService],
  exports: [NotificationService, PushService, CaixaDeEntradaService],
})
export class NotificationModule {}
