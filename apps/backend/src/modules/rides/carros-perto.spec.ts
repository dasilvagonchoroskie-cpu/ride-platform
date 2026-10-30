import { diaDeBrasilia, idAnonimo, posicaoAproximada, rumoArredondado } from './carros-perto';

describe('Carros por perto (30/10/2026: carro no sentido da rua)', () => {
  it('rumo de 5 em 5 graus; sem rumo do GPS fica null', () => {
    expect(rumoArredondado(92)).toBe(90);
    expect(rumoArredondado(93)).toBe(95);
    expect(rumoArredondado(358)).toBe(0);
    expect(rumoArredondado(0)).toBe(0);
    expect(rumoArredondado(null)).toBeNull();
    expect(rumoArredondado(undefined)).toBeNull();
    expect(rumoArredondado(-1)).toBeNull();
    expect(rumoArredondado(Number.NaN)).toBeNull();
  });

  it('posicao com 4 casas (~11 m)', () => {
    expect(posicaoAproximada(-18.0129468)).toBe(-18.0129);
    expect(posicaoAproximada(-49.35536)).toBe(-49.3554);
  });

  it('id anonimo: o mesmo no dia, outro no dia seguinte, outro para outro motorista; nao mostra o id real', () => {
    const a = idAnonimo('11111111-1111-1111-1111-111111111111', 'segredo', '2026-10-30');
    expect(a).toBe(idAnonimo('11111111-1111-1111-1111-111111111111', 'segredo', '2026-10-30'));
    expect(a).not.toBe(idAnonimo('11111111-1111-1111-1111-111111111111', 'segredo', '2026-10-31'));
    expect(a).not.toBe(idAnonimo('22222222-2222-2222-2222-222222222222', 'segredo', '2026-10-30'));
    expect(a).not.toBe(idAnonimo('11111111-1111-1111-1111-111111111111', 'outro', '2026-10-30'));
    expect(a).toMatch(/^carro-[0-9a-f]{12}$/);
    expect(a).not.toContain('1111');
  });

  it('dia de Brasilia vira a meia-noite de Brasilia (03:00 UTC)', () => {
    expect(diaDeBrasilia(new Date('2026-10-31T02:59:00Z'))).toBe('2026-10-30');
    expect(diaDeBrasilia(new Date('2026-10-31T03:00:00Z'))).toBe('2026-10-31');
  });
});
