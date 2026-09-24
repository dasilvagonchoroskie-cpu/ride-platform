import { z } from 'zod';

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : ['true', '1', 'yes'].includes(value.toLowerCase())));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BACKEND_PORT: z.coerce.number().int().positive().default(3333),
  BACKEND_HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('api'),
  API_URL: z.string().default('http://localhost:3333'),
  CORS_ORIGINS: z.string().default('*'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL e obrigatoria.'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(0),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET deve ter ao menos 32 caracteres.'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET deve ter ao menos 32 caracteres.'),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),

  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_DEBUG_RETURN: booleanFromEnv(false),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET_DOCUMENTS: z.string().default('ride-documents'),
  S3_BUCKET_PUBLIC: z.string().default('ride-public'),
  S3_FORCE_PATH_STYLE: booleanFromEnv(true),
  S3_SIGNED_URL_TTL: z.coerce.number().int().positive().default(900),
  S3_PUBLIC_URL: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Ride <no-reply@ride.local>'),
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),

  GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_MAPS_CACHE_TTL: z.coerce.number().int().positive().default(300),

  PAYMENT_PROVIDER: z.enum(['asaas', 'stripe']).default('asaas'),
  ASAAS_BASE_URL: z.string().default('https://sandbox.asaas.com/api/v3'),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  DEFAULT_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(20),
  MIN_PAYOUT_CENTS: z.coerce.number().int().positive().default(5000),
});

export type Env = z.infer<typeof envSchema>;

/** Usado pelo ConfigModule.validate: falha rapido com mensagem legivel. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variaveis de ambiente invalidas:\n${issues}`);
  }

  return parsed.data;
}
