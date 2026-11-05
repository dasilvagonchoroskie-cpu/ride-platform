import { createHash } from 'crypto';
import { z } from 'zod';

/**
 * Clube de Vantagens (Evandro, 05/11/2026). Regras puras: validacao do que a
 * Central manda e a carteirinha digital do motorista (APTO / NAO APTO).
 */

const texto = (max: number) => z.string().trim().max(max);
/** Telefone/WhatsApp: so numeros, com DDD (10 ou 11), opcional o 55. */
const telefone = z
  .string()
  .trim()
  .transform((t) => t.replace(/\D/g, ''))
  .refine((t) => t === '' || /^(55)?\d{10,11}$/.test(t), 'Telefone com DDD (10 ou 11 números).')
  .transform((t) => (t === '' ? null : t.length <= 11 ? `55${t}` : t));

export const parceiroSchema = z.object({
  nome: texto(120).min(2, 'Informe o nome comercial.'),
  categoria: texto(60).min(2, 'Escolha a categoria.'),
  descricao: texto(1000).default(''),
  endereco: texto(300).min(5, 'Informe o endereço completo.'),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  telefone: telefone.nullable().optional(),
  whatsapp: telefone.nullable().optional(),
  horario: texto(300).default(''),
  vantagens: texto(1500).min(3, 'Descreva as vantagens para os motoristas.'),
  condicoes: texto(1500).default(''),
  ativo: z.boolean().default(true),
});
export type DadosDoParceiro = z.infer<typeof parceiroSchema>;

export const beneficioSchema = z.object({
  titulo: texto(120).min(2, 'Informe o benefício.'),
  descricao: texto(1000).default(''),
  condicoes: texto(1000).default(''),
  ativo: z.boolean().default(true),
  ordem: z.number().int().min(0).max(999).default(0),
});
export type DadosDoBeneficio = z.infer<typeof beneficioSchema>;

export const categoriasSchema = z.object({
  categorias: z.array(texto(60).min(2)).max(40),
});

export const logoSchema = z.object({
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dados: z.string().min(10).max(700_000),
});

/** Logotipo: ate 500 KB (o banco gratis tem 500 MB no total). */
export const MAX_LOGO_BYTES = 500 * 1024;

export const CHAVE_CATEGORIAS_CLUBE = 'clube.categorias';

/** Sugestoes iniciais de categoria (genericas; o dono edita na Central). */
export const CATEGORIAS_PADRAO = [
  'Alimentação',
  'Auto peças',
  'Oficina mecânica',
  'Posto de combustível',
  'Lava-jato',
  'Pneus e borracharia',
  'Farmácia',
  'Saúde',
  'Outros',
];

// ------------------------------------------------------------ carteirinha

/** Recarga que deixa o motorista APTO: uma so, de R$ 100,00 ou mais. */
export const RECARGA_MINIMA_CENTS = 100_00;
/** A recarga vale 30 dias a partir do momento em que foi confirmada. */
export const DIAS_DA_RECARGA = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Lancamento da carteira como o banco guarda (wallet_transactions). */
export interface LancamentoDaCarteira {
  type: string;
  amountCents: number;
  createdAt: Date;
}

/**
 * Recarga confirmada = credito que a Central lancou depois de receber o Pix
 * (ADJUSTMENT positivo; e o mesmo criterio do relatorio de recargas). Pedido
 * que nao foi confirmado nao vira lancamento; debito, cupom, ganho de corrida
 * e saque nao sao recarga.
 */
export function ehRecargaConfirmada(l: LancamentoDaCarteira): boolean {
  return l.type === 'ADJUSTMENT' && l.amountCents > 0;
}

export interface Elegibilidade {
  apto: boolean;
  /** Ate quando vale (so quando APTO). */
  validoAte: Date | null;
  /** Quando a situacao mudou pela ultima vez (recarga ou vencimento); null = nunca teve recarga valida. */
  atualizadoEm: Date | null;
}

/**
 * APTO = tem pelo menos UMA recarga confirmada de R$ 100,00 ou mais nos
 * ultimos 30 dias. Nao soma recargas menores. Passados 30 dias da ultima
 * recarga valida, vira NAO APTO sozinho (a conta e feita a cada consulta).
 */
export function elegibilidade(lancamentos: LancamentoDaCarteira[], agora = new Date()): Elegibilidade {
  const validas = lancamentos
    .filter((l) => ehRecargaConfirmada(l) && l.amountCents >= RECARGA_MINIMA_CENTS && l.createdAt.getTime() <= agora.getTime())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const ultima = validas[0];
  if (!ultima) return { apto: false, validoAte: null, atualizadoEm: null };
  const vence = new Date(ultima.createdAt.getTime() + DIAS_DA_RECARGA * DIA_MS);
  if (vence.getTime() > agora.getTime()) return { apto: true, validoAte: vence, atualizadoEm: ultima.createdAt };
  return { apto: false, validoAte: null, atualizadoEm: vence };
}

/** Identificador do motorista na carteirinha: curto, sem expor o id do banco. */
export function codigoDoMotorista(driverId: string): string {
  return 'FM-' + createHash('sha256').update(`clube-id:${driverId}`).digest('hex').slice(0, 8).toUpperCase();
}

/** Situacao do cadastro como aparece na carteirinha. */
export function situacaoDoMotorista(status: string, bloqueado: boolean): { codigo: 'ATIVO' | 'PENDENTE' | 'SUSPENSO'; texto: string } {
  if (bloqueado || status === 'SUSPENDED' || status === 'BLOCKED' || status === 'REJECTED') return { codigo: 'SUSPENSO', texto: 'Cadastro suspenso' };
  if (status === 'APPROVED') return { codigo: 'ATIVO', texto: 'Motorista parceiro ativo' };
  return { codigo: 'PENDENTE', texto: 'Cadastro em análise' };
}
