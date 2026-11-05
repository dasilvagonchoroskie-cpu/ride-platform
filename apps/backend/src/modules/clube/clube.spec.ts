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

describe('Clube de Vantagens - APTO / NAO APTO pela soma das recargas', () => {
  const agora = new Date('2026-11-05T15:00:00-03:00');
  const DIA = 24 * 60 * 60 * 1000;
  const dias = (n: number) => new Date(agora.getTime() - n * DIA);
  const recarga = (reais: number, diasAtras: number) => ({ type: 'ADJUSTMENT', amountCents: Math.round(reais * 100), createdAt: dias(diasAtras) });

  it('uma recarga de R$ 100,00 nos ultimos 30 dias: APTO', () => {
    const e = elegibilidade([recarga(100, 3)], agora);
    expect(e).toMatchObject({ apto: true, totalCents: 10000 });
    expect(e.validoAte).toEqual(new Date(dias(3).getTime() + 30 * DIA));
    expect(e.atualizadoEm).toEqual(dias(3));
  });

  it('menos de R$ 100,00 no total: NAO APTO', () => {
    expect(elegibilidade([recarga(50, 1), recarga(49.99, 2)], agora)).toEqual({ apto: false, totalCents: 9999, validoAte: null, atualizadoEm: null });
  });

  it('varias recargas menores que somam R$ 100,00 ou mais: APTO (soma)', () => {
    const e = elegibilidade([recarga(50, 20), recarga(50, 10), recarga(50, 1)], agora);
    expect(e).toMatchObject({ apto: true, totalCents: 15000 });
    // Ficou apto na segunda (50 + 50); vale ate a de 20 dias atras sair e o total cair para 100.
    expect(e.atualizadoEm).toEqual(dias(10));
    expect(e.validoAte).toEqual(new Date(dias(10).getTime() + 30 * DIA));
  });

  it('caso do Evandro: 50 + 50 + 50 no mesmo dia = APTO', () => {
    expect(elegibilidade([recarga(50, 0.01), recarga(50, 0.02), recarga(50, 0.03)], agora).apto).toBe(true);
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
    expect(elegibilidade([recarga(60, 1), ...outros], agora).totalCents).toBe(6000);
  });

  it('recargas com mais de 30 dias saem da soma: NAO APTO, com a data em que caiu', () => {
    const e = elegibilidade([recarga(150, 31)], agora);
    expect(e.apto).toBe(false);
    expect(e.atualizadoEm).toEqual(new Date(dias(31).getTime() + 30 * DIA));
    expect(elegibilidade([recarga(150, 30)], agora).apto).toBe(false);
    // 60 de 35 dias atras + 50 de 5 dias atras: so 50 conta hoje.
    expect(elegibilidade([recarga(60, 35), recarga(50, 5)], agora)).toMatchObject({ apto: false, totalCents: 5000 });
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
