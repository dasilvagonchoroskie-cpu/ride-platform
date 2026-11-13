import {
  atualizarSchema,
  cadastroSchema,
  cotarSchema,
  decidir,
  descricaoParaMotorista,
  enderecoPorExtenso,
  entregaSchema,
  etapaDaEntrega,
  motivoDeNaoPoderPedir,
  periodoPadrao,
  somarGastos,
  valorCobrado,
} from './comercio.regras';

const endereco = { logradouro: 'Rua das Flores', numero: '120', bairro: 'Centro', cidade: 'Goiatuba', uf: 'go', cep: '75600-000' };
const cadastro = {
  ...endereco,
  nomeFantasia: 'Padaria Estrela',
  cnpj: '11.222.333/0001-81',
  responsavelNome: 'Maria Souza',
  telefone: '(64) 99999-1234',
  email: 'Maria@Padaria.com.br',
  aceiteTermos: true,
};
const pedido = {
  chave: 'abcdefghij0123456789',
  encomenda: { descricao: '2 caixas de bolo' },
  destinatario: { nome: 'Ana Lima', telefone: '(64) 98888-7777' },
  destino: { ...endereco, numero: '55', latitude: -18.0, longitude: -49.3 },
  veiculo: 'MOTO' as const,
};

describe('Comercio: aceite dos termos no cadastro', () => {
  it('sem aceite (ausente ou falso) o cadastro e recusado', () => {
    const { aceiteTermos: _a, ...semAceite } = cadastro;
    expect(cadastroSchema.safeParse(semAceite).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...cadastro, aceiteTermos: false }).success).toBe(false);
    expect(cadastroSchema.safeParse(cadastro).success).toBe(true);
  });
});

describe('Comercio: cadastro e validacao (testes 1 e 2)', () => {
  it('aceita um cadastro valido e normaliza CNPJ, CEP, UF, e-mail e telefone', () => {
    const r = cadastroSchema.safeParse(cadastro);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.cnpj).toBe('11222333000181');
      expect(r.data.cep).toBe('75600000');
      expect(r.data.uf).toBe('GO');
      expect(r.data.email).toBe('maria@padaria.com.br');
      expect(r.data.telefone).toBe('+5564999991234');
    }
  });

  it('recusa CNPJ com digito errado, repetido ou curto', () => {
    for (const cnpj of ['11.222.333/0001-82', '00000000000000', '123']) {
      expect(cadastroSchema.safeParse({ ...cadastro, cnpj }).success).toBe(false);
    }
  });

  it('recusa campos obrigatorios faltando, CEP/UF ruins e CPF do responsavel invalido', () => {
    expect(cadastroSchema.safeParse({ ...cadastro, nomeFantasia: undefined }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...cadastro, bairro: '' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...cadastro, cep: '123' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...cadastro, uf: 'Goias' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...cadastro, responsavelCpf: '111.111.111-11' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...cadastro, responsavelCpf: '529.982.247-25' }).success).toBe(true);
  });

  it('latitude sem longitude e recusada; senha fraca tambem', () => {
    expect(cadastroSchema.safeParse({ ...cadastro, telefone: '123' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...cadastro, telefone: '+55 64 99999-1234' }).success).toBe(true);
    expect(cadastroSchema.safeParse({ ...cadastro, latitude: -18 }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...cadastro, latitude: -18, longitude: -49 }).success).toBe(true);
    expect(cadastroSchema.safeParse({ ...cadastro, senha: '1234' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...cadastro, senha: 'Padaria2026' }).success).toBe(true);
  });

  it('o CNPJ nao muda pela atualizacao; precisa ter algo para atualizar', () => {
    const r = atualizarSchema.safeParse({ nomeFantasia: 'Novo nome', cnpj: '11222333000181' });
    expect(r.success).toBe(true);
    expect(r.success && 'cnpj' in r.data).toBe(false);
    expect(atualizarSchema.safeParse({}).success).toBe(false);
  });
});

describe('Comercio: destinatario, destino e pedido (testes 6, 7 e 8)', () => {
  it('pedido completo vale; sem destinatario, sem destino ou sem veiculo nao', () => {
    expect(entregaSchema.safeParse(pedido).success).toBe(true);
    expect(entregaSchema.safeParse({ ...pedido, destinatario: { nome: 'A', telefone: '123' } }).success).toBe(false);
    expect(entregaSchema.safeParse({ ...pedido, destino: { ...pedido.destino, cep: '1' } }).success).toBe(false);
    expect(entregaSchema.safeParse({ ...pedido, destino: { ...pedido.destino, latitude: undefined } }).success).toBe(false);
    expect(entregaSchema.safeParse({ ...pedido, veiculo: 'BICICLETA' }).success).toBe(false);
    expect(entregaSchema.safeParse({ ...pedido, veiculo: undefined }).success).toBe(false);
    // preco confirmado pela loja: inteiro, nao negativo, com teto; a consulta de preco nao aceita o campo
    expect(entregaSchema.safeParse({ ...pedido, valorEsperadoCents: 700 }).success).toBe(true);
    for (const ruim of [-1, 7.5, '700', 99_999_999]) expect(entregaSchema.safeParse({ ...pedido, valorEsperadoCents: ruim }).success).toBe(false);
    const { chave: _c, ...semChave } = pedido;
    expect((cotarSchema.parse({ ...semChave, valorEsperadoCents: 700 }) as Record<string, unknown>).valorEsperadoCents).toBeUndefined();
  });

  it('a chave do pedido precisa ser longa e sem simbolos (idempotencia)', () => {
    expect(entregaSchema.safeParse({ ...pedido, chave: 'curta' }).success).toBe(false);
    expect(entregaSchema.safeParse({ ...pedido, chave: 'abc def ghi jkl mno pqr' }).success).toBe(false);
  });

  it('consultar o preco nao pede chave; a coleta alternativa e opcional', () => {
    const { chave: _c, ...semChave } = pedido;
    expect(cotarSchema.safeParse(semChave).success).toBe(true);
    expect(entregaSchema.safeParse({ ...pedido, coletaAlternativa: { address: 'Av. Brasil, 10', latitude: -18, longitude: -49 } }).success).toBe(true);
  });

  it('consultar o preco aceita pedido SEM veiculo (o veiculo so e escolhido depois do preco)', () => {
    const { chave: _c, veiculo: _v, ...semChaveEVeiculo } = pedido;
    expect(cotarSchema.safeParse(semChaveEVeiculo).success).toBe(true);
    expect(cotarSchema.safeParse({ ...semChaveEVeiculo, veiculo: 'BICICLETA' }).success).toBe(false);
    // o pedido de verdade continua exigindo o veiculo
    expect(entregaSchema.safeParse({ ...pedido, veiculo: undefined }).success).toBe(false);
  });

  it('endereco por extenso: rua, numero, complemento, bairro, cidade/UF e CEP com hifen', () => {
    expect(enderecoPorExtenso({ ...endereco, uf: 'GO', cep: '75600000', complemento: 'Sala 2' })).toBe(
      'Rua das Flores, 120 - Sala 2, Centro, Goiatuba/GO, CEP 75600-000',
    );
  });
});

describe('Comercio: o que o motorista le (teste 12)', () => {
  it('traz o comercio, o telefone da coleta, a encomenda, a observacao e a referencia', () => {
    const t = descricaoParaMotorista({ nome: 'Padaria Estrela', telefone: '+5564999991234', encomenda: '2 caixas de bolo', observacoes: 'Frágil', referencia: 'Portão azul' });
    expect(t).toBe('COMÉRCIO Padaria Estrela (64999991234): 2 caixas de bolo | Obs: Frágil | Ref: Portão azul');
    expect(t.length).toBeLessThanOrEqual(200);
  });

  it('nunca passa de 200 letras e corta primeiro a observacao', () => {
    const t = descricaoParaMotorista({ nome: 'Padaria', telefone: '64999991234', encomenda: 'Bolo', observacoes: 'x'.repeat(400), referencia: 'perto da praça' });
    expect(t.length).toBeLessThanOrEqual(200);
    expect(t.startsWith('COMÉRCIO Padaria (64999991234): Bolo')).toBe(true);
  });
});

describe('Comercio: situacao do cadastro (teste 20)', () => {
  it('so aprovado pode pedir; os outros recebem o motivo', () => {
    expect(motivoDeNaoPoderPedir('APROVADO')).toBeNull();
    for (const s of ['AGUARDANDO', 'SUSPENSO', 'REJEITADO']) expect(motivoDeNaoPoderPedir(s)).toEqual(expect.any(String));
  });

  it('nada aprova sozinho e cada acao so parte da situacao certa', () => {
    expect(decidir('AGUARDANDO', 'APROVAR')).toEqual({ ok: true, para: 'APROVADO' });
    expect(decidir('APROVADO', 'APROVAR').ok).toBe(false);
    expect(decidir('APROVADO', 'SUSPENDER', 'Reclamações de motoristas')).toEqual({ ok: true, para: 'SUSPENSO' });
    expect(decidir('SUSPENSO', 'REATIVAR')).toEqual({ ok: true, para: 'APROVADO' });
    expect(decidir('AGUARDANDO', 'REATIVAR').ok).toBe(false);
    expect(decidir('REJEITADO', 'SUSPENDER', 'motivo valido').ok).toBe(false);
  });

  it('rejeitar e suspender exigem motivo', () => {
    expect(decidir('AGUARDANDO', 'REJEITAR').ok).toBe(false);
    expect(decidir('AGUARDANDO', 'REJEITAR', 'abc').ok).toBe(false);
    expect(decidir('AGUARDANDO', 'REJEITAR', 'CNPJ não confere')).toEqual({ ok: true, para: 'REJEITADO' });
    expect(decidir('APROVADO', 'SUSPENDER').ok).toBe(false);
  });
});

describe('Comercio: estado da entrega e acompanhamento (testes 14, 15 e 16)', () => {
  const r = (status: string, coletadaEm: unknown = null) => etapaDaEntrega({ status, coletadaEm: coletadaEm as never });
  it('segue o estado real do servidor, sem pular etapas', () => {
    expect(r('REQUESTED')).toBe('CRIADA');
    expect(r('SEARCHING')).toBe('AGUARDANDO_MOTORISTA');
    expect(r('DRIVER_ASSIGNED')).toBe('MOTORISTA_ENCONTRADO');
    expect(r('DRIVER_ARRIVING')).toBe('A_CAMINHO_DA_COLETA');
    expect(r('DRIVER_WAITING')).toBe('NO_ESTABELECIMENTO');
    expect(r('IN_PROGRESS')).toBe('COLETADA');
    expect(r('IN_PROGRESS', new Date())).toBe('A_CAMINHO_DA_ENTREGA');
    expect(r('COMPLETED')).toBe('ENTREGUE');
  });

  it('cancelamentos: antes da coleta e cancelada; depois da coleta e falha na entrega; ninguem aceitou', () => {
    expect(r('CANCELLED_BY_PASSENGER')).toBe('CANCELADA');
    expect(r('CANCELLED_BY_DRIVER')).toBe('CANCELADA');
    expect(r('CANCELLED_BY_DRIVER', new Date())).toBe('FALHA_NA_ENTREGA');
    expect(r('CANCELLED_BY_SYSTEM', new Date())).toBe('FALHA_NA_ENTREGA');
    expect(r('EXPIRED')).toBe('SEM_MOTORISTA');
  });

  it('um estado desconhecido nunca vira "entregue"', () => {
    expect(r('QUALQUER_COISA')).toBe('CRIADA');
  });
});

describe('Comercio: gastos (teste 19)', () => {
  const linhas = [
    { status: 'COMPLETED', finalFareCents: 1500, estimatedFareCents: 1400 },
    { status: 'COMPLETED', finalFareCents: null, estimatedFareCents: 900 },
    { status: 'CANCELLED_BY_PASSENGER', finalFareCents: null, estimatedFareCents: 2000 },
    { status: 'EXPIRED', finalFareCents: null, estimatedFareCents: 1000 },
    { status: 'IN_PROGRESS', finalFareCents: null, estimatedFareCents: 800 },
  ];
  it('so entrega concluida custa; cancelada e em andamento nao somam', () => {
    expect(somarGastos(linhas)).toEqual({ realizadas: 2, canceladas: 2, emAndamento: 1, totalCents: 2400 });
    expect(valorCobrado(linhas[2]!)).toBe(0);
    expect(valorCobrado(linhas[1]!)).toBe(900);
  });

  it('periodo padrao = o mes corrente em Brasilia', () => {
    const { de, ate } = periodoPadrao(new Date('2026-11-15T12:00:00Z'));
    expect(de.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(ate.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    // 01/12 01:00 em Brasilia ainda e 30/11 22:00? Nao: 01/12 04:00Z = 01:00 BRT -> dezembro.
    expect(periodoPadrao(new Date('2026-12-01T04:00:00Z')).de.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(periodoPadrao(new Date('2026-12-01T02:00:00Z')).de.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
});
