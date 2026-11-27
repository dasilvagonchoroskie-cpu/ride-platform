import { Request } from 'express';

/** Endereco de quem pediu, como o proxy da frente anotou (main.ts: trust proxy = 1). */
export function getClientIp(request: Request): string | undefined {
  return request.ip || request.socket?.remoteAddress || undefined;
}

export function getUserAgent(request: Request): string | undefined {
  const agent = request.headers['user-agent'];
  return typeof agent === 'string' ? agent.slice(0, 300) : undefined;
}
