import { verifyOtpSchema, OtpPurpose } from '@ride/shared';
import { OtpService } from './otp.service';

describe('Conferencia do codigo exige exatamente um destino', () => {
  const base = { code: '123456', purpose: 'LOGIN', role: 'PASSENGER' };

  it('a entrada recusa sem destino e com dois destinos', () => {
    expect(verifyOtpSchema.safeParse(base).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ ...base, phone: '+5564999990000', email: 'a@exemplo.test' }).success).toBe(false);
  });

  it('a entrada aceita um destino so', () => {
    expect(verifyOtpSchema.safeParse({ ...base, email: 'a@exemplo.test' }).success).toBe(true);
    expect(verifyOtpSchema.safeParse({ ...base, phone: '+5564999990000' }).success).toBe(true);
  });

  it('o servico valida o destino antes de seguir', async () => {
    const findFirst = jest.fn();
    const servico = new OtpService({ otpCode: { findFirst } } as never, {} as never, {} as never);
    for (const alvo of [{}, { phone: '+5564999990000', email: 'a@exemplo.test' }]) {
      await expect(servico.verify({ ...alvo, purpose: OtpPurpose.LOGIN, code: '123456' })).rejects.toBeDefined();
    }
    expect(findFirst).not.toHaveBeenCalled();
  });
});
