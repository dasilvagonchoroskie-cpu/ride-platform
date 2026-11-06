import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Quem esta pedindo, para o limite de pedidos por minuto (auditoria de
 * 06/11/2026). Atras do Render todo pedido chega pelo mesmo endereco
 * interno: sem isto, TODOS os usuarios dividiam o mesmo limite (120 por
 * minuto) e, com muitos motoristas, todo mundo passaria a receber "muitos
 * pedidos". Usa o endereco que a Cloudflare do Render viu (cf-connecting-ip,
 * regravado por ela) ou o ultimo do x-forwarded-for (o que o Render anotou).
 */
export function clienteDoPedido(req: { headers?: Record<string, unknown>; ip?: string }): string {
  const h = req.headers ?? {};
  const cf = String(h['cf-connecting-ip'] ?? '').trim();
  if (cf) return cf;
  const lista = String(h['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return lista[lista.length - 1] || req.ip || 'desconhecido';
}

@Injectable()
export class LimitePorClienteGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return clienteDoPedido(req);
  }
}
