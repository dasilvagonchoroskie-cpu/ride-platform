import { z } from 'zod';
import { plateSchema, uuidSchema } from './common.schema';

/// Modalidade unica: nao ha categoria de veiculo a escolher, so o
/// cadastro do veiculo em si.
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
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const vehicleIdParamSchema = z.object({ id: uuidSchema });

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
