import { z } from 'zod';
import { coordinatesSchema } from './common.schema';

/**
 * Um ponto da corrida: coordenada mais o endereco por extenso.
 *
 * A coordenada manda. O endereco escrito serve para o motorista ler e
 * para o historico — nunca para calcular distancia, porque texto de rua
 * e ambiguo e o GPS nao e.
 */
export const ridePointSchema = coordinatesSchema.extend({
  address: z.string().trim().min(3, 'Endereco muito curto.').max(300, 'Endereco muito longo.'),
  placeId: z.string().max(200).optional(),
});

/**
 * Orcamento: so o ponto A e o ponto B.
 *
 * Nao ha categoria a escolher — a plataforma opera uma modalidade unica.
 * A bandeira nao entra aqui de proposito: quem decide e a hora do
 * servidor, nunca o aparelho.
 */
export const estimateRideSchema = z.object({
  pickup: ridePointSchema,
  dropoff: ridePointSchema,
  /** Para mostrar o preco da bandeira do horario agendado. */
  scheduledFor: z.coerce.date().optional(),
  /** Categoria do veiculo (CARRO, MOTO...). */
  category: z.string().trim().toUpperCase().max(20).optional(),
  /** Mostra o desconto do cupom antes de confirmar. */
  couponCode: z.string().trim().toUpperCase().max(30).optional(),
});

export const requestRideSchema = z.object({
  pickup: ridePointSchema,
  dropoff: ridePointSchema,
  paymentMethodType: z
    .enum(['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'WALLET'])
    .default('CASH'),
  /** Corrida agendada: horario combinado (de 30 min a 7 dias a frente). */
  scheduledFor: z.coerce.date().optional(),
  /** Categoria do veiculo (CARRO, MOTO...). */
  category: z.string().trim().toUpperCase().max(20).optional(),
  /** Codigo do cupom de desconto (opcional). */
  couponCode: z.string().trim().toUpperCase().max(30).optional(),
});

export const cancelRideSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

/**
 * Fim da corrida. O aplicativo manda o que mediu; quem decide o preco e
 * o servidor. Os dois campos sao opcionais de proposito: se o GPS falhou
 * no meio do caminho, cai-se para a estimativa em vez de cobrar zero.
 */
export const finishRideSchema = z.object({
  distanceMeters: z.number().int().min(0).max(2_000_000).optional(),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  waitingSeconds: z.number().int().min(0).max(86_400).optional(),
  /**
   * Paradas durante a viagem (o passageiro pediu para esperar): segundos com
   * o carro parado 1 minuto ou mais, medidos pelo celular do motorista.
   * Entram na conta junto com a espera no embarque (Evandro, 09/10/2026).
   */
  stoppedSeconds: z.number().int().min(0).max(14_400).optional(),
  /** Onde a viagem terminou (confere a medicao do taximetro). */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/** Taximetro ao vivo: o que o celular do motorista mediu ate agora. */
export const taximetroSchema = z.object({
  distanceMeters: z.number().int().min(0).max(2_000_000),
  stoppedSeconds: z.number().int().min(0).max(14_400).optional(),
});

export const rideLocationSchema = coordinatesSchema;

export const listRidesSchema = z.object({
  status: z.string().optional(),
  /** Historico do motorista: so concluidas de hoje, da semana ou do mes. */
  period: z.enum(['day', 'week', 'month']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RidePointInput = z.infer<typeof ridePointSchema>;
export type EstimateRideInput = z.infer<typeof estimateRideSchema>;
export type RequestRideInput = z.infer<typeof requestRideSchema>;
export type CancelRideInput = z.infer<typeof cancelRideSchema>;
export type FinishRideInput = z.infer<typeof finishRideSchema>;
export type ListRidesInput = z.infer<typeof listRidesSchema>;
