import { Injectable } from '@nestjs/common';
import { ERROR_CODES, haversineKm } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { applySurge, percentOf, splitCommission } from '../../common/utils/money.util';

export interface RotaMedida {
  distanceMeters: number;
  durationSeconds: number;
  polyline?: string;
}

export interface OrcamentoDaCorrida {
  categoryId: string;
  distanceMeters: number;
  durationSeconds: number;
  baseFareCents: number;
  distanceCents: number;
  timeCents: number;
  bookingFeeCents: number;
  waitingCents: number;
  subtotalCents: number;
  surgeMultiplier: number;
  totalCents: number;
  commissionPercent: number;
  commissionCents: number;
  driverEarningCents: number;
  minFareApplied: boolean;
}

/**
 * Preco da corrida.
 *
 * Regra que nao se negocia: o valor e SEMPRE calculado aqui, no servidor,
 * a partir da tabela vigente. O aplicativo nunca manda preco — manda
 * distancia e tempo medidos, e recebe de volta quanto custou. Se o preco
 * viesse do celular, bastaria alguem editar o aplicativo para andar de
 * graca ou para cobrar a mais de um passageiro.
 */
@Injectable()
export class FareService {
  // Ruas nao sao linha reta. Quando nao ha rota calculada, a distancia em
  // linha reta e multiplicada por este fator para chegar perto do real.
  private static readonly FATOR_DE_RUA = 1.35;

  // Velocidade suposta quando nao ha rota: 25 km/h e o que se faz em
  // cidade pequena, contando semaforo e parada.
  private static readonly VELOCIDADE_URBANA_KMH = 25;

  constructor(private readonly prisma: PrismaService) {}

  /** Distancia e tempo entre dois pontos quando nao ha rota por rua. */
  estimarRota(
    origem: { latitude: number; longitude: number },
    destino: { latitude: number; longitude: number },
  ): RotaMedida {
    const linhaRetaKm = haversineKm(
      origem.latitude,
      origem.longitude,
      destino.latitude,
      destino.longitude,
    );
    const ruaKm = linhaRetaKm * FareService.FATOR_DE_RUA;
    return {
      distanceMeters: Math.round(ruaKm * 1000),
      durationSeconds: Math.round((ruaKm / FareService.VELOCIDADE_URBANA_KMH) * 3600),
    };
  }

  /**
   * Monta o orcamento a partir da tabela vigente da categoria.
   *
   * `waitingSeconds` cobre o tempo que o motorista ficou parado esperando
   * o passageiro; so entra na conta se a tabela tiver preco de espera.
   */
  async calcular(params: {
    categoryId: string;
    distanceMeters: number;
    durationSeconds: number;
    waitingSeconds?: number;
    pickupLat: number;
    pickupLng: number;
  }): Promise<OrcamentoDaCorrida> {
    const tabela = await this.prisma.fareConfig.findFirst({
      where: { categoryId: params.categoryId, isActive: true, validFrom: { lte: new Date() } },
      orderBy: { validFrom: 'desc' },
    });

    if (!tabela) {
      throw new BusinessException(
        ERROR_CODES.NOT_FOUND,
        'Nao ha tabela de precos ativa para esta categoria.',
      );
    }

    const km = params.distanceMeters / 1000;
    const minutos = params.durationSeconds / 60;
    const minutosParado = (params.waitingSeconds ?? 0) / 60;

    const distanceCents = Math.round(km * tabela.perKmCents);
    const timeCents = Math.round(minutos * tabela.perMinuteCents);
    const waitingCents = Math.round(minutosParado * tabela.waitingPerMinuteCents);

    let subtotalCents =
      tabela.baseFareCents + distanceCents + timeCents + waitingCents + tabela.bookingFeeCents;

    // A tarifa dinamica so multiplica o que foi rodado. Se estiver
    // desligada na tabela, o multiplicador fica em 1 e nada muda.
    let surgeMultiplier = 1;
    if (tabela.surgeEnabled) {
      const encontrado = await this.prisma.findSurgeMultiplier(params.pickupLat, params.pickupLng);
      const teto = Number(tabela.maxSurgeMultiplier);
      surgeMultiplier = Math.min(Math.max(encontrado, 1), teto);
      subtotalCents = applySurge(subtotalCents, surgeMultiplier);
    }

    // Corrida curta nao pode sair abaixo do minimo: abaixo disso o
    // motorista sai no prejuizo so de ligar o carro.
    const minFareApplied = subtotalCents < tabela.minFareCents;
    const totalCents = minFareApplied ? tabela.minFareCents : subtotalCents;

    const commissionPercent = Number(tabela.commissionPercent);
    const divisao = splitCommission(totalCents, commissionPercent);

    return {
      categoryId: params.categoryId,
      distanceMeters: params.distanceMeters,
      durationSeconds: params.durationSeconds,
      baseFareCents: tabela.baseFareCents,
      distanceCents,
      timeCents,
      bookingFeeCents: tabela.bookingFeeCents,
      waitingCents,
      subtotalCents,
      surgeMultiplier,
      totalCents,
      commissionPercent,
      commissionCents: divisao.commissionCents,
      driverEarningCents: divisao.driverEarningCents,
      minFareApplied,
    };
  }

  /** Multa de cancelamento tardio, conforme a tabela da categoria. */
  async taxaDeCancelamento(categoryId: string): Promise<number> {
    const tabela = await this.prisma.fareConfig.findFirst({
      where: { categoryId, isActive: true },
      orderBy: { validFrom: 'desc' },
    });
    return tabela?.cancellationFeeCents ?? 0;
  }

  /** Quanto a plataforma fica de um valor bruto. */
  comissaoDe(grossCents: number, percent: number): number {
    return percentOf(grossCents, percent);
  }
}
