import { reconhecerPedinte } from './pedinte-conhecido';

const APARELHO = `and-${'a1'.repeat(16)}`;
const AGORA = Date.now();
const DIA = 24 * 60 * 60_000;

function banco(aparelhos: [string, string][], entradas: { userId: string; ip: string | null; dias: number }[]) {
  return {
    device: {
      findUnique: async ({ where }: { where: { userId_deviceId: { userId: string; deviceId: string } } }) => {
        const { userId, deviceId } = where.userId_deviceId;
        return aparelhos.some(([u, d]) => u === userId && d === deviceId) ? { id: 'linha' } : null;
      },
    },
    refreshToken: {
      findMany: async ({ where }: { where: { userId: string; createdAt: { gte: Date } } }) =>
        entradas.filter((e) => e.userId === where.userId && e.ip && AGORA - e.dias * DIA >= where.createdAt.gte.getTime()),
    },
  } as never;
}

describe('Reconhecer quem pede', () => {
  const prisma = banco(
    [
      ['ana', APARELHO],
      ['ana', 'vinculo-de-conta'],
      ['ana', 'flutter-passenger'],
    ],
    [
      { userId: 'ana', ip: '203.0.113.7', dias: 3 },
      { userId: 'ana', ip: '::ffff:203.0.113.9', dias: 3 },
      { userId: 'ana', ip: '2001:db8:aa:bb:1:2:3:4', dias: 3 },
      { userId: 'ana', ip: '198.51.100.20', dias: 120 },
      { userId: 'bia', ip: '198.51.100.30', dias: 1 },
    ],
  );
  const quem = (userId: string | undefined, instalacao?: string, origem?: string) =>
    reconhecerPedinte(prisma, userId, { instalacao, origem });

  it('aparelho que ja entrou na conta, mesmo de outra internet', async () => {
    expect(await quem('ana', APARELHO, '192.0.2.1')).toEqual({ chave: `aparelho:${APARELHO}`, conhecido: true });
  });

  it('o mesmo aparelho nao e conhecido na conta de outra pessoa', async () => {
    expect(await quem('bia', APARELHO, '192.0.2.1')).toEqual({ chave: 'origem:192.0.2.1', conhecido: false });
  });

  it.each(['vinculo-de-conta', 'flutter-passenger', 'and-123', ''])('nome fixo ou curto nao vale: "%s"', async (nome) => {
    expect((await quem('ana', nome, '192.0.2.1')).conhecido).toBe(false);
  });

  it('conexao usada ha pouco tempo e conhecida (IPv4 e IPv6)', async () => {
    expect((await quem('ana', undefined, '203.0.113.7')).conhecido).toBe(true);
    expect((await quem('ana', undefined, '203.0.113.9')).conhecido).toBe(true);
    expect((await quem('ana', undefined, '2001:db8:aa:bb::/64')).conhecido).toBe(true);
  });

  it('conexao antiga, de outra conta ou nova nao e', async () => {
    for (const ip of ['198.51.100.20', '198.51.100.30', '192.0.2.1']) {
      expect((await quem('ana', undefined, ip)).conhecido).toBe(false);
    }
  });

  it('conta que nao existe: ninguem e conhecido', async () => {
    expect(await quem(undefined, APARELHO, '203.0.113.7')).toEqual({ chave: 'origem:203.0.113.7', conhecido: false });
  });

  it('sem endereco', async () => {
    expect(await quem('ana')).toEqual({ chave: 'origem:sem-origem', conhecido: false });
  });
});
