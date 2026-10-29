import { Controller, Get, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import type { Request, Response } from 'express';
import { BusinessException } from '../../common/errors/business.exception';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppConfigService } from '../../config/app-config.service';
import { ImagensDoAcompanhar } from './acompanhar-imagens';
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
  private readonly imagens = new ImagensDoAcompanhar();

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
    // Esta pagina usa o Leaflet (unpkg); as imagens do mapa (TomTom) vem do
    // proprio servidor, entao a chave nunca aparece na pagina.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; " +
        "img-src 'self' data: https://unpkg.com; connect-src 'self'",
    );
    res.send(paginaDeAcompanhar(token));
  }

  /** Imagem do mapa da pagina (TomTom pelo servidor, com guardado). */
  @Get(':token/mapa/:z/:x/:y')
  async imagem(
    @Param('token') token: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @Res() res: Response,
  ): Promise<void> {
    this.corrida(token);
    const r = await this.imagens.buscar(token, z, x, y.replace(/\.png$/, ''));
    if (!r) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(r);
  }

  @Get(':token/dados')
  dados(@Param('token') token: string) {
    return this.rides.acompanharPublico(this.corrida(token));
  }
}
