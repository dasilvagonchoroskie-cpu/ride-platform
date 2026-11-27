import { clienteDoPedido } from './limite-por-cliente.guard';

describe('Limite de pedidos por cliente (atras do proxy)', () => {
  it('conta pelo endereco anotado pelo proxy, nao por outros cabecalhos', () => {
    expect(clienteDoPedido({ headers: { 'cf-connecting-ip': '200.1.2.3', 'x-forwarded-for': '9.9.9.9, 177.5.6.7' }, ip: '10.0.0.1' })).toBe('177.5.6.7');
  });

  it('o ultimo do x-forwarded-for (o primeiro pode ser inventado)', () => {
    expect(clienteDoPedido({ headers: { 'x-forwarded-for': '1.1.1.1, 177.5.6.7' }, ip: '10.0.0.1' })).toBe('177.5.6.7');
  });

  it('sem cabecalhos: o endereco da conexao', () => {
    expect(clienteDoPedido({ headers: {}, ip: '10.0.0.9' })).toBe('10.0.0.9');
    expect(clienteDoPedido({})).toBe('desconhecido');
  });
});
