import { LimpezaService } from './limpeza.service';

/**
 * Limpeza de dados (so o dono): o que o teste de limpeza protege.
 * Banco de mentira; nada aqui toca em dado real.
 */
type Chamada = { tabela: string; metodo: string; args: unknown };

function montar(opcoes: {
  contas?: Array<{ id: string; name: string; role: string; _count: { ridesAsPassenger: number }; driver?: { _count: { rides: number } } | null }>;
  backupFalha?: boolean;
  schemasDeBackup?: string[];
} = {}) {
  const chamadas: Chamada[] = [];
  const anota = (tabela: string, metodo: string) =>
    jest.fn(async (args?: unknown) => {
      chamadas.push({ tabela, metodo, args });
      return { count: 1 };
    });
  const tabelaFalsa = (nome: string, extra: Record<string, unknown> = {}) => ({
    deleteMany: anota(nome, 'deleteMany'),
    updateMany: anota(nome, 'updateMany'),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    ...extra,
  });
  const tx = {
    driver: tabelaFalsa('driver', { findMany: jest.fn(async () => [{ id: 'd1' }]) }),
    ride: tabelaFalsa('ride', { findMany: jest.fn(async () => [{ id: 'r1' }]) }),
    rating: tabelaFalsa('rating'),
    payment: tabelaFalsa('payment'),
    walletTransaction: tabelaFalsa('walletTransaction'),
    payout: tabelaFalsa('payout'),
    safetyEvent: tabelaFalsa('safetyEvent'),
    driverOnlineSession: tabelaFalsa('driverOnlineSession'),
    notification: tabelaFalsa('notification'),
    wallet: tabelaFalsa('wallet'),
    coupon: tabelaFalsa('coupon'),
    user: tabelaFalsa('user'),
    $executeRaw: jest.fn(async () => 0),
  };
  const sqls: string[] = [];
  const prisma = {
    user: {
      findMany: jest.fn(async (a: { where?: { id?: { in: string[] } } }) =>
        a?.where?.id ? (opcoes.contas ?? []) : (opcoes.contas ?? []).map((c) => ({ id: c.id })),
      ),
      count: jest.fn(async () => 0),
    },
    ride: { count: jest.fn(async () => 0) },
    walletTransaction: { count: jest.fn(async () => 0) },
    payout: { count: jest.fn(async () => 0) },
    safetyEvent: { count: jest.fn(async () => 0) },
    rating: { count: jest.fn(async () => 0) },
    coupon: { count: jest.fn(async () => 0) },
    comercio: { findMany: jest.fn(async () => []) },
    comercioPedido: { count: jest.fn(async () => 0), deleteMany: jest.fn() },
    auditLog: { create: jest.fn(async () => ({})) },
    $executeRaw: jest.fn(async () => 0),
    $executeRawUnsafe: jest.fn(async (sql: string) => {
      if (opcoes.backupFalha && sql.startsWith('CREATE SCHEMA')) throw new Error('sem espaco');
      sqls.push(sql);
      return 0;
    }),
    $queryRaw: jest.fn(async (...a: unknown[]) => {
      const texto = String((a[0] as TemplateStringsArray)?.join?.('?') ?? a[0]);
      if (texto.includes('pg_namespace WHERE nspname')) return (opcoes.schemasDeBackup ?? []).map((nome) => ({ nome }));
      return [{ nome: 'users' }, { nome: 'rides' }];
    }),
    $queryRawUnsafe: jest.fn(async () => [{ linhas: [] }]),
    withTransaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const pracas = { esquecerMotoristas: jest.fn() };
  const servico = new LimpezaService(prisma as never, pracas as never);
  return { servico, prisma, tx, pracas, chamadas, sqls };
}

const conta = (id: string, role = 'PASSENGER', corridas = 0, comoMotorista = 0) => ({
  id,
  name: `Conta ${id}`,
  role,
  _count: { ridesAsPassenger: corridas },
  driver: comoMotorista ? { _count: { rides: comoMotorista } } : null,
});

describe('Limpeza de dados', () => {
  it('apagar contas: nao apaga a propria conta do dono', async () => {
    const { servico, prisma } = montar();
    await expect(servico.apagarContas(['admin1', 'u2'], 'admin1')).rejects.toThrow('propria conta');
    expect(prisma.withTransaction).not.toHaveBeenCalled();
  });

  it('apagar contas: recusa conta da Central e conta com corrida; apaga so as livres', async () => {
    const { servico, tx, pracas } = montar({
      contas: [conta('a', 'ADMIN'), conta('b', 'PASSENGER', 2), conta('c', 'DRIVER', 0, 3), conta('d')],
    });
    const r = await servico.apagarContas(['a', 'b', 'c', 'd'], 'dono');
    expect(r.recusadas.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
    expect(r.contas).toBe(1);
    expect(tx.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['d'] } } });
    // Sem apagar corridas (so a limpeza do teste faz isso).
    expect(tx.ride.deleteMany).not.toHaveBeenCalled();
    expect(pracas.esquecerMotoristas).toHaveBeenCalled();
  });

  it('apagar contas: grava na auditoria quem apagou e quantas foram recusadas', async () => {
    const { servico, prisma } = montar({ contas: [conta('b', 'PASSENGER', 1)] });
    await servico.apagarContas(['b'], 'dono');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: 'dono', action: 'APAGAR_CONTAS', entity: 'limpeza' }),
    });
  });

  it('zerar: se a copia de seguranca falhar, NADA e apagado', async () => {
    const { servico, prisma, tx } = montar({ backupFalha: true });
    await expect(servico.zerarOperacao('dono')).rejects.toThrow('Nada foi apagado');
    expect(prisma.withTransaction).not.toHaveBeenCalled();
    expect(tx.ride.deleteMany).not.toHaveBeenCalled();
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
  });

  it('zerar: apaga corridas e movimentos, zera carteiras, MANTEM contas, carros e tarifas', async () => {
    const { servico, tx, prisma } = montar();
    const r = await servico.zerarOperacao('dono');
    expect(r.copia).toMatch(/^backup_\d{8}_\d{4}$/);
    expect(tx.ride.deleteMany).toHaveBeenCalledWith({});
    expect(tx.wallet.updateMany).toHaveBeenCalledWith({
      data: { balanceCents: 0, blockedCents: 0, totalEarnedCents: 0, totalWithdrawnCents: 0 },
    });
    // A operacao nao apaga contas aqui (so as de teste, antes), nem motoristas.
    expect(tx.driver.deleteMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ZERAR_OPERACAO' }),
    });
  });

  it('copia de seguranca: guarda so as 3 mais novas e so apaga schemas com nome de copia', async () => {
    const { servico, sqls } = montar({
      schemasDeBackup: ['backup_20261113_0100', 'backup_20261112_0100', 'backup_20261111_0100', 'backup_20261110_0100', 'backup_x'],
    });
    await servico.copiaDeSeguranca();
    const apagados = sqls.filter((s) => s.startsWith('DROP SCHEMA'));
    expect(apagados).toEqual(['DROP SCHEMA "backup_20261110_0100" CASCADE']);
    expect(sqls.some((s) => s.includes('REVOKE ALL ON SCHEMA'))).toBe(true);
  });

  it('dados de teste: a busca nunca inclui a conta da Central (ADMIN)', async () => {
    const { servico, prisma } = montar();
    await servico.apagarDadosDeTeste('dono');
    const onde = (prisma.user.findMany.mock.calls[0] as unknown as [{ where: { role: { not: string } } }])[0].where;
    expect(onde.role).toEqual({ not: 'ADMIN' });
  });

  it('dados de teste: apaga tambem as corridas das contas de teste e audita', async () => {
    const { servico, tx, prisma } = montar({ contas: [conta('t1')] });
    const r = await servico.apagarDadosDeTeste('dono');
    expect(r.corridas).toBe(1);
    expect(tx.ride.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['r1'] } } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'LIMPEZA_TESTE' }) });
  });

  it('exportar: nao leva codigos de entrada nem sessoes', async () => {
    const { servico, prisma } = montar();
    await servico.exportar();
    const consulta = String((prisma.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?'));
    for (const t of ['otp_codes', 'refresh_tokens', 'spatial_ref_sys']) expect(consulta).toContain(t);
    expect(consulta).toContain('NOT IN');
  });

  it('auditoria que falha nao derruba a limpeza', async () => {
    const { servico, prisma } = montar({ contas: [conta('d')] });
    (prisma.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error('falhou'));
    await expect(servico.apagarContas(['d'], 'dono')).resolves.toMatchObject({ contas: 1 });
  });
});
