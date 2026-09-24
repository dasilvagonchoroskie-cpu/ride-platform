import { z } from 'zod';
import { coordinatesSchema, emailSchema, nameSchema, uuidSchema } from './common.schema';

export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    avatarUrl: z.string().url('URL invalida.').max(500).optional(),
    birthDate: z.coerce.date().optional(),
    cpf: z.string().max(14).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nenhum campo para atualizar.' });

export const createAddressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Casa'),
  formattedAddress: z.string().trim().min(3).max(300),
  placeId: z.string().trim().max(200).optional(),
  complement: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(200).optional(),
  latitude: coordinatesSchema.shape.latitude,
  longitude: coordinatesSchema.shape.longitude,
});

export const updateAddressSchema = createAddressSchema.partial();

export const blockUserSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().min(3).max(300).optional(),
});

export const adminListUsersSchema = z.object({
  role: z.enum(['PASSENGER', 'DRIVER', 'ADMIN']).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'BLOCKED', 'DELETED']).optional(),
});

export const userIdParamSchema = z.object({ id: uuidSchema });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
export type BlockUserInput = z.infer<typeof blockUserSchema>;
