import {
  CHAVE_ENTREGAS,
  conferirCodigo,
  ehEntrega,
  entregaNaCidade,
  lerConfigDeEntregas,
  telefoneDeQuemRecebe,
  veiculoServe,
} from './entregas.regras';
import { EntregasService } from './entregas.service';

const banco = (valor: unknown) =>
  ({ setting: { findUnique: async ({ where }: { where: { key: string } }) => (where.key === CHAVE_ENTREGAS && valor !== undefined ? { value: valor } : null) } }) as never;

describe('Entregas (Etapa 5, 30/10/2026)', () => {
  it('sem nada gravado: desligada em todas as cidades', async () => {
    const cfg = await lerConfigDeEntregas(banco(undefined));
    expect(entregaNaCidade(cfg, 'goiatuba')).toEqual({ ligada: false, veiculos: 'TODOS' });
    expect(entregaNaCidade(cfg, null).ligada).toBe(false);
  });

  it('ligada so na cidade escolhida, com o tipo de veiculo', async () => {
    const cfg = await lerConfigDeEntregas(banco({ porCidade: { goiatuba: { ligada: true, veiculos: 'MOTO' }, itumbiara: { ligada: true, veiculos: 'xx' } } }));
    expect(entregaNaCidade(cfg, 'goiatuba')).toEqual({ ligada: true, veiculos: 'MOTO' });
    expect(entregaNaCidade(cfg, 'itumbiara')).toEqual({ ligada: true, veiculos: 'TODOS' });
    expect(entregaNaCidade(cfg, 'teutonia').ligada).toBe(false);
  });

  it('tipo de veiculo: carro, moto ou os dois', () => {
    expect(veiculoServe('TODOS', 'CARRO')).toBe(true);
    expect(veiculoServe('CARRO', 'PREMIUM')).toBe(true);
    expect(veiculoServe('CARRO', 'MOTO')).toBe(false);
    expect(veiculoServe('MOTO', 'MOTO')).toBe(true);
    expect(veiculoServe('MOTO', 'CONFORTO')).toBe(false);
  });

  it('codigo de 4 digitos: certo encerra; errado avisa quantas tentativas restam; 5 erros trava', () => {
    expect(conferirCodigo({ codigo: '4821', tentativas: 0 }, '4821')).toEqual({ ok: true });
    expect(conferirCodigo({ codigo: '4821', tentativas: 0 }, ' 48-21 ')).toEqual({ ok: true });
    const errado = conferirCodigo({ codigo: '4821', tentativas: 0 }, '1111');
    expect(errado).toMatchObject({ ok: false, bloqueada: false });
    expect((errado as { motivo: string }).motivo).toContain('restam 4');
    expect(conferirCodigo({ codigo: '4821', tentativas: 4 }, '1111')).toMatchObject({ ok: false, bloqueada: true });
    expect(conferirCodigo({ codigo: '4821', tentativas: 5 }, '4821')).toMatchObject({ ok: false, bloqueada: true });
    expect(conferirCodigo({ codigo: '4821', tentativas: 0 }, '12')).toMatchObject({ ok: false, bloqueada: false });
  });

  it('telefone de quem recebe: so numeros, com 55', () => {
    expect(telefoneDeQuemRecebe('(64) 99999-1234')).toBe('5564999991234');
    expect(telefoneDeQuemRecebe('+55 64 99999-1234')).toBe('5564999991234');
  });

  it('o motorista nunca recebe o codigo; cliente e Central recebem', () => {
    const s = new EntregasService({} as never, {} as never);
    const e = {
      descricao: 'Documentos',
      destinatarioNome: 'Ana',
      destinatarioTelefone: '5564999991234',
      codigo: '4821',
      veiculos: 'TODOS',
      tentativas: 1,
      coletadaEm: null,
      entregueEm: null,
    };
    expect(s.publico(e, 'motorista')).not.toHaveProperty('codigo');
    expect(s.publico(e, 'cliente')).toMatchObject({ codigo: '4821' });
    expect(s.publico(e, 'central')).toMatchObject({ codigo: '4821', tentativas: 1 });
    expect(s.publico(null, 'cliente')).toBeNull();
  });

  it('codigo ENTREGA e reconhecido (maiuscula ou nao)', () => {
    expect(ehEntrega('ENTREGA')).toBe(true);
    expect(ehEntrega('entrega')).toBe(true);
    expect(ehEntrega('CARRO')).toBe(false);
  });
});
