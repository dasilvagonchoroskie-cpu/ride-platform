import { Logger } from '@nestjs/common';
import { TomTomGeo } from '../geo/tomtom';

/**
 * Imagens do mapa da pagina publica de acompanhar a viagem: o servidor busca
 * na TomTom e entrega, para a chave nunca ir para a pagina. Guarda as mais
 * usadas e limita cada link (a pagina e aberta pela familia, poucas vezes).
 */
export class ImagensDoAcompanhar {
  private readonly logger = new Logger('ImagensDoAcompanhar');
  private readonly guardadas = new Map<string, { quando: number; png: Buffer }>();
  private readonly porLink = new Map<string, { hora: number; n: number }>();

  constructor(
    private readonly chave: string | null = TomTomGeo.daVariavel(),
    private readonly buscarNaRede: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }> = (u) =>
      fetch(u),
  ) {}

  /** null = numero invalido, sem chave, limite do link ou a TomTom nao respondeu. */
  async buscar(token: string, zs: string, xs: string, ys: string): Promise<Buffer | null> {
    const z = Number(zs);
    const x = Number(xs);
    const y = Number(ys);
    if (![z, x, y].every(Number.isInteger) || z < 3 || z > 18) return null;
    const lado = 2 ** z;
    if (x < 0 || y < 0 || x >= lado || y >= lado) return null;
    const k = `${z}/${x}/${y}`;
    const g = this.guardadas.get(k);
    if (g && Date.now() - g.quando < 7 * 24 * 3600 * 1000) return g.png;
    if (!this.chave || !this.dentroDoLimite(token)) return null;
    try {
      const resp = await this.buscarNaRede(
        `https://api.tomtom.com/map/1/tile/basic/main/${k}.png?tileSize=256&language=pt-BR&key=${encodeURIComponent(this.chave)}`,
      );
      if (!resp.ok) {
        this.logger.warn(`TomTom respondeu ${resp.status} numa imagem do acompanhar`);
        return null;
      }
      const png = Buffer.from(await resp.arrayBuffer());
      if (this.guardadas.size >= 800) {
        const velha = this.guardadas.keys().next().value;
        if (velha !== undefined) this.guardadas.delete(velha);
      }
      this.guardadas.set(k, { quando: Date.now(), png });
      return png;
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
