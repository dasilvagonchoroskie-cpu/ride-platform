import { Injectable } from '@nestjs/common';
import { FareFlag } from '@prisma/client';
import { ERROR_CODES, haversineKm } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { percentOf, splitCommission } from '../../common/utils/money.util';

export interface RotaMedida {
  distanceMeters: number;
  durationSeconds: number;
}

export interface OrcamentoDaCorrida {
  flag: FareFlag;
  distanceMeters: number;
  durationSeconds: number;
  waitingSeconds: number;

  /** Bandeirada: o valor fixo, cobrado sempre. */
  baseFareCents: number;

  /** O que passou da carencia e por isso entrou na conta. */
  chargedDistanceMeters: number;
  chargedWaitingSeconds: number;
  distanceCents: number;
  waitingCents: number;

  subtotalCents: number;
  totalCents: number;
  minFareApplied: boolean;

  commissionPercent: number;
  commissionCents: number;
  driverEarningCents: number;
}

/**
 * Preco da corrida — sistema de bandeiras por horario.
 *
 * Duas regras mandam aqui, e nenhuma delas vem do celular:
 *
 * 1. A bandeira sai da hora do SERVIDOR no instante do pedido. Se viesse
 *    do aparelho, bastava mudar o relogio do celular para pagar a diurna
 *    as duas da manha.
 *
 * 2. A bandeirada ja cobre uma carencia — o primeiro quilometro e os
 *    primeiros minutos parado. Passando disso, cobra-se SO o excedente,
 *    nao o trajeto inteiro. Uma corrida de 1,2 km paga a bandeirada mais
 *    200 metros, e nao mais 1.200 metros.
 */
@Injectable()
export class FareService {
  // Ruas nao sao linha reta. Sem rota calculada, a distancia em linha
  // reta e multiplicada por este fator para chegar perto do real.
  private static readonly FATOR_DE_RUA = 1.35;

  // Velocidade suposta quando nao ha rota: 25 km/h e o que se faz em
  // cidade pequena, contando semaforo e parada.
  private static readonly VELOCIDADE_URBANA_KMH = 25;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Qual bandeira vale agora, pela hora do servidor.
   *
   * A faixa noturna atravessa a meia-noite (22h as 6h), por isso o teste
   * muda de forma quando o inicio e maior que o fim.
   */
  bandeiraDe(quando: Date, inicio: number, fim: number): boolean {
    const hora = quando.getHours();
    return inicio <= fim ? hora >= inicio && hora < fim : hora >= inicio || hora < fim;
  }

  /** A tabela vigente neste instante. */
  async tabelaVigente(quando: Date = new Date()) {
    const tabelas = await this.prisma.fareConfig.findMany({ where: { isActive: true } });
    if (tabelas.length === 0) {
      throw new BusinessException(
        ERROR_CODES.NOT_FOUND,
        'Nao ha tabela de precos ativa. Configure as bandeiras no painel.',
      );
    }
    const achada = tabelas.find((t) => this.bandeiraDe(quando, t.startHour, t.endHour));
    // Sem faixa correspondente, vale a diurna: e melhor cobrar a tarifa
    // mais barata do que recusar a corrida por erro de configuracao.
    return achada ?? tabelas.find((t) => t.flag === FareFlag.DIURNA) ?? tabelas[0];
  }

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
   * Monta o orcamento pela bandeira vigente.
   *
   * `quando` existe para que o fechamento da corrida possa recalcular com
   * a bandeira do PEDIDO, e nao com a hora em que terminou: quem chamou
   * as 21h55 nao deve pagar noturna por ter descido as 22h05.
   */
  async calcular(params: {
    distanceMeters: number;
    durationSeconds: number;
    waitingSeconds?: number;
    quando?: Date;
    flag?: FareFlag;
  }): Promise<OrcamentoDaCorrida> {
    const quando = params.quando ?? new Date();
    const tabela = params.flag
      ? await this.prisma.fareConfig.findUnique({ where: { flag: params.flag } })
      : await this.tabelaVigente(quando);

    if (!tabela) {
      throw new BusinessException(ERROR_CODES.NOT_FOUND, 'Tabela de precos nao encontrada.');
    }

    const esperaSegundos = params.waitingSeconds ?? 0;

    // Carencia: so o que passa do incluso e cobrado.
    const metrosCobrados = Math.max(0, params.distanceMeters - tabela.freeDistanceMeters);
    const esperaCobrada = Math.max(0, esperaSegundos - tabela.freeWaitingSeconds);

    const distanceCents = Math.round((metrosCobrados / 1000) * tabela.perKmCents);
    const waitingCents = Math.round((esperaCobrada / 60) * tabela.waitingPerMinuteCents);

    const subtotalCents = tabela.baseFareCents + distanceCents + waitingCents;

    // Piso da corrida. Com bandeirada de R$ 10 o piso raramente entra,
    // mas fica como rede de seguranca se alguem baixar a bandeirada.
    const minFareApplied = subtotalCents < tabela.minFareCents;
    const totalCents = minFareApplied ? tabela.minFareCents : subtotalCents;

    const commissionPercent = Number(tabela.commissionPercent);
    const divisao = splitCommission(totalCents, commissionPercent);

    return {
      flag: tabela.flag,
      distanceMeters: params.distanceMeters,
      durationSeconds: params.durationSeconds,
      waitingSeconds: esperaSegundos,
      baseFareCents: tabela.baseFareCents,
      chargedDistanceMeters: metrosCobrados,
      chargedWaitingSeconds: esperaCobrada,
      distanceCents,
      waitingCents,
      subtotalCents,
      totalCents,
      minFareApplied,
      commissionPercent,
      commissionCents: divisao.commissionCents,
      driverEarningCents: divisao.driverEarningCents,
    };
  }

  /** Multa de cancelamento tardio, pela bandeira vigente. */
  async taxaDeCancelamento(quando: Date = new Date()): Promise<number> {
    const tabela = await this.tabelaVigente(quando);
    return tabela.cancellationFeeCents;
  }

  /** Quanto a plataforma fica de um valor bruto. */
  comissaoDe(grossCents: number, percent: number): number {
    return percentOf(grossCents, percent);
  }
}
