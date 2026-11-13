import { REQUIRED_DRIVER_DOCUMENTS } from '@ride/shared';
import { DriversService } from './drivers.service';

jest.mock('../painel-motorista/jornada', () => ({
  abrirJornada: jest.fn(async () => undefined),
  fecharJornada: jest.fn(async () => undefined),
}));

/**
 * Motorista: ficar online, andamento dos documentos e aprovacao pela Central.
 * Testa o comportamento que ja existe (nenhuma regra de carteira/tarifa muda).
 * Banco de mentira.
 */
const FUTURO = new Date(Date.now() + 365 * 86_400_000);
const PASSADO = new Date(Date.now() - 86_400_000);

type Doc = { type: string; status: string; uploadedAt: Date | null };
const todosAprovados = (): Doc[] => REQUIRED_DRIVER_DOCUMENTS.map((type) => ({ type, status: 'APPROVED', uploadedAt: new Date() }));

function montar(
  opcoes: {
    driver?: Record<string, unknown> | null;
    docs?: Doc[];
    veiculosAtivos?: number;
    saldo?: number | null;
    settings?: Array<{ key: string; value: unknown }>;
    presencial?: boolean;
  } = {},
) {
  const driver =
    opcoes.driver === undefined
      ? { id: 'd1', userId: 'u1', status: 'APPROVED', isOnline: false, cnhExpiresAt: FUTURO }
      : opcoes.driver;
  const repo = {
    findByUserId: jest.fn(async () => driver),
    findById: jest.fn(async () => driver),
    update: jest.fn(async (id: string, data: Record<string, unknown>) => ({ id, status: 'APPROVED', isOnline: false, ...data })),
  };
  const prisma = {
    driverDocument: { findMany: jest.fn(async () => opcoes.docs ?? todosAprovados()) },
    vehicle: { count: jest.fn(async () => opcoes.veiculosAtivos ?? 1) },
    wallet: { findUnique: jest.fn(async () => (opcoes.saldo === null ? null : { balanceCents: opcoes.saldo ?? 5000 })) },
    setting: { findMany: jest.fn(async () => opcoes.settings ?? []) },
    auditLog: {
      findFirst: jest.fn(async () => (opcoes.presencial ? { id: 'a1' } : null)),
      create: jest.fn(async () => ({})),
    },
    driver: { findUnique: jest.fn(async () => ({ id: 'd1', user: {}, vehicles: [], wallet: null })) },
    user: { findUnique: jest.fn(async () => ({ metadata: {} })) },
    $executeRaw: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => []),
  };
  const caixa = { avisar: jest.fn(async () => undefined) };
  const pracas = { doPonto: jest.fn(async () => null), buscar: jest.fn(async () => null), definirPracaDoMotorista: jest.fn() };
  const servico = new DriversService(repo as never, prisma as never, {} as never, {} as never, pracas as never, caixa as never);
  // withProgress/ondeAbrirOMapa leem coisas que nao interessam aqui.
  jest.spyOn(servico as never, 'ondeAbrirOMapa' as never).mockResolvedValue({} as never);
  return { servico, repo, prisma, caixa };
}

describe('Andamento dos documentos', () => {
  it('todos aprovados = completo', async () => {
    const { servico } = montar();
    const p = await servico.getDocumentProgress('d1');
    expect(p.isComplete).toBe(true);
    expect(p.missing).toEqual([]);
    expect(p.total).toBe(REQUIRED_DRIVER_DOCUMENTS.length);
  });

  it('sem nenhum documento: tudo falta e nao esta completo', async () => {
    const { servico } = montar({ docs: [] });
    const p = await servico.getDocumentProgress('d1');
    expect(p.isComplete).toBe(false);
    expect(p.missing).toHaveLength(REQUIRED_DRIVER_DOCUMENTS.length);
  });

  it('pendente ou recusado impede o completo', async () => {
    const docs = todosAprovados();
    docs[0] = { ...docs[0], status: 'PENDING' };
    docs[1] = { ...docs[1], status: 'REJECTED' };
    const p = await montar({ docs }).servico.getDocumentProgress('d1');
    expect(p.isComplete).toBe(false);
    expect(p.pending).toEqual([docs[0].type]);
    expect(p.rejected).toEqual([docs[1].type]);
  });

  it('documento ja aprovado continua valendo enquanto a troca espera a Central ou foi recusada', async () => {
    const docs: Doc[] = [
      { type: REQUIRED_DRIVER_DOCUMENTS[0], status: 'REJECTED', uploadedAt: new Date() }, // troca recusada (a mais nova vem primeiro)
      ...todosAprovados(),
    ];
    const p = await montar({ docs }).servico.getDocumentProgress('d1');
    expect(p.isComplete).toBe(true);
  });
});

describe('Ficar online', () => {
  it('cadastro nao aprovado: recusa com o codigo certo', async () => {
    const { servico } = montar({ driver: { id: 'd1', userId: 'u1', status: 'PENDING', cnhExpiresAt: FUTURO } });
    await expect(servico.setOnline('u1', true)).rejects.toThrow('ainda nao foi aprovada');
  });

  it('documentos pendentes: recusa e diz quais faltam', async () => {
    const { servico } = montar({ docs: [] });
    await expect(servico.setOnline('u1', true)).rejects.toThrow('Documentos pendentes');
  });

  it('aprovado com conferencia presencial pode ficar online mesmo sem as fotos no sistema', async () => {
    const { servico, repo } = montar({ docs: [], presencial: true });
    await servico.setOnline('u1', true);
    expect(repo.update).toHaveBeenCalledWith('d1', { isOnline: true });
  });

  it('sem veiculo ativo: recusa', async () => {
    await expect(montar({ veiculosAtivos: 0 }).servico.setOnline('u1', true)).rejects.toThrow('veiculo ativo');
  });

  it('CNH vencida: recusa', async () => {
    const { servico } = montar({ driver: { id: 'd1', userId: 'u1', status: 'APPROVED', isOnline: false, cnhExpiresAt: PASSADO } });
    await expect(servico.setOnline('u1', true)).rejects.toThrow('CNH esta vencida');
  });

  it('saldo igual ou abaixo do minimo (padrao R$ 0,00): recusa para ficar online', async () => {
    await expect(montar({ saldo: 0 }).servico.setOnline('u1', true)).rejects.toThrow('Saldo insuficiente');
    await expect(montar({ saldo: null }).servico.setOnline('u1', true)).rejects.toThrow('Saldo insuficiente');
    await expect(montar({ saldo: 500, settings: [{ key: 'carteira.minimoCents', value: 1000 }] }).servico.setOnline('u1', true)).rejects.toThrow('R$ 5,00');
  });

  it('tudo certo: fica online, abre a jornada e marca a localizacao como disponivel', async () => {
    const { servico, repo, prisma } = montar();
    const r = await servico.setOnline('u1', true);
    expect(repo.update).toHaveBeenCalledWith('d1', { isOnline: true });
    expect(r.isOnline).toBe(true);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('ficar offline nunca e barrado por documento, CNH ou saldo', async () => {
    const { servico, repo } = montar({ docs: [], saldo: 0, veiculosAtivos: 0, driver: { id: 'd1', userId: 'u1', status: 'SUSPENDED', isOnline: true, cnhExpiresAt: PASSADO } });
    await servico.setOnline('u1', false);
    expect(repo.update).toHaveBeenCalledWith('d1', { isOnline: false });
  });

  it('quem nao tem cadastro de motorista: erro', async () => {
    await expect(montar({ driver: null }).servico.setOnline('u1', true)).rejects.toThrow('Cadastro de motorista');
  });
});

describe('Aprovacao pela Central', () => {
  it('motorista inexistente', async () => {
    await expect(montar({ driver: null }).servico.adminReview('x', 'admin', { status: 'APPROVED' } as never)).rejects.toThrow('Motorista nao encontrado');
  });

  it('aprovar com documentos faltando e sem conferencia presencial: recusa', async () => {
    const { servico, repo } = montar({ docs: [] });
    await expect(servico.adminReview('d1', 'admin', { status: 'APPROVED' } as never)).rejects.toThrow('conferencia presencial');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('aprovar com CNH vencida: recusa mesmo com conferencia presencial', async () => {
    const { servico } = montar({ driver: { id: 'd1', userId: 'u1', status: 'PENDING', cnhExpiresAt: PASSADO } });
    await expect(servico.adminReview('d1', 'admin', { status: 'APPROVED', presentialCheck: true } as never)).rejects.toThrow('CNH vencida');
  });

  it('aprovar: grava quem aprovou e quando, limpa o motivo e avisa o motorista', async () => {
    const { servico, repo, caixa } = montar({ driver: { id: 'd1', userId: 'u1', status: 'PENDING', isOnline: false, cnhExpiresAt: FUTURO } });
    await servico.adminReview('d1', 'admin', { status: 'APPROVED' } as never);
    expect(repo.update).toHaveBeenCalledWith('d1', expect.objectContaining({ status: 'APPROVED', approvedBy: 'admin', rejectionReason: null, approvedAt: expect.any(Date) }));
    expect(caixa.avisar).toHaveBeenCalledWith('u1', 'Cadastro aprovado', expect.any(String), { tipo: 'conta' });
  });

  it('aprovar por conferencia presencial: fica na auditoria com os documentos sem foto', async () => {
    const { servico, prisma } = montar({ docs: [], driver: { id: 'd1', userId: 'u1', status: 'PENDING', isOnline: false, cnhExpiresAt: FUTURO } });
    await servico.adminReview('d1', 'admin', { status: 'APPROVED', presentialCheck: true, reason: 'Vi os originais' } as never);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: 'admin', action: 'DRIVER_APPROVED_PRESENTIAL', entityId: 'd1', after: expect.objectContaining({ conferencia: 'Vi os originais' }) }),
    });
  });

  it('suspender, bloquear ou recusar tira o motorista do ar e guarda o motivo', async () => {
    for (const status of ['SUSPENDED', 'BLOCKED', 'REJECTED']) {
      const { servico, repo, caixa } = montar({ driver: { id: 'd1', userId: 'u1', status: 'APPROVED', isOnline: true, cnhExpiresAt: FUTURO } });
      await servico.adminReview('d1', 'admin', { status, reason: 'Motivo X' } as never);
      expect(repo.update).toHaveBeenCalledWith('d1', expect.objectContaining({ status, isOnline: false, rejectionReason: 'Motivo X', approvedAt: null, approvedBy: null }));
      expect(caixa.avisar).toHaveBeenCalledWith('u1', expect.any(String), 'Motivo X', { tipo: 'conta' });
    }
  });

  it('sem motivo informado, grava um texto padrao e nao avisa de novo se o status nao mudou', async () => {
    const { servico, repo, caixa } = montar({ driver: { id: 'd1', userId: 'u1', status: 'REJECTED', isOnline: false, cnhExpiresAt: FUTURO } });
    await servico.adminReview('d1', 'admin', { status: 'REJECTED' } as never);
    expect(repo.update).toHaveBeenCalledWith('d1', expect.objectContaining({ rejectionReason: 'Sem justificativa informada.' }));
    expect(caixa.avisar).not.toHaveBeenCalled();
  });
});

describe('Dados do motorista aprovado', () => {
  it('depois de aprovado, mudar dados so pela Central', async () => {
    await expect(montar().servico.updateMe('u1', { pixKey: 'x' } as never)).rejects.toThrow('Meus dados');
  });

  it('antes da aprovacao pode corrigir os proprios dados', async () => {
    const { servico, repo } = montar({ driver: { id: 'd1', userId: 'u1', status: 'PENDING', cnhExpiresAt: FUTURO } });
    await servico.updateMe('u1', { pixKey: 'chave', cnhNumber: '123' } as never);
    expect(repo.update).toHaveBeenCalledWith('d1', { cnhNumber: '123', pixKey: 'chave' });
  });
});
