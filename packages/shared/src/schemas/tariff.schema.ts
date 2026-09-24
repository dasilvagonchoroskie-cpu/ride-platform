import { z } from 'zod';

/**
 * Configuracao de uma bandeira.
 *
 * Todo dinheiro em centavos inteiros. Aceitar reais com virgula aqui seria
 * abrir a porta para erro de arredondamento no valor da corrida.
 */
export const tariffFlagSchema = z.object({
  /** Hora em que a bandeira comeca a valer (0 a 23). */
  startHour: z.number().int().min(0).max(23),

  /** Hora em que deixa de valer. A noturna atravessa a meia-noite. */
  endHour: z.number().int().min(0).max(23),

  /** Bandeirada: o valor fixo, que ja inclui a franquia. */
  baseFareCents: z.number().int().min(0).max(1_000_00),

  perKmCents: z.number().int().min(0).max(100_00),
  waitingPerMinuteCents: z.number().int().min(0).max(100_00),

  /** Franquia inclusa na bandeirada. */
  freeDistanceMeters: z.number().int().min(0).max(50_000),
  freeWaitingSeconds: z.number().int().min(0).max(3_600),

  minFareCents: z.number().int().min(0).max(1_000_00),
  cancellationFeeCents: z.number().int().min(0).max(1_000_00),

  commissionPercent: z.number().min(0).max(100),
});

/**
 * Salva as duas bandeiras de uma vez.
 *
 * As duas juntas de proposito: salvar uma so abriria a chance de deixar um
 * horario descoberto — por exemplo, a diurna indo ate as 20h e a noturna
 * comecando as 22h, com duas horas sem tabela nenhuma.
 */
export const updateTariffsSchema = z.object({
  diurna: tariffFlagSchema,
  noturna: tariffFlagSchema,
});

export type TariffFlagInput = z.infer<typeof tariffFlagSchema>;
export type UpdateTariffsInput = z.infer<typeof updateTariffsSchema>;
