import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Cotacao assinada (29/10/2026): o servidor nao guarda rota de ninguem, mas a
 * rota da corrida nao pode ser pedida duas vezes a TomTom (no orcamento e no
 * pedido). O orcamento devolve a medida (distancia e tempo) assinada; o app
 * guarda e manda de volta no pedido. Vale 20 minutos e so para os mesmos
 * pontos (embarque, paradas e destino). Ninguem consegue mexer no numero:
 * a assinatura usa o segredo do servidor.
 */
export interface MedidaDaViagem {
  distanceMeters: number;
  durationSeconds: number;
}

type Ponto = { latitude: number; longitude: number };

export const VALIDADE_DA_COTACAO_MS = 20 * 60_000;

const chaveDosPontos = (pontos: Ponto[]) => pontos.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(';');

const assinar = (corpo: string, segredo: string) => createHmac('sha256', `${segredo}:cotacao:v1`).update(corpo).digest('base64url');

export function assinarCotacao(pontos: Ponto[], m: MedidaDaViagem, segredo: string, agora = Date.now()): string {
  const corpo = Buffer.from(
    JSON.stringify({ k: chaveDosPontos(pontos), m: Math.round(m.distanceMeters), t: Math.round(m.durationSeconds), e: agora + VALIDADE_DA_COTACAO_MS }),
  ).toString('base64url');
  return `${corpo}.${assinar(corpo, segredo)}`;
}

/** A medida da cotacao, ou null (sem cotacao, vencida, outros pontos ou assinatura errada). */
export function lerCotacao(token: string | undefined | null, pontos: Ponto[], segredo: string, agora = Date.now()): MedidaDaViagem | null {
  if (!token || token.length > 2000) return null;
  const [corpo, ass] = token.split('.');
  if (!corpo || !ass) return null;
  const certa = assinar(corpo, segredo);
  if (ass.length !== certa.length || !timingSafeEqual(Buffer.from(ass), Buffer.from(certa))) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as { k?: string; m?: number; t?: number; e?: number };
    if (d.k !== chaveDosPontos(pontos) || typeof d.e !== 'number' || agora > d.e) return null;
    if (typeof d.m !== 'number' || typeof d.t !== 'number' || d.m < 0 || d.t < 0) return null;
    return { distanceMeters: d.m, durationSeconds: d.t };
  } catch {
    return null;
  }
}
