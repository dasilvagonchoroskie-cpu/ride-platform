import { UserRole } from '@ride/shared';
import { conferenciasQueFaltam, recuperacaoSchema, RecuperacaoAssistidaService } from './recuperacao-assistida';
import { DadosPessoaisCentralController } from './dados-pessoais.controller';
import { SenhaProvisoriaGuard } from '../../common/guards/senha-provisoria.guard';

/**
 * R3 (11/11/2026): recuperacao com documento, so pelo dono, com auditoria.
 * E o operador de cidade nao troca telefone/e-mail de ninguem.
 */
const tudoConferido = { fotoConfere: true, nomeConfere: true, cpfConfere: true, cnhConfere: true };
const pedido = { motivo: 'Perdeu o celular e o e-mail', documento: 'CNH' as const, conferencias: tudoConferido, novoEmail: 'novo@x.com' };

function montar(conta: { role: UserRole; driver?: { id: string } | null; email?: string | null }) {
  const prisma = {
    user: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.NOT ? null : { id: 'u1', phone: '+5564999990001', email: 'antigo@x.com', driver: null, ...conta },
      ),
      update: jest.fn(async () => ({})),
    },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const sessoes = { cortar: jest.fn(async () => ({ sessoesEncerradas: 3, aparelhos: 2 })) };
  const avisos = { avisar: jest.fn(async () => ({ email: true, aparelhos: 1 })) };
  return { s: new RecuperacaoAssistidaService(prisma as never, sessoes as never, avisos as never), prisma, sessoes, avisos };
}

describe('R3: recuperacao assistida pelo dono', () => {
  it('motorista precisa da CNH conferida; passageiro nao', () => {
    expect(conferenciasQueFaltam({ conferencias: { ...tudoConferido, cnhConfere: false } }, true)).toEqual(['CNH']);
    expect(conferenciasQueFaltam({ conferencias: { ...tudoConferido, cnhConfere: undefined } }, false)).toEqual([]);
    expect(conferenciasQueFaltam({ conferencias: { fotoConfere: false, nomeConfere: true, cpfConfere: false } }, false)).toEqual([
      'foto do documento',
      'CPF',
    ]);
  });

  it('o pedido nao aceita sem e-mail novo nem motivo curto', () => {
    expect(recuperacaoSchema.safeParse({ ...pedido, novoEmail: undefined }).success).toBe(false);
    expect(recuperacaoSchema.safeParse({ ...pedido, motivo: 'curto' }).success).toBe(false);
    expect(recuperacaoSchema.safeParse(pedido).success).toBe(true);
  });

  it('faltou conferir: NAO libera, nao derruba ninguem e registra "RECUSADA"', async () => {
    const { s, prisma, sessoes } = montar({ role: UserRole.DRIVER, driver: { id: 'd1' } });
    const r = await s.recuperar('dono', 'u1', { ...pedido, conferencias: { ...tudoConferido, cnhConfere: false } });
    expect(r).toEqual({ liberada: false, faltaram: ['CNH'] });
    expect(sessoes.cortar).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: 'dono', action: 'RECUPERACAO_ASSISTIDA', after: expect.objectContaining({ resultado: 'RECUSADA' }) }),
    });
  });

  it('tudo conferido: avisa, derruba tudo, troca o e-mail, apaga a senha antiga e registra "LIBERADA" (sem documento)', async () => {
    const { s, prisma, sessoes, avisos } = montar({ role: UserRole.DRIVER, driver: { id: 'd1' } });
    const r = await s.recuperar('dono', 'u1', pedido);
    expect(r).toEqual({ liberada: true, sessoesEncerradas: 3 });
    expect(avisos.avisar).toHaveBeenCalledWith('u1', 'RECUPERACAO_PELA_CENTRAL', { emailAntigo: 'antigo@x.com' });
    expect(sessoes.cortar).toHaveBeenCalledWith('u1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({ email: 'novo@x.com', emailVerifiedAt: null, passwordHash: null }),
    });
    const after = (prisma.auditLog.create.mock.calls[0] as unknown as [{ data: { after: Record<string, unknown> } }])[0].data.after;
    expect(after.resultado).toBe('LIBERADA');
    expect(after.motivo).toBe(pedido.motivo);
    expect(JSON.stringify(after)).not.toContain('novo@x.com'); // dado pessoal fora da auditoria
  });

  it('conta da Central nao e recuperada por aqui (R5)', async () => {
    const { s, sessoes } = montar({ role: UserRole.ADMIN });
    await expect(s.recuperar('dono', 'u1', pedido)).rejects.toThrow('Conta da Central');
    expect(sessoes.cortar).not.toHaveBeenCalled();
  });
});

describe('R2/R3: operador de cidade nao troca telefone nem e-mail', () => {
  function controlador(dono: boolean, pedidoMexe = true) {
    const dados = {
      aprovar: jest.fn(async () => ({ aprovado: true })),
      editarPelaCentral: jest.fn(async () => ({})),
      pedidoMexeNoAcesso: jest.fn(async () => pedidoMexe),
    };
    const pracas = {
      escopoDe: jest.fn(async () => (dono ? null : 'cidade-a')),
      pracaDoMotorista: jest.fn(async () => 'cidade-a'),
      exigirDono: jest.fn(async () => {
        if (!dono) throw new Error('So o dono da Central pode mexer nisto.');
      }),
    };
    const prisma = { user: { findUnique: jest.fn(async () => ({ role: UserRole.DRIVER, driver: { id: 'd1' } })) } };
    return { c: new DadosPessoaisCentralController(dados as never, pracas as never, prisma as never), dados };
  }
  const admin = { id: 'adm', role: UserRole.ADMIN } as never;

  it('operador da cidade: aprovar troca de telefone/e-mail e recusado', async () => {
    const { c, dados } = controlador(false);
    await expect(c.aprovar(admin, 'm1')).rejects.toThrow('So o dono');
    expect(dados.aprovar).not.toHaveBeenCalled();
  });

  it('operador da cidade: outros dados (ex.: Pix) do motorista da cidade dele continuam', async () => {
    const { c, dados } = controlador(false, false);
    await c.aprovar(admin, 'm1');
    expect(dados.aprovar).toHaveBeenCalled();
  });

  it('operador da cidade: editar telefone/e-mail direto e recusado; dono pode', async () => {
    await expect(controlador(false).c.editar(admin, 'm1', { phone: '+5564999990002' } as never)).rejects.toThrow('So o dono');
    await expect(controlador(false).c.editar(admin, 'm1', { email: 'x@x.com' } as never)).rejects.toThrow('So o dono');
    const dono = controlador(true);
    await dono.c.editar(admin, 'm1', { phone: '+5564999990002' } as never);
    expect(dono.dados.editarPelaCentral).toHaveBeenCalled();
  });
});

describe('R5: depois do procedimento excepcional, a Central so volta com as duas etapas', () => {
  function guarda(refazer: boolean) {
    const pracas = { refazerDoisFatores: jest.fn(async () => refazer), senhaProvisoria: jest.fn(async () => false) };
    return new SenhaProvisoriaGuard(pracas as never);
  }
  const pedidoPara = (url: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user: { id: 'dono', role: UserRole.ADMIN }, originalUrl: url }) }) }) as never;

  it('rotas da Central respondem REFAZER_DOIS_FATORES; ligar as duas etapas continua livre', async () => {
    await expect(guarda(true).canActivate(pedidoPara('/api/admin/drivers'))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'REFAZER_DOIS_FATORES' }),
    });
    await expect(guarda(true).canActivate(pedidoPara('/api/auth/2fa/iniciar'))).resolves.toBe(true);
    await expect(guarda(false).canActivate(pedidoPara('/api/admin/drivers'))).resolves.toBe(true);
  });
});
