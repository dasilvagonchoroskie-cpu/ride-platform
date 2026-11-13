import { normalizePhone } from '@ride/shared';
import { UsersService } from './users.service';

/**
 * Perfil, enderecos, contatos de emergencia e bloqueio de conta. Banco de mentira.
 */
function montar(opcoes: { usuario?: Record<string, unknown> | null; enderecos?: number; emailEmUso?: boolean; apelidoRepetido?: boolean; dono?: boolean } = {}) {
  const usuario = opcoes.usuario === undefined ? { id: 'u1', role: 'PASSENGER', passwordHash: 'segredo', name: 'Ana', metadata: {} } : opcoes.usuario;
  const tx: Record<string, unknown> = {};
  const prisma = {
    user: {
      findUnique: jest.fn(async () => usuario),
      findFirst: jest.fn(async () => (opcoes.emailEmUso ? { id: 'outro' } : null)),
      update: jest.fn(async () => ({})),
    },
    userAddress: {
      count: jest.fn(async () => opcoes.enderecos ?? 0),
      findFirst: jest.fn(async (a: { where: { label?: string } }) => (a.where.label ? (opcoes.apelidoRepetido ? { id: 'a0' } : null) : opcoes.dono === false ? null : { id: 'a1' })),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'a-novo', ...data })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({})),
      delete: jest.fn(async () => ({})),
    },
    refreshToken: { updateMany: jest.fn(async () => ({})) },
    driver: { updateMany: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  Object.assign(tx, prisma);
  const repo = {
    update: jest.fn(async (_id: string, data: Record<string, unknown>) => ({ id: 'u1', passwordHash: 'segredo', ...data })),
    findById: jest.fn(async () => usuario),
    list: jest.fn(async () => ({ items: [{ id: 'u1', passwordHash: 'segredo', name: 'Ana' }], total: 1 })),
  };
  return { servico: new UsersService(repo as never, prisma as never), prisma, repo };
}

describe('Perfil', () => {
  it('nunca devolve o hash da senha', async () => {
    const { servico } = montar();
    expect(await servico.getProfile('u1')).not.toHaveProperty('passwordHash');
    expect(await servico.updateProfile('u1', { name: 'Ana Maria' } as never)).not.toHaveProperty('passwordHash');
    const lista = (await servico.adminList({ page: 1, limit: 10 })) as { items: Array<Record<string, unknown>> };
    expect(lista.items[0]).not.toHaveProperty('passwordHash');
  });

  it('usuario que nao existe: erro', async () => {
    const { servico } = montar({ usuario: null });
    await expect(servico.getProfile('x')).rejects.toThrow('Usuario nao encontrado');
  });

  it('e-mail ja usado por outra conta: recusa e nao grava', async () => {
    const { servico, repo } = montar({ emailEmUso: true });
    await expect(servico.updateProfile('u1', { email: 'a@x.com' } as never)).rejects.toThrow('E-mail ja utilizado');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('e-mail novo volta a "nao confirmado"; CPF so com digitos; campos vazios nao sobrescrevem', async () => {
    const { servico, repo } = montar();
    await servico.updateProfile('u1', { email: 'novo@x.com', cpf: '123.456.789-09' } as never);
    expect(repo.update).toHaveBeenCalledWith('u1', { email: 'novo@x.com', emailVerifiedAt: null, cpf: '12345678909' });
  });
});

describe('Contatos de emergencia', () => {
  it('guarda no maximo 3, com telefone normalizado, sem perder o resto do metadata', async () => {
    const { servico, prisma } = montar({ usuario: { id: 'u1', metadata: { teste: true } } });
    await servico.gravarContatosEmergencia('u1', [
      { nome: ' Mae ', telefone: '(64) 99999-0001' },
      { nome: 'Pai', telefone: '64999990002' },
      { nome: 'Irma', telefone: '64999990003' },
      { nome: 'Quarto', telefone: '64999990004' },
    ]);
    const gravado = (prisma.user.update.mock.calls[0] as unknown as [{ data: { metadata: { teste: boolean; contatosEmergencia: Array<{ nome: string; telefone: string }> } } }])[0].data.metadata;
    expect(gravado.teste).toBe(true);
    expect(gravado.contatosEmergencia).toHaveLength(3);
    expect(gravado.contatosEmergencia[0].nome).toBe('Mae');
    expect(gravado.contatosEmergencia[0].telefone).toBe(normalizePhone('(64) 99999-0001'));
    expect(gravado.contatosEmergencia[0].telefone).not.toContain('(');
  });

  it('ler: ignora lixo e contato sem telefone; nome padrao "Contato"', async () => {
    const { servico } = montar({ usuario: { metadata: { contatosEmergencia: [null, 'x', { nome: 'Sem fone' }, { telefone: '+5564999990001' }] } } });
    expect(await servico.contatosEmergencia('u1')).toEqual({ items: [{ nome: 'Contato', telefone: '+5564999990001' }] });
  });
});

describe('Enderecos', () => {
  it('o primeiro endereco vira o padrao; os seguintes nao', async () => {
    const primeiro = montar({ enderecos: 0 });
    await primeiro.servico.createAddress('u1', { street: 'Rua A' } as never);
    expect(primeiro.prisma.userAddress.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', isDefault: true }) });
    const segundo = montar({ enderecos: 1 });
    await segundo.servico.createAddress('u1', { street: 'Rua B' } as never);
    expect(segundo.prisma.userAddress.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isDefault: false }) });
  });

  it('limite de 20 enderecos e apelido repetido', async () => {
    await expect(montar({ enderecos: 20 }).servico.createAddress('u1', { street: 'x' } as never)).rejects.toThrow('20 endere');
    await expect(montar({ enderecos: 2, apelidoRepetido: true }).servico.createAddress('u1', { label: 'Casa' } as never)).rejects.toThrow('apelido');
  });

  it('mexer em endereco de outra pessoa: nao encontrado, e nada e gravado', async () => {
    const { servico, prisma } = montar({ dono: false });
    await expect(servico.updateAddress('u1', 'a9', {} as never)).rejects.toThrow('Endereco nao encontrado');
    await expect(servico.deleteAddress('u1', 'a9')).rejects.toThrow('Endereco nao encontrado');
    await expect(servico.setDefaultAddress('u1', 'a9')).rejects.toThrow('Endereco nao encontrado');
    expect(prisma.userAddress.update).not.toHaveBeenCalled();
    expect(prisma.userAddress.delete).not.toHaveBeenCalled();
  });

  it('trocar o padrao desmarca os outros e marca o escolhido', async () => {
    const { servico, prisma } = montar();
    await servico.setDefaultAddress('u1', 'a1');
    expect(prisma.userAddress.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { isDefault: false } });
    expect(prisma.userAddress.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { isDefault: true } });
  });
});

describe('Bloqueio de conta (Central)', () => {
  it('nao bloqueia conta da Central', async () => {
    const { servico, repo } = montar({ usuario: { id: 'a', role: 'ADMIN' } });
    await expect(servico.adminSetBlocked('a', true)).rejects.toThrow('administrador');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('bloquear: corta as sessoes, tira o motorista do ar e guarda o motivo', async () => {
    const { servico, prisma, repo } = montar();
    await servico.adminSetBlocked('u1', true, 'Fraude');
    expect(repo.update).toHaveBeenCalledWith('u1', { status: 'BLOCKED', blockedReason: 'Fraude' });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(prisma.driver.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { isOnline: false } });
  });

  it('desbloquear: volta a ativo, limpa o motivo e nao mexe em sessoes', async () => {
    const { servico, prisma, repo } = montar();
    await servico.adminSetBlocked('u1', false);
    expect(repo.update).toHaveBeenCalledWith('u1', { status: 'ACTIVE', blockedReason: null });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('bloquear usuario inexistente: erro', async () => {
    const { servico } = montar({ usuario: null });
    await expect(servico.adminSetBlocked('x', true)).rejects.toThrow('Usuario nao encontrado');
  });
});
