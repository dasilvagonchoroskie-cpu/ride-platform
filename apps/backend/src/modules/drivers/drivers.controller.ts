import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  driverOnboardingSchema,
  setOnlineStatusSchema,
  updateDriverLocationSchema,
  updateDriverSchema,
  UserRole,
} from '@ride/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DriverApprovedGuard } from '../../common/guards/driver-approved.guard';
import { DriversService } from './drivers.service';

@ApiTags('Motorista')
@ApiBearerAuth()
@Roles(UserRole.DRIVER, UserRole.ADMIN)
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post('onboarding')
  @ApiOperation({ summary: 'Cria o cadastro de motorista (CPF, CNH) e a carteira virtual' })
  onboard(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(driverOnboardingSchema)) body: never) {
    return this.drivers.onboard(userId, body);
  }

  @Get('me')
  @ApiOperation({ summary: 'Perfil do motorista + situacao dos documentos' })
  me(@CurrentUser('id') userId: string) {
    return this.drivers.getMe(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Atualiza dados do motorista (CNH, chave Pix)' })
  update(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(updateDriverSchema)) body: never) {
    return this.drivers.updateMe(userId, body);
  }

  @Patch('me/online')
  @ApiOperation({ summary: 'Alterna o status Online/Offline' })
  setOnline(@CurrentUser('id') userId: string, @Body(new ZodValidationPipe(setOnlineStatusSchema)) body: { isOnline: boolean }) {
    return this.drivers.setOnline(userId, body.isOnline);
  }

  @Post('me/location')
  @UseGuards(DriverApprovedGuard)
  @ApiOperation({ summary: 'Envia a posicao atual do motorista (heartbeat)' })
  updateLocation(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(updateDriverLocationSchema)) body: never,
  ) {
    return this.drivers.updateLocation(userId, body);
  }
}
