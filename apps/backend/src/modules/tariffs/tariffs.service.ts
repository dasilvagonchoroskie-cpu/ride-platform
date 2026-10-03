import { Injectable } from '@nestjs/common';
import { FareFlag } from '@prisma/client';
import type { FareConfig } from '@prisma/client';
import { ERROR_CODES } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { PrismaService } from '../../database/prisma.service';
import type { UpdateTariffsInput } from './dto';
import type { MultiplierInput, SaveCategoryInput } from '@ride/shared';
import {
  codigoDaCategoria,
  gravarCategorias,
  gravarMultiplicador,
  lerCategorias,
  lerMultiplicador,
} from '../rides/categorias';

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

  /**
   * Todas as categorias com as duas bandeiras, mais o multiplicador.
   * "diurna" e "noturna" soltas sao as do Carro (quem ja lia assim continua).
   */
  async listar() {
    const tabelas: FareConfig[] = await this.prisma.fareConfig.findMany();
    const categorias = await lerCategorias(this.prisma);
    const da = (cat: string, flag: FareFlag) =>
      tabelas.find((t) => t.category === cat && t.flag === flag) ??
      tabelas.find((t) => t.category === 'CARRO' && t.flag === flag);

    const diurna = da('CARRO', FareFlag.DIURNA);
    const noturna = da('CARRO', FareFlag.NOTURNA);
    if (!diurna || !noturna) {
      throw new BusinessException(ERROR_CODES.NOT_FOUND, 'As bandeiras ainda nao foram criadas. Rode a semente do banco.');
    }
    return {
      diurna: this.paraFora(diurna),
      noturna: this.paraFora(noturna),
      categorias: categorias.map((c) => ({
        ...c,
        diurna: this.paraFora(da(c.codigo, FareFlag.DIURNA)!),
        noturna: this.paraFora(da(c.codigo, FareFlag.NOTURNA)!),
        proprias: tabelas.some((t) => t.category === c.codigo),
      })),
      multiplicador: await lerMultiplicador(this.prisma),
    };
  }

  /** Compatibilidade: salvar so as bandeiras do Carro. */
  async salvar(input: UpdateTariffsInput) {
    const carro = (await lerCategorias(this.prisma)).find((c) => c.codigo === 'CARRO');
    return this.salvarCategoria('CARRO', { nome: carro?.nome ?? 'Carro', ativa: true, ...input } as SaveCategoryInput);
  }

  /** Cria ou altera uma categoria com as duas bandeiras (codigo vem do nome se for nova). */
  async salvarCategoria(codigoOuNovo: string, input: SaveCategoryInput) {
    this.conferirCobertura(input);
    const codigo = codigoOuNovo === 'NOVA' ? codigoDaCategoria(input.nome) : codigoOuNovo.toUpperCase();
    if (!codigo) throw BusinessException.validation('Nome da categoria invalido.');
    if (codigo === 'CARRO' && !input.ativa) throw BusinessException.validation('A categoria Carro nao pode ser desligada.');
    const categorias = await lerCategorias(this.prisma);
    if (codigoOuNovo === 'NOVA' && categorias.some((c) => c.codigo === codigo)) {
      throw BusinessException.conflict('Ja existe uma categoria com este nome.');
    }

    await this.prisma.withTransaction(async (tx) => {
      for (const [flag, valores] of [
        [FareFlag.DIURNA, input.diurna],
        [FareFlag.NOTURNA, input.noturna],
      ] as const) {
        await tx.fareConfig.upsert({
          where: { category_flag: { category: codigo, flag } },
          create: { category: codigo, flag, ...valores, isActive: true },
          update: { ...valores, isActive: true },
        });
      }
      const outras = categorias.filter((c) => c.codigo !== codigo);
      const atual = categorias.find((c) => c.codigo === codigo);
      const nova = { codigo, nome: input.nome, ativa: input.ativa };
      await gravarCategorias(tx, atual ? categorias.map((c) => (c.codigo === codigo ? nova : c)) : [...outras, nova]);
    });
    return this.listar();
  }

  async salvarMultiplicador(input: MultiplierInput) {
    await gravarMultiplicador(this.prisma, input);
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
    const encaixa = diurna.endHour === noturna.startHour && noturna.endHour === diurna.startHour;
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
      perMinuteCents: t.perMinuteCents,
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
