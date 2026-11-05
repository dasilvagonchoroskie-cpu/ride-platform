import { beneficioSchema, codigoDoMotorista, ehRecargaConfirmada, elegibilidade, parceiroSchema, situacaoDoMotorista } from './clube.regras';
import { idDoLogo } from './clube.service';

const ID = '2b7c9a1e-3f4d-4c5b-9a8e-1f2e3d4c5b6a';

describe('Clube de Vantagens - cadastro do parceiro', () => {
  const base = { nome: 'Loja', categoria: 'Outros', endereco: 'Rua A, 100 - Centro', vantagens: 'Condição especial' };

  it('aceita o minimo e completa os campos opcionais', () => {
    const p = parceiroSchema.parse(base);
    expect(p).toMatchObject({ descricao: '', horario: '', condicoes: '', ativo: true });
  });

  it('normaliza telefone e WhatsApp (so numeros, com 55)', () => {
    const p = parceiroSchema.parse({ ...base, telefone: '(85) 3333-4444', whatsapp: '85 99999-8888' });
    expect(p.telefone).toBe('558533334444');
    expect(p.whatsapp).toBe('5585999998888');
    expect(parceiroSchema.parse({ ...base, whatsapp: '' }).whatsapp).toBeNull();
  });

  it('recusa telefone sem DDD, nome vazio e endereco curto', () => {
    expect(parceiroSchema.safeParse({ ...base, whatsapp: '99999' }).success).toBe(false);
    expect(parceiroSchema.safeParse({ ...base, nome: ' ' }).success).toBe(false);
    expect(parceiroSchema.safeParse({ ...base, endereco: 'Rua' }).success).toBe(false);
    expect(parceiroSchema.safeParse({ ...base, latitude: 120 }).success).toBe(false);
  });

  it('beneficio tem condicoes livres (sem percentual fixo)', () => {
    const b = beneficioSchema.parse({ titulo: 'Preço especial na troca de óleo', condicoes: 'Apresentar a identificação digital' });
    expect(b).toMatchObject({ ativo: true, ordem: 0 });
    expect(beneficioSchema.safeParse({ titulo: '' }).success).toBe(false);
  });
});

describe('Clube de Vantagens - APTO / NAO APTO pela recarga', () => {
  const agora = new Date('2026-11-05T15:00:00-03:00');
  const dias = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);
  const recarga = (reais: number, diasAtras: number) => ({ type: 'ADJUSTMENT', amountCents: Math.round(reais * 100), createdAt: dias(diasAtras) });

  it('recarga confirmada de R$ 100,00 ou mais nos ultimos 30 dias: APTO', () => {
    const e = elegibilidade([recarga(100, 3)], agora);
    expect(e.apto).toBe(true);
    expect(e.validoAte).toEqual(new Date(dias(3).getTime() + 30 * 24 * 60 * 60 * 1000));
    expect(e.atualizadoEm).toEqual(dias(3));
    expect(elegibilidade([recarga(250, 29)], agora).apto).toBe(true);
  });

  it('recarga menor que R$ 100,00: NAO APTO', () => {
    expect(elegibilidade([recarga(99.99, 1)], agora)).toEqual({ apto: false, validoAte: null, atualizadoEm: null });
  });

  it('varias recargas menores que somam mais de R$ 100,00: NAO APTO (nao soma)', () => {
    expect(elegibilidade([recarga(50, 1), recarga(50, 2), recarga(60, 3)], agora).apto).toBe(false);
  });

  it('o que nao e recarga confirmada nao conta (debito, cupom, ganho, saque)', () => {
    const outros = [
      { type: 'ADJUSTMENT', amountCents: -15000, createdAt: dias(1) },
      { type: 'BONUS', amountCents: 15000, createdAt: dias(1) },
      { type: 'RIDE_EARNING', amountCents: 15000, createdAt: dias(1) },
      { type: 'PAYOUT', amountCents: 15000, createdAt: dias(1) },
    ];
    expect(outros.every((l) => !ehRecargaConfirmada(l))).toBe(true);
    expect(elegibilidade(outros, agora).apto).toBe(false);
  });

  it('recarga valida com mais de 30 dias: NAO APTO, com a data em que venceu', () => {
    const e = elegibilidade([recarga(150, 31)], agora);
    expect(e.apto).toBe(false);
    expect(e.atualizadoEm).toEqual(new Date(dias(31).getTime() + 30 * 24 * 60 * 60 * 1000));
    expect(elegibilidade([recarga(150, 30)], agora).apto).toBe(false);
  });

  it('a recarga valida mais recente manda', () => {
    expect(elegibilidade([recarga(200, 40), recarga(100, 10), recarga(20, 1)], agora).apto).toBe(true);
  });

  it('lancamento com data no futuro nao vale', () => {
    expect(elegibilidade([{ type: 'ADJUSTMENT', amountCents: 20000, createdAt: new Date(agora.getTime() + 60_000) }], agora).apto).toBe(false);
  });
});

describe('Clube de Vantagens - carteirinha', () => {
  it('identificador interno curto e fixo por motorista', () => {
    expect(codigoDoMotorista(ID)).toMatch(/^FM-[0-9A-F]{8}$/);
    expect(codigoDoMotorista(ID)).toBe(codigoDoMotorista(ID));
    expect(codigoDoMotorista(ID)).not.toBe(codigoDoMotorista(ID.replace('a', 'b')));
  });

  it('situacao do cadastro', () => {
    expect(situacaoDoMotorista('APPROVED', false).codigo).toBe('ATIVO');
    expect(situacaoDoMotorista('APPROVED', true).codigo).toBe('SUSPENSO');
    expect(situacaoDoMotorista('PENDING', false).codigo).toBe('PENDENTE');
    expect(situacaoDoMotorista('BLOCKED', false).codigo).toBe('SUSPENSO');
  });

  it('logotipo: so apaga arquivo com endereco proprio', () => {
    expect(idDoLogo(`/arquivos/${ID}`)).toBe(ID);
    expect(idDoLogo('https://outro.site/x.png')).toBeNull();
    expect(idDoLogo(null)).toBeNull();
  });
});
