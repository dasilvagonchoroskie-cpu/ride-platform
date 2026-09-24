import type { Coords } from '../services/location';

const EARTH_RADIUS_KM = 6371;

/** Distancia em km (Haversine). */
export function distanceKm(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Interpola um ponto entre a e b (t de 0 a 1) com leve curva. */
export function interpolate(a: Coords, b: Coords, t: number, curve = 0): Coords {
  const mid = {
    latitude: (a.latitude + b.latitude) / 2 + curve * (b.longitude - a.longitude) * 0.12,
    longitude: (a.longitude + b.longitude) / 2 - curve * (b.latitude - a.latitude) * 0.12,
  };
  const ab = (1 - t) ** 2;
  const mb = 2 * (1 - t) * t;
  const bb = t ** 2;
  return {
    latitude: ab * a.latitude + mb * mid.latitude + bb * b.latitude,
    longitude: ab * a.longitude + mb * mid.longitude + bb * b.longitude,
  };
}

/** Gera pontos de uma rota simulada entre origem e destino. */
export function buildRoute(from: Coords, to: Coords, steps = 40): Coords[] {
  return Array.from({ length: steps + 1 }, (_, i) => interpolate(from, to, i / steps, 1));
}

/** Converte metros para texto legivel. */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** Converte segundos para "X min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

/** Converte centavos para "R$ 0,00". */
export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
