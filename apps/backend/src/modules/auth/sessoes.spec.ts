import { SessoesService, cortesRecentes, tokenValido } from './sessoes.service';

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

describe('Desconectar UM aparelho (Requisicao 1, 11/11/2026)', () => {
  const agora = 1_762_800_000_000;
  const seg = (ms: number) => Math.floor(ms / 1000);

  it('o corte de um aparelho derruba so ele; o outro continua', () => {
    const e = { sessoesDesde: 0, ativa: true, aparelhosCortados: { A: agora } };
    expect(tokenValido(e, seg(agora) - 60, 'A')).toBe(false);
    expect(tokenValido(e, seg(agora) - 60, 'B')).toBe(true);
    expect(tokenValido(e, seg(agora) + 60, 'A')).toBe(true); // entrou de novo depois
  });

  it('vale o corte mais recente entre o da conta e o do aparelho', () => {
    const e = { sessoesDesde: agora + 600_000, ativa: true, aparelhosCortados: { A: agora } };
    expect(tokenValido(e, seg(agora) + 60, 'A')).toBe(false);
    expect(tokenValido(e, seg(agora) + 60, 'B')).toBe(false);
  });

  it('cortes com mais de 2 dias saem da conta; lixo e ignorado', () => {
    expect(cortesRecentes({ A: agora, B: agora - 3 * 24 * 3600 * 1000, C: 'x' }, agora)).toEqual({ A: agora });
    expect(cortesRecentes(null, agora)).toEqual({});
  });

  function montar(outrosAbertos: number) {
    let meta: Record<string, unknown> = { outro: 1 };
    const tx = {
      user: {
        findUnique: jest.fn(async () => ({ status: 'ACTIVE', metadata: meta })),
        update: jest.fn(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          meta = data.metadata;
        }),
      },
      device: {
        findFirst: jest.fn(async ({ where }: { where: { id: string; userId: string } }) =>
          where.id === 'A' && where.userId === 'u1' ? { id: 'A' } : null,
        ),
        update: jest.fn(async () => ({})),
      },
      refreshToken: { updateMany: jest.fn(async () => ({ count: 2 })), count: jest.fn(async () => outrosAbertos) },
      driver: { updateMany: jest.fn(async () => ({ count: 1 })) },
    };
    const prisma = { ...tx, withTransaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    return { s: new SessoesService(prisma as never), tx, meta: () => meta };
  }

  it('cortarAparelho: revoga so as sessoes dele, apaga o aviso dele e o acesso antigo dele cai na hora', async () => {
    const { s, tx, meta } = montar(1);
    const antes = Math.floor(Date.now() / 1000) - 5;
    expect(await s.acessoValido('u1', antes, 'A')).toBe(true);
    expect(await s.cortarAparelho('u1', 'A')).toEqual({ sessoesEncerradas: 2, motoristaSaiuDoAr: false });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', deviceId: 'A', revokedAt: null } }),
    );
    expect(tx.device.update).toHaveBeenCalledWith({ where: { id: 'A' }, data: { fcmToken: null } });
    expect(tx.driver.updateMany).not.toHaveBeenCalled(); // ainda tem outro aparelho aberto
    expect(meta().outro).toBe(1);
    expect(await s.acessoValido('u1', antes, 'A')).toBe(false);
    expect(await s.acessoValido('u1', antes, 'B')).toBe(true);
  });

  it('cortarAparelho: sem outro aparelho aberto, o motorista sai do ar', async () => {
    const { s, tx } = montar(0);
    expect(await s.cortarAparelho('u1', 'A')).toEqual({ sessoesEncerradas: 2, motoristaSaiuDoAr: true });
    expect(tx.driver.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', isOnline: true }, data: { isOnline: false } });
  });

  it('cortarAparelho: aparelho de outra conta nao e cortado', async () => {
    const { s, tx } = montar(0);
    expect(await s.cortarAparelho('u2', 'A')).toBeNull();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
