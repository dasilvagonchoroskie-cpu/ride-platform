import { TomTomGeo } from '../geo/tomtom';

/**
 * Mapa dos 3 aplicativos (desde 29/10/2026: TomTom).
 *
 * - GET /app/config (publico) leva so o provedor e a atribuicao, SEM chave.
 *   Apps antigos (montagem 241 e anteriores) nao acham "tiles" ali e seguem
 *   com o mapa que ja tinham, sem quebrar.
 * - GET /geo/mapa (so com login) leva o endereco das imagens com a chave:
 *   a chave fica so na variavel TOMTOM_API_KEY do Render e da para trocar
 *   sem APK novo.
 *
 * Imagens de 512 px: 4 vezes menos pedidos que as de 256 px para a mesma tela
 * (cota gratis da TomTom: 200 mil imagens por mes).
 */
export const MAPA_PADRAO = {
  provedor: 'tomtom',
  atribuicao: '© TomTom',
  maxZoom: 20,
  tamanho: 512,
} as const;

export type ProvedorDoMapa = 'tomtom' | 'google';

export interface MapaDoApp {
  provedor: ProvedorDoMapa;
  atribuicao: string;
  maxZoom: number;
  tamanho: number;
}

export interface MapaComChave extends MapaDoApp {
  /** Endereco das imagens com {z}/{x}/{y}; null = sem chave no servidor. */
  tiles: string | null;
}

/** MAPA_PROVEDOR=google no Render: os apps montados com a chave do Google usam o Google. */
function provedorDoMapa(env: Record<string, string | undefined>): ProvedorDoMapa {
  return env.MAPA_PROVEDOR?.trim().toLowerCase() === 'google' ? 'google' : 'tomtom';
}

/** O que vai no /app/config (publico): nada de chave. */
export function mapaDoApp(env: Record<string, string | undefined> = process.env): MapaDoApp {
  return { ...MAPA_PADRAO, provedor: provedorDoMapa(env) };
}

/** Endereco das imagens da TomTom (com a chave), para quem entrou na conta. */
export function enderecoDasImagens(chave: string): string {
  return (
    'https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png' +
    `?tileSize=${MAPA_PADRAO.tamanho}&language=pt-BR&key=${encodeURIComponent(chave)}`
  );
}

export function mapaComChave(env: Record<string, string | undefined> = process.env): MapaComChave {
  const chave = TomTomGeo.daVariavel(env);
  return { ...mapaDoApp(env), tiles: chave ? enderecoDasImagens(chave) : null };
}
