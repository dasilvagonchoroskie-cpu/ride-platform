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
/** Reserva: Photon (Komoot), tambem OpenStreetMap, gratuito e sem chave. */
const PHOTON = 'https://photon.komoot.io';

interface ItemPhoton {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
}

/** Nome do estado -> sigla (o Photon devolve o nome por extenso). */
const UF: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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
  /**
   * O Nominatim publico bloqueia (429) o IP compartilhado do servidor
   * gratuito do Render (visto em 08/10/2026: TODA busca voltava vazia).
   * Depois de um bloqueio, por 15 minutos vai direto ao Photon.
   */
  private nominatimBloqueadoAte = 0;

  async buscar(texto: string, lat: number, lng: number): Promise<Lugar[]> {
    const q = texto.trim().replace(/\s+/g, ' ');
    const chave = `s:${q.toLowerCase()}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
    const guardado = this.lerCache<Lugar[]>(chave);
    if (guardado) return this.comDistancia(guardado, lat, lng);

    // Primeiro a regiao (uns 35 km em volta; se pouco aparecer, uns 80 km),
    // para "Rua Sao Paulo" achar a rua da cidade antes da de outro estado.
    // Depois, se ainda houver pouco, o Brasil inteiro: o passageiro pode ver
    // quanto da uma corrida para qualquer lugar (decisao do Evandro em
    // 05/10/2026 — sem limite de area). "Porto Alegre" em Goiatuba mostra a
    // rua local primeiro e a cidade gaucha logo depois.
    const caixaDe = (g: number) => [lng - g, lat + g, lng + g, lat - g].map((n) => n.toFixed(5)).join(',');
    const base = `q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=8&countrycodes=br`;
    let itens = (await this.consultar<ItemNominatim[]>(`/search?${base}&viewbox=${caixaDe(0.32)}&bounded=1`)) ?? [];
    if (itens.length < 3) {
      itens = [...itens, ...((await this.consultar<ItemNominatim[]>(`/search?${base}&viewbox=${caixaDe(0.75)}&bounded=1`)) ?? [])];
    }
    if (itens.length < 5) {
      itens = [...itens, ...((await this.consultar<ItemNominatim[]>(`/search?${base}&viewbox=${caixaDe(0.75)}`)) ?? [])];
    }
    let lugares = (itens ?? []).map((i) => this.paraLugar(i));
    if (lugares.length === 0) lugares = await this.buscarPhoton(q, lat, lng);
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
    const reserva = item && item.lat ? null : await this.reversoPhoton(lat, lng);
    const lugar: Lugar = item && item.lat
      ? { ...this.paraLugar(item), latitude: lat, longitude: lng, distanceKm: null }
      : reserva
      ? { ...reserva, latitude: lat, longitude: lng, distanceKm: null }
      : {
          address: `Ponto no mapa (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
          detail: '',
          latitude: lat,
          longitude: lng,
          distanceKm: null,
        };
    if ((item && item.lat) || reserva) this.gravarCache(chave, lugar);
    return lugar;
  }

  // ---------------- Reserva: Photon ----------------

  /** Regiao primeiro (caixa de uns 80 km); se vier pouco, o Brasil todo, perto primeiro. */
  private async buscarPhoton(q: string, lat: number, lng: number): Promise<Lugar[]> {
    const g = 0.75;
    const caixa = [lng - g, lat - g, lng + g, lat + g].map((n) => n.toFixed(5)).join(',');
    const base = `/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=10&lang=default`;
    const regiao = (await this.consultarPhoton<{ features?: ItemPhoton[] }>(`${base}&bbox=${caixa}`))?.features ?? [];
    let todos = regiao;
    if (regiao.length < 5) {
      const brasil = (await this.consultarPhoton<{ features?: ItemPhoton[] }>(base))?.features ?? [];
      todos = [...regiao, ...brasil];
    }
    return todos
      .filter((f) => (f.properties?.countrycode ?? 'BR').toUpperCase() === 'BR')
      .map((f) => this.paraLugarPhoton(f))
      .filter((l): l is Lugar => l !== null)
      .slice(0, 12);
  }

  private async reversoPhoton(lat: number, lng: number): Promise<Lugar | null> {
    const r = await this.consultarPhoton<{ features?: ItemPhoton[] }>(`/reverse?lat=${lat}&lon=${lng}&lang=default`);
    const f = r?.features?.[0];
    return f ? this.paraLugarPhoton(f) : null;
  }

  private paraLugarPhoton(f: ItemPhoton): Lugar | null {
    const c = f.geometry?.coordinates;
    const p = f.properties ?? {};
    if (!c || c.length < 2) return null;
    const eRua = p.osm_key === 'highway';
    const eCidade = ['city', 'town', 'village'].includes(p.type ?? '') || ['city', 'town', 'village'].includes(p.osm_value ?? '');
    const nome = (p.name ?? '').trim();
    const rua = (p.street ?? (eRua ? nome : '')).trim();
    const numero = p.housenumber ? `, ${p.housenumber}` : '';
    const bairro = p.district ?? p.locality ?? '';
    const cidade = p.city ?? (eCidade ? nome : '') ?? '';
    const uf = UF[semAcento(p.state ?? '')] ?? p.state ?? '';
    const linhaRua = rua ? `${rua}${numero}` : '';
    const principal = nome && !eRua ? nome : linhaRua || nome;
    const apoio = [nome && !eRua && linhaRua ? linhaRua : '', bairro, cidade && uf ? `${cidade} - ${uf}` : cidade || uf]
      .filter((x) => x && x.length > 0 && x !== principal)
      .join(', ');
    return {
      address: principal || 'Endereco sem nome',
      detail: apoio,
      latitude: Number(c[1]),
      longitude: Number(c[0]),
      distanceKm: null,
    };
  }

  private async consultarPhoton<T>(caminho: string): Promise<T | null> {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), 9000);
    try {
      const resp = await fetch(`${PHOTON}${caminho}`, {
        headers: { 'User-Agent': 'FortalezaMov/1.0 (+https://fortalezadigitalsecurity.com.br)' },
        signal: controle.signal,
      });
      if (!resp.ok) {
        this.logger.warn(`Photon respondeu ${resp.status} em ${caminho.split('?')[0]}`);
        return null;
      }
      return (await resp.json()) as T;
    } catch (e) {
      this.logger.warn(`Photon sem resposta: ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(relogio);
    }
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
    if (Date.now() < this.nominatimBloqueadoAte) return null;
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
        if (resp.status === 429 || resp.status === 403) this.nominatimBloqueadoAte = Date.now() + 15 * 60_000;
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
