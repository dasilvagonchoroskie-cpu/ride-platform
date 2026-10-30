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
/**
 * Etapa 3 (Evandro, 29/10/2026):
 * - "Nao informar destino": semDestino = true, sem dropoff. A corrida vai
 *   pelo taximetro e o app mostra que o valor e ESTIMADO.
 * - Parada extra: ate 2 paradas no caminho (paradas), na ordem.
 */
const comDestinoOuSem = <T extends { dropoff?: unknown; semDestino?: boolean }>(v: T) => v.semDestino === true || v.dropoff != null;
const AVISO_DESTINO = { message: 'Informe o destino ou escolha "sem destino".', path: ['dropoff'] };

export const estimateRideSchema = z.object({
  pickup: ridePointSchema,
  dropoff: ridePointSchema.optional(),
  semDestino: z.boolean().optional(),
  paradas: z.array(ridePointSchema).max(2, 'No maximo 2 paradas.').optional(),
  /** Para mostrar o preco da bandeira do horario agendado. */
  scheduledFor: z.coerce.date().optional(),
  /** Categoria do veiculo (CARRO, MOTO...). */
  category: z.string().trim().toUpperCase().max(20).optional(),
  /** Mostra o desconto do cupom antes de confirmar. */
  couponCode: z.string().trim().toUpperCase().max(30).optional(),
  /** Medida assinada do orcamento anterior: trocar categoria ou cupom nao pede a rota de novo. */
  cotacao: z.string().max(2000).optional(),
}).refine(comDestinoOuSem, AVISO_DESTINO);

export const requestRideSchema = z.object({
  pickup: ridePointSchema,
  dropoff: ridePointSchema.optional(),
  semDestino: z.boolean().optional(),
  paradas: z.array(ridePointSchema).max(2, 'No maximo 2 paradas.').optional(),
  paymentMethodType: z
    .enum(['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'WALLET'])
    .default('CASH'),
  /** Corrida agendada: horario combinado (de 30 min a 7 dias a frente). */
  scheduledFor: z.coerce.date().optional(),
  /** Categoria do veiculo (CARRO, MOTO...). */
  category: z.string().trim().toUpperCase().max(20).optional(),
  /** Codigo do cupom de desconto (opcional). */
  couponCode: z.string().trim().toUpperCase().max(30).optional(),
  /** Medida assinada do orcamento: a rota nao e pedida de novo a TomTom. */
  cotacao: z.string().max(2000).optional(),
  /**
   * Etapa 5 (30/10/2026): entrega de encomenda. Com isto a corrida vira
   * entrega (categoria ENTREGA): coleta = embarque, entrega = destino.
   */
  entrega: z
    .object({
      descricao: z.string().trim().min(3, 'Diga o que vai ser levado.').max(200, 'Descrição muito longa (até 200 letras).'),
      destinatarioNome: z.string().trim().min(2, 'Nome de quem recebe muito curto.').max(120),
      destinatarioTelefone: z
        .string()
        .trim()
        .refine((t) => /^\d{10,13}$/.test(t.replace(/\D/g, '')), 'Telefone de quem recebe com DDD (só números).'),
    })
    .optional(),
}).refine(comDestinoOuSem, AVISO_DESTINO);

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
  /** Entrega: o codigo de 4 digitos que a pessoa que recebe tem. */
  codigoEntrega: z.string().trim().max(10).optional(),
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
