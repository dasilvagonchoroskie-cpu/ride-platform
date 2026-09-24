import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants';
import { isValidCpf, isValidPlate } from '../utils';

export const uuidSchema = z.string().uuid('Identificador invalido.');

export const phoneSchema = z
  .string()
  .min(10, 'Telefone invalido.')
  .max(20, 'Telefone invalido.')
  .transform((value) => value.replace(/[^\d+]/g, ''))
  .refine((value) => /^\+?\d{10,15}$/.test(value), 'Telefone invalido.')
  .transform((value) => (value.startsWith('+') ? value : `+${value}`));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('E-mail invalido.')
  .max(180, 'E-mail muito longo.');

export const passwordSchema = z
  .string()
  .min(8, 'A senha deve ter no minimo 8 caracteres.')
  .max(72, 'A senha deve ter no maximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'A senha deve conter ao menos uma letra.')
  .regex(/\d/, 'A senha deve conter ao menos um numero.');

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Nome muito curto.')
  .max(120, 'Nome muito longo.');

export const cpfSchema = z
  .string()
  .transform((value) => value.replace(/\D+/g, ''))
  .refine((value) => isValidCpf(value), 'CPF invalido.');

export const plateSchema = z
  .string()
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .refine((value) => isValidPlate(value), 'Placa invalida (use ABC1234 ou ABC1D23).');

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().min(1).max(120).optional(),
});

export const sortSchema = z.object({
  sortBy: z.string().trim().max(40).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: 'Periodo invalido: "from" deve ser anterior a "to".',
    path: ['from'],
  });

export const deviceInfoSchema = z.object({
  deviceId: z.string().trim().min(4).max(200),
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
  appVersion: z.string().trim().max(40).optional(),
  model: z.string().trim().max(120).optional(),
  osVersion: z.string().trim().max(40).optional(),
  fcmToken: z.string().trim().max(4096).optional(),
  pushToken: z.string().trim().max(4096).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type CoordinatesInput = z.infer<typeof coordinatesSchema>;
export type DeviceInfoInput = z.infer<typeof deviceInfoSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
