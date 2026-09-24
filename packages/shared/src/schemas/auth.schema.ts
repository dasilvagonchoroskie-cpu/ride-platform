import { z } from 'zod';
import { emailSchema, deviceInfoSchema, passwordSchema, phoneSchema } from './common.schema';

export const requestOtpSchema = z
  .object({
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    purpose: z.enum(['LOGIN', 'PHONE_VERIFICATION', 'EMAIL_VERIFICATION', 'PASSWORD_RESET']).default('LOGIN'),
  })
  .refine((data) => Boolean(data.phone) !== Boolean(data.email), {
    message: 'Informe exatamente um dos campos: "phone" ou "email".',
    path: ['phone'],
  });

export const verifyOtpSchema = z.object({
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, 'Codigo invalido.'),
  purpose: z.enum(['LOGIN', 'PHONE_VERIFICATION', 'EMAIL_VERIFICATION', 'PASSWORD_RESET']).default('LOGIN'),
  role: z.enum(['PASSENGER', 'DRIVER']).default('PASSENGER'),
  device: deviceInfoSchema.optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token invalido.'),
  device: deviceInfoSchema.optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token invalido.').optional(),
  fcmToken: z.string().max(4096).optional(),
  allDevices: z.boolean().default(false),
});

export const registerPasswordSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(2).max(120),
  email: emailSchema.optional(),
  password: passwordSchema,
});

export const loginPasswordSchema = z
  .object({
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    password: z.string().min(1, 'Informe a senha.'),
    device: deviceInfoSchema.optional(),
  })
  .refine((data) => Boolean(data.phone) !== Boolean(data.email), {
    message: 'Informe exatamente um dos campos: "phone" ou "email".',
    path: ['phone'],
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: passwordSchema,
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type LoginPasswordInput = z.infer<typeof loginPasswordSchema>;
export type RegisterPasswordInput = z.infer<typeof registerPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
