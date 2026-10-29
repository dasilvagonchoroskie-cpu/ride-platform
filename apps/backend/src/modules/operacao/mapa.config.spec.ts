import { enderecoDasImagens, MAPA_PADRAO, mapaComChave, mapaDoApp } from './mapa.config';

// Chave de mentira (32 letras e numeros, como as da TomTom).
const CHAVE_FALSA = 'abcdefghijklmnopqrstuvwxyz012345';

describe('mapa dos aplicativos (TomTom)', () => {
  it('o /app/config publico nunca leva a chave', () => {
    const m = mapaDoApp({ TOMTOM_API_KEY: CHAVE_FALSA });
    expect(m).toEqual(MAPA_PADRAO);
    expect(JSON.stringify(m)).not.toContain(CHAVE_FALSA);
  });

  it('quem entrou na conta recebe o endereco das imagens de 512 px com a chave', () => {
    const m = mapaComChave({ TOMTOM_API_KEY: CHAVE_FALSA });
    expect(m.provedor).toBe('tomtom');
    expect(m.tiles).toBe(enderecoDasImagens(CHAVE_FALSA));
    expect(m.tiles).toContain('https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png');
    expect(m.tiles).toContain('tileSize=512');
    expect(m.tamanho).toBe(512);
  });

  it('sem chave no servidor: sem endereco de imagens (o app mostra o aviso)', () => {
    expect(mapaComChave({}).tiles).toBeNull();
    expect(mapaComChave({ TOMTOM_API_KEY: 'curta' }).tiles).toBeNull();
  });

  it('MAPA_PROVEDOR=google manda os apps com a chave do Google usarem o Google', () => {
    expect(mapaDoApp({ MAPA_PROVEDOR: 'GOOGLE' }).provedor).toBe('google');
    expect(mapaDoApp({ MAPA_PROVEDOR: 'qualquer' }).provedor).toBe('tomtom');
  });

  it('nenhum endereco do OpenStreetMap', () => {
    expect(JSON.stringify(mapaComChave({ TOMTOM_API_KEY: CHAVE_FALSA }))).not.toMatch(/openstreetmap/i);
  });
});
