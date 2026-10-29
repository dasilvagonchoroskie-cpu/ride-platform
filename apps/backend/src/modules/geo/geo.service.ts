import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES } from '@ride/shared';
import { BusinessException } from '../../common/errors/business.exception';
import { LimiteDoMapa, LugarDoProvedor, ProvedorGeo, TomTomGeo } from './tomtom';
import { UsoDoMapaService } from './uso-do-mapa';

/** Um endereco encontrado, pronto para a lista do "Para onde?". */
export interface Lugar {
  /** Linha principal: nome do lugar ou "Rua X, 123". */
  address: string;
  /** Linha de apoio: bairro e cidade. */
  detail: string;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  /** true = o mapa esta no limite agora (o app mostra a contingencia). */
  limite?: boolean;
}

/** Caminho pelas ruas entre dois pontos, para desenhar no mapa e medir a corrida. */
export interface RotaPorRua {
  distanceMeters: number;
  durationSeconds: number;
  /** [latitude, longitude] de cada ponto do caminho. */
  pontos: Array<[number, number]>;
  /** false = nao achou rota por rua (linha reta de reserva). */
  porRua: boolean;
}

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/** Guardado com prazo e tamanho maximo (o mais antigo sai primeiro). */
class Guardado<T> {
  private readonly itens = new Map<string, { quando: number; valor: T }>();
  constructor(
    private readonly prazoMs: number,
    private readonly maximo: number,
  ) {}

  ler(chave: string): T | null {
    const c = this.itens.get(chave);
    if (!c) return null;
    if (Date.now() - c.quando > this.prazoMs) {
      this.itens.delete(chave);
      return null;
    }
    return c.valor;
  }

  gravar(chave: string, valor: T): void {
    if (this.itens.size >= this.maximo) {
      const maisAntiga = this.itens.keys().next().value;
      if (maisAntiga !== undefined) this.itens.delete(maisAntiga);
    }
    this.itens.set(chave, { quando: Date.now(), valor });
  }
}

/** Texto normalizado da busca (para o guardado). */
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Busca de endereco, endereco de um ponto e rota pelas ruas.
 *
 * Desde 29/10/2026 (pedido do Evandro) pela TomTom, SEMPRE pelo servidor:
 * a chave nunca vai para o celular, um contador so para todos os usuarios
 * (a cota e da chave) e o que ja foi perguntado fica guardado para todos.
 * O servidor publico do OpenStreetMap (Nominatim) e o Photon/OSRM sairam.
 *
 * Economia: busca 3 dias guardada; endereco de um ponto 7 dias (grade de
 * ~11 m); rota 1 dia (mesmos pontos = mesma rota, entao a rota da corrida
 * e pedida uma vez so: no orcamento; o pedido, o app do passageiro e o do
 * motorista reaproveitam).
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly provedor: ProvedorGeo | null;
  private readonly buscas = new Guardado<Lugar[]>(3 * DIA_MS, 3000);
  private readonly enderecos = new Guardado<Lugar>(7 * DIA_MS, 6000);
  private readonly rotas = new Guardado<RotaPorRua>(DIA_MS, 2000);

  constructor(private readonly uso: UsoDoMapaService) {
    const chave = TomTomGeo.daVariavel();
    this.provedor = chave
      ? new TomTomGeo(chave, (s) => uso.contar(s), undefined, (m) => this.logger.warn(m))
      : null;
    if (!chave) this.logger.warn('TOMTOM_API_KEY ausente: busca, endereco e rota pela TomTom desligadas.');
  }

  /** Para testes: outro provedor (ex.: TomTom com respostas de mentira). */
  static comProvedor(uso: UsoDoMapaService, provedor: ProvedorGeo | null): GeoService {
    const g = new GeoService(uso);
    (g as unknown as { provedor: ProvedorGeo | null }).provedor = provedor;
    return g;
  }

  get ligado(): boolean {
    return this.provedor !== null;
  }

  economia(): boolean {
    return this.uso.economia();
  }

  parado(): boolean {
    return !this.provedor || this.uso.parado();
  }

  private limite(): BusinessException {
    return new BusinessException(
      ERROR_CODES.MAPA_LIMITE,
      'A busca de endereços está no limite agora. Escreva o endereço ou escolha no mapa.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /** Buscas por "sessao" de busca (uma abertura da tela de destino). */
  private readonly sessoes = new Map<string, { n: number; em: number }>();
  static readonly BUSCAS_POR_SESSAO = 40;

  /**
   * Token de sessao (etapa 3): o app manda o mesmo codigo enquanto a tela de
   * destino esta aberta. Mais de 40 buscas na mesma sessao = alguem
   * digitando sem parar (ou um robo): para, e o app mostra a contingencia.
   */
  private contarSessao(sessao: string | undefined): void {
    if (!sessao) return;
    const agora = Date.now();
    if (this.sessoes.size > 5000) {
      for (const [k, v] of this.sessoes) if (agora - v.em > 30 * 60_000) this.sessoes.delete(k);
    }
    const s = this.sessoes.get(sessao);
    if (!s || agora - s.em > 30 * 60_000) {
      this.sessoes.set(sessao, { n: 1, em: agora });
      return;
    }
    s.n += 1;
    if (s.n > GeoService.BUSCAS_POR_SESSAO) throw this.limite();
  }

  /**
   * [raioMetros]: o raio da cidade (praca) de onde a busca vem — "Rua Sao
   * Paulo" acha a da cidade primeiro. [fonte]: de onde vem a busca nesta
   * cidade (hoje so a TomTom; o Google entra quando houver a chave).
   */
  async buscar(
    texto: string,
    lat: number,
    lng: number,
    opcoes: { raioMetros?: number; sessao?: string; fonte?: string } = {},
  ): Promise<Lugar[]> {
    const q = texto.trim().replace(/\s+/g, ' ');
    const chave = `${semAcento(q)}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
    const guardado = this.buscas.ler(chave);
    if (guardado) return this.comDistancia(guardado, lat, lng);
    this.contarSessao(opcoes.sessao);
    const p = this.provedor;
    if (!p || !this.uso.pode('geocode', true)) throw this.limite();
    const raio = Math.min(Math.max(opcoes.raioMetros ?? 80_000, 20_000), 300_000);

    const perto = { lat, lng };
    let regiao: LugarDoProvedor[] = [];
    let lugares: LugarDoProvedor[] = [];
    let brasil: LugarDoProvedor[] = [];
    try {
      // 1) A regiao (uns 80 km): "Rua Sao Paulo" acha a da cidade primeiro.
      regiao = await p.geocodificar(q, perto, raio);
      // 2) Lugares com nome (Rodoviaria, Hospital) — cota pequena (2.500/mes):
      //    so quando a regiao trouxe pouco e fora do modo economia.
      if (regiao.length < 3 && this.uso.pode('search', false)) lugares = await p.lugares(q, perto, 30_000);
      // 3) O Brasil todo (decisao de 05/10/2026: ver o preco para qualquer
      //    lugar, ex.: "Porto Alegre") — fora do modo economia.
      if (this.uso.pode('geocode', false)) brasil = await p.geocodificar(q, null, null);
    } catch (e) {
      if (!(e instanceof LimiteDoMapa)) throw e;
      this.logger.warn(
        e.passageiro
          ? `TomTom pediu "devagar" (${e.status}) na busca: este pedido usa a reserva.`
          : `TomTom recusou (403) na busca: parado por 30 minutos.`,
      );
      this.uso.limiteDaTomTom(e.status);
      if (regiao.length + lugares.length + brasil.length === 0) throw this.limite();
    }
    const vistos = new Set<string>();
    const unicos: Lugar[] = [...lugares, ...regiao.slice(0, 7), ...brasil, ...regiao.slice(7)]
      .filter((l) => {
        const k = `${semAcento(l.address)}|${l.latitude.toFixed(3)}|${l.longitude.toFixed(3)}`;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .slice(0, 12)
      .map((l) => ({ ...l, distanceKm: null }));
    if (unicos.length > 0) this.buscas.gravar(chave, unicos);
    return this.comDistancia(unicos, lat, lng);
  }

  /** Endereco escrito de um ponto do mapa (embarque pelo GPS, destino no mapa). */
  async endereco(lat: number, lng: number): Promise<Lugar> {
    const chave = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
    const guardado = this.enderecos.ler(chave);
    if (guardado) return { ...guardado, latitude: lat, longitude: lng };
    const ponto: Lugar = {
      address: `Ponto no mapa (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
      detail: '',
      latitude: lat,
      longitude: lng,
      distanceKm: null,
    };
    const p = this.provedor;
    if (!p || !this.uso.pode('reverse', true)) return { ...ponto, limite: true };
    try {
      const l = await p.enderecoDoPonto(lat, lng);
      if (!l) return ponto;
      const lugar: Lugar = { ...l, latitude: lat, longitude: lng, distanceKm: null };
      this.enderecos.gravar(chave, lugar);
      return lugar;
    } catch (e) {
      if (!(e instanceof LimiteDoMapa)) throw e;
      this.logger.warn(
        e.passageiro
          ? `TomTom pediu "devagar" (${e.status}) no endereco: este pedido usa a reserva.`
          : `TomTom recusou (403) no endereco: parado por 30 minutos.`,
      );
      this.uso.limiteDaTomTom(e.status);
      return { ...ponto, limite: true };
    }
  }

  /**
   * Caminho pelas ruas (Evandro, 08/10/2026: "a rota tem que ir pela estrada
   * certa"). [essencial] = para o preco (orcamento, fim da corrida); so para
   * desenhar no mapa nao e essencial e para no modo economia. Sem rota,
   * devolve null e quem chamou usa a linha reta.
   */
  async rota(
    origem: { latitude: number; longitude: number },
    destino: { latitude: number; longitude: number },
    essencial = true,
  ): Promise<RotaPorRua | null> {
    const f = (n: number) => n.toFixed(4);
    const chave = `${f(origem.latitude)},${f(origem.longitude)}:${f(destino.latitude)},${f(destino.longitude)}`;
    const guardada = this.rotas.ler(chave);
    if (guardada) return guardada;
    const p = this.provedor;
    if (!p || !this.uso.pode('routing', essencial)) return null;
    try {
      const r = await p.rota(origem, destino);
      if (!r) return null;
      const rota: RotaPorRua = { ...r, porRua: true };
      this.rotas.gravar(chave, rota);
      return rota;
    } catch (e) {
      if (!(e instanceof LimiteDoMapa)) throw e;
      this.logger.warn(
        e.passageiro
          ? `TomTom pediu "devagar" (${e.status}) na rota: este pedido usa a reserva.`
          : `TomTom recusou (403) na rota: parado por 30 minutos.`,
      );
      this.uso.limiteDaTomTom(e.status);
      return null;
    }
  }

  private comDistancia(lista: Lugar[], lat: number, lng: number): Lugar[] {
    return lista.map((l) => ({ ...l, distanceKm: Math.round(this.km(lat, lng, l.latitude, l.longitude) * 10) / 10 }));
  }

  private km(a1: number, o1: number, a2: number, o2: number): number {
    const r = (g: number) => (g * Math.PI) / 180;
    const d = Math.sin(r(a2 - a1) / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(r(o2 - o1) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(1 - d));
  }
}
