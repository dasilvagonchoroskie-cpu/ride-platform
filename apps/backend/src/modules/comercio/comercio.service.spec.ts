import { UserRole } from '@ride/shared';

// O motor de corridas e o das cidades sao simulados (e nao carregam o banco).
jest.mock('../rides/rides.service', () => ({ RidesService: class RidesService {} }));
jest.mock('../pracas/pracas.service', () => ({ PracasService: class PracasService {} }));

import { ROLES_KEY } from '../../common/constants/metadata.constants';
import { DonoGravaGuard } from '../pracas/so-dono.guard';
import { AdminComercioController, ComercioController } from './comercio.controller';
import { ComercioService } from './comercio.service';

/**
 * Aplicativo Comercio: o servidor do estabelecimento, com um banco falso na
 * memoria e o motor de corridas simulado. Nada aqui toca motorista, passageiro
 * ou estabelecimento de verdade.
 */
const cadastro = {
  nomeFantasia: 'Padaria Estrela',
  cnpj: '11222333000181',
  responsavelNome: 'Maria Souza',
  telefone: '+5564999991234',
  email: 'maria@padaria.com.br',
  logradouro: 'Rua das Flores',
  numero: '120',
  bairro: 'Centro',
  cidade: 'Goiatuba',
  uf: 'GO',
  cep: '75600000',
  latitude: -18.01,
  longitude: -49.36,
};
const pedido = (chave = 'chave-numero-0000001') => ({
  chave,
  encomenda: { descricao: '2 caixas de bolo', observacoes: 'Frágil' },
  destinatario: { nome: 'Ana Lima', telefone: '(64) 98888-7777' },
  destino: { logradouro: 'Rua Verde', numero: '55', bairro: 'Jardim', cidade: 'Goiatuba', uf: 'GO', cep: '75600111', latitude: -18.02, longitude: -49.35 },
  veiculo: 'MOTO' as const,
});

function montar(opcoes: { pracas?: unknown[]; pedirDemora?: number } = {}) {
  const usuarios: Record<string, any> = {
    u1: { id: 'u1', role: 'PASSENGER', email: 'maria@padaria.com.br', emailVerifiedAt: new Date(), passwordHash: null },
    u2: { id: 'u2', role: 'PASSENGER', email: 'joao@loja.com.br', emailVerifiedAt: new Date(), passwordHash: null },
    motorista: { id: 'motorista', role: 'DRIVER', email: 'm@x.com', emailVerifiedAt: new Date(), passwordHash: null },
    semEmail: { id: 'semEmail', role: 'PASSENGER', email: 'a@b.com', emailVerifiedAt: null, passwordHash: null },
  };
  const comercios: any[] = [];
  const pedidos: any[] = [];
  const corridas: Record<string, any> = {};
  const auditoria: any[] = [];
  let n = 0;

  const comJoin = (p: any) => (p ? { ...p, ride: corridas[p.rideId] } : null);
  const prisma: any = {
    user: { findUnique: async ({ where }: any) => usuarios[where.id] ?? null, update: jest.fn(async ({ where, data }: any) => Object.assign(usuarios[where.id], data)) },
    comercio: {
      // devolve copia, como o banco de verdade (quem leu nao ve a mudanca depois)
      findUnique: async ({ where }: any) => {
        const c = comercios.find((x) => (where.userId ? x.userId === where.userId : where.cnpj ? x.cnpj === where.cnpj : x.id === where.id));
        return c ? { ...c } : null;
      },
      create: async ({ data }: any) => {
        const c = { id: `c${++n}`, createdAt: new Date(), updatedAt: new Date(), razaoSocial: null, responsavelCpf: null, complemento: null, motivo: null, decididoPor: null, decididoEm: null, ...data };
        comercios.push(c);
        return c;
      },
      update: async ({ where, data }: any) => ({ ...Object.assign(comercios.find((c) => c.id === where.id), data) }),
      findMany: async () => [...comercios],
    },
    comercioPedido: {
      findUnique: async ({ where }: any) => {
        const k = where.comercioId_chave;
        return pedidos.find((p) => p.comercioId === k.comercioId && p.chave === k.chave) ?? null;
      },
      findFirst: async ({ where }: any) => comJoin(pedidos.find((p) => p.rideId === where.rideId && p.comercioId === where.comercioId)),
      findMany: async ({ where }: any) =>
        pedidos
          .filter((p) => (!where?.comercioId || p.comercioId === where.comercioId))
          .map(comJoin)
          .map((p) => ({ ...p, comercio: comercios.find((c) => c.id === p.comercioId) })),
      count: async ({ where }: any) => pedidos.filter((p) => p.comercioId === where.comercioId).length,
      create: async ({ data }: any) => {
        if (pedidos.some((p) => p.comercioId === data.comercioId && p.chave === data.chave)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        pedidos.push({ createdAt: new Date(), ...data });
      },
    },
    auditLog: { create: jest.fn(async ({ data }: any) => void auditoria.push(data)) },
    $executeRawUnsafe: jest.fn(),
    withTransaction: async (fn: any) => fn(prisma),
  };

  const rides = {
    estimar: jest.fn(async () => ({
      distanceMeters: 3200,
      durationSeconds: 600,
      cotacao: 'cotacao-assinada',
      opcoesEntrega: [{ veiculo: 'MOTO', nome: 'Moto', estimatedFareCents: 700 }],
    })),
    pedir: jest.fn(async (uid: string, input: any, op: any) => {
      if (opcoes.pedirDemora) await new Promise((r) => setTimeout(r, opcoes.pedirDemora));
      const id = `r${++n}`;
      await op.aoCriar(prisma, id); // o pedido do comercio entra na MESMA transacao da corrida
      corridas[id] = {
        id,
        code: `FM${n}`,
        status: 'SEARCHING',
        category: 'ENTREGA_MOTO',
        requestedAt: new Date(),
        estimatedFareCents: 700,
        finalFareCents: null,
        pickupAddress: input.pickup.address,
        dropoffAddress: input.dropoff.address,
        dropoffLat: input.dropoff.latitude,
        dropoffLng: input.dropoff.longitude,
        commissionCents: 0,
        entrega: { destinatarioNome: input.entrega.destinatarioNome, destinatarioTelefone: input.entrega.destinatarioTelefone, codigo: '4821', coletadaEm: null, entregueEm: null },
        driver: null,
        vehicle: null,
        _passageiro: uid,
      };
      return { ride: { id } }; // como o RidesService de verdade: { ride: {...} }
    }),
    acompanharDoPassageiro: jest.fn(async () => ({ motorista: { lat: -18, lng: -49 } })),
    cancelar: jest.fn(async (_u: string, _p: string, id: string) => {
      corridas[id].status = 'CANCELLED_BY_PASSENGER';
    }),
  };
  const pracas = { listar: jest.fn(async () => opcoes.pracas ?? []) };
  return { s: new ComercioService(prisma, rides as never, pracas as never), prisma, rides, comercios, pedidos, corridas, auditoria, usuarios, pracas };
}

async function aprovado(ctx: ReturnType<typeof montar>, userId = 'u1', dados: Record<string, unknown> = cadastro) {
  const c = await ctx.s.cadastrar(userId, { ...dados, email: ctx.usuarios[userId].email });
  await ctx.s.adminDecidir('dono', c.id, 'APROVAR');
  return c;
}

describe('Comercio: cadastro e autenticacao (testes 1 e 3)', () => {
  it('cadastra como AGUARDANDO, com senha criptografada e sem CNPJ/telefone na auditoria', async () => {
    const ctx = montar();
    const c = await ctx.s.cadastrar('u1', { ...cadastro, senha: 'Padaria2026' });
    expect(c.situacao).toBe('AGUARDANDO');
    expect(c.situacaoRotulo).toBe('Aguardando aprovação');
    expect(ctx.usuarios.u1.passwordHash).toEqual(expect.any(String));
    expect(ctx.usuarios.u1.passwordHash).not.toContain('Padaria2026');
    const log = JSON.stringify(ctx.auditoria[0]);
    expect(ctx.auditoria[0].action).toBe('COMERCIO_CADASTROU');
    expect(log).not.toContain('11222333000181');
    expect(log).not.toContain('99999');
    // CPF sempre mascarado para o app e a Central
    const comCpf = await montar().s.cadastrar('u1', { ...cadastro, responsavelCpf: '52998224725' });
    expect(comCpf.responsavelCpf).toBe('***.982.***-**');
  });

  it('motorista, e-mail nao confirmado ou e-mail diferente do login: recusado', async () => {
    const ctx = montar();
    await expect(ctx.s.cadastrar('motorista', cadastro)).rejects.toThrow('não pode cadastrar');
    await expect(ctx.s.cadastrar('semEmail', { ...cadastro, email: 'a@b.com' })).rejects.toThrow('Confirme seu e-mail');
    await expect(ctx.s.cadastrar('u1', { ...cadastro, email: 'outro@x.com' })).rejects.toThrow('mesmo e-mail');
  });

  it('CNPJ repetido e segundo estabelecimento na mesma conta: recusados', async () => {
    const ctx = montar();
    await ctx.s.cadastrar('u1', cadastro);
    await expect(ctx.s.cadastrar('u1', cadastro)).rejects.toThrow('já tem um estabelecimento');
    await expect(ctx.s.cadastrar('u2', { ...cadastro, email: 'joao@loja.com.br' })).rejects.toThrow('com este CNPJ');
  });

  it('conta que ja tem senha nao troca por aqui', async () => {
    const ctx = montar();
    ctx.usuarios.u1.passwordHash = 'x';
    await expect(ctx.s.cadastrar('u1', { ...cadastro, senha: 'Padaria2026' })).rejects.toThrow('já tem senha');
  });

  it('quem nao cadastrou nada nao enxerga nem pede nada', async () => {
    const ctx = montar();
    expect(await ctx.s.meu('u2')).toEqual({ cadastrado: false, comercio: null });
    await expect(ctx.s.historico('u2')).rejects.toThrow('ainda não cadastrou');
    await expect(ctx.s.pedir('u2', pedido())).rejects.toThrow('ainda não cadastrou');
  });

  it('as rotas do aplicativo sao so do papel de passageiro; as da Central so do ADMIN, e so o dono grava', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ComercioController)).toEqual([UserRole.PASSENGER]);
    expect(Reflect.getMetadata(ROLES_KEY, AdminComercioController)).toEqual([UserRole.ADMIN]);
    expect(Reflect.getMetadata('__guards__', AdminComercioController)).toContain(DonoGravaGuard);
  });
});

describe('Comercio: so aprovado pede (teste 20/21)', () => {
  it.each(['AGUARDANDO', 'SUSPENSO', 'REJEITADO'])('cadastro %s: nao consulta preco nem pede', async (situacao) => {
    const ctx = montar();
    const c = await ctx.s.cadastrar('u1', cadastro);
    ctx.comercios[0].status = situacao;
    await expect(ctx.s.cotar('u1', pedido() as never)).rejects.toThrow();
    await expect(ctx.s.pedir('u1', pedido())).rejects.toThrow();
    expect(ctx.rides.estimar).not.toHaveBeenCalled();
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
    expect(c.id).toBeDefined();
  });
});

describe('Comercio: preco e pedido (testes 5, 8, 9, 10 e 11)', () => {
  it('coleta preenchida com o endereco do estabelecimento e preco do mecanismo oficial (categoria ENTREGA)', async () => {
    const ctx = montar();
    await aprovado(ctx);
    const r = await ctx.s.cotar('u1', pedido() as never);
    expect(r.coleta).toEqual({ endereco: 'Rua das Flores, 120, Centro, Goiatuba/GO, CEP 75600-000', alternativa: false });
    const [entrada, quem] = ctx.rides.estimar.mock.calls[0] as unknown as [any, string];
    expect(quem).toBe('u1');
    expect(entrada.category).toBe('ENTREGA');
    expect(entrada.pickup).toMatchObject({ latitude: -18.01, longitude: -49.36 });
    // so oferece o que o servidor devolveu (o que a Central liga); nada e inventado
    expect(r.opcoes).toEqual([{ veiculo: 'MOTO', nome: 'Moto', valorCents: 700 }]);
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
  });

  it('entrega desligada na cidade: o erro do servidor chega ao app e nada e criado', async () => {
    const ctx = montar();
    await aprovado(ctx);
    ctx.rides.estimar.mockRejectedValueOnce(new Error('Entrega ainda não está disponível nesta cidade.'));
    await expect(ctx.s.cotar('u1', pedido() as never)).rejects.toThrow('não está disponível nesta cidade');
    ctx.rides.pedir.mockRejectedValueOnce(new Error('Entrega ainda não está disponível nesta cidade.'));
    await expect(ctx.s.pedir('u1', pedido())).rejects.toThrow('não está disponível nesta cidade');
    expect(ctx.pedidos).toHaveLength(0);
  });

  it('endereco de coleta sem localizacao: pede para confirmar antes (nao manda motorista ao lugar errado)', async () => {
    const ctx = montar();
    const { latitude: _a, longitude: _b, ...semLocal } = cadastro;
    await aprovado(ctx, 'u1', semLocal);
    await expect(ctx.s.pedir('u1', pedido())).rejects.toThrow('ainda não tem localização');
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
  });

  it('pedido entra no despacho oficial: entrega com destinatario, moto escolhida, pagamento ao motorista, varias abertas', async () => {
    const ctx = montar();
    await aprovado(ctx);
    const r = await ctx.s.pedir('u1', pedido());
    const [uid, entrada, op] = ctx.rides.pedir.mock.calls[0] as unknown as [string, any, any];
    expect(uid).toBe('u1');
    expect(entrada.pickup.address).toContain('Rua das Flores, 120');
    expect(entrada.dropoff).toMatchObject({ latitude: -18.02, longitude: -49.35 });
    expect(entrada.paymentMethodType).toBe('CASH');
    expect(entrada.entrega).toMatchObject({ destinatarioNome: 'Ana Lima', destinatarioTelefone: '5564988887777', veiculo: 'MOTO' });
    expect(entrada.entrega.descricao).toContain('COMÉRCIO Padaria Estrela');
    expect(entrada.entrega.descricao).toContain('Obs: Frágil');
    expect(op.varias).toBe(true);
    expect(r.origem).toBe('COMERCIO');
    expect(r.repetido).toBe(false);
    expect(r.situacao).toBe('Aguardando motorista');
    expect(r.codigoDeEntrega).toBe('4821');
    expect(ctx.auditoria.map((a) => a.action)).toContain('COMERCIO_PEDIU_ENTREGA');
  });

  it('coleta alternativa substitui o endereco do estabelecimento', async () => {
    const ctx = montar();
    await aprovado(ctx);
    await ctx.s.pedir('u1', { ...pedido(), coletaAlternativa: { address: 'Av. Goiás, 900', latitude: -18.5, longitude: -49.1 } } as never);
    expect((ctx.rides.pedir.mock.calls[0] as unknown as [string, any])[1].pickup).toMatchObject({ address: 'Av. Goiás, 900', latitude: -18.5 });
    expect(ctx.pedidos[0].coletaAlternativa).toBe(true);
  });
});

describe('Comercio: duplicidade e falha de rede (testes 22 e 23)', () => {
  it('o mesmo toque repetido devolve a mesma entrega e nao cria outra', async () => {
    const ctx = montar();
    await aprovado(ctx);
    const a = await ctx.s.pedir('u1', pedido());
    const b = await ctx.s.pedir('u1', pedido());
    expect(ctx.rides.pedir).toHaveBeenCalledTimes(1);
    expect(b.repetido).toBe(true);
    expect(b.id).toBe(a.id);
  });

  it('dois toques ao mesmo tempo: so um cria', async () => {
    const ctx = montar({ pedirDemora: 30 });
    await aprovado(ctx);
    const [x, y] = await Promise.allSettled([ctx.s.pedir('u1', pedido()), ctx.s.pedir('u1', pedido())]);
    expect(ctx.rides.pedir).toHaveBeenCalledTimes(1);
    expect([x.status, y.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(ctx.pedidos).toHaveLength(1);
  });

  it('o banco recusa a chave repetida (outra instancia): devolve a entrega que ja existe', async () => {
    const ctx = montar();
    await aprovado(ctx);
    const primeira = await ctx.s.pedir('u1', pedido());
    // simula corrida entre instancias: a consulta previa nao viu, o insert bateu na chave unica
    const original = ctx.prisma.comercioPedido.findUnique;
    let chamadas = 0;
    ctx.prisma.comercioPedido.findUnique = async (a: any) => (++chamadas === 1 ? null : original(a));
    const r = await ctx.s.pedir('u1', pedido());
    expect(r.id).toBe(primeira.id);
    expect(r.repetido).toBe(true);
  });

  it('falha de rede/servidor ao pedir: nada e gravado como entrega e a nova tentativa com a mesma chave funciona', async () => {
    const ctx = montar();
    await aprovado(ctx);
    ctx.rides.pedir.mockRejectedValueOnce(new Error('timeout'));
    await expect(ctx.s.pedir('u1', pedido())).rejects.toThrow('timeout');
    expect(ctx.pedidos).toHaveLength(0);
    expect(ctx.auditoria.map((a) => a.action)).not.toContain('COMERCIO_PEDIU_ENTREGA');
    const r = await ctx.s.pedir('u1', pedido());
    expect(r.repetido).toBe(false);
    expect(ctx.pedidos).toHaveLength(1);
  });

  it('o acompanhamento mostra o estado real; sem localizacao do motorista a tela segue so com o estado', async () => {
    const ctx = montar();
    await aprovado(ctx);
    const e = await ctx.s.pedir('u1', pedido());
    ctx.rides.acompanharDoPassageiro.mockRejectedValueOnce(new Error('sem posicao'));
    const d = await ctx.s.detalhe('u1', e.id);
    expect(d.aoVivo).toBeNull();
    expect(d.etapa).toBe('AGUARDANDO_MOTORISTA');
    // o servidor andou: motorista coletou e depois entregou
    ctx.corridas[e.id].status = 'IN_PROGRESS';
    ctx.corridas[e.id].entrega.coletadaEm = new Date();
    expect((await ctx.s.detalhe('u1', e.id)).situacao).toBe('Em deslocamento para entrega');
    ctx.corridas[e.id].status = 'COMPLETED';
    ctx.corridas[e.id].finalFareCents = 750;
    const fim = await ctx.s.detalhe('u1', e.id);
    expect(fim.situacao).toBe('Entregue');
    expect(fim.final).toBe(true);
    expect(fim.valorCobradoCents).toBe(750);
    expect(fim.codigoDeEntrega).toBeNull(); // depois de entregue o codigo some
    expect(fim.aoVivo).toBeNull();
  });
});

describe('Comercio: isolamento entre estabelecimentos (teste 4)', () => {
  async function doisComercios() {
    const ctx = montar();
    await aprovado(ctx, 'u1');
    await aprovado(ctx, 'u2', { ...cadastro, cnpj: '45723174000110', nomeFantasia: 'Loja do Joao', email: 'joao@loja.com.br' });
    const a = await ctx.s.pedir('u1', pedido('chave-da-padaria-001'));
    const b = await ctx.s.pedir('u2', pedido('chave-da-loja-00001'));
    return { ctx, a, b };
  }

  it('cada um ve so as proprias entregas no historico e nos gastos', async () => {
    const { ctx, a, b } = await doisComercios();
    expect((await ctx.s.historico('u1')).itens.map((i) => i.id)).toEqual([a.id]);
    expect((await ctx.s.historico('u2')).itens.map((i) => i.id)).toEqual([b.id]);
    ctx.corridas[a.id].status = 'COMPLETED';
    ctx.corridas[b.id].status = 'COMPLETED';
    ctx.corridas[b.id].finalFareCents = 1234;
    expect((await ctx.s.gastos('u1')).totalCents).toBe(700);
    expect((await ctx.s.gastos('u2')).totalCents).toBe(1234);
  });

  it('entrega de outro estabelecimento responde "nao encontrada" em detalhe, repetir e cancelar', async () => {
    const { ctx, a } = await doisComercios();
    await expect(ctx.s.detalhe('u2', a.id)).rejects.toThrow('Entrega não encontrada');
    await expect(ctx.s.repetir('u2', a.id)).rejects.toThrow('Entrega não encontrada');
    await expect(ctx.s.cancelar('u2', a.id)).rejects.toThrow('Entrega não encontrada');
    expect(ctx.rides.cancelar).not.toHaveBeenCalled();
  });

  it('a mesma chave de pedido em estabelecimentos diferentes nao se mistura', async () => {
    const ctx = montar();
    await aprovado(ctx, 'u1');
    await aprovado(ctx, 'u2', { ...cadastro, cnpj: '45723174000110', email: 'joao@loja.com.br' });
    const a = await ctx.s.pedir('u1', pedido('mesma-chave-000000001'));
    const b = await ctx.s.pedir('u2', pedido('mesma-chave-000000001'));
    expect(a.id).not.toBe(b.id);
    expect(b.repetido).toBe(false);
  });
});

describe('Comercio: historico, repetir, cancelar e gastos (testes 17, 18 e 19)', () => {
  it('historico com data, codigo, destinatario, endereco, veiculo, situacao e valor', async () => {
    const ctx = montar();
    await aprovado(ctx);
    await ctx.s.pedir('u1', pedido());
    const h = await ctx.s.historico('u1');
    expect(h.total).toBe(1);
    expect(h.itens[0]).toMatchObject({
      origem: 'COMERCIO',
      destinatario: { nome: 'Ana Lima' },
      enderecoDeEntrega: expect.stringContaining('Rua Verde, 55'),
      veiculo: 'MOTO',
      situacao: 'Aguardando motorista',
    });
    expect(h.itens[0]!.criadaEm).toEqual(expect.any(String));
  });

  it('repetir so devolve os dados para preencher: nao cria entrega nem consulta preco', async () => {
    const ctx = montar();
    await aprovado(ctx);
    const e = await ctx.s.pedir('u1', pedido());
    ctx.rides.pedir.mockClear();
    const r = await ctx.s.repetir('u1', e.id);
    expect(r.criaEntrega).toBe(false);
    expect(r.destinatario).toEqual({ nome: 'Ana Lima', telefone: '5564988887777' });
    expect(r.destino).toMatchObject({ numero: '55', cep: '75600111', latitude: -18.02 });
    expect(r.encomenda.descricao).toBe('2 caixas de bolo');
    expect(ctx.rides.pedir).not.toHaveBeenCalled();
    expect(ctx.rides.estimar).not.toHaveBeenCalled();
    expect(ctx.pedidos).toHaveLength(1);
  });

  it('cancelar a propria entrega usa a regra da corrida e fica auditado', async () => {
    const ctx = montar();
    await aprovado(ctx);
    const e = await ctx.s.pedir('u1', pedido());
    const c = await ctx.s.cancelar('u1', e.id, 'Cliente desistiu');
    expect(c.situacao).toBe('Cancelada');
    expect(ctx.auditoria.map((a) => a.action)).toContain('COMERCIO_CANCELOU_ENTREGA');
  });

  it('gastos: so concluida soma, cancelada conta a parte e cada cobranca aparece', async () => {
    const ctx = montar();
    await aprovado(ctx);
    const a = await ctx.s.pedir('u1', pedido('chave-gasto-0000001'));
    const b = await ctx.s.pedir('u1', pedido('chave-gasto-0000002'));
    const c = await ctx.s.pedir('u1', pedido('chave-gasto-0000003'));
    ctx.corridas[a.id].status = 'COMPLETED';
    ctx.corridas[a.id].finalFareCents = 800;
    ctx.corridas[a.id].finishedAt = new Date();
    ctx.corridas[b.id].status = 'CANCELLED_BY_PASSENGER';
    void c;
    const g = await ctx.s.gastos('u1');
    expect(g).toMatchObject({ realizadas: 1, canceladas: 1, emAndamento: 1, totalCents: 800 });
    expect(g.cobrancas).toHaveLength(1);
    expect(g.cobrancas[0]).toMatchObject({ valorCents: 800, destinatario: 'Ana Lima' });
  });
});

describe('Comercio: Central (testes 20 e 21)', () => {
  it('lista, consulta e decide com auditoria (antes e depois); recusa transicao errada', async () => {
    const ctx = montar();
    const c = await ctx.s.cadastrar('u1', cadastro);
    expect((await ctx.s.adminListar(null, {})).itens).toHaveLength(1);
    const d = await ctx.s.adminDetalhe(null, c.id);
    expect(d.nomeFantasia).toBe('Padaria Estrela');
    await expect(ctx.s.adminDecidir('dono', c.id, 'SUSPENDER', 'sem motivo ainda')).rejects.toThrow('Não dá para suspender');
    await expect(ctx.s.adminDecidir('dono', c.id, 'REJEITAR')).rejects.toThrow('motivo');
    const ok = await ctx.s.adminDecidir('dono', c.id, 'APROVAR');
    expect(ok.situacao).toBe('APROVADO');
    const log = ctx.auditoria.find((a) => a.action === 'COMERCIO_APROVAR');
    expect(log).toMatchObject({ actorId: 'dono', actorRole: 'ADMIN', before: { situacao: 'AGUARDANDO' }, after: { situacao: 'APROVADO' } });
    const susp = await ctx.s.adminDecidir('dono', c.id, 'SUSPENDER', 'Reclamações de motoristas');
    expect(susp.situacao).toBe('SUSPENSO');
    await expect(ctx.s.pedir('u1', pedido())).rejects.toThrow('suspenso');
  });

  it('o operador de cidade nao ve estabelecimento sem localizacao nem de outra cidade; o dono ve tudo', async () => {
    const ctx = montar({ pracas: [{ id: 'goiatuba', nome: 'Goiatuba', latitude: -18.01, longitude: -49.36, raioKm: 20 }] });
    const c = await ctx.s.cadastrar('u1', cadastro);
    const { latitude: _a, longitude: _b, ...semLocal } = cadastro;
    const d = await ctx.s.cadastrar('u2', { ...semLocal, cnpj: '45723174000110', email: 'joao@loja.com.br' });
    void d;
    expect((await ctx.s.adminListar('goiatuba', {})).itens.map((i) => i.id)).toEqual([c.id]);
    expect((await ctx.s.adminListar('outra', {})).itens).toHaveLength(0);
    expect((await ctx.s.adminListar(null, {})).itens).toHaveLength(2);
    await expect(ctx.s.adminDetalhe('outra', c.id)).rejects.toThrow('não encontrado');
  });

  it('entregas do Comercio na Central trazem a origem e a cidade', async () => {
    const ctx = montar({ pracas: [{ id: 'goiatuba', nome: 'Goiatuba', latitude: -18.01, longitude: -49.36, raioKm: 20 }] });
    ctx.pracas.listar.mockResolvedValue([{ id: 'goiatuba', nome: 'Goiatuba', latitude: -18.01, longitude: -49.36, raioKm: 20 }] as never);
    await aprovado(ctx);
    await ctx.s.pedir('u1', pedido());
    for (const r of Object.values(ctx.corridas)) Object.assign(r, { pickupLat: -18.01, pickupLng: -49.36 });
    const l = await ctx.s.adminPedidos(null, {});
    expect(l.itens[0]).toMatchObject({ origem: 'COMERCIO', comercio: 'Padaria Estrela', praca: 'goiatuba' });
    expect((await ctx.s.adminPedidos('outra', {})).itens).toHaveLength(0);
  });
});
