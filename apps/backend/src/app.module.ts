import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './database/redis.module';
import { StorageModule } from './integrations/storage/storage.module';
import { NotificationModule } from './integrations/notifications/notification.module';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { HealthModule } from './modules/health/health.module';
import { RidesModule } from './modules/rides/rides.module';
import { TariffsModule } from './modules/tariffs/tariffs.module';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    StorageModule,
    NotificationModule,
    AuthModule,
    UsersModule,
    DriversModule,
    DocumentsModule,
    VehiclesModule,
    RidesModule,
    TariffsModule,
    HealthModule,
  ],
  providers: [
    // A ordem importa: throttle -> autenticacao -> papeis
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
