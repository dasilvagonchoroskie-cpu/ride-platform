import { Logger } from '@nestjs/common';
import { Ritmo } from '../geo/ritmo';
import { TomTomGeo } from '../geo/tomtom';

/**
 * Imagens do mapa da pagina publica de acompanhar a viagem: o servidor busca
 * na TomTom e entrega, para a chave nunca ir para a pagina. NAO guarda nada
 * (29/10/2026: clausula 11.4 da TomTom e decisao do Evandro): repassa ao
 * navegador o cabecalho de cache que a propria TomTom mandou, e o navegador
 * de quem abriu guarda pelo prazo dela. Cada link tem limite por hora.
 */
export interface ImagemDoMapa {
  png: Buffer;
  /** Cache-Control da TomTom (null = nao mandou: o navegador nao guarda). */
  cacheControl: string | null;
}

export class ImagensDoAcompanhar {
  private readonly logger = new Logger('ImagensDoAcompanhar');
  private readonly porLink = new Map<string, { hora: number; n: number }>();
  /** O mapa da TomTom aceita 10 pedidos/s para a chave toda (com os celulares): aqui no maximo 3. */
  private readonly ritmo = new Ritmo(3, 3000);

  constructor(
    private readonly chave: string | null = TomTomGeo.daVariavelDoMapa(),
    private readonly buscarNaRede: (
      url: string,
    ) => Promise<{ ok: boolean; status: number; headers?: { get(n: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }> = (u) => fetch(u),
  ) {}

  /** null = numero invalido, sem chave, limite do link ou a TomTom nao respondeu. */
  async buscar(token: string, zs: string, xs: string, ys: string): Promise<ImagemDoMapa | null> {
    const z = Number(zs);
    const x = Number(xs);
    const y = Number(ys);
    if (![z, x, y].every(Number.isInteger) || z < 3 || z > 18) return null;
    const lado = 2 ** z;
    if (x < 0 || y < 0 || x >= lado || y >= lado) return null;
    const k = `${z}/${x}/${y}`;
    if (!this.chave || !this.dentroDoLimite(token)) return null;
    try {
      const endereco = `https://api.tomtom.com/map/1/tile/basic/main/${k}.png?tileSize=256&language=pt-BR&key=${encodeURIComponent(this.chave)}`;
      if (!(await this.ritmo.vez())) return null;
      let resp = await this.buscarNaRede(endereco);
      if (resp.status === 429 && (await this.ritmo.vez())) {
        await new Promise((r) => setTimeout(r, 700));
        resp = await this.buscarNaRede(endereco);
      }
      if (!resp.ok) {
        this.logger.warn(`TomTom respondeu ${resp.status} numa imagem do acompanhar`);
        return null;
      }
      const png = Buffer.from(await resp.arrayBuffer());
      return { png, cacheControl: resp.headers?.get('cache-control') ?? null };
    } catch {
      return null;
    }
  }

  /** No maximo 400 imagens novas por link por hora. */
  private dentroDoLimite(token: string): boolean {
    const hora = Math.floor(Date.now() / 3_600_000);
    const c = this.porLink.get(token);
    if (!c || c.hora !== hora) {
      if (this.porLink.size > 2000) this.porLink.clear();
      this.porLink.set(token, { hora, n: 1 });
      return true;
    }
    c.n += 1;
    return c.n <= 400;
  }
}
