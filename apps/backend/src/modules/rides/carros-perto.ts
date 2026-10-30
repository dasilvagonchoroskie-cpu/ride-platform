import { createHmac } from 'crypto';

/**
 * Carros por perto no mapa do passageiro (Evandro, 30/10/2026: "o carro nao
 * acompanha o sentido da rua, ta sempre andando de lado").
 *
 * - Rumo do carro (0 = norte, sentido horario), de 5 em 5 graus: o app gira
 *   a figura para o lado em que o carro anda.
 * - Posicao com ~11 m de precisao (antes ~55 m): o carro aparece em cima da
 *   rua, sem mostrar o ponto exato. So aparecem motoristas online e livres.
 * - Identificador anonimo e estavel no dia: o app anima o MESMO carro de um
 *   ponto ao outro (antes "carro-1, carro-2" pela distancia, e os carros
 *   trocavam de lugar entre si). Sai de um HMAC com segredo do servidor:
 *   ninguem chega ao motorista por ele, e muda todo dia.
 */

/** Rumo de 0 a 355, de 5 em 5 graus; null quando o GPS nao mandou. */
export function rumoArredondado(heading: number | null | undefined): number | null {
  if (heading == null || !Number.isFinite(heading) || heading < 0) return null;
  return (Math.round(heading / 5) * 5) % 360;
}

/** ~11 m (4 casas decimais). */
export function posicaoAproximada(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Dia de Brasilia (UTC-3) no formato AAAA-MM-DD. */
export function diaDeBrasilia(agora = new Date()): string {
  return new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export function idAnonimo(driverId: string, segredo: string, dia: string): string {
  return 'carro-' + createHmac('sha256', segredo).update(`${dia}:${driverId}`).digest('hex').slice(0, 12);
}
