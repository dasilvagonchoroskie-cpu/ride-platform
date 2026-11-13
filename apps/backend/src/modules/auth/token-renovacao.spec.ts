import { JANELA_REPETIR_RENOVACAO_MS, TokenService } from './token.service';
import { hashToken } from '../../common/utils/crypto.util';

/**
 * Renovacao do login: troca unica, mas com tolerancia a resposta perdida.
 * Banco de mentira.
 */
const PEPPER = 'pimenta-de-teste';
const usuario = { id: 'u1', role: 'DRIVER', name: 'Motorista', phone: '+5564999990000', email: null, status: 'ACTIVE', driver: { id: 'd1' } };

function montar(registro: Record<string, unknown> | null, substituto: Record<string, unknown> | null = null) {
  const criados: Array<{ tokenHash: string }> = [];
  const prisma = {
    refreshToken: {
      findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
        if (where.tokenHash === hashToken('antigo', PEPPER)) return registro;
        if (registro && where.tokenHash === registro.replacedBy) return substituto;
        return null;
      }),
      create: jest.fn(async ({ data }: { data: { tokenHash: string } }) => {
        criados.push(data);
        return data;
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    device: { upsert: jest.fn() },
  };
  const jwt = { signAsync: jest.fn(async () => 'acesso-novo') };
  const config = { jwt: { refreshSecret: PEPPER, accessSecret: 's', accessTtl: 900, refreshTtl: 2_592_000 } };
  return { servico: new TokenService(jwt as never, prisma as never, config as never), prisma, criados };
}

const aberto = () => ({ id: 't1', tokenHash: hashToken('antigo', PEPPER), userId: 'u1', deviceId: 'dev1', expiresAt: new Date(Date.now() + 86_400_000), revokedAt: null, replacedBy: null, user: usuario });
const trocadoHa = (ms: number, replacedBy: string | null = 'hash-substituto') => ({ ...aberto(), revokedAt: new Date(Date.now() - ms), replacedBy });

describe('Renovacao do login', () => {
  it('token aberto: troca, fecha o antigo apontando para o novo e mantem o mesmo aparelho', async () => {
    const { servico, prisma, criados } = montar(aberto());
    const r = await servico.rotateRefreshToken('antigo');
    expect(r.userId).toBe('u1');
    expect(criados[0]).toMatchObject({ userId: 'u1', deviceId: 'dev1' });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', revokedAt: null },
      data: { revokedAt: expect.any(Date), replacedBy: hashToken(r.refreshToken, PEPPER) },
    });
  });

  it('desconhecido ou vencido: recusa', async () => {
    await expect(montar(null).servico.rotateRefreshToken('antigo')).rejects.toThrow('invalido ou expirado');
    await expect(montar({ ...aberto(), expiresAt: new Date(Date.now() - 1000) }).servico.rotateRefreshToken('antigo')).rejects.toThrow('invalido ou expirado');
  });

  it('resposta perdida: o token trocado ha poucos segundos vale mais uma vez se a sessao nova segue aberta', async () => {
    const { servico, criados } = montar(trocadoHa(20_000), { revokedAt: null });
    const r = await servico.rotateRefreshToken('antigo');
    expect(r.userId).toBe('u1');
    expect(criados).toHaveLength(1);
  });

  it('passou da janela: recusa', async () => {
    const { servico } = montar(trocadoHa(JANELA_REPETIR_RENOVACAO_MS + 5_000), { revokedAt: null });
    await expect(servico.rotateRefreshToken('antigo')).rejects.toThrow('invalido ou expirado');
  });

  it('sessao nova ja encerrada (sair, trocar senha, desconectar aparelho): recusa mesmo dentro da janela', async () => {
    const { servico, criados } = montar(trocadoHa(10_000), { revokedAt: new Date() });
    await expect(servico.rotateRefreshToken('antigo')).rejects.toThrow('invalido ou expirado');
    expect(criados).toHaveLength(0);
  });

  it('token revogado sem substituto (saiu da conta / aparelho cortado): nunca volta', async () => {
    const { servico, criados } = montar(trocadoHa(5_000, null));
    await expect(servico.rotateRefreshToken('antigo')).rejects.toThrow('invalido ou expirado');
    expect(criados).toHaveLength(0);
  });

  it('conta bloqueada ou apagada: nao renova', async () => {
    for (const status of ['BLOCKED', 'DELETED']) {
      const { servico } = montar({ ...aberto(), user: { ...usuario, status } });
      await expect(servico.rotateRefreshToken('antigo')).rejects.toThrow('Conta indisponivel');
    }
  });
});
