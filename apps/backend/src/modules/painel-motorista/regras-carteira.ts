import type { PrismaClient, Prisma } from '@prisma/client';

type Banco = PrismaClient | Prisma.TransactionClient;

export const CHAVE_MINIMO = 'carteira.minimoCents';
export const CHAVE_BLOQUEAR = 'carteira.bloquearSemSaldo';
export const MINIMO_PADRAO_CENTS = 0;

/**
 * Regras da carteira pre-paga, configuradas pela Central.
 * - minimoCents: saldo minimo para continuar recebendo corridas.
 * - bloquear: se ligado, quem tem saldo IGUAL OU MENOR que o minimo nao
 *   recebe chamados (nem consegue ficar disponivel) ate recarregar.
 *   Comeca DESLIGADO (especificacao do app do motorista, 03/10/2026: sem
 *   saldo o motorista e avisado, mas continua recebendo corridas e o debito
 *   da taxa fica registrado). A Central pode ligar em Carteiras / Recargas.
 */
export async function regrasDaCarteira(db: Banco): Promise<{ minimoCents: number; bloquear: boolean }> {
  const lista = await db.setting.findMany({ where: { key: { in: [CHAVE_MINIMO, CHAVE_BLOQUEAR] } } });
  const valor = (k: string) => lista.find((s) => s.key === k)?.value;
  const minimo = valor(CHAVE_MINIMO);
  const bloquear = valor(CHAVE_BLOQUEAR);
  return {
    minimoCents: typeof minimo === 'number' ? minimo : MINIMO_PADRAO_CENTS,
    bloquear: bloquear === true,
  };
}

/** Saldo que nao da direito a receber corridas (igual ou abaixo do minimo). */
export function semSaldo(saldoCents: number, minimoCents: number): boolean {
  return saldoCents <= minimoCents;
}

// ------------------------------------------------------------------
// Aviso "Saldo se esgotando" (Evandro, 30/10/2026: "o limite do aviso de
// saldo configuravel pela Central, por cidade, em reais").
// ------------------------------------------------------------------

export const CHAVE_AVISO_SALDO = 'carteira.avisoSaldo';

export interface AvisoDeSaldo {
  /** Vale nas cidades sem valor proprio. null = automatico (3x o minimo). */
  padraoCents: number | null;
  /** Valor proprio de cada cidade (id da praca -> centavos). */
  porCidade: Record<string, number>;
}

export async function lerAvisoDeSaldo(db: Banco): Promise<AvisoDeSaldo> {
  const s = await db.setting.findUnique({ where: { key: CHAVE_AVISO_SALDO } });
  const v = (s?.value && typeof s.value === 'object' && !Array.isArray(s.value) ? s.value : {}) as Partial<AvisoDeSaldo>;
  const porCidade: Record<string, number> = {};
  if (v.porCidade && typeof v.porCidade === 'object') {
    for (const [k, c] of Object.entries(v.porCidade)) if (typeof c === 'number' && c >= 0) porCidade[k] = Math.round(c);
  }
  return { padraoCents: typeof v.padraoCents === 'number' && v.padraoCents >= 0 ? Math.round(v.padraoCents) : null, porCidade };
}

/** Abaixo deste saldo aparece "Saldo se esgotando" (da cidade, senao o padrao, senao 3x o minimo). */
export function limiteDoAviso(aviso: AvisoDeSaldo, praca: string | null | undefined, minimoCents: number): {
  cents: number;
  origem: 'cidade' | 'padrao' | 'automatico';
} {
  if (praca && aviso.porCidade[praca] != null) return { cents: aviso.porCidade[praca], origem: 'cidade' };
  if (aviso.padraoCents != null) return { cents: aviso.padraoCents, origem: 'padrao' };
  return { cents: minimoCents * 3, origem: 'automatico' };
}

/** ok: tranquilo | low: se esgotando | insufficient: igual ou abaixo do minimo. */
export function situacaoDoSaldo(saldoCents: number, minimoCents: number, avisoCents: number): 'ok' | 'low' | 'insufficient' {
  if (semSaldo(saldoCents, minimoCents)) return 'insufficient';
  return saldoCents < avisoCents ? 'low' : 'ok';
}
