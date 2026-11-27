import { ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { ERROR_CODES } from '@ride/shared';
import { BusinessException } from '../errors/business.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** Recusas que importam para a seguranca ficam no registro do servidor, sem dado pessoal. */
describe('Registro de recusas no servidor', () => {
  let avisos: string[];
  let relogio: number;

  beforeEach(() => {
    avisos = [];
    relogio += 10 * 60_000;
    jest.spyOn(Date, 'now').mockImplementation(() => relogio);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(function (m: unknown) {
      avisos.push(String(m));
    });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  beforeAll(() => {
    relogio = 1_000_000;
  });
  afterEach(() => jest.restoreAllMocks());

  function recusar(erro: unknown, req: Record<string, unknown> = {}) {
    const resposta = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const pedido = { method: 'GET', url: '/api/rides/1', ip: '203.0.113.7', ...req };
    const host = { switchToHttp: () => ({ getResponse: () => resposta, getRequest: () => pedido }) } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(erro, host);
    return resposta;
  }
  const marcados = () => avisos.filter((a) => a.startsWith('[seguranca]'));

  it.each([
    ['acesso negado', BusinessException.forbidden('Sem permissao.'), 403],
    ['pedidos demais (limite geral)', new HttpException('ThrottlerException: Too Many Requests', 429), 429],
    ['senha errada', BusinessException.unauthorized('Credenciais invalidas.', ERROR_CODES.INVALID_CREDENTIALS), 401],
    ['codigo de acesso errado', BusinessException.unauthorized('Codigo incorreto.', ERROR_CODES.OTP_INVALID), 401],
  ])('registra %s', (_nome, erro, status) => {
    const r = recusar(erro, { user: { id: 'u-1' } });
    expect(r.status).toHaveBeenCalledWith(status);
    expect(marcados()).toHaveLength(1);
    expect(marcados()[0]).toContain(`status=${status}`);
    expect(marcados()[0]).toContain('ip=203.0.113.7');
    expect(marcados()[0]).toContain('user=u-1');
  });

  it('registra chave de integracao recusada', () => {
    recusar(BusinessException.unauthorized('Chave de integracao ausente ou invalida.'), { method: 'POST', url: '/api/integracao/motoristas' });
    expect(marcados()).toHaveLength(1);
  });

  it.each([
    ['login vencido (o app renova sozinho)', BusinessException.unauthorized()],
    ['motorista ainda em analise', new BusinessException(ERROR_CODES.DRIVER_NOT_APPROVED, 'Em analise.', 403)],
    ['senha provisoria', new BusinessException(ERROR_CODES.SENHA_PROVISORIA, 'Troque a senha.', 403)],
    ['campo invalido', BusinessException.validation('Dado invalido.')],
    ['nao encontrado', BusinessException.notFound('Nada.')],
  ])('nao enche o registro com %s', (_nome, erro) => {
    recusar(erro);
    expect(marcados()).toHaveLength(0);
  });

  it('nao grava a mensagem, os parametros do endereco nem codigos longos de link', () => {
    const link = 'a'.repeat(64);
    recusar(BusinessException.forbidden('Conta fulano@exemplo.test'), { url: `/api/acompanhar/${link}?email=fulano%40exemplo.test&senha=x` });
    expect(marcados()[0]).not.toMatch(/fulano|senha=|email=|aaaaaaaaaa/);
    expect(marcados()[0]).toContain('/api/acompanhar/:longo');
  });

  it('repeticoes viram uma linha por minuto, com a contagem', () => {
    for (let i = 0; i < 500; i++) {
      recusar(BusinessException.forbidden('x'), { url: `/api/rides/00000000-0000-4000-8000-${String(i).padStart(12, '0')}` });
    }
    expect(marcados()).toHaveLength(1);
    relogio += 61_000;
    recusar(BusinessException.forbidden('x'), { url: '/api/rides/00000000-0000-4000-8000-000000000999' });
    expect(marcados()).toHaveLength(2);
    expect(marcados()[1]).toContain('repetidas=499');
  });

  it('muitas origens diferentes nao inundam o registro', () => {
    for (let i = 0; i < 1000; i++) recusar(BusinessException.forbidden('x'), { ip: `10.0.${Math.floor(i / 250)}.${i % 250}` });
    expect(marcados().length).toBeLessThanOrEqual(121);
    relogio += 61_000;
    recusar(BusinessException.forbidden('x'), { ip: '10.9.9.9' });
    expect(avisos.some((a) => /\[seguranca\] .*nao listadas=880/.test(a))).toBe(true);
  });
});
