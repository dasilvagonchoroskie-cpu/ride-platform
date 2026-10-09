import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { PushService } from './push.service';

@Global()
@Module({
  providers: [NotificationService, PushService],
  exports: [NotificationService, PushService],
})
export class NotificationModule {}
