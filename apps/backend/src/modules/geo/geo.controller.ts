import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { mapaComChave } from '../operacao/mapa.config';
import { GeoService } from './geo.service';
import { UsoDoMapaService } from './uso-do-mapa';
import { PracasService } from '../pracas/pracas.service';

const buscaSchema = z.object({
  q: z.string().trim().min(2).max(120),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  /** Token de sessao da tela de destino (etapa 3). */
  sessao: z.string().trim().max(64).optional(),
});

const pontoSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const mapaSchema = z.object({
  /** Imagens que o celular baixou desde o ultimo aviso. */
  imagens: z.coerce.number().int().min(0).max(20_000).optional(),
});

const rotaSchema = z.object({
  deLat: z.coerce.number().min(-90).max(90),
  deLng: z.coerce.number().min(-180).max(180),
  paraLat: z.coerce.number().min(-90).max(90),
  paraLng: z.coerce.number().min(-180).max(180),
});

@ApiTags('Enderecos')
@ApiBearerAuth()
@Roles(UserRole.PASSENGER, UserRole.DRIVER, UserRole.ADMIN)
@Controller('geo')
export class GeoController {
  constructor(
    private readonly geo: GeoService,
    private readonly uso: UsoDoMapaService,
    private readonly pracas: PracasService,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Busca enderecos e lugares perto de um ponto (TomTom, pelo servidor)' })
  async buscar(@Query(new ZodValidationPipe(buscaSchema)) q: { q: string; lat: number; lng: number; sessao?: string }) {
    // Centro e limite da cidade (praca) de onde vem a busca; fonte da busca
    // configuravel por cidade.
    const praca = await this.pracas.doPonto({ latitude: q.lat, longitude: q.lng }).catch(() => null);
    return this.geo.buscar(q.q, q.lat, q.lng, {
      raioMetros: praca ? praca.raioKm * 1000 : undefined,
      sessao: q.sessao,
      fonte: praca?.fonteBusca,
    });
  }

  @Get('rota')
  @ApiOperation({ summary: 'Caminho pelas ruas entre dois pontos (para desenhar no mapa)' })
  async rota(@Query(new ZodValidationPipe(rotaSchema)) q: { deLat: number; deLng: number; paraLat: number; paraLng: number }) {
    const de = { latitude: q.deLat, longitude: q.deLng };
    const para = { latitude: q.paraLat, longitude: q.paraLng };
    // So para desenhar: nao essencial (no modo economia vem a linha reta).
    // O servidor nao guarda rota de ninguem (29/10/2026): cada app pede uma
    // vez por etapa da corrida e o proprio celular guarda.
    const r = await this.geo.rota(de, para, false);
    if (r) return r;
    return {
      distanceMeters: null,
      durationSeconds: null,
      pontos: [
        [de.latitude, de.longitude],
        [para.latitude, para.longitude],
      ],
      porRua: false,
      limite: this.geo.parado(),
      economia: this.geo.economia(),
    };
  }

  @Get('mapa')
  @ApiOperation({ summary: 'Endereco das imagens do mapa (TomTom, com a chave) e modo economia — so com login' })
  mapa(@Query(new ZodValidationPipe(mapaSchema)) q: { imagens?: number }) {
    // O celular conta as imagens que baixou da TomTom e manda o numero aqui
    // (a cota de imagens e da chave inteira: 200 mil por mes).
    if (q.imagens) this.uso.contarImagens(q.imagens);
    return { ...mapaComChave(), economia: this.geo.economia(), parado: this.geo.parado() };
  }

  @Get('uso')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Uso da TomTom hoje e no mes (Central)' })
  usoDoMapa() {
    return { ligado: this.geo.ligado, ...this.uso.resumo() };
  }

  @Get('reverse')
  @ApiOperation({ summary: 'Endereco escrito de um ponto do mapa' })
  endereco(@Query(new ZodValidationPipe(pontoSchema)) q: { lat: number; lng: number }) {
    return this.geo.endereco(q.lat, q.lng);
  }
}
