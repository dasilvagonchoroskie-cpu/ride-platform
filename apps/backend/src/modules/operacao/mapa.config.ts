/**
 * Endereco das imagens do mapa usado pelos 3 aplicativos (auditoria de
 * 23/10/2026).
 *
 * Padrao: OpenStreetMap, gratis. Se um dia o OSM limitar o uso, basta
 * colocar outro endereco nas variaveis do Render (MAPA_TILES_URL e
 * MAPA_ATRIBUICAO) e os aplicativos passam a usar sozinhos, sem APK novo.
 * Endereco invalido e ignorado: fica o OpenStreetMap.
 */
export const MAPA_PADRAO = {
  tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  atribuicao: '© OpenStreetMap contributors',
  maxZoom: 19,
  // 'google' so vale no APK montado com a chave do Google Maps; sem a chave
  // o app usa o OpenStreetMap. MAPA_PROVEDOR=osm no Render volta todo mundo
  // para o OpenStreetMap sem app novo.
  provedor: 'google',
} as const;

export type ProvedorDoMapa = 'google' | 'osm';

export interface MapaDoApp {
  tiles: string;
  atribuicao: string;
  maxZoom: number;
  provedor: ProvedorDoMapa;
}

function provedorDoMapa(env: Record<string, string | undefined>): ProvedorDoMapa {
  return env.MAPA_PROVEDOR?.trim().toLowerCase() === 'osm' ? 'osm' : 'google';
}

/** So https, com {z}, {x} e {y}, sem espacos e de tamanho razoavel. */
export function enderecoDeMapaValido(url: string | undefined | null): url is string {
  if (!url) return false;
  const u = url.trim();
  return (
    u.length <= 300 &&
    u.startsWith('https://') &&
    !/\s/.test(u) &&
    u.includes('{z}') &&
    u.includes('{x}') &&
    u.includes('{y}')
  );
}

export function mapaDoApp(env: Record<string, string | undefined> = process.env): MapaDoApp {
  const url = env.MAPA_TILES_URL?.trim();
  const provedor = provedorDoMapa(env);
  if (!enderecoDeMapaValido(url)) return { ...MAPA_PADRAO, provedor };
  const atribuicao = env.MAPA_ATRIBUICAO?.trim().slice(0, 120) || MAPA_PADRAO.atribuicao;
  const zoom = Number(env.MAPA_MAX_ZOOM);
  const maxZoom = Number.isInteger(zoom) && zoom >= 10 && zoom <= 22 ? zoom : MAPA_PADRAO.maxZoom;
  return { tiles: url, atribuicao, maxZoom, provedor };
}
