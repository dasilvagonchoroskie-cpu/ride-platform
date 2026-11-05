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

/** Total de recargas nos ultimos 30 dias que deixa o motorista APTO. */
export const RECARGA_MINIMA_CENTS = 100_00;
/** Cada recarga conta por 30 dias a partir do momento em que foi confirmada. */
export const DIAS_DA_RECARGA = 30;
const DIA_MS = 24 * 60 * 60 * 1000;
const JANELA_MS = DIAS_DA_RECARGA * DIA_MS;

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
  /** Soma das recargas confirmadas dos ultimos 30 dias (centavos). */
  totalCents: number;
  /** Ate quando vale sem nova recarga (so quando APTO). */
  validoAte: Date | null;
  /** Quando a situacao mudou pela ultima vez; null = nunca chegou a R$ 100,00. */
  atualizadoEm: Date | null;
}

const soma = (ls: LancamentoDaCarteira[]) => ls.reduce((s, l) => s + l.amountCents, 0);

/**
 * APTO = a SOMA das recargas confirmadas dos ultimos 30 dias chega a
 * R$ 100,00 (Evandro, 05/11/2026: "50 + 50 = 100, fica apto"). Cada recarga
 * sai da conta 30 dias depois; quando o total cai abaixo de R$ 100,00, vira
 * NAO APTO sozinho (a conta e feita a cada abertura da carteirinha).
 */
export function elegibilidade(lancamentos: LancamentoDaCarteira[], agora = new Date()): Elegibilidade {
  const t = agora.getTime();
  const recargas = lancamentos
    .filter((l) => ehRecargaConfirmada(l) && l.createdAt.getTime() <= t)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const naJanela = recargas.filter((l) => l.createdAt.getTime() > t - JANELA_MS);
  const totalCents = soma(naJanela);

  if (totalCents >= RECARGA_MINIMA_CENTS) {
    // Vale ate a recarga mais antiga que, ao sair, deixa o total abaixo de R$ 100.
    let resto = totalCents;
    let validoAte = new Date(naJanela[naJanela.length - 1].createdAt.getTime() + JANELA_MS);
    for (const l of naJanela) {
      resto -= l.amountCents;
      if (resto < RECARGA_MINIMA_CENTS) {
        validoAte = new Date(l.createdAt.getTime() + JANELA_MS);
        break;
      }
    }
    // Ficou APTO na recarga que completou os R$ 100 (contando as da janela).
    let acumulado = 0;
    let atualizadoEm = naJanela[naJanela.length - 1].createdAt;
    for (const l of naJanela) {
      acumulado += l.amountCents;
      if (acumulado >= RECARGA_MINIMA_CENTS) {
        atualizadoEm = l.createdAt;
        break;
      }
    }
    return { apto: true, totalCents, validoAte, atualizadoEm };
  }

  // NAO APTO: quando foi a ultima vez que o total caiu abaixo de R$ 100?
  let atualizadoEm: Date | null = null;
  for (let i = recargas.length - 1; i >= 0; i--) {
    const vence = recargas[i].createdAt.getTime() + JANELA_MS;
    if (vence > t) continue;
    const antes = recargas.filter((l) => l.createdAt.getTime() >= vence - JANELA_MS && l.createdAt.getTime() < vence);
    const depois = recargas.filter((l) => l.createdAt.getTime() > vence - JANELA_MS && l.createdAt.getTime() <= vence);
    if (soma(antes) >= RECARGA_MINIMA_CENTS && soma(depois) < RECARGA_MINIMA_CENTS) {
      atualizadoEm = new Date(vence);
      break;
    }
  }
  return { apto: false, totalCents, validoAte: null, atualizadoEm };
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
