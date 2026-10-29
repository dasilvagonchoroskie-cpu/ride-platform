/**
 * TomTom (Evandro, 29/10/2026): busca de endereco, endereco de um ponto e
 * rota pelas ruas. A chave fica SO na variavel TOMTOM_API_KEY do Render:
 * nunca no codigo, nunca no registro (os enderecos registrados saem sem a
 * chave — veja semChave()).
 *
 * Tudo que fala com a TomTom passa por aqui. Para trocar de fornecedor
 * (Google, outro), basta outra classe com a mesma interface ProvedorGeo.
 */

export interface LugarDoProvedor {
  address: string;
  detail: string;
  latitude: number;
  longitude: number;
}

export interface RotaDoProvedor {
  distanceMeters: number;
  durationSeconds: number;
  pontos: Array<[number, number]>;
}

export type ServicoTomTom = 'geocode' | 'reverse' | 'routing' | 'search';

/**
 * A TomTom recusou: 403 = chave recusada ou cota acabada; 429 = pedidos
 * demais no mesmo segundo (mesmo depois de esperar e tentar de novo); 0 = a
 * fila do ritmo estava longa demais.
 */
export class LimiteDoMapa extends Error {
  constructor(public readonly status: number) {
    super(`limite do mapa (${status})`);
  }

  /** So "devagar" (429 ou fila): passa em segundos, nao e a cota. */
  get passageiro(): boolean {
    return this.status !== 403;
  }
}

export interface ProvedorGeo {
  readonly nome: string;
  geocodificar(q: string, perto: { lat: number; lng: number } | null, raioMetros: number | null): Promise<LugarDoProvedor[]>;
  lugares(q: string, perto: { lat: number; lng: number }, raioMetros: number): Promise<LugarDoProvedor[]>;
  enderecoDoPonto(lat: number, lng: number): Promise<LugarDoProvedor | null>;
  rota(de: { latitude: number; longitude: number }, para: { latitude: number; longitude: number }): Promise<RotaDoProvedor | null>;
}

import { Ritmo } from './ritmo';

const API = 'https://api.tomtom.com';

/** Endereco sem a chave (para registrar no log). */
export function semChave(url: string): string {
  return url.replace(/([?&]key=)[^&]*/i, '$1***');
}

interface EnderecoTomTom {
  streetName?: string;
  streetNumber?: string;
  municipalitySubdivision?: string;
  municipality?: string;
  countrySubdivision?: string;
  countrySubdivisionCode?: string;
  countryCode?: string;
  freeformAddress?: string;
  localName?: string;
}

interface ResultadoTomTom {
  type?: string;
  entityType?: string;
  poi?: { name?: string };
  address?: EnderecoTomTom;
  position?: { lat?: number; lon?: number };
}

/** Sigla do estado: "GO" (a TomTom manda "BR-GO" ou "GO" conforme o servico). */
function uf(a: EnderecoTomTom): string {
  const c = (a.countrySubdivisionCode ?? '').replace(/^BR-/, '');
  return c.length === 2 ? c : (a.countrySubdivision ?? '');
}

/** Um resultado da TomTom no formato da lista "Para onde?". */
export function paraLugar(r: ResultadoTomTom): LugarDoProvedor | null {
  const lat = r.position?.lat;
  const lon = r.position?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const a = r.address ?? {};
  if (a.countryCode && a.countryCode !== 'BR') return null;
  const rua = (a.streetName ?? '').trim();
  const numero = a.streetNumber ? `, ${a.streetNumber}` : '';
  const linhaRua = rua ? `${rua}${numero}` : '';
  const cidade = (a.municipality ?? a.localName ?? '').trim();
  const estado = uf(a);
  const cidadeUf = cidade && estado ? `${cidade} - ${estado}` : cidade || estado;
  const nomeDoLugar = (r.poi?.name ?? '').trim();
  const eCidade = r.type === 'Geography';
  const principal = nomeDoLugar || linhaRua || (eCidade ? cidadeUf : '') || (a.freeformAddress ?? '').split(',')[0];
  const apoio = [nomeDoLugar && linhaRua ? linhaRua : '', a.municipalitySubdivision ?? '', eCidade && !nomeDoLugar && !linhaRua ? '' : cidadeUf]
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x !== principal)
    .join(', ');
  return { address: principal || 'Endereço sem nome', detail: apoio, latitude: lat, longitude: lon };
}

/** Pontos da rota da TomTom ([lat, lng]), no maximo uns 500. */
export function pontosDaRota(corpo: unknown): RotaDoProvedor | null {
  const r = (corpo as { routes?: Array<{ summary?: { lengthInMeters?: number; travelTimeInSeconds?: number }; legs?: Array<{ points?: Array<{ latitude: number; longitude: number }> }> }> })
    ?.routes?.[0];
  const todos = (r?.legs ?? []).flatMap((l) => l.points ?? []);
  if (!r || todos.length < 2 || !r.summary?.lengthInMeters) return null;
  const passo = Math.max(1, Math.ceil(todos.length / 500));
  const pontos: Array<[number, number]> = [];
  for (let i = 0; i < todos.length; i += passo) pontos.push([todos[i].latitude, todos[i].longitude]);
  const ultimo = todos[todos.length - 1];
  const fim = pontos[pontos.length - 1];
  if (fim[0] !== ultimo.latitude || fim[1] !== ultimo.longitude) pontos.push([ultimo.latitude, ultimo.longitude]);
  return {
    distanceMeters: Math.round(r.summary.lengthInMeters),
    durationSeconds: Math.round(r.summary.travelTimeInSeconds ?? 0),
    pontos,
  };
}

type Buscar = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Busca (geocode, endereco, lugares) e rota tem 5 pedidos/s cada na TomTom: usamos 4. */
const RITMO_PADRAO = (): Record<'busca' | 'rota', Ritmo> => ({ busca: new Ritmo(4), rota: new Ritmo(4) });

export class TomTomGeo implements ProvedorGeo {
  readonly nome = 'tomtom';

  constructor(
    private readonly chave: string,
    private readonly aoPedir: (s: ServicoTomTom) => void = () => {},
    private readonly buscar: Buscar = (url, init) => fetch(url, init),
    private readonly aviso: (msg: string) => void = () => {},
    private readonly ritmo: Record<'busca' | 'rota', Ritmo> = RITMO_PADRAO(),
    private readonly dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  static daVariavel(env: Record<string, string | undefined> = process.env): string | null {
    const k = env.TOMTOM_API_KEY?.trim();
    return k && /^[A-Za-z0-9]{20,64}$/.test(k) ? k : null;
  }

  async geocodificar(q: string, perto: { lat: number; lng: number } | null, raioMetros: number | null): Promise<LugarDoProvedor[]> {
    const p = new URLSearchParams({ countrySet: 'BR', language: 'pt-BR', limit: '8', typeahead: 'true' });
    if (perto) {
      p.set('lat', perto.lat.toFixed(5));
      p.set('lon', perto.lng.toFixed(5));
      if (raioMetros) p.set('radius', String(raioMetros));
    }
    const corpo = await this.pedir('geocode', `/search/2/geocode/${encodeURIComponent(q)}.json?${p}`);
    return this.lista(corpo);
  }

  async lugares(q: string, perto: { lat: number; lng: number }, raioMetros: number): Promise<LugarDoProvedor[]> {
    const p = new URLSearchParams({
      countrySet: 'BR',
      language: 'pt-BR',
      limit: '5',
      lat: perto.lat.toFixed(5),
      lon: perto.lng.toFixed(5),
      radius: String(raioMetros),
    });
    const corpo = await this.pedir('search', `/search/2/poiSearch/${encodeURIComponent(q)}.json?${p}`);
    return this.lista(corpo);
  }

  async enderecoDoPonto(lat: number, lng: number): Promise<LugarDoProvedor | null> {
    const corpo = (await this.pedir('reverse', `/search/2/reverseGeocode/${lat.toFixed(6)},${lng.toFixed(6)}.json?language=pt-BR`)) as {
      addresses?: Array<{ address?: EnderecoTomTom; position?: string }>;
    } | null;
    const a = corpo?.addresses?.[0];
    if (!a?.address) return null;
    const l = paraLugar({ address: a.address, position: { lat, lon: lng } });
    return l ? { ...l, latitude: lat, longitude: lng } : null;
  }

  async rota(
    de: { latitude: number; longitude: number },
    para: { latitude: number; longitude: number },
  ): Promise<RotaDoProvedor | null> {
    const trecho = `${de.latitude.toFixed(6)},${de.longitude.toFixed(6)}:${para.latitude.toFixed(6)},${para.longitude.toFixed(6)}`;
    const corpo = await this.pedir(
      'routing',
      `/routing/1/calculateRoute/${trecho}/json?travelMode=car&routeType=fastest&traffic=false&computeTravelTimeFor=none`,
    );
    return corpo ? pontosDaRota(corpo) : null;
  }

  private lista(corpo: unknown): LugarDoProvedor[] {
    const r = (corpo as { results?: ResultadoTomTom[] } | null)?.results ?? [];
    return r.map(paraLugar).filter((l): l is LugarDoProvedor => l !== null);
  }

  /**
   * Um pedido, no ritmo da TomTom. 429 ("devagar"): espera e tenta mais uma
   * vez. 403 ou 429 de novo viram LimiteDoMapa; outros erros, null.
   */
  private async pedir(servico: ServicoTomTom, caminho: string): Promise<unknown> {
    const url = `${API}${caminho}${caminho.includes('?') ? '&' : '?'}key=${encodeURIComponent(this.chave)}`;
    const ritmo = servico === 'routing' ? this.ritmo.rota : this.ritmo.busca;
    for (let tentativa = 0; ; tentativa++) {
      if (!(await ritmo.vez())) throw new LimiteDoMapa(0);
      this.aoPedir(servico);
      const controle = new AbortController();
      const relogio = setTimeout(() => controle.abort(), 9000);
      try {
        const resp = await this.buscar(url, { signal: controle.signal });
        if (resp.status === 429 && tentativa === 0) {
          await this.dormir(600 + Math.floor(Math.random() * 400));
          continue;
        }
        if (resp.status === 429 || resp.status === 403) throw new LimiteDoMapa(resp.status);
        if (!resp.ok) {
          this.aviso(`TomTom respondeu ${resp.status} em ${semChave(caminho).split('?')[0]}`);
          return null;
        }
        return await resp.json();
      } catch (e) {
        if (e instanceof LimiteDoMapa) throw e;
        this.aviso(`TomTom sem resposta em ${caminho.split('/').slice(0, 3).join('/')}: ${(e as Error).name}`);
        return null;
      } finally {
        clearTimeout(relogio);
      }
    }
  }
}
