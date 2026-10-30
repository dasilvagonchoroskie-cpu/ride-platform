import { RidesService } from './rides.service';

describe('Escolha do motorista: rota pelas ruas so nos mais perto', () => {
  it('padrao 0 desde 30/10/2026 (o app do motorista ja pede a rota); a variavel ROTA_NOS_MAIS_PROXIMOS liga de novo', () => {
    expect(RidesService.quantosPelaRua({})).toBe(0);
    expect(RidesService.quantosPelaRua({ ROTA_NOS_MAIS_PROXIMOS: '3' })).toBe(3);
    expect(RidesService.quantosPelaRua({ ROTA_NOS_MAIS_PROXIMOS: '2' })).toBe(2);
    expect(RidesService.quantosPelaRua({ ROTA_NOS_MAIS_PROXIMOS: '50' })).toBe(0);
    expect(RidesService.quantosPelaRua({ ROTA_NOS_MAIS_PROXIMOS: 'x' })).toBe(0);
  });
});
