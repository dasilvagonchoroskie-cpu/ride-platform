import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { Public } from '../../common/decorators/public.decorator';
import { AppConfigService } from '../../config/app-config.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Status da API, banco e cache' })
  async check() {
    const [database, cache] = await Promise.all([this.prisma.isHealthy(), this.redis.ping()]);

    return {
      status: database && cache ? 'ok' : 'degraded',
      env: this.config.env,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        database: database ? 'up' : 'down',
        redis: cache ? 'up' : 'down',
      },
    };
  }
}
