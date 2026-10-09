import { distanciaDoTaximetro, paradasQueValem } from './cobranca';

// Praca da Matriz de Goiatuba e um ponto ~1,1 km dali.
const embarque = { latitude: -18.0125, longitude: -49.3547 };
const longe = { latitude: -18.005, longitude: -49.361 };

const porRua = (metros: number) => async () => metros;

describe('Taximetro: distancia que vale no fim', () => {
  it('usa o que o celular mediu quando e possivel', async () => {
    const d = await distanciaDoTaximetro({ medida: 1800, embarque, fim: longe, estimadaMetros: 1500, porRuaAte: porRua(1400) });
    expect(d).toBe(1800);
  });

  it('medicao menor que a linha reta (GPS falhou): vale o caminho pelas ruas', async () => {
    const d = await distanciaDoTaximetro({ medida: 0, embarque, fim: longe, estimadaMetros: 1500, porRuaAte: porRua(1400) });
    expect(d).toBe(1400);
  });

  it('salto de GPS fica no teto (3x o caminho + 2 km)', async () => {
    const d = await distanciaDoTaximetro({ medida: 90_000, embarque, fim: longe, estimadaMetros: 1500, porRuaAte: porRua(1400) });
    expect(d).toBe(1400 * 3 + 2000);
  });

  it('desceu perto do embarque: cobra o pouco que andou', async () => {
    const d = await distanciaDoTaximetro({ medida: 120, embarque, fim: embarque, estimadaMetros: 5000, porRuaAte: porRua(0) });
    expect(d).toBe(120);
  });

  it('sem medicao e sem saber onde terminou: a estimativa do pedido', async () => {
    const d = await distanciaDoTaximetro({ medida: undefined, embarque, fim: null, estimadaMetros: 5000, porRuaAte: porRua(0) });
    expect(d).toBe(5000);
  });
});

describe('paradas na viagem (Evandro, 09/10/2026)', () => {
  it('parada de 5 minutos numa viagem de 20 minutos vale inteira', () => {
    expect(paradasQueValem(300, 20 * 60, 8000)).toBe(300);
  });

  it('nunca passa do tempo da viagem menos o minimo para rodar a distancia', () => {
    // 10 km em 10 minutos: o carro rodou quase o tempo todo (minimo ~450 s).
    expect(paradasQueValem(600, 600, 10000)).toBe(149);
  });

  it('viagem de segundos nao aceita parada inventada', () => {
    expect(paradasQueValem(300, 10, 1000)).toBe(0);
  });

  it('sem parada informada, zero', () => {
    expect(paradasQueValem(undefined, 900, 3000)).toBe(0);
    expect(paradasQueValem(0, 900, 3000)).toBe(0);
  });
});
