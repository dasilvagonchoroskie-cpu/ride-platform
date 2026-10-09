import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { Public } from '../../common/decorators/public.decorator';
import { AppConfigService } from '../../config/app-config.service';
import { PushService } from '../../integrations/notifications/push.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private static readonly inicio = new Date().toISOString();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
    private readonly push: PushService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Status da API, banco e cache' })
  async check() {
    const [database, cache] = await Promise.all([this.prisma.isHealthy(), this.redis.ping()]);

    return {
      status: database && cache ? 'ok' : 'degraded',
      env: this.config.env,
      // Versao no ar: o commit do GitHub que o Render publicou. O teste de
      // ponta a ponta e a esteira dos APKs conferem se o servidor esta em
      // dia com o codigo (servidor esquecido desatualizado = app quebrado).
      versao: (process.env.RENDER_GIT_COMMIT ?? 'local').slice(0, 7),
      commit: process.env.RENDER_GIT_COMMIT ?? null,
      noArDesde: HealthController.inicio,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        database: database ? 'up' : 'down',
        redis: cache ? 'up' : 'down',
        // Push (Firebase): ok = o Google aceitou a chave na subida do servidor.
        push: this.push.conferencia,
      },
    };
  }
}
