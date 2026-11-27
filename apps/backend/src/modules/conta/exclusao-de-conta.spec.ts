import { SessoesService } from '../auth/sessoes.service';
import { CentralService } from '../central/central.service';
import { DriversService } from '../drivers/drivers.service';
import { ContaService } from './conta.service';

/** Excluir a conta tem de fazer o que a Politica de Privacidade promete. */

type Chamada = { alvo: string; args: any };

/** Banco de mentira: anota cada chamada; `respostas['tabela.metodo']` decide o retorno. */
function banco(respostas: Record<string, (args: any) => unknown> = {}) {
  const chamadas: Chamada[] = [];
  const tabela = (nome: string) =>
    new Proxy(
      {},
      {
        get: (_t, metodo: string) => async (args: any) => {
          const alvo = `${nome}.${metodo}`;
          chamadas.push({ alvo, args });
          if (respostas[alvo]) return respostas[alvo](args);
          if (metodo === 'count') return 0;
          if (metodo === 'findMany') return [];
          return { count: 0 };
        },
      },
    );
  const base: any = new Proxy(
    {},
    {
      get: (_t, nome: string) => {
        if (nome === 'then') return undefined;
        if (nome === '$transaction' || nome === 'withTransaction') return (fn: any) => fn(base);
        return tabela(nome);
      },
    },
  );
  const feitas = (alvo: string) => chamadas.filter((c) => c.alvo === alvo);
  return { prisma: base, feitas };
}

const motorista = { id: 'd1', userId: 'u1', user: { role: 'DRIVER', metadata: {} } };

function servicoDeMotorista(respostas: Record<string, (args: any) => unknown> = {}) {
  const b = banco({ 'driver.findUnique': () => motorista, ...respostas });
  const sessoes = { esquecer: jest.fn() };
  const s: any = Object.create(DriversService.prototype);
  Object.assign(s, { prisma: b.prisma, sessoes, logger: { log: jest.fn(), warn: jest.fn() } });
  return { s: s as DriversService, sessoes, ...b };
}

function servicoDaCentral(respostas: Record<string, (args: any) => unknown> = {}) {
  const b = banco({
    'user.findUnique': () => ({ id: 'u1', name: 'Ana', role: 'PASSENGER', deletedAt: null, metadata: {}, driver: null }),
    ...respostas,
  });
  const sessoes = { esquecer: jest.fn() };
  const s: any = Object.create(CentralService.prototype);
  Object.assign(s, { prisma: b.prisma, sessoes, logger: { log: jest.fn(), warn: jest.fn() } });
  return { s: s as CentralService, sessoes, ...b };
}

describe('Excluir a propria conta', () => {
  function montar(corridasAbertasComoPassageiro: number) {
    const b = banco({
      'user.findUnique': () => ({ id: 'u1', role: 'DRIVER', deletedAt: null, driver: { id: 'd1' } }),
      'ride.count': () => corridasAbertasComoPassageiro,
    });
    const drivers = { adminDelete: jest.fn(async () => ({ resultado: 'VIROU_PASSAGEIRO' })) };
    const central = { excluirPassageiro: jest.fn(async () => ({ resultado: 'ANONIMIZADO' })) };
    const conta = new ContaService(b.prisma, drivers as never, central as never, {} as never, {} as never, {} as never);
    return { conta, drivers, central };
  }

  it('com corrida aberta como passageiro, nao apaga nem a parte de motorista', async () => {
    const { conta, drivers, central } = montar(1);
    await expect(conta.excluirMinhaConta('u1')).rejects.toThrow(/corrida em andamento ou agendada/);
    expect(drivers.adminDelete).not.toHaveBeenCalled();
    expect(central.excluirPassageiro).not.toHaveBeenCalled();
  });

  it('sem corrida aberta, encerra os dois perfis', async () => {
    const { conta, drivers, central } = montar(0);
    await expect(conta.excluirMinhaConta('u1')).resolves.toMatchObject({ ok: true });
    expect(drivers.adminDelete).toHaveBeenCalledTimes(1);
    expect(central.excluirPassageiro).toHaveBeenCalledTimes(1);
  });
});

describe('Excluir motorista', () => {
  it('sem historico nenhum, sai a conta inteira e o acesso cai na hora', async () => {
    const { s, sessoes, feitas } = servicoDeMotorista();
    await expect(s.adminDelete('d1', 'adm')).resolves.toMatchObject({ resultado: 'APAGADO' });
    expect(feitas('user.delete')).toHaveLength(1);
    expect(sessoes.esquecer).toHaveBeenCalledWith('u1');
  });

  it('com alerta de SOS, o registro do alerta nao some junto com a conta', async () => {
    const { s, feitas } = servicoDeMotorista({ 'safetyEvent.count': () => 1 });
    await expect(s.adminDelete('d1', 'adm')).resolves.toMatchObject({ resultado: 'ANONIMIZADO' });
    expect(feitas('user.delete')).toHaveLength(0);
  });

  it('dono de loja continua com a conta: apagar o motorista nao derruba a loja', async () => {
    const { s, feitas } = servicoDeMotorista({ 'comercio.count': () => 1 });
    await expect(s.adminDelete('d1', 'adm')).resolves.toMatchObject({ resultado: 'VIROU_PASSAGEIRO' });
    expect(feitas('user.delete')).toHaveLength(0);
  });

  it('ao tirar os dados pessoais, saem tambem avisos, aparelhos e formas de pagamento', async () => {
    const { s, feitas } = servicoDeMotorista({ 'rating.count': () => 2 });
    await expect(s.adminDelete('d1', 'adm')).resolves.toMatchObject({ resultado: 'ANONIMIZADO' });
    for (const alvo of ['refreshToken', 'device', 'userAddress', 'paymentMethod', 'notification']) {
      expect(feitas(`${alvo}.deleteMany`)[0]?.args).toEqual({ where: { userId: 'u1' } });
    }
  });
});

describe('Excluir passageiro', () => {
  it('com historico, apaga os avisos e o acesso cai na hora', async () => {
    const { s, sessoes, feitas } = servicoDaCentral({ 'ride.count': (a) => (a.where.status ? 0 : 3) });
    await expect(s.excluirPassageiro('u1', 'adm')).resolves.toMatchObject({ resultado: 'ANONIMIZADO' });
    expect(feitas('notification.deleteMany')[0]?.args).toEqual({ where: { userId: 'u1' } });
    expect(sessoes.esquecer).toHaveBeenCalledWith('u1');
  });

  it('sem historico, o acesso tambem cai na hora', async () => {
    const { s, sessoes } = servicoDaCentral();
    await expect(s.excluirPassageiro('u1', 'adm')).resolves.toMatchObject({ resultado: 'APAGADO' });
    expect(sessoes.esquecer).toHaveBeenCalledWith('u1');
  });

  it('com corrida aberta, nada e apagado', async () => {
    const { s, sessoes, feitas } = servicoDaCentral({ 'ride.count': (a) => (a.where.status ? 1 : 1) });
    await expect(s.excluirPassageiro('u1', 'adm')).rejects.toThrow(/corrida em andamento ou agendada/);
    expect(feitas('user.update')).toHaveLength(0);
    expect(feitas('user.delete')).toHaveLength(0);
    expect(sessoes.esquecer).not.toHaveBeenCalled();
  });
});

describe('Acesso de conta excluida', () => {
  it('esquecer a conta faz o proximo pedido consultar o banco de novo', async () => {
    let status = 'ACTIVE';
    const b = banco({ 'user.findUnique': () => ({ status, metadata: {} }) });
    const sessoes = new SessoesService(b.prisma);
    await expect(sessoes.acessoValido('u1', 100)).resolves.toBe(true);
    status = 'DELETED';
    sessoes.esquecer('u1');
    await expect(sessoes.acessoValido('u1', 100)).resolves.toBe(false);
  });
});
