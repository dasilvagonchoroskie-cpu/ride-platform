import { UserRole } from '@ride/shared';
import { OtpService } from './otp.service';

/** Os testes automaticos so mexem em conta de teste. */
const CHAVE = 'chave-do-teste-1234567890';

function montar(conta: { role: UserRole; metadata?: unknown } | null, chaveTeste: string | undefined = CHAVE) {
  const prisma = { user: { findFirst: jest.fn(async () => conta) } };
  const config = { jwt: { refreshSecret: 'p' }, otp: { chaveTeste } };
  return new OtpService(prisma as never, config as never, {} as never);
}

describe('Modo dos testes automaticos', () => {
  const email = { email: 'passageiro.1@teste.fortalezamov.com.br' };

  it('vale para endereco novo do dominio de teste', async () => {
    await expect(montar(null).modoDeTeste(email, CHAVE)).resolves.toBe(true);
  });

  it('vale para conta ja marcada como teste', async () => {
    const otp = montar({ role: UserRole.PASSENGER, metadata: { teste: true } });
    await expect(otp.modoDeTeste({ phone: '+5564999990001' }, CHAVE)).resolves.toBe(true);
  });

  it.each([UserRole.PASSENGER, UserRole.DRIVER, UserRole.ADMIN])('nao vale para conta comum (%s)', async (role) => {
    const otp = montar({ role, metadata: {} });
    await expect(otp.modoDeTeste(email, CHAVE)).resolves.toBe(false);
    await expect(otp.modoDeTeste({ phone: '+5564999990001' }, CHAVE)).resolves.toBe(false);
  });

  it('nunca vale para a Central, mesmo marcada', async () => {
    const otp = montar({ role: UserRole.ADMIN, metadata: { teste: true } });
    await expect(otp.modoDeTeste(email, CHAVE)).resolves.toBe(false);
  });

  it.each(['novo@exemplo.com', 'x@teste.fortalezamov.com.br.exemplo.com', 'x@fortalezamov.com.br'])(
    'nao vale para endereco novo fora do dominio de teste (%s)',
    async (outro) => {
      await expect(montar(null).modoDeTeste({ email: outro }, CHAVE)).resolves.toBe(false);
    },
  );

  it('nao vale para telefone sem conta, nem com os dois alvos', async () => {
    await expect(montar(null).modoDeTeste({ phone: '+5564999990001' }, CHAVE)).resolves.toBe(false);
    await expect(montar(null).modoDeTeste({ ...email, phone: '+5564999990001' }, CHAVE)).resolves.toBe(false);
  });

  it('chave errada, ausente ou nao configurada: nao vale', async () => {
    await expect(montar(null).modoDeTeste(email, 'chave-errada-000000000000')).resolves.toBe(false);
    await expect(montar(null).modoDeTeste(email, undefined)).resolves.toBe(false);
    await expect(montar(null, '').modoDeTeste(email, CHAVE)).resolves.toBe(false);
  });
});
