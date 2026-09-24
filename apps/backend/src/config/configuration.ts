import { Env, envSchema } from './env.validation';

export interface AppConfiguration {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  isDevelopment: boolean;
  port: number;
  host: string;
  apiPrefix: string;
  apiUrl: string;
  corsOrigins: string[];
  database: { url: string };
  redis: { host: string; port: number; password?: string; db: number };
  jwt: {
    accessSecret: string;
    accessTtl: number;
    refreshSecret: string;
    refreshTtl: number;
  };
  otp: { length: number; ttlSeconds: number; maxAttempts: number; debugReturn: boolean };
  s3: {
    endpoint?: string;
    region: string;
    accessKey?: string;
    secretKey?: string;
    bucketDocuments: string;
    bucketPublic: string;
    forcePathStyle: boolean;
    signedUrlTtl: number;
    publicUrl?: string;
  };
  mail: { host?: string; port: number; user?: string; password?: string; from: string };
  fcm: { projectId?: string; clientEmail?: string; privateKey?: string };
  maps: { apiKey?: string; cacheTtl: number };
  payments: {
    provider: 'asaas' | 'stripe';
    asaasBaseUrl: string;
    asaasApiKey?: string;
    asaasWebhookToken?: string;
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
  };
  business: { commissionPercent: number; minPayoutCents: number };
}

/** Factory consumida pelo ConfigModule.load. */
export function configuration(): AppConfiguration {
  const env = envSchema.parse(process.env);

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    port: env.BACKEND_PORT,
    host: env.BACKEND_HOST,
    apiPrefix: env.API_PREFIX,
    apiUrl: env.API_URL,
    corsOrigins:
      env.CORS_ORIGINS.trim() === '*'
        ? ['*']
        : env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
    database: { url: env.DATABASE_URL },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      db: env.REDIS_DB,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshSecret: env.JWT_REFRESH_SECRET,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    otp: {
      length: env.OTP_LENGTH,
      ttlSeconds: env.OTP_TTL_SECONDS,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      debugReturn: env.OTP_DEBUG_RETURN,
    },
    s3: {
      endpoint: env.S3_ENDPOINT || undefined,
      region: env.S3_REGION,
      accessKey: env.S3_ACCESS_KEY || undefined,
      secretKey: env.S3_SECRET_KEY || undefined,
      bucketDocuments: env.S3_BUCKET_DOCUMENTS,
      bucketPublic: env.S3_BUCKET_PUBLIC,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      signedUrlTtl: env.S3_SIGNED_URL_TTL,
      publicUrl: env.S3_PUBLIC_URL || undefined,
    },
    mail: {
      host: env.SMTP_HOST || undefined,
      port: env.SMTP_PORT,
      user: env.SMTP_USER || undefined,
      password: env.SMTP_PASSWORD || undefined,
      from: env.SMTP_FROM,
    },
    fcm: {
      projectId: env.FCM_PROJECT_ID || undefined,
      clientEmail: env.FCM_CLIENT_EMAIL || undefined,
      privateKey: env.FCM_PRIVATE_KEY || undefined,
    },
    maps: { apiKey: env.GOOGLE_MAPS_API_KEY || undefined, cacheTtl: env.GOOGLE_MAPS_CACHE_TTL },
    payments: {
      provider: env.PAYMENT_PROVIDER,
      asaasBaseUrl: env.ASAAS_BASE_URL,
      asaasApiKey: env.ASAAS_API_KEY || undefined,
      asaasWebhookToken: env.ASAAS_WEBHOOK_TOKEN || undefined,
      stripeSecretKey: env.STRIPE_SECRET_KEY || undefined,
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || undefined,
    },
    business: {
      commissionPercent: env.DEFAULT_COMMISSION_PERCENT,
      minPayoutCents: env.MIN_PAYOUT_CENTS,
    },
  };
}
