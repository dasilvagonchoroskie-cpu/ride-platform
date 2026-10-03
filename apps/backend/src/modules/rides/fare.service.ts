import { Injectable } from '@nestjs/common';
import { FareFlag } from '@prisma/client';
import type { FareConfig } from '@prisma/client';
import { ERROR_CODES, haversineKm } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { percentOf, splitCommission } from '../../common/utils/money.util';
import { lerMultiplicador, multiplicadorNoPonto } from './categorias';

/** Como o motorista paga a plataforma (definido pela Central). */
export interface ModeloFinanceiro {
  financeModel: string;
  customCommissionPercent: unknown;
  fixedFeeCents: number | null;
}

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
  /** Minutos de viagem cobrados (categoria com valor por minuto). */
  timeCents: number;
  category: string;
  /** Multiplicador dinamico aplicado (1 = normal). */
  multiplier: number;

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
 * 2. A bandeirada ja cobre uma franquia — os primeiros 1,5 km e os
 *    primeiros 3 minutos parado. Passando disso, cobra-se SO o excedente,
 *    nao o trajeto inteiro. Uma corrida de 1,8 km paga a bandeirada mais
 *    300 metros, e nao mais 1.800 metros.
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
   * Hora de Brasilia (0 a 23), qualquer que seja o fuso do servidor.
   *
   * O servidor roda no horario de Londres (UTC). Com getHours() puro, das
   * 19h as 22h de Brasilia a corrida saia na bandeira NOTURNA (o dobro), e
   * das 3h as 6h na diurna. Achado pelo teste de ponta a ponta.
   */
  private horaDeBrasilia(quando: Date): number {
    return Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: 'America/Sao_Paulo',
      }).format(quando),
    );
  }

  /**
   * Qual bandeira vale agora, pela hora de BRASILIA.
   *
   * A faixa noturna atravessa a meia-noite (22h as 6h), por isso o teste
   * muda de forma quando o inicio e maior que o fim.
   */
  bandeiraDe(quando: Date, inicio: number, fim: number): boolean {
    const hora = this.horaDeBrasilia(quando);
    return inicio <= fim ? hora >= inicio && hora < fim : hora >= inicio || hora < fim;
  }

  /** A tabela vigente neste instante. */
  async tabelaVigente(quando: Date = new Date(), categoria = 'CARRO') {
    let tabelas: FareConfig[] = await this.prisma.fareConfig.findMany({
      where: { isActive: true, category: categoria },
    });
    // Categoria sem tabela propria usa a do Carro.
    if (tabelas.length === 0 && categoria !== 'CARRO') {
      tabelas = await this.prisma.fareConfig.findMany({ where: { isActive: true, category: 'CARRO' } });
    }
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
    const linhaRetaKm = haversineKm(origem, destino);
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
    category?: string;
    /** Ponto de embarque: decide o multiplicador da zona. */
    pickup?: { latitude: number; longitude: number };
    /** Multiplicador ja gravado na corrida (no fim, vale o do pedido). */
    multiplier?: number;
    /** Modelo financeiro do motorista (no fim da corrida). */
    motorista?: ModeloFinanceiro | null;
  }): Promise<OrcamentoDaCorrida> {
    const quando = params.quando ?? new Date();
    const categoria = params.category ?? 'CARRO';
    const tabela = params.flag
      ? (await this.prisma.fareConfig.findUnique({ where: { category_flag: { category: categoria, flag: params.flag } } })) ??
        (await this.prisma.fareConfig.findUnique({ where: { category_flag: { category: 'CARRO', flag: params.flag } } }))
      : await this.tabelaVigente(quando, categoria);

    if (!tabela) {
      throw new BusinessException(ERROR_CODES.NOT_FOUND, 'Tabela de precos nao encontrada.');
    }

    const esperaSegundos = params.waitingSeconds ?? 0;

    // Carencia: so o que passa do incluso e cobrado.
    const metrosCobrados = Math.max(0, params.distanceMeters - tabela.freeDistanceMeters);
    const esperaCobrada = Math.max(0, esperaSegundos - tabela.freeWaitingSeconds);

    const distanceCents = Math.round((metrosCobrados / 1000) * tabela.perKmCents);
    const waitingCents = Math.round((esperaCobrada / 60) * tabela.waitingPerMinuteCents);

    const timeCents = Math.round((Math.max(0, params.durationSeconds) / 60) * tabela.perMinuteCents);
    const subtotalCents = tabela.baseFareCents + distanceCents + waitingCents + timeCents;

    // Piso da corrida. Com bandeirada de R$ 10 o piso raramente entra,
    // mas fica como rede de seguranca se alguem baixar a bandeirada.
    const minFareApplied = subtotalCents < tabela.minFareCents;
    const semMultiplicador = minFareApplied ? tabela.minFareCents : subtotalCents;
    const multiplier =
      params.multiplier ?? multiplicadorNoPonto(await lerMultiplicador(this.prisma), params.pickup);
    const totalCents = Math.round(semMultiplicador * multiplier);

    // Comissao: a da categoria, ou a do modelo que a Central definiu para o motorista.
    let commissionPercent = Number(tabela.commissionPercent);
    let divisao = splitCommission(totalCents, commissionPercent);
    const m = params.motorista;
    if (m?.financeModel === 'PERCENTUAL' && m.customCommissionPercent != null) {
      commissionPercent = Number(m.customCommissionPercent);
      divisao = splitCommission(totalCents, commissionPercent);
    } else if (m?.financeModel === 'TAXA_FIXA') {
      const fixo = Math.min(Math.max(m.fixedFeeCents ?? 0, 0), totalCents);
      commissionPercent = totalCents > 0 ? Math.round((fixo / totalCents) * 10000) / 100 : 0;
      divisao = { grossCents: totalCents, commissionCents: fixo, driverEarningCents: totalCents - fixo };
    } else if (m?.financeModel === 'MENSALIDADE') {
      commissionPercent = 0;
      divisao = { grossCents: totalCents, commissionCents: 0, driverEarningCents: totalCents };
    }

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
      timeCents,
      category: tabela.category,
      multiplier,
      subtotalCents,
      totalCents,
      minFareApplied,
      commissionPercent,
      commissionCents: divisao.commissionCents,
      driverEarningCents: divisao.driverEarningCents,
    };
  }

  /** Multa de cancelamento tardio, pela bandeira vigente. */
  async taxaDeCancelamento(quando: Date = new Date(), categoria = 'CARRO'): Promise<number> {
    const tabela = await this.tabelaVigente(quando, categoria);
    return tabela.cancellationFeeCents;
  }

  /** Quanto a plataforma fica de um valor bruto. */
  comissaoDe(grossCents: number, percent: number): number {
    return percentOf(grossCents, percent);
  }
}
