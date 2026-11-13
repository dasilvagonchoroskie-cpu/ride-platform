import { RidesService } from '../rides/rides.service';
import { EntregasService } from '../entregas/entregas.service';
import { CHAVE_ENTREGAS } from '../entregas/entregas.regras';

/**
 * As duas ultimas portas do Comercio (Entrega ligada na cidade da coleta e
 * veiculo aceito na cidade) ficam dentro do pedido OFICIAL. Aqui o pedido
 * oficial e o de verdade (`RidesService.pedir`), com o servico de Entregas de
 * verdade; so o banco e a busca da cidade sao falsos. Se uma porta falhar, a
 * corrida nao e criada e o despacho nao e acionado.
 */
function montar(config: unknown) {
  const criacoes = jest.fn();
  const prisma: any = {
    ride: { findFirst: jest.fn(async () => null), create: criacoes },
    $transaction: criacoes,
    withTransaction: criacoes,
    setting: { findUnique: async ({ where }: any) => (where.key === CHAVE_ENTREGAS && config !== undefined ? { value: config } : null) },
  };
  const pracas = { doPonto: async () => ({ id: 'goiatuba', nome: 'Goiatuba' }) };
  const entregas = new EntregasService(prisma, pracas as never);
  const rides: any = Object.create(RidesService.prototype);
  rides.prisma = prisma;
  rides.entregas = entregas;
  return { rides: rides as RidesService, criacoes, prisma };
}

const pedido = (veiculo: 'MOTO' | 'CARRO') =>
  ({
    pickup: { address: 'Rua A, 10', latitude: -18.0108, longitude: -49.3558 },
    dropoff: { address: 'Rua B, 20', latitude: -18.0200, longitude: -49.3600 },
    paymentMethod: 'CASH',
    entrega: { descricao: 'Encomenda de teste', recebedorNome: 'Fulano', recebedorTelefone: '64999998888', veiculo },
  }) as never;

describe('Pedido oficial de entrega: portas de cidade e de veiculo (as que o Comercio herda)', () => {
  it('sem nada gravado a Entrega esta desligada em toda cidade: pedido recusado e nada e criado', async () => {
    const { rides, criacoes } = montar(undefined);
    await expect(rides.pedir('u1', pedido('CARRO'), { varias: true })).rejects.toThrow('Entrega ainda não está disponível nesta cidade.');
    expect(criacoes).not.toHaveBeenCalled();
  });

  it('cidade explicitamente desligada: recusado', async () => {
    const { rides, criacoes } = montar({ porCidade: { goiatuba: { ligada: false, veiculos: 'TODOS' } } });
    await expect(rides.pedir('u1', pedido('MOTO'), { varias: true })).rejects.toThrow('Entrega ainda não está disponível nesta cidade.');
    expect(criacoes).not.toHaveBeenCalled();
  });

  it('cidade ligada so para CARRO: pedido de MOTO recusado antes de criar a corrida', async () => {
    const { rides, criacoes } = montar({ porCidade: { goiatuba: { ligada: true, veiculos: 'CARRO' } } });
    await expect(rides.pedir('u1', pedido('MOTO'), { varias: true })).rejects.toThrow('Entrega de moto não está disponível nesta cidade.');
    expect(criacoes).not.toHaveBeenCalled();
  });

  it('cidade ligada so para MOTO: pedido de CARRO recusado antes de criar a corrida', async () => {
    const { rides, criacoes } = montar({ porCidade: { goiatuba: { ligada: true, veiculos: 'MOTO' } } });
    await expect(rides.pedir('u1', pedido('CARRO'), { varias: true })).rejects.toThrow('Entrega de carro não está disponível nesta cidade.');
    expect(criacoes).not.toHaveBeenCalled();
  });

  it('outra cidade (sem configuracao) continua desligada mesmo com Goiatuba ligada', async () => {
    const { rides, criacoes, prisma } = montar({ porCidade: { goiatuba: { ligada: true, veiculos: 'TODOS' } } });
    (rides as any).entregas = new EntregasService(prisma, { doPonto: async () => ({ id: 'itumbiara', nome: 'Itumbiara' }) } as never);
    await expect(rides.pedir('u1', pedido('CARRO'), { varias: true })).rejects.toThrow('Entrega ainda não está disponível nesta cidade.');
    expect(criacoes).not.toHaveBeenCalled();
  });
});
