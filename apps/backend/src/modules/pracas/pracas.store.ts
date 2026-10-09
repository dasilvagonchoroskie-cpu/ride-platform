import { haversineKm } from '@ride/shared';

/**
 * Cidades atendidas pela operacao ("pracas") — Evandro, 08/10/2026: "se eu
 * abrir em Goiatuba e a minha sobrinha cuidar de Teutonia, no Rio Grande do
 * Sul, como fica a Central?"
 *
 * Decisao: uma Central so, um servidor so, os mesmos aplicativos. Cada
 * cidade e uma praca com centro e raio no mapa. A corrida pertence a praca
 * onde o passageiro embarca; o motorista, a praca onde trabalha. O dono ve
 * todas; o operador de uma praca (ex.: a sobrinha em Teutonia) entra na
 * mesma Central e ve so a dele. Pix da empresa unico para todas.
 *
 * Guardado na tabela settings (chave "pracas"): sem mudar o banco.
 */
export interface Praca {
  /** Codigo curto e fixo (ex.: "goiatuba", "teutonia-rs"). */
  id: string;
  nome: string;
  uf: string;
  latitude: number;
  longitude: number;
  /** Raio atendido a partir do centro, em km. */
  raioKm: number;
  ativa: boolean;
  /** WhatsApp da Central desta cidade (opcional; sem ele vale o geral). */
  whatsapp?: string | null;
}

export const CHAVE_PRACAS = 'pracas';

/** Enquanto o dono nao cadastrar nada, a operacao e so Goiatuba. */
export const PRACA_PADRAO: Praca = {
  id: 'goiatuba',
  nome: 'Goiatuba',
  uf: 'GO',
  latitude: -18.0125,
  longitude: -49.3547,
  raioKm: 60,
  ativa: true,
  whatsapp: null,
};

export function codigoDaPraca(nome: string, uf: string): string {
  const base = `${nome}-${uf}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 40) || 'praca';
}

export function lerListaDePracas(valor: unknown): Praca[] {
  if (!Array.isArray(valor)) return [PRACA_PADRAO];
  const lista: Praca[] = [];
  for (const v of valor) {
    if (!v || typeof v !== 'object') continue;
    const p = v as Record<string, unknown>;
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    if (!p.id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    lista.push({
      id: String(p.id),
      nome: String(p.nome ?? p.id),
      uf: String(p.uf ?? '').toUpperCase().slice(0, 2),
      latitude: lat,
      longitude: lng,
      raioKm: Math.min(Math.max(Number(p.raioKm) || 60, 5), 300),
      ativa: p.ativa !== false,
      whatsapp: typeof p.whatsapp === 'string' && p.whatsapp ? p.whatsapp : null,
    });
  }
  return lista.length > 0 ? lista : [PRACA_PADRAO];
}

/**
 * A praca de um ponto: a mais perto cujo raio cobre o ponto. Fora de todos
 * os raios: null (o dono ve em "Todas as cidades").
 */
export function pracaDoPonto(pracas: Praca[], ponto: { latitude: number; longitude: number }): Praca | null {
  let melhor: Praca | null = null;
  let menor = Infinity;
  for (const p of pracas) {
    const d = haversineKm(ponto, p);
    if (d <= p.raioKm && d < menor) {
      menor = d;
      melhor = p;
    }
  }
  return melhor;
}

/** Retangulo que contem o raio da praca (filtro rapido no banco). */
export function caixaDaPraca(p: Praca): { latMin: number; latMax: number; lngMin: number; lngMax: number } {
  const dLat = p.raioKm / 111.32;
  const dLng = p.raioKm / (111.32 * Math.max(Math.cos((p.latitude * Math.PI) / 180), 0.1));
  return { latMin: p.latitude - dLat, latMax: p.latitude + dLat, lngMin: p.longitude - dLng, lngMax: p.longitude + dLng };
}
