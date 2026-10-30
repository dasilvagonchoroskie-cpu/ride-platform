import { z } from 'zod';
import { plateSchema, uuidSchema } from './common.schema';

/// Codigo da categoria (POPULAR = CARRO, CONFORTO, PREMIUM, MOTO...).
export const categoriaDoCarroSchema = z.string().trim().toUpperCase().min(2).max(20);

/// O motorista escolhe a categoria no cadastro do carro (29/10/2026); ela so
/// vale depois que a Central aprova (ate la ele roda na categoria de antes).
export const createVehicleSchema = z.object({
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
  categoria: categoriaDoCarroSchema.optional(),
});

export const pedirCategoriaSchema = z.object({ categoria: categoriaDoCarroSchema });

export const revisarCategoriaSchema = z.object({
  aprovar: z.boolean(),
  motivo: z.string().trim().max(300).optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const vehicleIdParamSchema = z.object({ id: uuidSchema });

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
