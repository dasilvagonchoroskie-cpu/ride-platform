import { assinarCotacao, lerCotacao, VALIDADE_DA_COTACAO_MS } from './cotacao';

describe('Cotacao assinada (rota pedida uma vez so, sem guardar no servidor)', () => {
  const segredo = 'segredo-de-teste-com-mais-de-32-letras!!';
  const pontos = [
    { latitude: -18.0125, longitude: -49.3547 },
    { latitude: -18.005, longitude: -49.361 },
  ];
  const t0 = 1_800_000_000_000;

  it('volta a mesma medida para os mesmos pontos dentro do prazo', () => {
    const c = assinarCotacao(pontos, { distanceMeters: 2884.4, durationSeconds: 410.6 }, segredo, t0);
    expect(lerCotacao(c, pontos, segredo, t0 + 60_000)).toEqual({ distanceMeters: 2884, durationSeconds: 411 });
  });

  it('recusa vencida, outros pontos, outro segredo e numero alterado', () => {
    const c = assinarCotacao(pontos, { distanceMeters: 2884, durationSeconds: 410 }, segredo, t0);
    expect(lerCotacao(c, pontos, segredo, t0 + VALIDADE_DA_COTACAO_MS + 1)).toBeNull();
    expect(lerCotacao(c, [pontos[0], { latitude: -18.1, longitude: -49.4 }], segredo, t0)).toBeNull();
    expect(lerCotacao(c, pontos, 'outro-segredo-de-teste-com-32-letras!!', t0)).toBeNull();
    const [corpo, ass] = c.split('.');
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    const falso = Buffer.from(JSON.stringify({ ...d, m: 10 })).toString('base64url');
    expect(lerCotacao(`${falso}.${ass}`, pontos, segredo, t0)).toBeNull();
    expect(lerCotacao(undefined, pontos, segredo, t0)).toBeNull();
    expect(lerCotacao('lixo', pontos, segredo, t0)).toBeNull();
  });
});
