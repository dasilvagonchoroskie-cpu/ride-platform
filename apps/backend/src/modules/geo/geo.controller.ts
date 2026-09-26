import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@ride/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import { GeoService } from './geo.service';

const buscaSchema = z.object({
  q: z.string().trim().min(2).max(120),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const pontoSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

@ApiTags('Enderecos')
@ApiBearerAuth()
@Roles(UserRole.PASSENGER, UserRole.DRIVER, UserRole.ADMIN)
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('search')
  @ApiOperation({ summary: 'Busca enderecos e lugares perto de um ponto (OpenStreetMap)' })
  buscar(@Query(new ZodValidationPipe(buscaSchema)) q: { q: string; lat: number; lng: number }) {
    return this.geo.buscar(q.q, q.lat, q.lng);
  }

  @Get('reverse')
  @ApiOperation({ summary: 'Endereco escrito de um ponto do mapa' })
  endereco(@Query(new ZodValidationPipe(pontoSchema)) q: { lat: number; lng: number }) {
    return this.geo.endereco(q.lat, q.lng);
  }
}
