import { z } from 'zod';
import { plateSchema, uuidSchema } from './common.schema';

export const createVehicleSchema = z.object({
  categoryId: uuidSchema,
  plate: plateSchema,
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z
    .number()
    .int()
    .min(1990, 'Ano invalido.')
    .max(new Date().getFullYear() + 1, 'Ano invalido.'),
  color: z.string().trim().min(1).max(40),
  isActive: z.boolean().default(true),
});

export const updateVehicleSchema = createVehicleSchema.partial().omit({ categoryId: true });

export const createVehicleCategorySchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,40}$/, 'Slug invalido.'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  seats: z.number().int().min(1).max(10).default(4),
  iconUrl: z.string().url().max(500).optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const updateVehicleCategorySchema = createVehicleCategorySchema.partial();

export const vehicleIdParamSchema = z.object({ id: uuidSchema });

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type CreateVehicleCategoryInput = z.infer<typeof createVehicleCategorySchema>;
export type UpdateVehicleCategoryInput = z.infer<typeof updateVehicleCategorySchema>;
