import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
import { gravarCobranca, lerCobranca } from '../rides/cobranca';
import { aplicarSemente } from '../rides/semente-categorias';
import { ajusteDe, aplicarAjuste, categoriasDaCidade, gravarAjuste, lerAjustes } from '../rides/tarifas-da-cidade';
import type { ModoCobranca } from '../rides/cobranca';

/**
 * Administracao das bandeiras.
 *
 * Nao ha cache: o motor de preco le a tabela do banco a cada corrida. Foi
 * de proposito — assim, alterar o valor pela Central vale na corrida
 * seguinte, sem reiniciar o servidor nem esperar nada expirar.
 */
@Injectable()
export class TariffsService implements OnModuleInit {
  private readonly logger = new Logger(TariffsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Semente das categorias Popular, Conforto e Premium (uma vez so). */
  async onModuleInit(): Promise<void> {
    try {
      if (await aplicarSemente(this.prisma as never, (db) => lerCategorias(db as never), (db, l) => gravarCategorias(db as never, l))) {
        this.logger.log('Categorias padrao criadas: Popular (CARRO), Conforto e Premium (desligadas).');
      }
    } catch (e) {
      this.logger.warn(`Semente das categorias nao rodou: ${(e as Error).message}`);
    }
  }

  /**
   * Todas as categorias com as duas bandeiras, mais o multiplicador.
   * "diurna" e "noturna" soltas sao as do Carro (quem ja lia assim continua).
   * Com [praca]: os valores e o ligado/desligado daquela cidade (o que nao
   * foi ajustado na cidade vem do padrao; "daCidade" diz o que foi).
   */
  async listar(praca?: string | null) {
    const tabelas: FareConfig[] = await this.prisma.fareConfig.findMany();
    const ajustes = await lerAjustes(this.prisma);
    const categorias = categoriasDaCidade(await lerCategorias(this.prisma), ajustes, praca);
    const daPadrao = (cat: string, flag: FareFlag) =>
      tabelas.find((t) => t.category === cat && t.flag === flag) ??
      tabelas.find((t) => t.category === 'CARRO' && t.flag === flag);
    const da = (cat: string, flag: FareFlag) => {
      const t = daPadrao(cat, flag);
      return t ? aplicarAjuste(t, ajusteDe(ajustes, praca, cat)) : t;
    };

    const diurna = da('CARRO', FareFlag.DIURNA);
    const noturna = da('CARRO', FareFlag.NOTURNA);
    if (!diurna || !noturna) {
      throw new BusinessException(ERROR_CODES.NOT_FOUND, 'As bandeiras ainda nao foram criadas. Rode a semente do banco.');
    }
    return {
      diurna: this.paraFora(diurna),
      noturna: this.paraFora(noturna),
      praca: praca ?? null,
      categorias: categorias.map((c) => ({
        ...c,
        diurna: this.paraFora(da(c.codigo, FareFlag.DIURNA)!),
        noturna: this.paraFora(da(c.codigo, FareFlag.NOTURNA)!),
        proprias: tabelas.some((t) => t.category === c.codigo),
        daCidade: !!ajusteDe(ajustes, praca, c.codigo),
      })),
      multiplicador: await lerMultiplicador(this.prisma),
      /** TAXIMETRO (valor corre na viagem) ou FECHADO (o estimado no pedido). */
      cobranca: await lerCobranca(this.prisma),
    };
  }

  async salvarCobranca(modo: ModoCobranca) {
    await gravarCobranca(this.prisma, modo);
    return this.listar();
  }

  /** Compatibilidade: salvar so as bandeiras do Carro. */
  async salvar(input: UpdateTariffsInput) {
    const carro = (await lerCategorias(this.prisma)).find((c) => c.codigo === 'CARRO');
    return this.salvarCategoria('CARRO', { nome: carro?.nome ?? 'Popular', ativa: true, ...input } as SaveCategoryInput);
  }

  /**
   * Cria ou altera uma categoria com as duas bandeiras (codigo vem do nome se
   * for nova). Com [praca]: grava so o ajuste daquela cidade (ligada,
   * multiplicador e valores); nome, figura, texto e lugares sao os mesmos em
   * todas as cidades.
   */
  async salvarCategoria(codigoOuNovo: string, input: SaveCategoryInput, praca?: string | null, quem?: string) {
    this.conferirCobertura(input);
    if (praca) {
      const codigo = codigoOuNovo.toUpperCase();
      const categorias = await lerCategorias(this.prisma);
      if (!categorias.some((c) => c.codigo === codigo)) throw BusinessException.notFound('Categoria nao encontrada. Crie primeiro em "Todas as cidades".');
      if (codigo === 'CARRO' && !input.ativa) throw BusinessException.validation('O Popular nao pode ser desligado: e a categoria de reserva da cidade.');
      const valores = (b: SaveCategoryInput['diurna']) => ({
        startHour: b.startHour,
        endHour: b.endHour,
        baseFareCents: b.baseFareCents,
        perKmCents: b.perKmCents,
        perMinuteCents: b.perMinuteCents ?? 0,
        waitingPerMinuteCents: b.waitingPerMinuteCents,
        freeDistanceMeters: b.freeDistanceMeters,
        freeWaitingSeconds: b.freeWaitingSeconds,
        minFareCents: b.minFareCents,
        cancellationFeeCents: b.cancellationFeeCents,
        commissionPercent: b.commissionPercent,
      });
      await gravarAjuste(
        this.prisma,
        praca,
        codigo,
        { ativa: input.ativa, multiplicador: input.multiplicador ?? 1, diurna: valores(input.diurna), noturna: valores(input.noturna) },
        quem,
      );
      return this.listar(praca);
    }
    const codigo = codigoOuNovo === 'NOVA' ? codigoDaCategoria(input.nome) : codigoOuNovo.toUpperCase();
    if (!codigo) throw BusinessException.validation('Nome da categoria invalido.');
    if (codigo === 'CARRO' && !input.ativa) throw BusinessException.validation('O Popular nao pode ser desligado: e a categoria de reserva.');
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
      const nova = {
        codigo,
        nome: input.nome,
        ativa: input.ativa,
        icone: input.icone ?? atual?.icone ?? (codigo.includes('MOTO') ? 'moto' : 'carro'),
        descricao: input.descricao ?? atual?.descricao ?? '',
        capacidade: input.capacidade ?? atual?.capacidade ?? (codigo.includes('MOTO') ? 1 : 4),
        multiplicador: input.multiplicador ?? atual?.multiplicador ?? 1,
      };
      await gravarCategorias(tx, atual ? categorias.map((c) => (c.codigo === codigo ? nova : c)) : [...outras, nova]);
    });
    return this.listar();
  }

  /** Tira o ajuste da cidade: a categoria volta ao padrao (todas as cidades). */
  async voltarAoPadrao(codigo: string, praca: string, quem?: string) {
    await gravarAjuste(this.prisma, praca, codigo.toUpperCase(), null, quem);
    return this.listar(praca);
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
