import { enderecoDeMapaValido, MAPA_PADRAO, mapaDoApp } from './mapa.config';

describe('mapa dos aplicativos', () => {
  it('sem variavel, usa o OpenStreetMap', () => {
    expect(mapaDoApp({})).toEqual(MAPA_PADRAO);
  });

  it('usa o endereco configurado quando ele e valido', () => {
    expect(
      mapaDoApp({
        MAPA_TILES_URL: ' https://tiles.exemplo.com.br/{z}/{x}/{y}.png ',
        MAPA_ATRIBUICAO: '© Exemplo',
        MAPA_MAX_ZOOM: '18',
      }),
    ).toEqual({ tiles: 'https://tiles.exemplo.com.br/{z}/{x}/{y}.png', atribuicao: '© Exemplo', maxZoom: 18, provedor: 'google' });
  });

  it('endereco errado nao quebra o mapa: volta para o OpenStreetMap', () => {
    for (const ruim of ['http://tiles.exemplo.com/{z}/{x}/{y}.png', 'https://tiles.exemplo.com/mapa.png', 'https://a b/{z}/{x}/{y}', '']) {
      expect(enderecoDeMapaValido(ruim)).toBe(false);
      expect(mapaDoApp({ MAPA_TILES_URL: ruim })).toEqual(MAPA_PADRAO);
    }
  });

  it('MAPA_PROVEDOR=osm volta todos os apps para o OpenStreetMap', () => {
    expect(mapaDoApp({ MAPA_PROVEDOR: 'OSM' }).provedor).toBe('osm');
    expect(mapaDoApp({ MAPA_PROVEDOR: 'qualquer' }).provedor).toBe('google');
    expect(mapaDoApp({}).provedor).toBe('google');
  });

  it('zoom fora do normal fica no padrao', () => {
    expect(mapaDoApp({ MAPA_TILES_URL: 'https://t.exemplo.com/{z}/{x}/{y}.png', MAPA_MAX_ZOOM: '40' }).maxZoom).toBe(19);
  });
});
