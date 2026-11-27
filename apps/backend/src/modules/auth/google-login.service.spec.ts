import { generateKeyPairSync, sign } from 'crypto';
import { UserRole, UserStatus } from '@ride/shared';
import { GoogleLoginService } from './google-login.service';

const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CLIENTE = '123456789012-abcdefgh.apps.googleusercontent.com';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
function token(dados: Record<string, unknown> = {}) {
  const s = Math.floor(Date.now() / 1000);
  const corpo = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64({ iss: 'https://accounts.google.com', aud: CLIENTE, sub: 'g-1', email: 'ana@gmail.com', email_verified: true, name: 'Ana Souza', iat: s, exp: s + 600, ...dados })}`;
  return `${corpo}.${sign('RSA-SHA256', Buffer.from(corpo), par.privateKey).toString('base64url')}`;
}

function montar(contas: any[] = [], clientId: string | undefined = CLIENTE) {
  const casa = (u: any, w: any) => {
    if (w.metadata) return u.metadata?.google?.sub === w.metadata.equals && u.status !== w.status?.not;
    return (u.email ?? '').toLowerCase() === w.email;
  };
  const prisma: any = {
    $executeRaw: jest.fn(async () => 0),
    $transaction: async (fn: any) => fn(prisma),
    user: {
      findFirst: async ({ where }: any) => contas.find((u) => casa(u, where)) ?? null,
      create: async ({ data }: any) => {
        const u = { id: `u${contas.length + 1}`, driver: null, ...data };
        contas.push(u);
        return u;
      },
      update: async ({ where, data }: any) => Object.assign(contas.find((u) => u.id === where.id), data),
    },
  };
  const tokens = {
    issueTokens: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 1, refreshExpiresIn: 1 })),
    upsertDevice: jest.fn(async () => 'aparelho-1'),
  };
  const sessoes = { cortar: jest.fn(async () => ({ sessoesEncerradas: 1, aparelhos: 1 })) };
  const auth = { me: jest.fn(async (id: string) => ({ id })) };
  const avisos = { avisar: jest.fn(async () => undefined) };
  const s = new GoogleLoginService(prisma, { googleLogin: { clientId } } as never, tokens as never, auth as never, avisos as never, sessoes as never);
  (s as any).chaves = { chave: async () => par.publicKey };
  return { s, contas, tokens, avisos, sessoes };
}

const conta = (extra: Record<string, unknown> = {}) => ({ id: 'u1', role: UserRole.PASSENGER, status: UserStatus.ACTIVE, name: 'Ana', phone: '+5564999990000', email: 'ana@gmail.com', emailVerifiedAt: new Date(1), metadata: { cidade: 'Goiatuba' }, driver: null, ...extra });
const entrar = (s: GoogleLoginService, t = token(), role: UserRole = UserRole.PASSENGER) => s.entrar({ idToken: t, role });

describe('Entrar com Google', () => {
  it('desligado enquanto o codigo do cliente nao estiver configurado (ou estiver errado)', async () => {
    for (const id of [undefined, '', 'qualquer-coisa']) {
      const { s, contas } = montar([], id as never);
      (s as any).config = { googleLogin: { clientId: id } };
      expect(s.idDoCliente()).toBeNull();
      await expect(entrar(s)).rejects.toThrow('ainda nao esta ligado');
      expect(contas).toHaveLength(0);
    }
  });

  it('comprovante falso nao cria conta nem entrega acesso', async () => {
    const { s, contas, tokens } = montar();
    await expect(entrar(s, token({ aud: 'outro' }))).rejects.toThrow('nao confirmou');
    expect(contas).toHaveLength(0);
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it('conta nova: sem senha, telefone por informar, ja ligada ao Google', async () => {
    const { s, contas, avisos } = montar();
    const r: any = await entrar(s, token(), UserRole.DRIVER);
    expect(r.isNewUser).toBe(true);
    expect(contas[0]).toMatchObject({ role: UserRole.DRIVER, email: 'ana@gmail.com', name: 'Ana Souza', metadata: { google: { sub: 'g-1', email: 'ana@gmail.com' } } });
    expect(contas[0].phone.startsWith('pend-')).toBe(true);
    expect(contas[0].passwordHash).toBeUndefined();
    expect(avisos.avisar).not.toHaveBeenCalled();
  });

  it('conta que ja existe com o mesmo Gmail: liga, avisa uma vez e nao apaga os outros dados', async () => {
    const { s, contas, avisos } = montar([conta()]);
    const r: any = await entrar(s);
    expect(r.isNewUser).toBe(false);
    expect(contas).toHaveLength(1);
    expect(contas[0].metadata).toMatchObject({ cidade: 'Goiatuba', google: { sub: 'g-1' } });
    await entrar(s);
    expect(avisos.avisar).toHaveBeenCalledTimes(1);
    expect(avisos.avisar).toHaveBeenCalledWith('u1', 'GOOGLE_LIGADO');
  });

  it('e-mail ainda nao confirmado: a senha antiga cai e os outros aparelhos sao desconectados', async () => {
    const { s, contas, sessoes } = montar([conta({ emailVerifiedAt: null, passwordHash: 'antiga' })]);
    await entrar(s);
    expect(contas[0].passwordHash).toBeNull();
    expect(contas[0].emailVerifiedAt).toBeInstanceOf(Date);
    expect(sessoes.cortar).toHaveBeenCalledWith('u1', 'aparelho-1');
  });

  it('e-mail ja confirmado: a senha e os aparelhos continuam', async () => {
    const { s, contas, sessoes } = montar([conta({ passwordHash: 'minha' })]);
    await entrar(s);
    expect(contas[0].passwordHash).toBe('minha');
    expect(sessoes.cortar).not.toHaveBeenCalled();
  });

  it('a conta da Central nunca entra pelo Google', async () => {
    const { s, tokens } = montar([conta({ role: UserRole.ADMIN })]);
    await expect(entrar(s)).rejects.toThrow('conta da Central');
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it('conta bloqueada nao entra nem e ligada', async () => {
    const { s, contas, tokens } = montar([conta({ status: UserStatus.BLOCKED })]);
    await expect(entrar(s)).rejects.toThrow('bloqueada');
    expect(contas[0].metadata.google).toBeUndefined();
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it('endereco que o Google nao garante: pede o codigo do e-mail e nao mexe em nada', async () => {
    const { s, contas, tokens } = montar([conta({ email: 'ana@hotmail.com' })]);
    await expect(entrar(s, token({ email: 'ana@hotmail.com' }))).resolves.toEqual({ precisaCodigoEmail: true, email: 'ana@hotmail.com' });
    await expect(entrar(s, token({ email: 'nova@outlook.com', sub: 'g-9' }))).resolves.toEqual({ precisaCodigoEmail: true, email: 'nova@outlook.com' });
    expect(contas).toHaveLength(1);
    expect(contas[0].metadata.google).toBeUndefined();
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it('endereco ligado a OUTRA conta Google: so com o codigo do e-mail', async () => {
    const { s, tokens } = montar([conta({ metadata: { google: { sub: 'g-antigo', email: 'ana@gmail.com' } } })]);
    await expect(entrar(s)).resolves.toEqual({ precisaCodigoEmail: true, email: 'ana@gmail.com' });
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it('depois de trocar o e-mail da conta, o Google antigo nao entra mais nela', async () => {
    const trocada = conta({ email: 'ana.nova@gmail.com', metadata: { google: { sub: 'g-1', email: 'ana@gmail.com' } } });
    const { s, contas } = montar([trocada]);
    const r: any = await entrar(s);
    // O Gmail antigo vira uma conta nova e vazia; a conta trocada fica intacta.
    expect(r.isNewUser).toBe(true);
    expect(contas).toHaveLength(2);
    expect(r.user.id).not.toBe('u1');
  });

  it('passageiro que entra no app do motorista vira motorista (como na entrada por codigo)', async () => {
    const { s, contas } = montar([conta()]);
    await entrar(s, token(), UserRole.DRIVER);
    expect(contas[0].role).toBe(UserRole.DRIVER);
  });
});
