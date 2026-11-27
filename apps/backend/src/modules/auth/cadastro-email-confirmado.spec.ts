import { AuthService } from './auth.service';

const entrada = {
  name: 'Pessoa de Teste',
  email: 'nova@exemplo.test',
  gender: 'NAO_INFORMAR' as never,
  cpf: '52998224725',
  password: 'Teste1234',
};

function montar(emailDaConta: string | null, metadata: Record<string, unknown> = {}) {
  const usuario = { id: 'u1', role: 'PASSENGER', status: 'ACTIVE', name: 'Passageiro', phone: '+5564999990000', email: emailDaConta, metadata };
  const update = jest.fn().mockResolvedValue({ ...usuario, driver: null });
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(usuario), findFirst: jest.fn().mockResolvedValue(null), update },
    setting: { findUnique: jest.fn().mockResolvedValue(null) },
    appSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    systemSetting: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const otp = { verify: jest.fn().mockResolvedValue(undefined) };
  const servico = new AuthService(prisma as never, {} as never, otp as never, {} as never, {} as never, {} as never, {} as never);
  return { servico, update, otp };
}

describe('Cadastro: so e-mail confirmado', () => {
  it('conta com e-mail: outro endereco e recusado e nada e gravado', async () => {
    const { servico, update, otp } = montar('minha@exemplo.test');
    await expect(servico.concluirCadastro('u1', entrada)).rejects.toThrow('mesmo e-mail');
    expect(update).not.toHaveBeenCalled();
    expect(otp.verify).not.toHaveBeenCalled();
  });

  it('conta com e-mail: o mesmo endereco passa sem codigo', async () => {
    const { servico, update, otp } = montar('nova@exemplo.test');
    await servico.concluirCadastro('u1', entrada);
    expect(otp.verify).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });

  it('conta sem e-mail: sem codigo nao grava', async () => {
    const { servico, update } = montar(null);
    await expect(servico.concluirCadastro('u1', entrada)).rejects.toThrow('Confirme o e-mail');
    expect(update).not.toHaveBeenCalled();
  });

  it('conta sem e-mail: com codigo confere no endereco novo e marca como confirmado', async () => {
    const { servico, update, otp } = montar(null);
    await servico.concluirCadastro('u1', { ...entrada, codigoEmail: '123456' });
    expect(otp.verify).toHaveBeenCalledWith({ email: 'nova@exemplo.test', purpose: 'EMAIL_VERIFICATION', code: '123456' });
    expect(update.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('sem senha so quem entra com o Google; com a ligacao vencida a senha volta a ser exigida', async () => {
    const semSenha = { ...entrada, password: undefined };
    const comum = montar('nova@exemplo.test');
    await expect(comum.servico.concluirCadastro('u1', semSenha)).rejects.toThrow('Crie uma senha');
    expect(comum.update).not.toHaveBeenCalled();

    const antiga = montar('nova@exemplo.test', { google: { sub: 'g', email: 'outra@exemplo.test' } });
    await expect(antiga.servico.concluirCadastro('u1', semSenha)).rejects.toThrow('Crie uma senha');

    const google = montar('nova@exemplo.test', { google: { sub: 'g', email: 'nova@exemplo.test' } });
    await google.servico.concluirCadastro('u1', semSenha);
    expect(google.update.mock.calls[0][0].data.passwordHash).toBeUndefined();
    expect(google.update.mock.calls[0][0].data.metadata).toMatchObject({ cadastroCompleto: true, google: { sub: 'g' } });
  });
});
