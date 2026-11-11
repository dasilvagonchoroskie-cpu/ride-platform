import { OtpPurpose } from '@ride/shared';
import { OtpService } from './otp.service';
import { hashToken } from '../../common/utils/crypto.util';

/**
 * Requisicao de continuidade (11/11/2026), item 2: codigos expirados,
 * repetidos, tentativas demais, pedidos demais e o codigo da troca de
 * telefone que nunca aparece na tela.
 */
const PEPPER = 'pimenta-de-teste';

function montar(opcoes: { debugReturn?: boolean; emailConfigurado?: boolean; codigos?: Array<Record<string, unknown>>; pedidosNaHora?: number; dono?: { id: string; email: string | null } | null } = {}) {
  const codigos = opcoes.codigos ?? [];
  const prisma = {
    otpCode: {
      findFirst: jest.fn(async () => codigos.find((c) => !c.consumedAt) ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const c = codigos.find((x) => x.id === where.id)!;
        if ((data.attempts as { increment?: number })?.increment) c.attempts = (c.attempts as number) + 1;
        if (data.consumedAt) c.consumedAt = data.consumedAt;
        return c;
      }),
      count: jest.fn(async () => opcoes.pedidosNaHora ?? 0),
      updateMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async () => ({})),
    },
    user: { findUnique: jest.fn(async () => opcoes.dono ?? null) },
    $transaction: jest.fn(async () => []),
  };
  const config = {
    jwt: { refreshSecret: PEPPER },
    otp: { chaveTeste: 'chave-do-teste-1234567890', debugReturn: opcoes.debugReturn ?? false, length: 6, ttlSeconds: 300, maxAttempts: 5 },
  };
  const notifications = { emailConfigurado: opcoes.emailConfigurado ?? true, send: jest.fn(async () => ({ delivered: true })), sendOtpCode: jest.fn() };
  return { otp: new OtpService(prisma as never, config as never, notifications as never), prisma, notifications, codigos };
}

const codigo = (code: string, extra: Record<string, unknown> = {}) => ({
  id: 'c1',
  codeHash: hashToken(code, PEPPER),
  expiresAt: new Date(Date.now() + 60_000),
  attempts: 0,
  maxAttempts: 5,
  consumedAt: null,
  ...extra,
});

describe('Codigos (OTP): abuso e repeticao', () => {
  it('codigo expirado nao vale', async () => {
    const { otp } = montar({ codigos: [codigo('123456', { expiresAt: new Date(Date.now() - 1000) })] });
    await expect(otp.verify({ email: 'a@x.com', purpose: OtpPurpose.PASSWORD_RESET, code: '123456' })).rejects.toThrow('expirado');
  });

  it('codigo usado uma vez nao vale de novo', async () => {
    const { otp } = montar({ codigos: [codigo('123456')] });
    await otp.verify({ email: 'a@x.com', purpose: OtpPurpose.PASSWORD_RESET, code: '123456' });
    await expect(otp.verify({ email: 'a@x.com', purpose: OtpPurpose.PASSWORD_RESET, code: '123456' })).rejects.toThrow('invalido ou expirado');
  });

  it('5 tentativas erradas: nem o codigo certo entra mais', async () => {
    const { otp } = montar({ codigos: [codigo('123456')] });
    for (let i = 0; i < 5; i++) {
      await expect(otp.verify({ email: 'a@x.com', purpose: OtpPurpose.LOGIN, code: '000000' })).rejects.toThrow('incorreto');
    }
    await expect(otp.verify({ email: 'a@x.com', purpose: OtpPurpose.LOGIN, code: '123456' })).rejects.toThrow('tentativas');
  });

  it('mais de 6 codigos por hora para o mesmo contato: recusa', async () => {
    const { otp } = montar({ pedidosNaHora: 6 });
    await expect(otp.request({ email: 'a@x.com', purpose: OtpPurpose.LOGIN })).rejects.toThrow('Muitos codigos');
  });

  it('R2: codigo da troca de telefone nunca aparece na tela, nem com OTP_DEBUG_RETURN ligado', async () => {
    // Conta sem e-mail: sem o e-mail, nada de codigo na tela.
    const semEmail = montar({ debugReturn: true, dono: { id: 'u1', email: null } });
    await expect(semEmail.otp.request({ phone: '+5564999990001', purpose: OtpPurpose.PHONE_VERIFICATION })).rejects.toThrow('precisa de um e-mail');
    // E-mail desligado no servidor: tambem nao.
    const semEnvio = montar({ debugReturn: true, emailConfigurado: false, dono: { id: 'u1', email: 'a@x.com' } });
    await expect(semEnvio.otp.request({ phone: '+5564999990001', purpose: OtpPurpose.PHONE_VERIFICATION })).rejects.toThrow('precisa de um e-mail');
  });

  it('R2: com e-mail, o codigo da troca de telefone vai para o e-mail da conta (nada na resposta)', async () => {
    const { otp, notifications } = montar({ debugReturn: true, dono: { id: 'u1', email: 'ana@x.com' } });
    const r = await otp.request({ phone: '+5564999990001', purpose: OtpPurpose.PHONE_VERIFICATION });
    expect(r.debugCode).toBeUndefined();
    expect(r.enviadoPor).toBe('email');
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@x.com' }));
  });
});
