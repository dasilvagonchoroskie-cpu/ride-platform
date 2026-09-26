import { Injectable, Logger } from '@nestjs/common';

/** Um endereco encontrado, pronto para a lista do "Para onde?". */
export interface Lugar {
  /** Linha principal: nome do lugar ou "Rua X, 123". */
  address: string;
  /** Linha de apoio: bairro e cidade. */
  detail: string;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
}

interface ItemNominatim {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

const BASE = 'https://nominatim.openstreetmap.org';
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Enderecos pelo OpenStreetMap (Nominatim): gratuito e sem chave.
 *
 * A politica de uso do Nominatim pede: no maximo 1 consulta por segundo,
 * identificacao do aplicativo e cache. Por isso as consultas passam pelo
 * servidor (nunca direto do celular), uma de cada vez, e o resultado fica
 * guardado por um dia.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly cache = new Map<string, { quando: number; valor: unknown }>();
  private proximaVez = 0;

  async buscar(texto: string, lat: number, lng: number): Promise<Lugar[]> {
    const q = texto.trim().replace(/\s+/g, ' ');
    const chave = `s:${q.toLowerCase()}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
    const guardado = this.lerCache<Lugar[]>(chave);
    if (guardado) return this.comDistancia(guardado, lat, lng);

    // Primeiro so na regiao (uns 35 km em volta); se nada aparecer, abre
    // para o pais inteiro.
    const caixa = [lng - 0.32, lat + 0.32, lng + 0.32, lat - 0.32].map((n) => n.toFixed(5)).join(',');
    const base = `q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=8&countrycodes=br`;
    let itens = await this.consultar<ItemNominatim[]>(`/search?${base}&viewbox=${caixa}&bounded=1`);
    if (!itens || itens.length === 0) {
      itens = await this.consultar<ItemNominatim[]>(`/search?${base}&viewbox=${caixa}&bounded=0`);
    }
    const lugares = (itens ?? []).map((i) => this.paraLugar(i));
    // Sem repetidos (o mesmo nome no mesmo ponto aparece as vezes duas vezes).
    const vistos = new Set<string>();
    const unicos = lugares.filter((l) => {
      const k = `${l.address}|${l.latitude.toFixed(4)}|${l.longitude.toFixed(4)}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    this.gravarCache(chave, unicos);
    return this.comDistancia(unicos, lat, lng);
  }

  /** Endereco escrito de um ponto do mapa (embarque pelo GPS, destino no mapa). */
  async endereco(lat: number, lng: number): Promise<Lugar> {
    const chave = `r:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    const guardado = this.lerCache<Lugar>(chave);
    if (guardado) return guardado;

    const item = await this.consultar<ItemNominatim>(
      `/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1&zoom=18`,
    );
    const lugar: Lugar = item && item.lat
      ? { ...this.paraLugar(item), latitude: lat, longitude: lng, distanceKm: null }
      : {
          address: `Ponto no mapa (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
          detail: '',
          latitude: lat,
          longitude: lng,
          distanceKm: null,
        };
    if (item && item.lat) this.gravarCache(chave, lugar);
    return lugar;
  }

  // ------------------------------------------------------------------

  private paraLugar(i: ItemNominatim): Lugar {
    const a = i.address ?? {};
    const rua = a.road ?? a.pedestrian ?? a.footway ?? a.street ?? '';
    const numero = a.house_number ? `, ${a.house_number}` : '';
    const bairro = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? '';
    const cidade = a.city ?? a.town ?? a.village ?? a.municipality ?? '';
    const uf = a['ISO3166-2-lvl4']?.replace('BR-', '') ?? a.state ?? '';

    const nome = (i.name ?? '').trim();
    const linhaRua = rua ? `${rua}${numero}` : '';
    // Um lugar com nome (Rodoviaria, Hospital) aparece pelo nome; senao, pela rua.
    const principal = nome && nome !== rua ? nome : linhaRua || nome || (i.display_name ?? '').split(',')[0];
    const apoio = [nome && nome !== rua ? linhaRua : '', bairro, cidade && uf ? `${cidade} - ${uf}` : cidade]
      .filter((p) => p && p.length > 0)
      .join(', ');

    return {
      address: principal || 'Endereco sem nome',
      detail: apoio,
      latitude: Number(i.lat),
      longitude: Number(i.lon),
      distanceKm: null,
    };
  }

  private comDistancia(lista: Lugar[], lat: number, lng: number): Lugar[] {
    return lista.map((l) => ({ ...l, distanceKm: Math.round(this.km(lat, lng, l.latitude, l.longitude) * 10) / 10 }));
  }

  private km(a1: number, o1: number, a2: number, o2: number): number {
    const r = (g: number) => (g * Math.PI) / 180;
    const d = Math.sin(r(a2 - a1) / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(r(o2 - o1) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(1 - d));
  }

  /** Uma consulta por vez, com 1,1 s de intervalo (regra do Nominatim). */
  private async consultar<T>(caminho: string): Promise<T | null> {
    const agora = Date.now();
    const espera = Math.max(0, this.proximaVez - agora);
    this.proximaVez = Math.max(agora, this.proximaVez) + 1100;
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), 9000);
    try {
      const resp = await fetch(`${BASE}${caminho}&accept-language=pt-BR`, {
        headers: {
          'User-Agent': 'FortalezaMov/1.0 (+https://fortalezadigitalsecurity.com.br; fortalezadigitalsecurity@gmail.com)',
          'Accept-Language': 'pt-BR',
        },
        signal: controle.signal,
      });
      if (!resp.ok) {
        this.logger.warn(`Nominatim respondeu ${resp.status} em ${caminho.split('?')[0]}`);
        return null;
      }
      return (await resp.json()) as T;
    } catch (e) {
      this.logger.warn(`Nominatim sem resposta: ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(relogio);
    }
  }

  private lerCache<T>(chave: string): T | null {
    const c = this.cache.get(chave);
    if (!c) return null;
    if (Date.now() - c.quando > DIA_MS) {
      this.cache.delete(chave);
      return null;
    }
    return c.valor as T;
  }

  private gravarCache(chave: string, valor: unknown): void {
    if (this.cache.size > 3000) {
      const maisAntiga = this.cache.keys().next().value;
      if (maisAntiga !== undefined) this.cache.delete(maisAntiga);
    }
    this.cache.set(chave, { quando: Date.now(), valor });
  }
}
