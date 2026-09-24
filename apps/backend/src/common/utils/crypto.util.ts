import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Hash deterministico (sha256 + pepper) para tokens e codigos OTP. */
export function hashToken(token: string, pepper = ''): string {
  return createHash('sha256').update(`${token}${pepper}`).digest('hex');
}

/** Comparacao em tempo constante. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('hex');
}

/** Gera codigo numerico criptograficamente seguro. */
export function randomNumericCode(length: number): string {
  const max = 10 ** length;
  const value = randomBytes(4).readUInt32BE(0) % max;
  return value.toString().padStart(length, '0');
}

export function generateRideCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}
