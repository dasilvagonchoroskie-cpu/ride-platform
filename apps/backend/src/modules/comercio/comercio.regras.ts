import { emailSchema, isValidCnpj, isValidCpf, nameSchema, passwordSchema } from '@ride/shared';
import { z } from 'zod';

/**
 * Fortaleza Move Comercio (quarto aplicativo, 12/11/2026).
 *
 * Regras puras, sem banco: validacao dos dados, situacao do cadastro, estado
 * da entrega como o comerciante ve, texto que o motorista le e a conta de
 * gastos. O preco NAO e calculado aqui: sai sempre do mecanismo oficial
 * (RidesService.estimar), com as tarifas ja configuradas.
 */

export const digitos = (v: string): string => v.replace(/\D/g, '');

// ---------------------------------------------------------------------------
// Situacao administrativa
// ---------------------------------------------------------------------------

export const SITUACOES = ['AGUARDANDO', 'APROVADO', 'SUSPENSO', 'REJEITADO'] as const;
export type Situacao = (typeof SITUACOES)[number];

export const ACOES = ['APROVAR', 'REJEITAR', 'SUSPENDER', 'REATIVAR'] as const;
export type Acao = (typeof ACOES)[number];

/** De onde cada acao parte e para onde vai. Nada de aprovar sozinho. */
const TRANSICOES: Record<Acao, { de: Situacao[]; para: Situacao; pedeMotivo: boolean }> = {
  APROVAR: { de: ['AGUARDANDO', 'REJEITADO'], para: 'APROVADO', pedeMotivo: false },
  REJEITAR: { de: ['AGUARDANDO'], para: 'REJEITADO', pedeMotivo: true },
  SUSPENDER: { de: ['APROVADO'], para: 'SUSPENSO', pedeMotivo: true },
  REATIVAR: { de: ['SUSPENSO'], para: 'APROVADO', pedeMotivo: false },
};

export function decidir(atual: string, acao: Acao, motivo?: string | null): { ok: true; para: Situacao } | { ok: false; erro: string } {
  const t = TRANSICOES[acao];
  if (!t.de.includes(atual as Situacao)) {
    return { ok: false, erro: `Não dá para ${rotuloDaAcao(acao)} um cadastro que está "${rotuloDaSituacao(atual)}".` };
  }
  if (t.pedeMotivo && (motivo ?? '').trim().length < 5) {
    return { ok: false, erro: 'Escreva o motivo (pelo menos 5 letras).' };
  }
  return { ok: true, para: t.para };
}

export function rotuloDaAcao(a: Acao): string {
  return { APROVAR: 'aprovar', REJEITAR: 'rejeitar', SUSPENDER: 'suspender', REATIVAR: 'reativar' }[a];
}

export function rotuloDaSituacao(s: string): string {
  return (
    { AGUARDANDO: 'Aguardando aprovação', APROVADO: 'Aprovado', SUSPENSO: 'Suspenso', REJEITADO: 'Rejeitado' } as Record<string, string>
  )[s] ?? s;
}

/** Mensagem de quem tenta pedir entrega sem estar aprovado. */
export function motivoDeNaoPoderPedir(situacao: string): string | null {
  switch (situacao) {
    case 'APROVADO':
      return null;
    case 'AGUARDANDO':
      return 'Seu cadastro ainda está aguardando aprovação da Central.';
    case 'SUSPENSO':
      return 'Seu estabelecimento está suspenso. Fale com a Central.';
    case 'REJEITADO':
      return 'Seu cadastro não foi aprovado. Fale com a Central.';
    default:
      return 'Cadastro indisponível.';
  }
}

// ---------------------------------------------------------------------------
// Validacao dos dados (o servidor nunca confia so no aplicativo)
// ---------------------------------------------------------------------------

const texto = (min: number, max: number, rotulo: string) =>
  z.string().trim().min(min, `${rotulo} muito curto.`).max(max, `${rotulo} muito longo.`);

const cnpjSchema = z
  .string()
  .transform(digitos)
  .refine((v) => isValidCnpj(v), 'CNPJ inválido.');

const cpfOpcional = z
  .string()
  .transform(digitos)
  .refine((v) => isValidCpf(v), 'CPF do responsável inválido.');

/** Telefone do Brasil: 10 ou 11 numeros (com DDD); guarda sempre com +55. */
const telefoneSchema = z
  .string()
  .transform(digitos)
  .refine((v) => /^(55)?\d{10,11}$/.test(v), 'Telefone inválido (com DDD).')
  .transform((v) => (v.length <= 11 ? `+55${v}` : `+${v}`));

const cepSchema = z
  .string()
  .transform(digitos)
  .refine((v) => v.length === 8, 'CEP inválido (8 números).');

const ufSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Estado inválido (2 letras).');

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const enderecoSchema = z.object({
  logradouro: texto(3, 200, 'Rua'),
  numero: texto(1, 20, 'Número'),
  complemento: z.string().trim().max(80).optional(),
  bairro: texto(2, 80, 'Bairro'),
  cidade: texto(2, 80, 'Cidade'),
  uf: ufSchema,
  cep: cepSchema,
  latitude: latitude.optional(),
  longitude: longitude.optional(),
});

export const cadastroSchema = enderecoSchema
  .extend({
    nomeFantasia: texto(2, 120, 'Nome fantasia'),
    razaoSocial: z.string().trim().min(2).max(160).optional(),
    cnpj: cnpjSchema,
    responsavelNome: nameSchema,
    responsavelCpf: cpfOpcional.optional(),
    telefone: telefoneSchema,
    email: emailSchema,
    /** So vale se a conta ainda nao tem senha. */
    senha: passwordSchema.optional(),
    /** Aceite dos termos de uso do Comercio (obrigatorio; o servidor grava a versao vigente). */
    aceiteTermos: z.literal(true, { errorMap: () => ({ message: 'Leia e aceite os termos de uso do Comércio.' }) }),
  })
  .refine((d) => (d.latitude == null) === (d.longitude == null), { message: 'Informe latitude e longitude juntas.', path: ['latitude'] });

/** O CNPJ nao muda por aqui (so a Central, se um dia for preciso). */
export const atualizarSchema = enderecoSchema
  .partial()
  .extend({
    nomeFantasia: texto(2, 120, 'Nome fantasia').optional(),
    razaoSocial: z.string().trim().min(2).max(160).optional(),
    responsavelNome: nameSchema.optional(),
    telefone: telefoneSchema.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: 'Nada para atualizar.' })
  .refine((d) => (d.latitude == null) === (d.longitude == null), { message: 'Informe latitude e longitude juntas.', path: ['latitude'] });

const pontoSchema = z.object({
  address: z.string().trim().min(3).max(300),
  latitude,
  longitude,
  placeId: z.string().max(200).optional(),
});

/** Telefone de quem recebe: opcional (13/11/2026); se vier, com DDD. */
const telefoneOpcional = z
  .string()
  .trim()
  .refine((t) => digitos(t) === '' || /^\d{10,13}$/.test(digitos(t)), 'Telefone de quem recebe com DDD.')
  .default('');

const destinoSchema = enderecoSchema
  .omit({ latitude: true, longitude: true })
  .extend({
    latitude,
    longitude,
    referencia: z.string().trim().max(160).optional(),
    placeId: z.string().max(200).optional(),
  });

export const entregaSchema = z.object({
  /** Chave de idempotencia do app: o mesmo toque repetido nao cria outra entrega. */
  chave: z.string().trim().regex(/^[A-Za-z0-9_-]{16,64}$/, 'Chave do pedido inválida.'),
  encomenda: z.object({
    descricao: texto(3, 120, 'Descrição da encomenda'),
    observacoes: z.string().trim().max(300).optional(),
  }),
  /** Sem isto, a coleta e no endereco do estabelecimento. */
  coletaAlternativa: pontoSchema.optional(),
  destinatario: z.object({
    nome: texto(2, 120, 'Nome de quem recebe'),
    telefone: telefoneOpcional,
  }),
  destino: destinoSchema,
  /**
   * Varias entregas num pedido (um veiculo, uma rota): as entregas ANTES da ultima, na ordem
   * em que o motorista vai passar. A ultima e sempre `destino` + `destinatario`. No maximo 4 + a ultima = 5.
   */
  paradas: z
    .array(
      z.object({
        encomenda: z.object({ descricao: texto(3, 120, 'Descrição da encomenda') }),
        destinatario: z.object({
          nome: texto(2, 120, 'Nome de quem recebe'),
          telefone: telefoneOpcional,
        }),
        destino: destinoSchema,
      }),
    )
    .max(4, 'No máximo 5 entregas por pedido.')
    .optional(),
  veiculo: z.enum(['MOTO', 'CARRO']),
  /** Medida assinada do preco consultado (a rota nao e medida de novo). */
  cotacao: z.string().max(2000).optional(),
  /** Preco que a loja viu e confirmou: se o preco oficial mudou ate o pedido, o servidor recusa e pede nova consulta. */
  valorEsperadoCents: z.number().int().min(0).max(10_000_000).optional(),
});
export type EntregaInput = z.infer<typeof entregaSchema>;

/**
 * Para consultar o preco: igual ao pedido, sem a chave. O veiculo e opcional:
 * a consulta devolve as opcoes de todos os veiculos liberados e a loja escolhe depois
 * (antes, o app novo recebia "Required" ao consultar, porque ainda nao ha veiculo escolhido).
 */
export const cotarSchema = entregaSchema.omit({ chave: true, valorEsperadoCents: true }).partial({ encomenda: true, veiculo: true });
export type CotarInput = z.infer<typeof cotarSchema>;

// ---------------------------------------------------------------------------
// Lancamento manual de entrega pelo motorista (12/11/2026)
// ---------------------------------------------------------------------------

/** O motorista procura o estabelecimento por telefone, e-mail ou nome. */
export const buscarEstabelecimentoSchema = z.object({ busca: z.string().trim().min(3, 'Digite ao menos 3 letras ou números.').max(120) });

/**
 * Pedido lancado pelo motorista: igual ao da loja, mas o veiculo NAO vem do
 * aplicativo (e o veiculo em uso do proprio motorista) e a loja e escolhida pelo id.
 */
export const entregaManualSchema = entregaSchema.omit({ veiculo: true, paradas: true }).extend({ comercioId: z.string().uuid() });
export type EntregaManualInput = z.infer<typeof entregaManualSchema>;

export const cotarManualSchema = cotarSchema.omit({ veiculo: true, paradas: true }).extend({ comercioId: z.string().uuid() });
export type CotarManualInput = z.infer<typeof cotarManualSchema>;

/**
 * Entrega lancada pela Central (13/11/2026): igual ao pedido da loja, mas a
 * Central escolhe a loja, o veiculo (Moto ou Carro) e, se quiser, o motorista
 * (sem motorista, o despacho automatico de sempre).
 */
export const entregaCentralSchema = entregaSchema
  .omit({ paradas: true })
  .extend({ comercioId: z.string().uuid(), motoristaId: z.string().uuid().optional() });
export type EntregaCentralInput = z.infer<typeof entregaCentralSchema>;

export const cotarCentralSchema = cotarSchema.omit({ paradas: true }).extend({ comercioId: z.string().uuid() });
export type CotarCentralInput = z.infer<typeof cotarCentralSchema>;

/**
 * Estabelecimento NAO cadastrado no Comercio (13/11/2026, entrega avulsa pela
 * Central): so o que a Central precisa para a coleta: nome, telefone de contato e
 * o endereco de coleta, ja confirmado no mapa.
 */
export const estabelecimentoAvulsoSchema = z.object({
  nome: texto(2, 120, 'Nome do estabelecimento'),
  telefone: z.string().trim().refine((t) => /^\d{10,13}$/.test(digitos(t)), 'Telefone do estabelecimento com DDD.'),
  coleta: pontoSchema,
});
export type EstabelecimentoAvulso = z.infer<typeof estabelecimentoAvulsoSchema>;

/** Igual ao pedido da loja, mas sem cadastro: o estabelecimento vem digitado e a coleta e o endereco dele. */
export const entregaAvulsaSchema = entregaSchema
  .omit({ paradas: true, coletaAlternativa: true })
  .extend({ estabelecimento: estabelecimentoAvulsoSchema, motoristaId: z.string().uuid().optional() });
export type EntregaAvulsaInput = z.infer<typeof entregaAvulsaSchema>;

export const cotarAvulsaSchema = cotarSchema.omit({ paradas: true, coletaAlternativa: true }).extend({ estabelecimento: estabelecimentoAvulsoSchema });
export type CotarAvulsaInput = z.infer<typeof cotarAvulsaSchema>;

export type TipoDeBusca = { tipo: 'EMAIL' | 'TELEFONE' | 'NOME'; valor: string };

/** E-mail se tem "@"; telefone se so tem numeros e simbolos de telefone (8+ numeros); senao, nome. */
export function tipoDeBusca(busca: string): TipoDeBusca {
  const q = busca.trim();
  if (q.includes('@')) return { tipo: 'EMAIL', valor: q.toLowerCase() };
  const d = digitos(q);
  if (d.length >= 8 && /^[\d\s()+.-]+$/.test(q)) return { tipo: 'TELEFONE', valor: d.replace(/^55(?=\d{10,11}$)/, '') };
  return { tipo: 'NOME', valor: q };
}

/** O veiculo em uso do motorista: categoria com "MOTO" = moto; o resto = carro. */
export function veiculoDaCategoria(categoria: string | null | undefined): 'MOTO' | 'CARRO' {
  return (categoria ?? '').toUpperCase().includes('MOTO') ? 'MOTO' : 'CARRO';
}

/** Por que o motorista NAO pode lancar para este estabelecimento (null = pode, quanto ao cadastro). */
export function motivoParaMotorista(situacao: string): string | null {
  switch (situacao) {
    case 'APROVADO':
      return null;
    case 'AGUARDANDO':
      return 'Este estabelecimento ainda está aguardando aprovação da Central.';
    case 'SUSPENSO':
      return 'Este estabelecimento está suspenso. Fale com a Central.';
    case 'REJEITADO':
      return 'O cadastro deste estabelecimento não foi aprovado. Fale com a Central.';
    default:
      return 'Cadastro indisponível.';
  }
}

/** CNPJ para o motorista conferir sem expor tudo: so os 2 ultimos numeros. */
export function cnpjParcial(cnpj: string): string {
  const d = digitos(cnpj);
  return d.length >= 4 ? `**.***.***/****-${d.slice(-2)}` : '';
}

/** Final do telefone (para distinguir lojas de mesmo nome sem mostrar o numero inteiro). */
export function finalDoTelefone(tel: string): string {
  const d = digitos(tel);
  return d.length >= 4 ? `…${d.slice(-4)}` : '';
}

export const decisaoSchema = z.object({
  acao: z.enum(ACOES),
  motivo: z.string().trim().max(300).optional(),
});

export const periodoSchema = z.object({
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

export const listaSchema = z.object({
  situacao: z.enum(SITUACOES).optional(),
  busca: z.string().trim().max(80).optional(),
  praca: z.string().trim().max(80).optional(),
});

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export function enderecoPorExtenso(e: {
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}): string {
  const rua = `${e.logradouro}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ''}`;
  const cep = e.cep.length === 8 ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : e.cep;
  return `${rua}, ${e.bairro}, ${e.cidade}/${e.uf}, CEP ${cep}`.slice(0, 300);
}

/**
 * O que o motorista le como "o que vai ser levado" (campo de 200 letras do
 * app dele, que nao muda): quem e o comercio, o telefone para a coleta, a
 * encomenda e a observacao. A observacao e a primeira a ser cortada.
 */
export function descricaoParaMotorista(d: {
  nome: string;
  telefone: string;
  encomenda: string;
  observacoes?: string | null;
  referencia?: string | null;
  /** "COMERCIO" (cadastrado, padrao) ou "AVULSO" (coleta lancada pela Central, sem cadastro). */
  rotulo?: string;
}): string {
  const tel = digitos(d.telefone).replace(/^55(\d{10,11})$/, '$1');
  const cabeca = `${d.rotulo ?? 'COMÉRCIO'} ${d.nome.trim()} (${tel}): ${d.encomenda.trim()}`;
  const extras = [d.observacoes ? `Obs: ${d.observacoes.trim()}` : '', d.referencia ? `Ref: ${d.referencia.trim()}` : ''].filter(Boolean);
  const cheio = extras.length ? `${cabeca} | ${extras.join(' | ')}` : cabeca;
  if (cheio.length <= 200) return cheio;
  if (cabeca.length >= 200) return cabeca.slice(0, 199) + '…';
  return `${cheio.slice(0, 199)}…`;
}

// ---------------------------------------------------------------------------
// Estado da entrega, como o comerciante ve (sempre o do servidor)
// ---------------------------------------------------------------------------

export interface FatosDaEntrega {
  status: string;
  coletadaEm?: Date | string | null;
  entregueEm?: Date | string | null;
}

export type Etapa =
  | 'CRIADA'
  | 'AGUARDANDO_MOTORISTA'
  | 'MOTORISTA_ENCONTRADO'
  | 'A_CAMINHO_DA_COLETA'
  | 'NO_ESTABELECIMENTO'
  | 'COLETADA'
  | 'A_CAMINHO_DA_ENTREGA'
  | 'ENTREGUE'
  | 'CANCELADA'
  | 'FALHA_NA_ENTREGA'
  | 'SEM_MOTORISTA';

export const ROTULOS: Record<Etapa, string> = {
  CRIADA: 'Solicitação criada',
  AGUARDANDO_MOTORISTA: 'Aguardando motorista',
  MOTORISTA_ENCONTRADO: 'Motorista encontrado',
  A_CAMINHO_DA_COLETA: 'Motorista a caminho da coleta',
  NO_ESTABELECIMENTO: 'Motorista chegou ao estabelecimento',
  COLETADA: 'Encomenda coletada',
  A_CAMINHO_DA_ENTREGA: 'Em deslocamento para entrega',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
  FALHA_NA_ENTREGA: 'Falha na entrega',
  SEM_MOTORISTA: 'Nenhum motorista aceitou',
};

const FINAIS: Etapa[] = ['ENTREGUE', 'CANCELADA', 'FALHA_NA_ENTREGA', 'SEM_MOTORISTA'];
export const ehFinal = (e: Etapa): boolean => FINAIS.includes(e);

/**
 * Traduz o estado real da corrida. Nada e inventado: se o servidor nao tem
 * o dado, o estado nao avanca. "Falha na entrega" = o motorista (ou o
 * sistema) cancelou DEPOIS de coletar a encomenda.
 */
export function etapaDaEntrega(f: FatosDaEntrega): Etapa {
  const coletada = !!f.coletadaEm;
  switch (f.status) {
    case 'SCHEDULED':
    case 'REQUESTED':
      return 'CRIADA';
    case 'SEARCHING':
      return 'AGUARDANDO_MOTORISTA';
    case 'DRIVER_ASSIGNED':
      return 'MOTORISTA_ENCONTRADO';
    case 'DRIVER_ARRIVING':
      return 'A_CAMINHO_DA_COLETA';
    case 'DRIVER_WAITING':
      return 'NO_ESTABELECIMENTO';
    case 'IN_PROGRESS':
      return coletada ? 'A_CAMINHO_DA_ENTREGA' : 'COLETADA';
    case 'COMPLETED':
      return 'ENTREGUE';
    case 'CANCELLED_BY_PASSENGER':
      return 'CANCELADA';
    case 'CANCELLED_BY_DRIVER':
    case 'CANCELLED_BY_SYSTEM':
      return coletada ? 'FALHA_NA_ENTREGA' : 'CANCELADA';
    case 'EXPIRED':
      return 'SEM_MOTORISTA';
    default:
      return 'CRIADA';
  }
}

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------

export interface LinhaDeCobranca {
  status: string;
  finalFareCents: number | null;
  estimatedFareCents: number;
}

export interface Gastos {
  realizadas: number;
  canceladas: number;
  emAndamento: number;
  totalCents: number;
}

/** So o que foi ENTREGUE conta como gasto; o valor e o cobrado no fim da corrida. */
export function valorCobrado(l: LinhaDeCobranca): number {
  return l.status === 'COMPLETED' ? (l.finalFareCents ?? l.estimatedFareCents) : 0;
}

export function somarGastos(linhas: LinhaDeCobranca[]): Gastos {
  const g: Gastos = { realizadas: 0, canceladas: 0, emAndamento: 0, totalCents: 0 };
  for (const l of linhas) {
    if (l.status === 'COMPLETED') {
      g.realizadas += 1;
      g.totalCents += valorCobrado(l);
    } else if (['CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER', 'CANCELLED_BY_SYSTEM', 'EXPIRED'].includes(l.status)) {
      g.canceladas += 1;
    } else {
      g.emAndamento += 1;
    }
  }
  return g;
}

/** Periodo padrao: o mes corrente (horario de Brasilia, UTC-3). */
export function periodoPadrao(agora: Date = new Date()): { de: Date; ate: Date } {
  const br = new Date(agora.getTime() - 3 * 3_600_000);
  const de = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3, 0, 0));
  const ate = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth() + 1, 1, 3, 0, 0));
  return { de, ate };
}
