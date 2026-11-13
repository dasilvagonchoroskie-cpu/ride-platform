import { OtpPurpose } from '@ride/shared';
import { OtpService } from './otp.service';
import { hashToken } from '../../common/utils/crypto.util';
import { lerContasDeRevisao } from '../../config/configuration';

/**
 * Conta de revisao da loja (Google Play), 13/11/2026: codigo fixo so para e-mails da lista
 * OTP_CONTAS_REVISAO. Desligada por padrao, so passageiro/motorista, so por e-mail.
 * Os valores abaixo sao ficticios, so deste teste.
 */
const PEPPER = 'pimenta-de-teste';
const FIXO = '424242';

function montar(opcoes: { contas?: Record<string, string>; role?: string | null; pedidosNaHora?: number; debugReturn?: boolean } = {}) {
  const prisma = {
    otpCode: {
      count: jest.fn(async () => opcoes.pedidosNaHora ?? 0),
      findFirst: jest.fn(async () => null),
      updateMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async (a: unknown) => a),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn(async () => (opcoes.role ? { role: opcoes.role } : null)) },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  const config = {
    jwt: { refreshSecret: PEPPER },
    otp: { chaveTeste: undefined, debugReturn: opcoes.debugReturn ?? false, length: 6, ttlSeconds: 300, maxAttempts: 5, contasRevisao: opcoes.contas ?? {} },
  };
  const notifications = { emailConfigurado: true, send: jest.fn(async () => ({ delivered: true })), sendOtpCode: jest.fn() };
  return { otp: new OtpService(prisma as never, config as never, notifications as never), prisma, notifications };
}

const REV = { 'revisor@exemplo.com': FIXO };

describe('Conta de revisao da loja', () => {
  it('lista da entrada: so aceita e-mail valido com codigo so de digitos do tamanho certo', () => {
    expect(lerContasDeRevisao(undefined, 6)).toEqual({});
    expect(lerContasDeRevisao('', 6)).toEqual({});
    expect(lerContasDeRevisao('Revisor@Exemplo.com=424242, b@x.com=111111', 6)).toEqual({ 'revisor@exemplo.com': '424242', 'b@x.com': '111111' });
    expect(lerContasDeRevisao('semarroba=424242,a@x.com=12345,a@x.com=abcdef,a@x.com', 6)).toEqual({});
  });

  it('desligada por padrao: sem lista, o fluxo normal segue (envia e-mail)', async () => {
    const { otp, notifications, prisma } = montar({ contas: {} });
    const r = await otp.request({ email: 'revisor@exemplo.com', purpose: OtpPurpose.LOGIN });
    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(r.enviadoPor).toBe('email');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('e-mail da lista: grava o codigo fixo, nao envia e-mail e nao devolve codigo', async () => {
    const { otp, notifications, prisma } = montar({ contas: REV, role: 'PASSENGER' });
    const r = await otp.request({ email: 'Revisor@Exemplo.com', purpose: OtpPurpose.LOGIN });
    expect(notifications.send).not.toHaveBeenCalled();
    expect(notifications.sendOtpCode).not.toHaveBeenCalled();
    expect(r.debugCode).toBeUndefined();
    expect(r.enviadoPor).toBe('email');
    const gravado = (prisma.otpCode.create.mock.calls[0] as unknown as [{ data: { codeHash: string } }])[0].data;
    expect(gravado.codeHash).toBe(hashToken(FIXO, PEPPER));
  });

  it('conta ainda nao existente (primeira entrada do revisor) tambem vale', async () => {
    const { otp, notifications } = montar({ contas: REV, role: null });
    await otp.request({ email: 'revisor@exemplo.com', purpose: OtpPurpose.EMAIL_VERIFICATION });
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('motorista tambem vale; dono/operador (Central) nunca: segue o fluxo normal', async () => {
    const motorista = montar({ contas: REV, role: 'DRIVER' });
    await motorista.otp.request({ email: 'revisor@exemplo.com', purpose: OtpPurpose.LOGIN });
    expect(motorista.notifications.send).not.toHaveBeenCalled();

    for (const role of ['ADMIN', 'OWNER', 'OPERATOR', 'SUPPORT']) {
      const { otp, notifications } = montar({ contas: REV, role });
      await otp.request({ email: 'revisor@exemplo.com', purpose: OtpPurpose.LOGIN });
      expect(notifications.send).toHaveBeenCalledTimes(1);
    }
  });

  it('e-mail fora da lista segue o fluxo normal', async () => {
    const { otp, notifications } = montar({ contas: REV, role: 'PASSENGER' });
    await otp.request({ email: 'outro@exemplo.com', purpose: OtpPurpose.LOGIN });
    expect(notifications.send).toHaveBeenCalledTimes(1);
  });

  it('nunca para telefone, troca de telefone nem recuperacao de senha', async () => {
    const tel = montar({ contas: REV, role: 'PASSENGER' });
    await tel.otp.request({ phone: '+5564999990001', email: 'revisor@exemplo.com', purpose: OtpPurpose.LOGIN }).catch(() => undefined);
    expect(tel.prisma.otpCode.create.mock.calls.some((c) => (c[0] as { data: { codeHash: string } }).data.codeHash === hashToken(FIXO, PEPPER))).toBe(false);

    const senha = montar({ contas: REV, role: 'PASSENGER' });
    await senha.otp.request({ email: 'revisor@exemplo.com', purpose: OtpPurpose.PASSWORD_RESET });
    expect(senha.notifications.send).toHaveBeenCalledTimes(1);
  });

  it('mantem o limite de 6 pedidos por hora (senao zerar tentativas permitiria adivinhar o codigo)', async () => {
    const { otp } = montar({ contas: REV, role: 'PASSENGER', pedidosNaHora: 6 });
    await expect(otp.request({ email: 'revisor@exemplo.com', purpose: OtpPurpose.LOGIN })).rejects.toThrow('Muitos codigos');
  });

  it('o codigo fixo confere no verify; errado conta tentativa', async () => {
    const reg: Record<string, unknown> = { id: 'c1', codeHash: hashToken(FIXO, PEPPER), expiresAt: new Date(Date.now() + 60_000), attempts: 0, maxAttempts: 5, consumedAt: null };
    const { otp, prisma } = montar({ contas: REV, role: 'PASSENGER' });
    (prisma.otpCode.findFirst as jest.Mock).mockImplementation(async () => (reg.consumedAt ? null : reg));
    (prisma.otpCode.update as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      if ((data.attempts as { increment?: number })?.increment) reg.attempts = (reg.attempts as number) + 1;
      if (data.consumedAt) reg.consumedAt = data.consumedAt;
      return reg;
    });
    await expect(otp.verify({ email: 'revisor@exemplo.com', purpose: OtpPurpose.LOGIN, code: '000000' })).rejects.toThrow('incorreto');
    expect(reg.attempts).toBe(1);
    await otp.verify({ email: 'revisor@exemplo.com', purpose: OtpPurpose.LOGIN, code: FIXO });
    expect(reg.consumedAt).toBeTruthy();
  });
});
