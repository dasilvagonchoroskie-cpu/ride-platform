import { RidesService } from './rides.service';

describe('Escolha do motorista: rota pelas ruas so nos mais perto', () => {
  it('padrao 3; variavel ROTA_NOS_MAIS_PROXIMOS muda (0 desliga); valor estranho volta ao 3', () => {
    expect(RidesService.quantosPelaRua({})).toBe(3);
    expect(RidesService.quantosPelaRua({ ROTA_NOS_MAIS_PROXIMOS: '0' })).toBe(0);
    expect(RidesService.quantosPelaRua({ ROTA_NOS_MAIS_PROXIMOS: '2' })).toBe(2);
    expect(RidesService.quantosPelaRua({ ROTA_NOS_MAIS_PROXIMOS: '50' })).toBe(3);
    expect(RidesService.quantosPelaRua({ ROTA_NOS_MAIS_PROXIMOS: 'x' })).toBe(3);
  });
});
