/**
 * Carrega o .env antes dos testes e2e.
 * Os testes exigem PostgreSQL/PostGIS e Redis no ar (pnpm infra:up) e o
 * banco migrado + semeado (pnpm db:migrate && pnpm db:seed).
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../../../.env') });

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.OTP_DEBUG_RETURN = 'true';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-com-mais-de-32-caracteres!!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-com-mais-de-32-caracteres!!';
