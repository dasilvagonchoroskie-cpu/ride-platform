import { chaveDoDestino } from './destinos';

describe('Destinos recentes (historico no servidor)', () => {
  it('mesma rua no mesmo ponto = mesmo destino, sem ligar para acento e maiuscula', () => {
    expect(chaveDoDestino('Rodoviária de Goiatuba', -18.00501, -49.36099)).toBe(chaveDoDestino('rodoviaria de goiatuba', -18.00499, -49.36101));
  });

  it('outro ponto = outro destino', () => {
    expect(chaveDoDestino('Rua Goiás, 10', -18.0, -49.3)).not.toBe(chaveDoDestino('Rua Goiás, 10', -18.01, -49.3));
  });
});
