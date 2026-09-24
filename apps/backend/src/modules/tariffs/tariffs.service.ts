import { Injectable } from '@nestjs/common';
import { FareFlag } from '@prisma/client';
import type { FareConfig } from '@prisma/client';
import { ERROR_CODES } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { UpdateTariffsInput } from './dto';

/**
 * Administracao das bandeiras.
 *
 * Nao ha cache: o motor de preco le a tabela do banco a cada corrida. Foi
 * de proposito — assim, alterar o valor pela Central vale na corrida
 * seguinte, sem reiniciar o servidor nem esperar nada expirar.
 */
@Injectable()
export class TariffsService {
  constructor(private readonly prisma: PrismaService) {}

  async listar() {
    const tabelas: FareConfig[] = await this.prisma.fareConfig.findMany();
    const achar = (flag: FareFlag) => tabelas.find((t) => t.flag === flag);

    const diurna = achar(FareFlag.DIURNA);
    const noturna = achar(FareFlag.NOTURNA);

    if (!diurna || !noturna) {
      throw new BusinessException(
        ERROR_CODES.NOT_FOUND,
        'As bandeiras ainda nao foram criadas. Rode a semente do banco.',
      );
    }

    return { diurna: this.paraFora(diurna), noturna: this.paraFora(noturna) };
  }

  async salvar(input: UpdateTariffsInput) {
    this.conferirCobertura(input);

    // As duas na mesma transacao: se a segunda falhar, a primeira nao
    // fica gravada sozinha deixando um horario a descoberto.
    await this.prisma.withTransaction(async (tx) => {
      for (const [flag, valores] of [
        [FareFlag.DIURNA, input.diurna],
        [FareFlag.NOTURNA, input.noturna],
      ] as const) {
        await tx.fareConfig.upsert({
          where: { flag },
          create: { flag, ...valores, isActive: true },
          update: { ...valores, isActive: true },
        });
      }
    });

    return this.listar();
  }

  /**
   * As duas faixas juntas precisam cobrir as 24 horas, sem buraco e sem
   * sobreposicao. Sem esta conferencia, um erro de digitacao na Central
   * deixaria corridas sem tabela de preco no meio da madrugada.
   */
  private conferirCobertura(input: UpdateTariffsInput): void {
    const { diurna, noturna } = input;

    if (diurna.startHour === diurna.endHour || noturna.startHour === noturna.endHour) {
      throw BusinessException.validation('A faixa de horario nao pode comecar e terminar na mesma hora.');
    }

    // Uma bandeira comeca exatamente onde a outra termina.
    const encaixa =
      diurna.endHour === noturna.startHour && noturna.endHour === diurna.startHour;

    if (!encaixa) {
      throw BusinessException.validation(
        'As duas bandeiras precisam cobrir o dia inteiro: a diurna deve terminar na hora em que a noturna comeca, e vice-versa.',
      );
    }
  }

  private paraFora(t: FareConfig) {
    return {
      flag: t.flag,
      startHour: t.startHour,
      endHour: t.endHour,
      baseFareCents: t.baseFareCents,
      perKmCents: t.perKmCents,
      waitingPerMinuteCents: t.waitingPerMinuteCents,
      freeDistanceMeters: t.freeDistanceMeters,
      freeWaitingSeconds: t.freeWaitingSeconds,
      minFareCents: t.minFareCents,
      cancellationFeeCents: t.cancellationFeeCents,
      commissionPercent: Number(t.commissionPercent),
      updatedAt: t.updatedAt,
    };
  }
}
