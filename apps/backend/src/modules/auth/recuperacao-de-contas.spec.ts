import { OtpPurpose, UserRole } from '@ride/shared';
import { AuthService, ESPERA_TELEFONE_DEPOIS_DO_EMAIL_MS } from './auth.service';
import { SessoesService, tokenValido } from './sessoes.service';
import { enderecoDeTeste, textoDoAviso } from './avisos-de-seguranca';
import { DoisFatoresService } from './dois-fatores';
import { hashPassword } from '../../common/utils/crypto.util';

/**
 * Requisicao de continuidade (11/11/2026): recuperacao de contas R1, R2, R4, R5.
 * Tudo com o banco simulado: confere O QUE o servidor faz em cada caso.
 */

const MESTRE = 'chave-mestra-de-teste-com-32-letras!!';

describe('R1: corte da conta poupando so o aparelho que trocou a senha', () => {
  const agora = 1_762_700_000_000;
  const emitidoAntes = Math.floor(agora / 1000) - 60;

  it('o aparelho que trocou continua; os outros (e token sem aparelho) caem na hora', () => {
    const e = { sessoesDesde: agora, ativa: true, sessoesExceto: 'aparelho-A' };
    expect(tokenValido(e, emitidoAntes, 'aparelho-A')).toBe(true);
    expect(tokenValido(e, emitidoAntes, 'aparelho-B')).toBe(false);
    expect(tokenValido(e, emitidoAntes, null)).toBe(false);
    expect(tokenValido(e, emitidoAntes)).toBe(false);
  });

  it('o aparelho poupado ainda cai se for desconectado sozinho depois', () => {
    const e = { sessoesDesde: agora, ativa: true, sessoesExceto: 'aparelho-A', aparelhosCortados: { 'aparelho-A': agora + 5000 } };
    expect(tokenValido(e, Math.floor(agora / 1000) + 1, 'aparelho-A')).toBe(false);
  });

  it('cortar(manter): revoga as renovacoes e os avisos so dos OUTROS e nao tira o motorista do ar', async () => {
    let meta: Record<string, unknown> = { sessoesExceto: 'velho' };
    const tx = {
      user: {
        findUnique: jest.fn(async () => ({ status: 'ACTIVE', metadata: meta })),
        update: jest.fn(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
          meta = data.metadata;
        }),
      },
      refreshToken: { updateMany: jest.fn(async () => ({ count: 4 })) },
      device: { updateMany: jest.fn(async () => ({ count: 2 })) },
      driver: { updateMany: jest.fn(async () => ({ count: 1 })) },
    };
    const prisma = { ...tx, withTransaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    const s = new SessoesService(prisma as never);
    await s.cortar('u1', 'aparelho-A');
    expect(meta.sessoesExceto).toBe('aparelho-A');
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', OR: [{ deviceId: null }, { deviceId: { not: 'aparelho-A' } }] }) }),
    );
    expect(tx.device.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', id: { not: 'aparelho-A' } }, data: { fcmToken: null } });
    expect(tx.driver.updateMany).not.toHaveBeenCalled();
    // Corte total depois: a excecao some.
    await s.cortar('u1');
    expect(meta.sessoesExceto).toBeUndefined();
    expect(tx.driver.updateMany).toHaveBeenCalled();
  });
});

/** AuthService com tudo simulado. */
function montarAuth(conta: Record<string, unknown>, opcoes: { chaveTeste?: boolean } = {}) {
  const user = { id: 'u1', role: UserRole.PASSENGER, name: 'Ana Souza', phone: '+5564999990001', email: 'ana@x.com', status: 'ACTIVE', metadata: {}, driver: null, ...conta };
  const prisma = {
    user: {
      findUnique: jest.fn(async () => user),
      findUniqueOrThrow: jest.fn(async () => user),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => (where.NOT ? null : user)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(user, data);
        return user;
      }),
    },
  };
  const tokens = {
    upsertDevice: jest.fn(async () => 'aparelho-novo'),
    issueTokens: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900, refreshExpiresIn: 1 })),
  };
  const otp = {
    verify: jest.fn(async () => undefined),
    chaveTesteValida: jest.fn(() => opcoes.chaveTeste === true),
    entregaReal: jest.fn(() => true),
  };
  const doisFatores = new DoisFatoresService({ user: { update: jest.fn() } } as never, { jwt: { accessSecret: MESTRE } } as never, undefined as never);
  const pracas = { esquecerEscopo: jest.fn() };
  const sessoes = { cortar: jest.fn(async () => ({ sessoesEncerradas: 2, aparelhos: 2 })) };
  const avisos = { avisar: jest.fn(async () => ({ email: true, aparelhos: 1 })) };
  const auth = new AuthService(prisma as never, tokens as never, otp as never, doisFatores, pracas as never, sessoes as never, avisos as never);
  return { auth, user, prisma, tokens, otp, sessoes, avisos, doisFatores };
}

describe('R1/R4: troca e recuperacao de senha', () => {
  it('trocar a senha logado: avisa (menos o proprio aparelho) e corta tudo menos o aparelho atual', async () => {
    const { auth, sessoes, avisos, user } = montarAuth({ passwordHash: await hashPassword('Antiga123') });
    await auth.changePassword('u1', 'Antiga123', 'Nova12345', 'aparelho-A');
    expect(avisos.avisar).toHaveBeenCalledWith('u1', 'SENHA_TROCADA', { exceto: 'aparelho-A' });
    expect(sessoes.cortar).toHaveBeenCalledWith('u1', 'aparelho-A');
    expect(user.passwordHash).not.toBe('Nova12345');
  });

  it('senha atual errada: nada muda, ninguem e derrubado', async () => {
    const { auth, sessoes, avisos } = montarAuth({ passwordHash: await hashPassword('Antiga123') });
    await expect(auth.changePassword('u1', 'errada000', 'Nova12345', 'aparelho-A')).rejects.toThrow('Senha atual incorreta');
    expect(sessoes.cortar).not.toHaveBeenCalled();
    expect(avisos.avisar).not.toHaveBeenCalled();
  });

  it('"Esqueci a senha": o aparelho que recuperou e o unico que fica, e o aviso sai antes do corte', async () => {
    const { auth, sessoes, avisos, tokens, otp } = montarAuth({});
    const ordem: string[] = [];
    avisos.avisar.mockImplementation(async () => {
      ordem.push('aviso');
      return { email: true, aparelhos: 1 };
    });
    sessoes.cortar.mockImplementation(async () => {
      ordem.push('corte');
      return { sessoesEncerradas: 1, aparelhos: 1 };
    });
    const device = { deviceId: 'and-123', platform: 'ANDROID' as never };
    const r = await auth.redefinirSenha({ phone: '+5564999990001', code: '123456', newPassword: 'Nova12345', device });
    expect(otp.verify).toHaveBeenCalledWith(expect.objectContaining({ purpose: OtpPurpose.PASSWORD_RESET, code: '123456' }));
    expect(sessoes.cortar).toHaveBeenCalledWith('u1', 'aparelho-novo');
    expect(ordem).toEqual(['aviso', 'corte']);
    expect(tokens.issueTokens).toHaveBeenCalledWith(expect.anything(), device);
    expect('accessToken' in r).toBe(true);
  });

  it('codigo errado/expirado/repetido: o erro do codigo para tudo (senha nao muda, ninguem cai)', async () => {
    const { auth, sessoes, otp, prisma } = montarAuth({});
    otp.verify.mockRejectedValueOnce(new Error('Codigo expirado. Solicite um novo.'));
    await expect(auth.redefinirSenha({ phone: '+5564999990001', code: '000000', newPassword: 'Nova12345' })).rejects.toThrow('expirado');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(sessoes.cortar).not.toHaveBeenCalled();
  });
});

describe('R5: Central com duas etapas nunca recupera a senha sem o autenticador', () => {
  const comDuasEtapas = { role: UserRole.ADMIN, email: 'dono@x.com', metadata: { doisFatores: { ativo: true, segredo: 'x' } } };

  it('"Esqueci a senha" da Central: a senha NAO muda antes do codigo do Google Authenticator', async () => {
    const { auth, prisma, sessoes } = montarAuth(comDuasEtapas);
    const r = await auth.redefinirSenha({ email: 'dono@x.com', code: '123456', newPassword: 'Nova12345' });
    expect('precisa2fa' in r && r.precisa2fa).toBe(true);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(sessoes.cortar).not.toHaveBeenCalled();
  });

  it('o desafio leva a senha nova assinada; alterado, nao vale', async () => {
    const s = new DoisFatoresService({} as never, { jwt: { accessSecret: MESTRE } } as never, undefined as never);
    const d = s.criarDesafio('u1', Date.now(), { senhaNova: 'resumo', aparelho: 'ap1' });
    expect(s.lerDadosDoDesafio(d)).toEqual({ userId: 'u1', senhaNova: 'resumo', aparelho: 'ap1' });
    const [corpo, assinatura] = d.split('.');
    const falso = Buffer.from(JSON.stringify({ u: 'u1', e: Date.now() + 60_000, s: 'outra' })).toString('base64url');
    expect(() => s.lerDadosDoDesafio(`${falso}.${assinatura}`)).toThrow();
    expect(() => s.lerDadosDoDesafio(`${corpo}.${assinatura}`, Date.now() + 6 * 60_000)).toThrow('Passou o tempo');
  });

  it('com o codigo certo: grava a senha nova, avisa e corta tudo menos o aparelho', async () => {
    const { auth, prisma, sessoes, avisos, doisFatores } = montarAuth(comDuasEtapas);
    jest.spyOn(doisFatores, 'conferirEGastar').mockResolvedValue(true);
    const desafio = doisFatores.criarDesafio('u1', Date.now(), { senhaNova: 'resumo-bcrypt', aparelho: 'ap1' });
    await auth.entrarComDoisFatores(desafio, '123456');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ passwordHash: 'resumo-bcrypt' }) }));
    expect(avisos.avisar).toHaveBeenCalledWith('u1', 'SENHA_RECUPERADA', { exceto: 'ap1' });
    expect(sessoes.cortar).toHaveBeenCalledWith('u1', 'ap1');
  });

  it('codigo do autenticador errado: senha nao muda', async () => {
    const { auth, prisma, doisFatores } = montarAuth(comDuasEtapas);
    jest.spyOn(doisFatores, 'conferirEGastar').mockResolvedValue(false);
    const desafio = doisFatores.criarDesafio('u1', Date.now(), { senhaNova: 'resumo-bcrypt' });
    await expect(auth.entrarComDoisFatores(desafio, '000000')).rejects.toThrow('Codigo errado');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('R2: troca de telefone e de e-mail', () => {
  it('sem e-mail na conta: nao troca o telefone', async () => {
    const { auth, otp } = montarAuth({ email: null });
    await expect(auth.atualizarPerfil('u1', { phone: '+5564999990002', codigo: '123456' })).rejects.toThrow('cadastre e confirme um e-mail');
    expect(otp.verify).not.toHaveBeenCalled();
  });

  it('sem o codigo do e-mail: nao troca o telefone', async () => {
    const { auth } = montarAuth({});
    await expect(auth.atualizarPerfil('u1', { phone: '+5564999990002' })).rejects.toThrow('peca o codigo');
  });

  it('e-mail trocado ha menos de 48 h: o telefone espera', async () => {
    const { auth } = montarAuth({ metadata: { emailTrocadoEm: new Date(Date.now() - 3600_000).toISOString() } });
    await expect(auth.atualizarPerfil('u1', { phone: '+5564999990002', codigo: '123456' })).rejects.toThrow('48 horas');
    expect(ESPERA_TELEFONE_DEPOIS_DO_EMAIL_MS).toBe(48 * 3600 * 1000);
  });

  it('com o codigo do e-mail: troca, confirma o e-mail e avisa', async () => {
    const { auth, otp, prisma, avisos } = montarAuth({});
    await auth.atualizarPerfil('u1', { phone: '+5564999990002', codigo: '123456' });
    expect(otp.verify).toHaveBeenCalledWith({ phone: '+5564999990001', purpose: OtpPurpose.PHONE_VERIFICATION, code: '123456' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '+5564999990002', emailVerifiedAt: expect.any(Date) }) }),
    );
    expect(avisos.avisar).toHaveBeenCalledWith('u1', 'TELEFONE_TROCADO');
  });

  it('e-mail novo: so com o codigo que chegou NELE; avisa tambem o e-mail antigo', async () => {
    const { auth, otp, avisos } = montarAuth({});
    await expect(auth.atualizarPerfil('u1', { email: 'nova@x.com' })).rejects.toThrow('e-mail novo');
    await auth.atualizarPerfil('u1', { email: 'nova@x.com', codigoEmail: '654321' });
    expect(otp.verify).toHaveBeenCalledWith({ email: 'nova@x.com', purpose: OtpPurpose.EMAIL_VERIFICATION, code: '654321' });
    expect(avisos.avisar).toHaveBeenCalledWith('u1', 'EMAIL_TROCADO', { emailAntigo: 'ana@x.com' });
  });

  it('e-mail e telefone no mesmo pedido: recusa', async () => {
    const { auth } = montarAuth({});
    await expect(auth.atualizarPerfil('u1', { email: 'nova@x.com', codigoEmail: '1', phone: '+5564999990002', codigo: '1' })).rejects.toThrow(
      'momentos separados',
    );
  });
});

describe('R4: texto do aviso', () => {
  it('diz o que e quando, orienta, e nao leva codigo, telefone nem documento', () => {
    const { titulo, texto } = textoDoAviso('SENHA_TROCADA', new Date('2026-11-11T20:47:00Z'));
    expect(titulo).toBe('Aviso de segurança');
    expect(texto).toContain('11/11/2026');
    expect(texto).toContain('17:47');
    expect(texto).toContain('Esqueci minha senha');
    expect(texto).toContain('Os outros aparelhos foram desconectados');
    expect(texto).not.toMatch(/\d{6}|\+55/);
    expect(textoDoAviso('TELEFONE_TROCADO', new Date()).texto).not.toContain('desconectados');
  });

  it('enderecos do teste automatico nunca recebem e-mail', () => {
    expect(enderecoDeTeste('passageiro.1@teste.fortalezamov.com.br')).toBe(true);
    expect(enderecoDeTeste('fortalezamovegtba@gmail.com')).toBe(false);
  });
});
