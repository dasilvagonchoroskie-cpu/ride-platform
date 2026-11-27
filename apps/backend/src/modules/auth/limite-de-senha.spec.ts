import { ERROS_PERMITIDOS, ESPERA_MS, liberarConta, reservarTentativa } from './limite-de-senha';

describe('Limite de senhas erradas por conta', () => {
  it('permite ate o limite e depois pede para esperar', () => {
    for (let i = 0; i < ERROS_PERMITIDOS; i++) expect(reservarTentativa('conta-a', 1000 + i)).toBe(true);
    expect(reservarTentativa('conta-a', 2000)).toBe(false);
  });

  it('a espera termina sozinha', () => {
    for (let i = 0; i < ERROS_PERMITIDOS; i++) reservarTentativa('conta-b', 1000);
    expect(reservarTentativa('conta-b', 1000 + ESPERA_MS - 1)).toBe(false);
    expect(reservarTentativa('conta-b', 1000 + ESPERA_MS)).toBe(true);
  });

  it('senha certa zera a contagem, e uma conta nao interfere na outra', () => {
    for (let i = 0; i < ERROS_PERMITIDOS; i++) reservarTentativa('conta-c', 1000);
    expect(reservarTentativa('conta-d', 1000)).toBe(true);
    liberarConta('conta-c');
    expect(reservarTentativa('conta-c', 1001)).toBe(true);
  });
});
