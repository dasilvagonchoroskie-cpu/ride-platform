import { z } from 'zod';
import { coordinatesSchema, uuidSchema } from './common.schema';

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

export const estimateRideSchema = z.object({
  pickup: ridePointSchema,
  dropoff: ridePointSchema,
  categoryId: uuidSchema.optional(),
});

export const requestRideSchema = z.object({
  pickup: ridePointSchema,
  dropoff: ridePointSchema,
  categoryId: uuidSchema,
  paymentMethodType: z
    .enum(['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'WALLET'])
    .default('CASH'),
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
});

export const rideLocationSchema = coordinatesSchema;

export const listRidesSchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RidePointInput = z.infer<typeof ridePointSchema>;
export type EstimateRideInput = z.infer<typeof estimateRideSchema>;
export type RequestRideInput = z.infer<typeof requestRideSchema>;
export type CancelRideInput = z.infer<typeof cancelRideSchema>;
export type FinishRideInput = z.infer<typeof finishRideSchema>;
export type ListRidesInput = z.infer<typeof listRidesSchema>;
