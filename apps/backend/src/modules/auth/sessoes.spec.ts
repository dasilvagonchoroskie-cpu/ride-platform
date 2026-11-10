import { SessoesService, tokenValido } from './sessoes.service';

describe('Corte de sessoes (celular vendido)', () => {
  const agora = 1_762_700_000_000;

  it('sem corte: vale; conta bloqueada: nao vale', () => {
    expect(tokenValido({ sessoesDesde: 0, ativa: true }, 1)).toBe(true);
    expect(tokenValido({ sessoesDesde: 0, ativa: false }, 1)).toBe(false);
  });

  it('token emitido antes do corte cai; depois do corte vale', () => {
    const e = { sessoesDesde: agora, ativa: true };
    expect(tokenValido(e, Math.floor(agora / 1000) - 60)).toBe(false);
    expect(tokenValido(e, Math.floor(agora / 1000) + 60)).toBe(true);
    expect(tokenValido(e, undefined)).toBe(false);
  });

  it('cortar: grava o corte, revoga tudo, tira o motorista do ar e o acesso antigo cai na hora', async () => {
    let meta: Record<string, unknown> = { outro: 1 };
    const tx = {
      user: {
        findUnique: jest.fn(async () => ({ status: 'ACTIVE', metadata: meta })),
        update: jest.fn(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          meta = data.metadata;
        }),
      },
      refreshToken: { updateMany: jest.fn(async () => ({ count: 3 })) },
      device: { updateMany: jest.fn(async () => ({ count: 2 })) },
      driver: { updateMany: jest.fn(async () => ({ count: 1 })) },
    };
    const prisma = { ...tx, withTransaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    const s = new SessoesService(prisma as never);
    const antes = Math.floor(Date.now() / 1000) - 5;
    expect(await s.acessoValido('u1', antes)).toBe(true); // fica no cache
    expect(await s.cortar('u1')).toEqual({ sessoesEncerradas: 3, aparelhos: 2 });
    expect(meta.outro).toBe(1);
    expect(typeof meta.sessoesDesde).toBe('number');
    expect(tx.driver.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { isOnline: false } });
    expect(await s.acessoValido('u1', antes)).toBe(false); // cache limpo no corte
    expect(await s.acessoValido('u1', Math.floor(Date.now() / 1000) + 120)).toBe(true);
  });
});
