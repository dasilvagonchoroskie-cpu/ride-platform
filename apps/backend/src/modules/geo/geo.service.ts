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

/** Texto normalizado (para tirar resultados repetidos). */
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Busca de endereco, endereco de um ponto e rota pelas ruas.
 *
 * Desde 29/10/2026 (pedido do Evandro) pela TomTom, SEMPRE pelo servidor:
 * a chave nunca vai para o celular e um contador so para todos os usuarios
 * (a cota e da chave).
 *
 * NADA fica guardado no servidor (Evandro, 29/10/2026: "cada usuario tem o
 * seu proprio historico; nunca e compartilhado; fica somente no aplicativo
 * do usuario"; e a clausula 11.4 dos termos da TomTom nao permite guardado
 * para servir varios usuarios). Cada pedido vai para a TomTom em nome de
 * quem pediu; quem guarda o que ja buscou e o celular da pessoa. A rota da
 * corrida nao e pedida duas vezes: o orcamento devolve a medida assinada
 * (cotacao) e o pedido da corrida a reaproveita.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly provedor: ProvedorGeo | null;

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
    this.contarSessao(opcoes.sessao);
    const p = this.provedor;
    if (!p || !this.uso.pode('geocode', true)) throw this.limite();
    const raio = Math.min(Math.max(opcoes.raioMetros ?? 80_000, 20_000), 300_000);

    const perto = { lat, lng };
    let regiao: LugarDoProvedor[] = [];
    let lugares: LugarDoProvedor[] = [];
    try {
      // 1) So a regiao de operacao: o raio da cidade cadastrado na Central
      //    (Evandro, 29/10/2026: "limitada a regiao de operacao"). A busca
      //    extra no Brasil todo (decisao de 05/10) saiu: 1 chamada a menos.
      //    Fora do raio, o passageiro marca o destino no mapa.
      regiao = await p.geocodificar(q, perto, raio);
      // 2) Lugares com nome (Rodoviaria, Hospital) — cota pequena (2.500/mes):
      //    so quando a regiao trouxe pouco e fora do modo economia.
      if (regiao.length < 3 && this.uso.pode('search', false)) lugares = await p.lugares(q, perto, Math.min(raio, 30_000));
    } catch (e) {
      if (!(e instanceof LimiteDoMapa)) throw e;
      this.logger.warn(
        e.passageiro
          ? `TomTom pediu "devagar" (${e.status}) na busca: este pedido usa a reserva.`
          : `TomTom recusou (403) na busca: parado por 30 minutos.`,
      );
      this.uso.limiteDaTomTom(e.status);
      if (regiao.length + lugares.length === 0) throw this.limite();
    }
    const vistos = new Set<string>();
    const unicos: Lugar[] = [...lugares, ...regiao]
      .filter((l) => {
        const k = `${semAcento(l.address)}|${l.latitude.toFixed(3)}|${l.longitude.toFixed(3)}`;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .slice(0, 12)
      .map((l) => ({ ...l, distanceKm: null }));
    return this.comDistancia(unicos, lat, lng);
  }

  /** Endereco escrito de um ponto do mapa (embarque pelo GPS, destino no mapa). */
  async endereco(lat: number, lng: number): Promise<Lugar> {
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
      return { ...l, latitude: lat, longitude: lng, distanceKm: null };
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
    const p = this.provedor;
    if (!p || !this.uso.pode('routing', essencial)) return null;
    try {
      const r = await p.rota(origem, destino);
      if (!r) return null;
      return { ...r, porRua: true };
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
