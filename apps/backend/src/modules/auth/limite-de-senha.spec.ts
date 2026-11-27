import {
  ERROS_DE_DESCONHECIDOS,
  ERROS_DE_DESCONHECIDOS_NO_DIA,
  ERROS_PERMITIDOS,
  ESPERA_MS,
  Pedinte,
  liberarConta,
  reservarTentativa,
  senhaCerta,
} from './limite-de-senha';

const de = (chave: string): Pedinte => ({ chave, conhecido: false });
const daCasa = (chave: string): Pedinte => ({ chave, conhecido: true });

/** Gasta ate o limite; devolve quantas passaram. */
function errar(conta: string, pedinte: Pedinte, vezes: number, agora = 1000): number {
  let passaram = 0;
  for (let i = 0; i < vezes; i++) if (reservarTentativa(conta, pedinte, agora)) passaram += 1;
  return passaram;
}

describe('Limite de senhas erradas', () => {
  it('cada pedinte tem o proprio limite, e depois espera', () => {
    expect(errar('conta-a', de('x'), 20)).toBe(ERROS_PERMITIDOS);
    expect(reservarTentativa('conta-a', de('x'), 1000 + ESPERA_MS - 1)).toBe(false);
    expect(reservarTentativa('conta-a', de('x'), 1000 + ESPERA_MS)).toBe(true);
  });

  it('o limite de um pedinte nao vale para os outros', () => {
    errar('conta-b', de('x'), 20);
    expect(reservarTentativa('conta-b', de('dona'), 1001)).toBe(true);
  });

  it('pedido recusado nao gasta o teto dos desconhecidos', () => {
    errar('conta-c', de('x'), 500);
    expect(reservarTentativa('conta-c', de('dona'), 1001)).toBe(true);
  });

  it('muitas conexoes juntas param no teto da conta', () => {
    let passaram = 0;
    for (let i = 0; i < 50; i++) passaram += errar('conta-d', de(`x${i}`), 3);
    expect(passaram).toBe(ERROS_DE_DESCONHECIDOS);
    expect(reservarTentativa('conta-d', de('novo'), 1001)).toBe(false);
    expect(reservarTentativa('conta-d', de('novo'), 1000 + ESPERA_MS)).toBe(true);
  });

  it('quem a conta ja conhece nao depende do teto', () => {
    for (let i = 0; i < 50; i++) errar('conta-e', de(`x${i}`), 3);
    expect(errar('conta-e', daCasa('celular-da-dona'), 20)).toBe(ERROS_PERMITIDOS);
  });

  it('o que um conhecido erra nao entra no teto dos desconhecidos', () => {
    errar('conta-f', daCasa('celular'), 20);
    let passaram = 0;
    for (let i = 0; i < 50; i++) passaram += errar('conta-f', de(`x${i}`), 3);
    expect(passaram).toBe(ERROS_DE_DESCONHECIDOS);
  });

  it('ha um teto por dia, e ele vence no dia seguinte', () => {
    let passaram = 0;
    for (let janela = 0; janela < 10; janela++) {
      const agora = 1000 + janela * ESPERA_MS;
      for (let i = 0; i < 40; i++) passaram += errar('conta-g', de(`${janela}-${i}`), 1, agora);
    }
    expect(passaram).toBe(ERROS_DE_DESCONHECIDOS_NO_DIA);
    expect(reservarTentativa('conta-g', daCasa('celular'), 1000 + 10 * ESPERA_MS)).toBe(true);
    expect(reservarTentativa('conta-g', de('depois'), 1000 + 25 * 60 * 60_000)).toBe(true);
  });

  it('senha certa zera so a contagem de quem acertou', () => {
    errar('conta-h', de('x'), ERROS_PERMITIDOS);
    errar('conta-h', daCasa('celular'), 5);
    senhaCerta('conta-h', daCasa('celular'));
    expect(errar('conta-h', daCasa('celular'), 20)).toBe(ERROS_PERMITIDOS);
    expect(reservarTentativa('conta-h', de('x'), 1001)).toBe(false);
  });

  it('entradas certas de aparelhos novos nao enchem o teto', () => {
    for (let i = 0; i < ERROS_DE_DESCONHECIDOS * 3; i++) {
      expect(reservarTentativa('conta-i', de(`n${i}`), 1000)).toBe(true);
      senhaCerta('conta-i', de(`n${i}`));
    }
  });

  it('senha nova com codigo zera a conta, e uma conta nao interfere na outra', () => {
    for (let i = 0; i < 50; i++) errar('conta-j', de(`x${i}`), 3);
    expect(reservarTentativa('conta-k', de('x0'), 1001)).toBe(true);
    liberarConta('conta-j');
    expect(reservarTentativa('conta-j', de('x0'), 1001)).toBe(true);
  });
});
