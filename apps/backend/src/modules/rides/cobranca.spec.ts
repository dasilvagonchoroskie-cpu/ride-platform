import { distanciaDoTaximetro } from './cobranca';

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
