import { Controller, Get, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import type { Request, Response } from 'express';
import { BusinessException } from '../../common/errors/business.exception';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppConfigService } from '../../config/app-config.service';
import { corridaDoToken, paginaDeAcompanhar, tokenDeAcompanhar } from './acompanhar';
import { RidesService } from './rides.service';

/** Endereco publico do servidor (o Render repassa o https no cabecalho). */
function base(req: Request): string {
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

/** Passageiro pede o link para mandar a quem quiser. */
@ApiTags('rides')
@ApiBearerAuth()
// Motorista tambem pede corrida como passageiro (mesma conta).
@Roles(UserRole.PASSENGER, UserRole.DRIVER, UserRole.ADMIN)
@Controller('rides')
export class CompartilharCorridaController {
  constructor(
    private readonly rides: RidesService,
    private readonly config: AppConfigService,
  ) {}

  @Post(':id/compartilhar')
  @ApiOperation({ summary: 'Link para a familia acompanhar a viagem no mapa' })
  async compartilhar(@CurrentUser('id') userId: string, @Param('id', new ParseUUIDPipe()) rideId: string, @Req() req: Request) {
    await this.rides.corridaAbertaDoPassageiro(userId, rideId);
    return { link: `${base(req)}/api/acompanhar/${tokenDeAcompanhar(rideId, this.config.jwt.accessSecret)}` };
  }
}

/** Pagina e dados publicos do acompanhamento (sem login, so com o link). */
@ApiTags('public')
@Public()
@Controller('acompanhar')
export class AcompanharCorridaController {
  constructor(
    private readonly rides: RidesService,
    private readonly config: AppConfigService,
  ) {}

  private corrida(token: string): string {
    const id = corridaDoToken(token, this.config.jwt.accessSecret);
    if (!id) throw BusinessException.notFound('Link de acompanhamento invalido.');
    return id;
  }

  @Get(':token')
  pagina(@Param('token') token: string, @Res() res: Response): void {
    this.corrida(token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    // Esta pagina usa o Leaflet (unpkg) e os mapas do OpenStreetMap.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; " +
        "img-src 'self' data: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://unpkg.com; connect-src 'self'",
    );
    res.send(paginaDeAcompanhar(token));
  }

  @Get(':token/dados')
  dados(@Param('token') token: string) {
    return this.rides.acompanharPublico(this.corrida(token));
  }
}
