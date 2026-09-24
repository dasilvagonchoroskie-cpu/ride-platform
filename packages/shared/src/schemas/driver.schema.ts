import { z } from 'zod';
import { cpfSchema, uuidSchema } from './common.schema';

export const driverOnboardingSchema = z.object({
  cpf: cpfSchema,
  birthDate: z.coerce.date().refine((date) => date < new Date(), 'Data de nascimento invalida.'),
  cnhNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D+/g, ''))
    .refine((value) => value.length === 11, 'Numero da CNH deve ter 11 digitos.'),
  cnhCategory: z.enum(['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE']),
  cnhExpiresAt: z.coerce.date().refine((date) => date > new Date(), 'CNH vencida ou a vencer.'),
  pixKey: z.string().trim().max(200).optional(),
});

export const updateDriverSchema = driverOnboardingSchema.partial().extend({
  pixKey: z.string().trim().max(200).optional(),
});

export const setOnlineStatusSchema = z.object({
  isOnline: z.boolean(),
});

export const updateDriverLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).max(300).optional(),
  accuracy: z.number().min(0).max(1000).optional(),
});

export const reviewDriverSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED']),
  reason: z.string().trim().min(3).max(500).optional(),
});

export const listDriversSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
  isOnline: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export const driverIdParamSchema = z.object({ id: uuidSchema });

export type DriverOnboardingInput = z.infer<typeof driverOnboardingSchema>;
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>;
export type SetOnlineStatusInput = z.infer<typeof setOnlineStatusSchema>;
export type UpdateDriverLocationInput = z.infer<typeof updateDriverLocationSchema>;
export type ReviewDriverInput = z.infer<typeof reviewDriverSchema>;
