import { Request } from 'express';

export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return request.ip || request.socket?.remoteAddress || undefined;
}

export function getUserAgent(request: Request): string | undefined {
  const agent = request.headers['user-agent'];
  return typeof agent === 'string' ? agent.slice(0, 300) : undefined;
}
